/** @type {import('next').NextConfig} */
const nextConfig = {
  // Vercel runs Next.js server-side so /api/v1/* Route Handlers proxy to the
  // API upstream (API_UPSTREAM). No localhost fallback in production.
  trailingSlash: true,
  images: { unoptimized: true },
  eslint: { ignoreDuringBuilds: true },
  // Allow Vercel preview host + production domain (CORS for serverless proxy)
  experimental: {
    optimizePackageImports: ['lucide-react', 'framer-motion'],
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};
export default nextConfig;
