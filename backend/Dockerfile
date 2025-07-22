# Используем официальный Node образ с pnpm и подходящей версией
FROM node:22-alpine

# Устанавливаем pnpm
RUN corepack enable && corepack prepare pnpm@9.10.0 --activate

# Устанавливаем необходимые зависимости для сборки native модулей
RUN apk add --no-cache python3 make g++ bash

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем всё, кроме node_modules (см. .dockerignore)
COPY . .

# Устанавливаем зависимости
RUN pnpm install

# Сборка проекта
RUN pnpm build

# Открываем нужный порт
EXPOSE 9000

# Запускаем сервер
CMD ["pnpm", "start"]
