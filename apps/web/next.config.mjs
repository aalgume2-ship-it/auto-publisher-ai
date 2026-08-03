/** @type {import('next').NextConfig} */
const nextConfig = {
  // Fully static export — deployed to a CDN (Render static site). All API
  // calls happen in the browser with the visitor's own Bearer token; there is
  // no server runtime and therefore no server secrets in this app.
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  // NEXT_PUBLIC_API_BASE is inlined at build time (public by definition).
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
