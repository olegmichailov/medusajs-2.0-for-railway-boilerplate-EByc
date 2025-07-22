# Используем официальный Node.js образ
FROM node:18-alpine

# Устанавливаем рабочую директорию
WORKDIR /app

# Копируем package.json и pnpm-lock.yaml заранее для кеширования зависимостей
COPY package.json pnpm-lock.yaml ./

# Устанавливаем pnpm глобально и зависимости проекта
RUN npm install -g pnpm && pnpm install

# Копируем остальные файлы проекта
COPY . .

# Указываем порт, используемый Medusa
EXPOSE 9000

# Стартуем Medusa-сервер
CMD ["pnpm", "start"]
