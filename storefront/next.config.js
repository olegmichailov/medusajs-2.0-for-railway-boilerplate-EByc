/* eslint-disable @typescript-eslint/no-var-requires */
const checkEnvVariables = require("./check-env-variables")
checkEnvVariables()

const getCleanHostname = (url) => {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return url.replace(/^https?:\/\//, "").replace(/\/$/, "")
  }
}

const backendHost = getCleanHostname(process.env.NEXT_PUBLIC_MEDUSA_BACKEND_URL)
const minioHost = getCleanHostname(process.env.NEXT_PUBLIC_MINIO_ENDPOINT)

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  // некоторые CJS-зависимости (matter-js/poly-decomp) дружелюбнее в "loose"
  experimental: {
    esmExternals: "loose",
  },

  eslint: {
    ignoreDuringBuilds: true,
  },

  typescript: {
    ignoreBuildErrors: true,
  },

  images: {
    // 💥 отключаем Next Image оптимизацию — меньше сюрпризов на деплое
    unoptimized: true,

    formats: ["image/avif", "image/webp"],
    minimumCacheTTL: 600,
    deviceSizes: [360, 640, 768, 1024, 1280, 1440, 1920],

    remotePatterns: [
      { protocol: "http", hostname: "localhost" },
      ...(backendHost ? [{ protocol: "https", hostname: backendHost }] : []),
      ...(minioHost ? [{ protocol: "https", hostname: minioHost }] : []),
      { protocol: "https", hostname: "bucket-production-s43jr0.up.railway.app" },
      { protocol: "https", hostname: "medusa-public-images.s3.eu-west-1.amazonaws.com" },
      { protocol: "https", hostname: "medusa-server-testing.s3.amazonaws.com" },
      { protocol: "https", hostname: "medusa-server-testing.s3.us-east-1.amazonaws.com" },
    ],
  },

  serverRuntimeConfig: {
    port: process.env.PORT || 3000,
  },

  webpack: (config, { isServer }) => {
    // ✅ Включаем поддержку async WebAssembly для Rapier (compat)
    config.experiments = {
      ...(config.experiments || {}),
      asyncWebAssembly: true,
      topLevelAwait: true,
    }

    // ✅ Явно говорим вебпаку, что .wasm — это ассет (чтобы корректно ложился в /_next/static/)
    // (если правило уже есть — не дублируем)
    const hasWasmRule = config.module.rules.some(
      (r) => typeof r === "object" && r.test && r.test.toString().includes("\\.wasm$")
    )
    if (!hasWasmRule) {
      config.module.rules.push({
        test: /\.wasm$/,
        type: "asset/resource",
      })
    }

    // ✅ Урезаем node-полифилы и конфликтующие модули на сервере/клиенте
    config.resolve.fallback = {
      ...config.resolve.fallback,
      // Konva/matter не должны тянуть node canvas/fs
      canvas: false,
      fs: false,
      path: false,
    }

    // (не обязательно, но помогает с нестабильными ESM/CJS пакетами)
    config.module.parser = {
      ...config.module.parser,
      javascript: {
        ...((config.module.parser && config.module.parser.javascript) || {}),
        exportsPresence: "auto",
      },
    }

    return config
  },
}

module.exports = nextConfig
