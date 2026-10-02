import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  distDir: process.env.GETCITED_DIST_DIR || ".next",
};

export default nextConfig;
