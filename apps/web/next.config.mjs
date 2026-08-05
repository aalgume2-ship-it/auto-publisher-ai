/** @type {import('next').NextConfig} */
const nextConfig = {
  // Phase 1: server runtime enabled for Route Handlers (auth + health proxies).
  // output: 'export' removed — Vercel runs Next.js server-side so /api/v1/*
  // routes proxy to the Render API, hiding the upstream from the browser.
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
};
export default nextConfig;
