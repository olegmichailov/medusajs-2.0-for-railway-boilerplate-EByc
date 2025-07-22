# ✅ Рабочий Dockerfile для Medusa 2.0 backend с pnpm, Node.js 22, Railway, без .env
# Использует только переменные из Railway UI

FROM node:22-slim

# Установка pnpm
RUN npm install -g pnpm@9.10.0

# Создание рабочего каталога
WORKDIR /app

# Копируем манифесты и lock-файл
COPY backend/package.json ./
COPY backend/pnpm-lock.yaml ./

# Установка зависимостей
RUN pnpm install --frozen-lockfile

# Копируем всё остальное
COPY backend .

# Сборка проекта (включает postBuild.js, если он есть)
RUN pnpm build

# Экспонируем порт
EXPOSE 9000

# Запуск Medusa
CMD ["pnpm", "start"]
