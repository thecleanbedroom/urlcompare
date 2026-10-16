#!/bin/bash
set -e

# Create a temporary directory for the deployment package
TEMP_DIR="deploy-temp"
ZIP_FILE="urlcompare-deployment-$(date +%Y%m%d).zip"

# Create the temporary directory
mkdir -p "$TEMP_DIR"

# Copy only the necessary files
cp -r src "$TEMP_DIR/"
cp -r public "$TEMP_DIR/"
cp -r prisma "$TEMP_DIR/"
cp .env.example "$TEMP_DIR/.env"
cp package*.json "$TEMP_DIR/"
cp next.config.js "$TEMP_DIR/" 2>/dev/null || echo "next.config.js not found, skipping"
cp next.config.ts "$TEMP_DIR/" 2>/dev/null || echo "next.config.ts not found, skipping"
cp tsconfig.json "$TEMP_DIR/" 2>/dev/null || echo "tsconfig.json not found, skipping"
cp Dockerfile "$TEMP_DIR/"
cp docker-compose.yml "$TEMP_DIR/"
cp DEPLOY.md "$TEMP_DIR/"
cp -r .next "$TEMP_DIR/" 2>/dev/null && echo "Copied .next directory" || echo "No .next directory found, it will be built during deployment"

# Create a .dockerignore file in the temp directory
cat > "$TEMP_DIR/.dockerignore" <<EOL
node_modules
npm-debug.log
.next
.git
.gitignore
*.log
local-*
EOL

# Create the zip file
(cd "$TEMP_DIR" && zip -r "../$ZIP_FILE" .)

# Clean up
rm -rf "$TEMP_DIR"

echo ""
echo "✅ Deployment package created: $ZIP_FILE"
echo ""
echo "📦 Package contents:"
unzip -l "$ZIP_FILE" | head -n 10
echo "... (truncated)"
echo ""
echo "📝 Deployment Instructions:"
echo "1. Upload $ZIP_FILE to your server"
echo "2. On the server, run these commands:"
echo "   unzip $ZIP_FILE -d urlcompare"
echo "   cd urlcompare"
echo "   # Edit the .env file with your configuration"
echo "   nano .env"
echo "   # Start the application"
echo "   docker-compose up -d --build"
echo ""
echo "🌐 The application will be available on port 3000 (or your configured port)"
echo "For detailed instructions, see DEPLOY.md in the package."
