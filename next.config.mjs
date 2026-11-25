const basePath = process.env.NEXT_PUBLIC_BASE_PATH || "";
/** Static export so the site can be hosted on GitHub Pages. */
export default {
  output: "export",
  basePath,
  assetPrefix: basePath || undefined,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  eslint: { ignoreDuringBuilds: false },
};
