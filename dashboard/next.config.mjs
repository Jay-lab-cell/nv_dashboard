/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth'],
  experimental: {
    serverActions: {
      bodySizeLimit: '2mb',
    },
  },
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        // 백엔드 (FastAPI) 주소 - 환경변수로 Vercel에 설정하거나, 로컬일 경우 8000
        destination: `${process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
