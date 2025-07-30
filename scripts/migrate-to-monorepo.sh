#!/bin/bash

# Migration script for MCP Identity Gateway Monorepo
# This script helps migrate from the old structure to the new monorepo structure

set -e

echo "🚀 Starting migration to monorepo structure..."

# Create backup of original src directory
echo "📦 Creating backup of original source files..."
cp -r src src.backup.$(date +%Y%m%d_%H%M%S)

# Clean up old files that have been moved
echo "🧹 Cleaning up old source files..."
rm -rf src

# Install dependencies for all packages
echo "📦 Installing dependencies for all packages..."
yarn install

# Build all packages
echo "🔨 Building all packages..."
yarn build

echo "✅ Migration completed successfully!"
echo ""
echo "📋 Next steps:"
echo "1. Test each service individually:"
echo "   - yarn workspace @mcp-identity/slack dev"
echo "   - yarn workspace @mcp-identity/web dev"
echo "   - yarn workspace @mcp-identity/router dev"
echo "   - etc."
echo ""
echo "2. Deploy services individually:"
echo "   - cd slack && cf push"
echo "   - cd web && cf push"
echo "   - etc."
echo ""
echo "3. Or deploy all services:"
echo "   - cf push (uses root manifest.yaml)"
echo ""
echo "📁 New structure:"
echo "├── shared/     # Shared utilities and types"
echo "├── slack/      # Slack bot application"
echo "├── web/        # Web UI application"
echo "├── router/     # MCP router service"
echo "├── discovery/  # MCP discovery/registry service"
echo "├── dashboard/  # Identity dashboard"
echo "├── whoami/     # Whoami service"
echo "└── inspector/  # MCP inspector" 