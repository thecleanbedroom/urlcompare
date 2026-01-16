# Docker Deployment Guide

This document outlines the Docker configuration and setup for the Next.js application with Prisma and SQLite.

## Key Components

### 1. Dockerfile Configuration

```dockerfile
FROM node:20-slim

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    openssl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Create necessary directories
RUN mkdir -p /app/.next/cache /app/db

# Set environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV DATABASE_URL=file:./db/custom.db

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["sh", "-c", "npm run migrate && npm start"]
```

### 2. Package.json Scripts

```json
{
  "scripts": {
    "dev": "nodemon --exec \"npx tsx server.ts\" --watch server.ts --watch src --ext ts,tsx,js,jsx 2>&1 | tee dev.log",
    "build": "next build",
    "start": "NODE_ENV=production tsx server.ts 2>&1 | tee server.log",
    "migrate": "prisma migrate deploy && prisma generate",
    "db:push": "prisma db push",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "db:reset": "prisma migrate reset"
  }
}
```

### 3. docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - PORT=3000
      - HOSTNAME=0.0.0.0
      - DATABASE_URL=file:./db/custom.db
    volumes:
      - ./db:/app/db
      - ./prisma/migrations:/app/prisma/migrations
    restart: unless-stopped
```

### 4. Next.js Configuration (next.config.ts)

```typescript
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: 'standalone',
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
```

## Deployment Instructions

### Prerequisites
- Docker and Docker Compose installed on your system
- Node.js and npm (for local development)

### Building and Running

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd urlCompare
   ```

2. **Build and start the application**
   ```bash
   # Clean up any existing containers and volumes
   docker compose down -v
   
   # Create database directory
   mkdir -p db
   
   # Build and start the containers
   docker compose up --build -d
   ```

3. **View logs**
   ```bash
   docker compose logs -f
   ```

4. **Access the application**
   Open your browser and navigate to: http://localhost:3000

### Environment Variables

The following environment variables can be configured:

- `NODE_ENV`: Application environment (default: production)
- `PORT`: Port to run the application on (default: 3000)
- `HOSTNAME`: Hostname to bind to (default: 0.0.0.0)
- `DATABASE_URL`: Database connection string (default: file:./db/custom.db)

### Database Management

#### Running Migrations
Migrations are automatically applied when the container starts. To manually run migrations:

```bash
docker compose exec app npx prisma migrate deploy
```

#### Accessing the Database
To access the SQLite database:

```bash
# Install SQLite tools
sudo apt-get install sqlite3

# Connect to the database
sqlite3 db/custom.db
```

### Maintenance

#### Updating Dependencies
1. Stop the containers:
   ```bash
   docker compose down
   ```
2. Update dependencies in `package.json`
3. Rebuild the containers:
   ```bash
   docker compose up --build -d
   ```

#### Backing Up the Database
```bash
# Create a backup
cp db/custom.db db/backup-$(date +%Y%m%d).db

# Restore from backup
cp db/backup-<date>.db db/custom.db
```

### Troubleshooting

#### Common Issues

1. **Permission Issues**
   If you encounter permission issues with the database:
   ```bash
   sudo chown -R $USER:$USER db/
   ```

2. **Port Already in Use**
   If port 3000 is already in use, either stop the conflicting service or change the port in `docker-compose.yml`.

3. **Database Migration Failures**
   If migrations fail, try resetting the database:
   ```bash
   docker compose down -v
   rm -rf db/
   mkdir -p db
   docker compose up --build -d
   ```

### Production Considerations

1. **Security**
   - Use environment variables for sensitive data
   - Enable HTTPS with a reverse proxy like Nginx
   - Regularly update dependencies for security patches

2. **Performance**
   - Consider using a more robust database like PostgreSQL for production
   - Configure appropriate resource limits in `docker-compose.yml`

3. **Monitoring**
   - Set up logging and monitoring
   - Consider using a process manager like PM2 for better reliability
```

## Important Notes

1. **Environment Variables**:
   - `APP_PORT`: Configurable port (default: 3000)
   - `DATABASE_URL`: SQLite database file location (default: `file:./db/custom.db`)

2. **Volume Mounts**:
   - Database file is persisted in the `./db` directory
   - Prisma migrations are stored in `./prisma/migrations`

3. **Build Process**:
   - Uses multi-stage build for smaller final image
   - Production dependencies only in final image
   - Standalone output mode for Next.js

4. **Health Check**:
   - Endpoint: `/api/health`
   - Checks if the application is running

## Common Issues and Solutions

1. **Missing package-lock.json**
   - Solution: Run `npm install` to generate it

2. **Permission Issues**
   - Solution: Ensure `start.sh` is executable (`chmod +x start.sh`)

3. **Database Migration Failures**
   - Ensure the `db` directory exists and is writable
   - Check database URL in environment variables

## Deployment

1. Build and start:
   ```bash
   docker compose up --build -d
   ```

2. View logs:
   ```bash
   docker compose logs -f
   ```

3. Stop the application:
   ```bash
   docker compose down
   ```

## Security Considerations

1. Never commit sensitive data to version control
2. Use environment variables for all secrets
3. Keep dependencies updated
4. Run containers as non-root user in production
5. Regularly back up the database volume
