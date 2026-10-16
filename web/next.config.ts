import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only env (never exposed to the client bundle):
  //   MODELSCOPE_BASE_URL / MODELSCOPE_API_KEY / MODELSCOPE_MODEL
  // are read only inside app/api/mstari/* route handlers.
  //
  // `postgres` must stay external on the server: its socket/TLS layer sniffs
  // the runtime (Node vs Bun vs Deno) at require-time, which breaks when
  // Turbopack bundles it — producing silent connect failures against Neon.
  serverExternalPackages: ["postgres"],
};

export default nextConfig;
