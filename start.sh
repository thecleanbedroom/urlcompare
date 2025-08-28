#!/bin/sh
set -e

echo "🚀 Starting URL Compare application..."

# Change to the app directory
cd /app

# Create database directory if it doesn't exist
mkdir -p /app/db

# Run database migrations if needed
if [ -f "prisma/migrations" ]; then
    echo "🔄 Running database migrations..."
    npx prisma migrate deploy
fi

# Generate Prisma client if needed
if [ ! -d "node_modules/.prisma" ]; then
    echo "⚙️  Generating Prisma client..."
    npx prisma generate
fi

# Start the application
echo "🚀 Starting Next.js server..."
exec npm start
