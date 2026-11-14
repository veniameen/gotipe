import type { NextConfig } from "next";

/**
 * The site is a static export (out/): every route is a folder with index.html, so links end with
 * a slash and any static host serves them without rewrites. No image optimisation server exists.
 */
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};

export default nextConfig;
