FROM node:20-alpine

# Создание директории приложения
WORKDIR /app

# Установка pnpm
RUN npm install -g pnpm

# Копируем package.json и pnpm-lock.yaml
COPY package.json pnpm-lock.yaml ./

# Установка зависимостей
RUN pnpm install

# Копируем остальные файлы
COPY . .

# Билдим проект (ты уже указал build-скрипт в package.json)
RUN pnpm build

# Открываем порт
EXPOSE 9000

# Запуск сервера
CMD ["pnpm", "start"]
