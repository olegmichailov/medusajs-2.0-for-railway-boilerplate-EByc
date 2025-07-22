FROM node:18-slim

# Install dependencies
RUN apt-get update && apt-get install -y openssl

# Set workdir
WORKDIR /app

# Copy only package files
COPY package.json pnpm-lock.yaml ./

# Install pnpm
RUN npm install -g pnpm@8

# Install app dependencies
RUN pnpm install

# Copy the rest of the code
COPY . .

# Build the Medusa app
RUN pnpm build

# Start the app
CMD ["pnpm", "start"]
