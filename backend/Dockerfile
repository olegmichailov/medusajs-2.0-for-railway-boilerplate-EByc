# Используем образ с Node 20
FROM node:20-slim

# Устанавливаем необходимые утилиты
RUN apt-get update && apt-get install -y openssl

# Устанавливаем PNPM нужной версии
RUN npm install -g pnpm@8.15.9

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости
RUN pnpm install

# Копируем остальной проект
COPY . .

# Пробрасываем переменные (в том числе DATABASE_URL)
ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL

# Сборка
RUN pnpm build

# Запуск сервера
CMD ["pnpm", "start"]
