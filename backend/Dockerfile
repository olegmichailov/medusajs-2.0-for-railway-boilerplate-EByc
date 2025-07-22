# Используем официальный Node.js образ с поддержкой pnpm
FROM node:22

# Устанавливаем pnpm
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем файлы зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# Копируем остальные файлы проекта
COPY . .

# Собираем Medusa backend
RUN pnpm build

# Открываем порт (если нужен)
EXPOSE 9000

# Запускаем сервер
CMD ["pnpm", "start"]
