/** @type {import('next').NextConfig} */
const nextConfig = {
  // Trustfall lives at humanversus.tech/trustfall (lib/site.ts BASE_PATH must match).
  basePath: "/trustfall",
  images: {
    unoptimized: true,
  },
}

export default nextConfig
