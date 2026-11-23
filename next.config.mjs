/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return {
      beforeFiles: [
        { source: '/', destination: '/aurora-app/index.html' },
        { source: '/add-song', destination: '/aurora-app/index.html' },
        { source: '/slides', destination: '/aurora-app/index.html' },
        { source: '/song/:path*', destination: '/aurora-app/index.html' },
        { source: '/setlists/:path*', destination: '/aurora-app/index.html' },
      ],
    };
  },
};

export default nextConfig;
