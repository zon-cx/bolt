# Migration Guide: Monorepo Restructuring

This document outlines the migration from the original single-package structure to the new monorepo structure for the MCP Identity Gateway.

## Overview

The repository has been restructured into a monorepo with separate packages for each service, making it easier to develop, deploy, and maintain individual components.

## New Structure

```
mcp-identity-monorepo/
├── shared/           # Shared utilities and types
│   ├── src/
│   │   ├── store.yjs.ts
│   │   ├── chat.type.ts
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── slack/           # Slack bot application
│   ├── src/
│   │   ├── index.ts (was chat.ui.slack.ts)
│   │   ├── chat.store.ts
│   │   ├── chat.handler.*.ts
│   │   ├── chat.ui.slack.messages.ts
│   │   └── mcp.client.*.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── web/             # Web UI application
│   ├── src/
│   │   └── index.tsx (was chat.ui.web.tsx)
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── router/          # MCP router service
│   ├── src/
│   │   ├── index.ts (was router.mcp.server.ts)
│   │   ├── router.mcp.server.auth.ts
│   │   ├── router.mcp.client.*.ts
│   │   └── router.mcp.server.test.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── discovery/       # MCP discovery/registry service
│   ├── src/
│   │   ├── index.ts (was registry.mcp.server.ts)
│   │   ├── registry.mcp.server.auth.ts
│   │   └── mcp.client.*.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── dashboard/       # Identity dashboard
│   ├── src/
│   │   ├── index.tsx (was registry.identity.dashboard.tsx)
│   │   └── registry.identity.store.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── whoami/          # Whoami service
│   ├── src/
│   │   └── index.ts (was whoami.mcp.server.ts)
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── inspector/       # MCP inspector
│   ├── src/
│   │   └── index.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── manifest.yaml
├── package.json     # Root workspace configuration
├── manifest.yaml    # Root Cloud Foundry manifest
└── README.md        # Updated documentation
```

## Key Changes

### 1. Package Structure
- **Root package.json**: Now acts as a workspace manager with yarn workspaces
- **Individual packages**: Each service has its own package.json with specific dependencies
- **Shared package**: Common utilities and types moved to `@mcp-identity/shared`

### 2. Import Updates
- **Relative imports**: Updated to use workspace package names (e.g., `@mcp-identity/shared`)
- **Shared types**: `Chat`, `Session`, `Tools` types now imported from shared package
- **YJS utilities**: `connectYjs` function now imported from shared package

### 3. Build Configuration
- **Individual builds**: Each package has its own build script
- **Workspace builds**: Root package can build all packages with `yarn build`
- **TypeScript configs**: Each package has its own tsconfig.json

### 4. Deployment
- **Individual manifests**: Each service has its own Cloud Foundry manifest
- **Root manifest**: Combined manifest for deploying all services
- **Independent deployment**: Services can be deployed individually or together

## Migration Steps

### 1. Automatic Migration
Run the migration script:
```bash
./scripts/migrate-to-monorepo.sh
```

### 2. Manual Migration (if needed)

#### Step 1: Install Dependencies
```bash
yarn install
```

#### Step 2: Build All Packages
```bash
yarn build
```

#### Step 3: Test Individual Services
```bash
# Test Slack service
yarn workspace @mcp-identity/slack dev

# Test Web service
yarn workspace @mcp-identity/web dev

# Test Router service
yarn workspace @mcp-identity/router dev

# Test Discovery service
yarn workspace @mcp-identity/discovery dev

# Test Dashboard service
yarn workspace @mcp-identity/dashboard dev

# Test Whoami service
yarn workspace @mcp-identity/whoami dev

# Test Inspector service
yarn workspace @mcp-identity/inspector dev
```

## Development Workflow

### Adding Dependencies
```bash
# Add to specific service
yarn workspace @mcp-identity/slack add <package-name>

# Add dev dependency
yarn workspace @mcp-identity/slack add -D <package-name>

# Add shared dependency
yarn add <package-name>
```

### Building
```bash
# Build all packages
yarn build

# Build specific package
yarn workspace @mcp-identity/slack build
```

### Running Services
```bash
# Run all services in development
yarn dev

# Run specific service
yarn start:slack
yarn start:web
yarn start:router
# etc.
```

## Deployment

### Individual Deployment
```bash
# Deploy Slack service
cd slack && cf push

# Deploy Web service
cd web && cf push

# Deploy Router service
cd router && cf push

# etc.
```

### All Services Deployment
```bash
# Deploy all services using root manifest
cf push
```

## Troubleshooting

### Common Issues

1. **Import Errors**
   - Ensure shared package is built: `yarn workspace @mcp-identity/shared build`
   - Check import paths use workspace names: `@mcp-identity/shared`

2. **Build Failures**
   - Clean and reinstall: `rm -rf node_modules && yarn install`
   - Build shared package first: `yarn workspace @mcp-identity/shared build`

3. **Deployment Issues**
   - Check individual manifest files
   - Verify environment variables in manifests
   - Ensure all dependencies are included in package.json

### Rollback
If needed, you can rollback to the original structure:
```bash
# Restore from backup
cp -r src.backup.* src/

# Revert package.json to original
git checkout HEAD -- package.json
```

## Benefits of New Structure

1. **Independent Development**: Each service can be developed and tested independently
2. **Selective Deployment**: Deploy only the services that have changed
3. **Clear Dependencies**: Each package has explicit dependencies
4. **Better Organization**: Clear separation of concerns
5. **Scalability**: Easier to add new services or modify existing ones
6. **Team Collaboration**: Different teams can work on different services

## Next Steps

1. **Test all services** in the new structure
2. **Update CI/CD pipelines** to work with the monorepo
3. **Document service-specific configurations**
4. **Set up monitoring** for individual services
5. **Plan for future service additions**

## Support

For issues during migration:
1. Check the troubleshooting section above
2. Review the backup files created during migration
3. Consult the individual service documentation
4. Create an issue with detailed error information 