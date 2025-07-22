FROM node:20-slim

RUN apt-get update && apt-get install -y openssl curl
RUN npm install -g pnpm@8.15.9

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install

COPY . .

# Сборка проекта
RUN pnpm build

# Обязательно открой порт (Medusa работает на 9000)
EXPOSE 9000

# HEALTHCHECK — теперь по реальному роуту
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:9000/store/products || exit 1

# ВНИМАНИЕ: Меняем директорию ПЕРЕД запуском
WORKDIR /app/.medusa/server

# Запускаем Medusa
CMD ["pnpm", "start"]
