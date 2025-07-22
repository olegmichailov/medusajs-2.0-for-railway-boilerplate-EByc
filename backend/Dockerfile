# Используем образ с Node.js
FROM node:20-slim

# Устанавливаем необходимые утилиты
RUN apt-get update && apt-get install -y openssl

# Устанавливаем PNPM
RUN npm install -g pnpm@8.15.9

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем зависимости
COPY package.json pnpm-lock.yaml ./

# Устанавливаем зависимости
RUN pnpm install

# Копируем остальной код
COPY . .

# Открываем порт Medusa
EXPOSE 9000

# Запускаем без сборки (build перенеси внутрь `start` если нужно)
CMD ["pnpm", "start"]
