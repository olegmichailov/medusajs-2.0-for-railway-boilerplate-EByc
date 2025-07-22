# backend/Dockerfile

# Используем официальный Node образ
FROM node:22-alpine

# Создаём рабочую директорию
WORKDIR /app

# Копируем зависимости
COPY package.json pnpm-lock.yaml ./

# Устанавливаем pnpm
RUN npm install -g pnpm

# Устанавливаем зависимости
RUN pnpm install

# Копируем весь код
COPY . .

# Собираем проект
RUN pnpm build

# Открываем порт
EXPOSE 9000

# Запускаем Medusa backend
CMD ["pnpm", "start"]
