FROM node:22-alpine
# Install system dependencies
RUN apk add --no-cache openssl
WORKDIR /app
# Copy package files
COPY package*.json ./
# Copy Prisma config (Prisma 7 uses prisma.config.ts)
COPY prisma ./prisma/
COPY prisma.config.ts ./
# Install dependencies
RUN npm install
# Generate Prisma Client (required — not auto-generated on install)
RUN npx prisma generate
# Copy source code
COPY . .
# Build the application
RUN npm run build
# Create necessary directories
RUN mkdir -p /app/prisma/db
# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:./db/custom.db
# Expose the port the app runs on
EXPOSE 3000
# Start the application (run prisma db push then start)
CMD ["sh", "-c", "npx prisma db push && npm start"]
