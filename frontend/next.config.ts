import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds plain HTML into out/ (for GitHub Pages). NEXT_PUBLIC_BASE_PATH="/repo-name" for project pages.
const nextConfig: NextConfig = {
  output: process.env.STATIC_EXPORT ? "export" : undefined,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
};

export default nextConfig;
