FROM node:20-slim

# Установим нужные инструменты
RUN apt-get update && apt-get install -y openssl curl
RUN npm install -g pnpm@8.15.9

# Задаём рабочую директорию
WORKDIR /app

# Устанавливаем зависимости
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Копируем весь проект
COPY . .

# Открываем нужный порт
EXPOSE 9000

# Healthcheck: проверка доступности публичного маршрута
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=5 \
  CMD curl -f http://localhost:9000/store/products || exit 1

# Запуск Medusa
CMD ["pnpm", "start"]
