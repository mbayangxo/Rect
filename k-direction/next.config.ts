import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: import.meta.dirname,
  },
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
