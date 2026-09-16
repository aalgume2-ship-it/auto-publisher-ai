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
          // NOTE: no X-Frame-Options — it blocked the hosted preview iframe
          // and left the user staring at an endless loading screen.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
  async redirects() {
    return [
      // Users naturally try Arabic paths (/ar/login, /ar/videos…). Map them
      // to the real pages instead of dead 404s.
      { source: '/ar', destination: '/', permanent: false },
      { source: '/ar/:path*', destination: '/:path*', permanent: false },
      { source: '/studio', destination: '/video', permanent: false },
      { source: '/videos', destination: '/video', permanent: false },
    ];
  },
};
export default nextConfig;
