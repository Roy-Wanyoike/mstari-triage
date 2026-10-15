import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Server-only env (never exposed to the client bundle):
  //   MODELSCOPE_BASE_URL / MODELSCOPE_API_KEY / MODELSCOPE_MODEL
  // are read only inside app/api/mstari/* route handlers.
};

export default nextConfig;
