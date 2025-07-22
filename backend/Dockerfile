FROM node:20-slim

# Утилиты
RUN apt-get update && apt-get install -y openssl curl

# Установка PNPM нужной версии
RUN npm install -g pnpm@8.15.9

# Установка рабочей директории
WORKDIR /app

# Копируем зависимости
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Копируем весь проект
COPY . .

# Пробрасываем переменные окружения (это важно!)
ENV DATABASE_URL=${DATABASE_URL}
ENV JWT_SECRET=${JWT_SECRET}
ENV COOKIE_SECRET=${COOKIE_SECRET}
ENV REDIS_URL=${REDIS_URL}

# Сборка
RUN pnpm build

# Открываем порт
EXPOSE 9000

# Healthcheck (меняй URL на нужный)
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=5 \
  CMD curl -f http://localhost:9000/store/products || exit 1

# Медуса стартует из .medusa/server
WORKDIR /app/.medusa/server

# Запуск
CMD ["pnpm", "start"]
