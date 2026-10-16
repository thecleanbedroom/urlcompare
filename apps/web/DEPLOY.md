# Deployment Guide

This guide explains how to deploy the application using Docker Compose.

## Prerequisites

- Docker installed on your server
- Docker Compose installed on your server
- Git (for cloning the repository)

## Quick Start

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd urlCompare
   ```

2. Create a `.env` file with your configuration:
   ```bash
   # Required
   APP_PORT=3000  # Change this to your desired port
   
   # Optional: Add any other environment variables your app needs
   # NODE_ENV=production
   # DATABASE_URL=file:/app/prisma/database.sqlite
   ```

3. Build and start the containers:
   ```bash
   docker-compose up -d --build
   ```

4. Verify the application is running:
   ```bash
   docker-compose ps
   ```

## Configuration

### Port Configuration

The application's port can be configured in two ways:

1. Using the `.env` file (recommended):
   ```env
   APP_PORT=8080  # Change this to your desired port
   ```

2. Or as an environment variable when running docker-compose:
   ```bash
   APP_PORT=8080 docker-compose up -d
   ```

### Environment Variables

| Variable     | Default | Description                         |
|--------------|---------|-------------------------------------|
| APP_PORT     | 3000    | Port to expose the application on   |
| NODE_ENV     | production | Node.js environment                |
| PORT         | 3000    | Internal container port             |
| DATABASE_URL | file:/app/prisma/database.sqlite | SQLite database file location |

## Managing the Application

- **View logs**: `docker-compose logs -f`
- **Stop the application**: `docker-compose down`
- **Restart the application**: `docker-compose restart`
- **Update the application**:
  ```bash
  git pull
  docker-compose up -d --build
  ```

## Database Persistence

The SQLite database is stored in the `prisma/database.sqlite` file, which is persisted using a Docker volume. This means your data will survive container restarts.

## Health Check

The application includes a health check endpoint at `/api/health` that runs every 30 seconds. If the check fails 3 times, the container will be restarted.

## Troubleshooting

- If you get a port conflict, make sure the port isn't being used by another application
- Check logs with `docker-compose logs` if the application doesn't start
- Ensure the `prisma` directory has proper write permissions for the database file

## Security Considerations

- Don't expose the Docker daemon port (2375/2376) to the internet
- Use a reverse proxy (like Nginx) with SSL termination in production
- Keep your system and Docker installation up to date
