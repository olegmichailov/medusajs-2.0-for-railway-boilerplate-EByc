FROM node:18-alpine

WORKDIR /app

# Убираем package-lock.json
COPY package.json ./
RUN npm install

COPY . .

RUN npm run build

EXPOSE 9000

CMD ["npm", "run", "start"]
