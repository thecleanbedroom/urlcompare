#!/bin/sh
set -e

echo "🚀 Starting URL Compare application..."

# Change to the app directory
cd /app

# Create database directory if it doesn't exist
mkdir -p /app/db

# Sync database schema
echo "🔄 Syncing database schema..."
npx prisma db push

# Generate Prisma client
echo "⚙️  Generating Prisma client..."
npx prisma generate

# Start the application
echo "🚀 Starting Next.js server..."
exec npm start
