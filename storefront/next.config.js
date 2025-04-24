const checkEnvVariables = require("./check-env-variables")
checkEnvVariables()

/**
 * @type {import('next').NextConfig}
 */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    loader: "default", // ⬅️ ОБЯЗАТЕЛЬНО! используем встроенный оптимизатор (sharp)
    formats: ["image/avif", "image/webp"], // современные форматы
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      {
        protocol: "https",
        hostname: process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL?.replace("https://", ""),
      },
      {
        protocol: "https",
        hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.amazonaws.com",
      },
      {
        protocol: "https",
        hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com",
      },
      ...(process.env.NEXT_PUBLIC_MINIO_ENDPOINT
        ? [
            {
              protocol: "https",
              hostname: process.env.NEXT_PUBLIC_MINIO_ENDPOINT,
            },
          ]
        : []),
    ],
    minimumCacheTTL: 60, // 🔁 кэш на 60 сек, можно поднять до 600+
    deviceSizes: [360, 640, 768, 1024, 1280, 1440, 1920], // ⚙️ адаптивные размеры
  },
  serverRuntimeConfig: {
    port: process.env.PORT || 3000,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false, // отключаем canvas, если не нужен
      };
    }
    return config;
  },
}

module.exports = nextConfig
