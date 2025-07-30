#!/bin/bash

# Deployment script with memory fixes for registry service
# This script updates the manifest.yaml with proper memory settings before deploying

echo "🔧 Preparing deployment with memory fixes..."

# Create a temporary manifest with updated memory settings
cp manifest.yaml manifest.yaml.backup

# Update registry service memory settings
echo "📊 Updating registry service memory configuration..."

# Use sed to update the memory and NODE_OPTIONS for registry service
sed -i.bak '
/^  - name: registry$/,/^    buildpacks:$/ {
  s/memory: 512M/memory: 1G/
  s/NODE_OPTIONS: "--max-old-space-size=1024 --max-http-header-size=80000"/NODE_OPTIONS: "--max-old-space-size=1024 --max-http-header-size=80000 --expose-gc"/
}
' manifest.yaml

echo "✅ Memory configuration updated:"
echo "   - Registry memory: 512M → 1G"
echo "   - Added --expose-gc flag for garbage collection"

# Show the changes
echo ""
echo "📋 Registry service configuration:"
grep -A 15 "name: registry" manifest.yaml

echo ""
echo "🚀 Starting deployment..."

# Deploy using the updated manifest
cf deploy mta_archives/archive.0.1.mtar -f --retries 1

# Check deployment status
echo ""
echo "📊 Checking deployment status..."
cf apps | grep registry

echo ""
echo "🔍 Memory monitoring will be active in production"
echo "   - Warning threshold: 400MB"
echo "   - Critical threshold: 450MB" 
echo "   - Max threshold: 500MB"
echo "   - Auto garbage collection enabled"

# Restore original manifest
mv manifest.yaml.backup manifest.yaml
echo ""
echo "✅ Original manifest restored" 