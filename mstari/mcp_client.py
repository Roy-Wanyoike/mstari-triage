"""Sync-friendly MCP client proxy.

Runs a dedicated asyncio event loop in a background thread so LangGraph nodes
(plain sync functions) can call MCP tools over stdio without juggling loops.

Used for:
  - our own mstari MCP server        (python -m mstari.mcp_server)
  - the borrowed official fetch MCP server (python -m mcp_server_fetch)
"""
import asyncio
import json
import os
import sys
import threading
import time
from typing import Any

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

from .config import REPO_ROOT
from .audit import log_tool_call


class MCPClientProxy:
    """Owns one stdio MCP connection and exposes blocking call_tool()."""

    def __init__(self, server_params: StdioServerParameters, run_id: str = "adhoc"):
        self._params = server_params
        self._run_id = run_id
        self._loop = asyncio.new_event_loop()
        self._thread = threading.Thread(target=self._run_loop, daemon=True, name="mcp-client")
        self._ready = threading.Event()
        self._error: Exception | None = None
        self._session: ClientSession | None = None
        self._cm_stack: Any = None
        self._thread.start()
        if not self._ready.wait(timeout=60):
            raise RuntimeError(f"MCP session failed to start: {self._error}")

    def _run_loop(self):
        asyncio.set_event_loop(self._loop)
        self._loop.run_until_complete(self._startup())
        if self._error is None:
            # run_until_complete stops the loop on completion - keep it alive
            # for future run_coroutine_threadsafe calls.
            self._loop.run_forever()

    async def _startup(self):
        try:
            self._cm_stack = AsyncExitStack()
            read, write = await self._cm_stack.enter_async_context(stdio_client(self._params))
            self._session = await self._cm_stack.enter_async_context(ClientSession(read, write))
            await self._session.initialize()
        except Exception as e:  # surfaced to the main thread
            self._error = e
        finally:
            self._ready.set()

    # ------------------------------------------------------------- sync API

    def call_tool(self, tool: str, args: dict, server_name: str = "mcp") -> dict:
        """Blocking tool call. Returns parsed dict; raises on transport errors."""
        if self._session is None:
            raise RuntimeError(f"MCP session unavailable: {self._error}")
        t0 = time.monotonic()
        fut = asyncio.run_coroutine_threadsafe(
            self._session.call_tool(tool, args or {}), self._loop)
        result = fut.result(timeout=180)
        payload = parse_tool_result(result)
        log_tool_call(self._run_id, tool, server_name, args, payload,
                      int((time.monotonic() - t0) * 1000))
        return payload

    def list_tools(self) -> list[str]:
        fut = asyncio.run_coroutine_threadsafe(self._session.list_tools(), self._loop)
        return [t.name for t in fut.result(timeout=60).tools]

    def close(self):
        try:
            if self._cm_stack is not None and self._session is not None:
                asyncio.run_coroutine_threadsafe(self._cm_stack.aclose(), self._loop).result(timeout=30)
        except Exception:
            pass
        finally:
            self._loop.call_soon_threadsafe(self._loop.stop)

    @staticmethod
    def own_server(run_id: str = "adhoc") -> "MCPClientProxy":
        env = {**os.environ, "MSTARI_RUN_ID": run_id,
               "PYTHONUNBUFFERED": "1", "PYTHONPATH": str(REPO_ROOT)}
        params = StdioServerParameters(
            command=sys.executable, args=["-m", "mstari.mcp_server"],
            env=env, cwd=str(REPO_ROOT))
        return MCPClientProxy(params, run_id=run_id)

    @staticmethod
    def borrowed_fetch_server(run_id: str = "adhoc") -> "MCPClientProxy":
        """The official reference fetch server - a server we did NOT write."""
        params = StdioServerParameters(
            command=sys.executable, args=["-m", "mcp_server_fetch"])
        return MCPClientProxy(params, run_id=run_id)


class AsyncExitStack:
    """Tiny local alias to avoid importing contextlib in two spots."""
    def __init__(self):
        from contextlib import AsyncExitStack as _S
        self._s = _S()
    async def enter_async_context(self, cm):
        return await self._s.enter_async_context(cm)
    async def aclose(self):
        await self._s.aclose()


def parse_tool_result(result) -> dict:
    """Best-effort extraction of a structured payload from a CallToolResult."""
    sc = getattr(result, "structuredContent", None)
    if isinstance(sc, dict):
        for key in ("result", "data", "output"):
            if key in sc and isinstance(sc[key], dict):
                return sc[key]
        return sc
    texts = []
    for block in getattr(result, "content", []) or []:
        t = getattr(block, "text", None)
        if t:
            texts.append(t)
    raw = "\n".join(texts).strip()
    if not raw:
        return {"raw": None, "is_error": bool(getattr(result, "isError", False))}
    try:
        v = json.loads(raw)
        return v if isinstance(v, dict) else {"value": v}
    except Exception:
        return {"raw": raw, "is_error": bool(getattr(result, "isError", False))}
