# Используем Node.js c поддержкой pnpm
FROM node:22-bullseye

# Устанавливаем pnpm
RUN npm install -g pnpm@9.10.0

# Создаем рабочую директорию
WORKDIR /app

# Копируем все необходимые файлы
COPY . .

# Устанавливаем зависимости
RUN pnpm install --frozen-lockfile

# Собираем Medusa
RUN pnpm build

# Открываем порт
EXPOSE 9000

# Запускаем сервер
CMD ["pnpm", "start"]
