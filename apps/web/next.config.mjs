/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel runs Next.js server-side so /api/v1/* Route Handlers proxy to the
  // API upstream (API_UPSTREAM), hiding it from the browser.
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
