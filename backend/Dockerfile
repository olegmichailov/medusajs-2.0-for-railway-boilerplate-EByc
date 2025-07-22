# Используем образ с поддержкой Node 22 и pnpm
FROM node:22-alpine

# Установка pnpm
RUN corepack enable && corepack prepare pnpm@9.1.1 --activate

# Создаём рабочую директорию
WORKDIR /app

# Копируем только нужные файлы для установки зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости
RUN pnpm install

# Копируем всё остальное
COPY . .

# Собираем backend
RUN pnpm build

# Запускаем сервер Medusa
CMD ["pnpm", "start"]
