#!/bin/bash

# Stop on error
set -e

echo "🚀 Starting URL Compare application..."

# Install dependencies if node_modules doesn't exist
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "⚠️  Warning: .env file not found. Please create one based on .env.example"
fi

# Run database migrations
echo "🔄 Running database migrations..."
npm run db:push

# Generate Prisma client
if [ ! -d "node_modules/.prisma" ]; then
    echo "⚙️  Generating Prisma client..."
    npm run db:generate
fi

# Start the development server
echo "🚀 Starting development server..."
npm run dev

echo "✅ Application started successfully! Access it at http://localhost:3000"
