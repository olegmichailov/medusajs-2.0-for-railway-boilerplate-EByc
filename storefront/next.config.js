const checkEnvVariables = require("./check-env-variables")
checkEnvVariables()

const getCleanHostname = (url) => {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, "")
  }
}

const backendHost = getCleanHostname(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL)
const minioHost = getCleanHostname(process.env.NEXT_PUBLIC_MINIO_ENDPOINT)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    loader: "default", // встроенный оптимизатор (sharp)
    formats: ["image/avif", "image/webp"], // современные форматы
    minimumCacheTTL: 600, // кэш на 10 минут
    deviceSizes: [360, 640, 768, 1024, 1280, 1440, 1920],
    remotePatterns: [
      {
        protocol: "http",
        hostname: "localhost",
      },
      ...(backendHost
        ? [
            {
              protocol: "https",
              hostname: backendHost,
            },
          ]
        : []),
      ...(minioHost
        ? [
            {
              protocol: "https",
              hostname: minioHost,
            },
          ]
        : []),
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
    ],
  },
  serverRuntimeConfig: {
    port: process.env.PORT || 3000,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        canvas: false,
      };
    }
    return config;
  },
}

module.exports = nextConfig
