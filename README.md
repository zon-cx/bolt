# MCP Identity Gateway Monorepo

This is a monorepo containing all the services for the MCP Identity Gateway platform. The repository is organized into separate packages for each service, making it easier to develop, deploy, and maintain individual components.

## Repository Structure

```
mcp-identity-monorepo/
├── shared/           # Shared utilities and types
├── slack/           # Slack bot application
├── web/             # Web UI application
├── router/          # MCP router service
├── discovery/       # MCP discovery/registry service
├── dashboard/       # Identity dashboard
├── whoami/          # Whoami service
├── inspector/       # MCP inspector
├── package.json     # Root workspace configuration
└── manifest.yaml    # Root Cloud Foundry manifest
```

## Services Overview

### Shared Package (`@mcp-identity/shared`)
- Common utilities and types used across all services
- YJS store configuration
- Chat types and interfaces

### Slack Service (`@mcp-identity/slack`)
- Slack bot integration
- Chat handlers and message processing
- AI-powered conversations

### Web Service (`@mcp-identity/web`)
- React-based web UI
- Chat interface for web users
- Modern UI with Tailwind CSS

### Router Service (`@mcp-identity/router`)
- MCP router implementation
- Authentication and authorization
- Client management and routing

### Discovery Service (`@mcp-identity/discovery`)
- MCP service discovery and registry
- Service catalog management
- Client API for service discovery

### Dashboard Service (`@mcp-identity/dashboard`)
- Identity management dashboard
- User authentication and authorization
- Admin interface for managing users

### Whoami Service (`@mcp-identity/whoami`)
- User identity verification service
- JWT token validation
- User profile information

### Inspector Service (`@mcp-identity/inspector`)
- MCP protocol inspector
- Debugging and development tools
- Protocol analysis utilities

## Getting Started

### Prerequisites
- Node.js 22.16.0
- Yarn 1.22.22
- Cloud Foundry CLI (for deployment)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd mcp-identity-monorepo
```

2. Install dependencies for all packages:
```bash
yarn install
```

3. Build all packages:
```bash
yarn build
```

### Development

#### Running Individual Services

Each service can be run independently:

```bash
# Run Slack service
yarn workspace slack dev

# Run Web service
yarn workspace web dev

# Run Router service
yarn workspace router dev

# Run Discovery service
yarn workspace discovery dev

# Run Dashboard service
yarn workspace dashboard dev

# Run Whoami service
yarn workspace whoami dev

# Run Inspector service
yarn workspace inspector dev
```

#### Running All Services

Use the root scripts to run all services:

```bash
# Build all packages
yarn build

# Run all services in development mode
yarn dev

# Start specific service in production mode
yarn start:slack
yarn start:web
yarn start:router
# etc.
```

### Deployment

#### Deploy Individual Services

Each service has its own manifest file and can be deployed independently:

```bash
# Deploy Slack service
cd slack && cf push

# Deploy Web service
cd web && cf push

# Deploy Router service
cd router && cf push

# etc.
```

#### Deploy All Services

Use the root manifest to deploy all services:

```bash
# Deploy all services
cf push

# Or use the deploy script
yarn deploy
```

## Package Management

### Adding Dependencies

To add dependencies to a specific service:

```bash
# Add to Slack service
yarn workspace @mcp-identity/slack add <package-name>

# Add to Web service
yarn workspace @mcp-identity/web add <package-name>

# Add dev dependency
yarn workspace @mcp-identity/slack add -D <package-name>
```

### Adding Shared Dependencies

To add dependencies that should be shared across all services, add them to the root package.json:

```bash
yarn add <package-name>
```

## Configuration

Each service has its own configuration files:

- `package.json` - Package dependencies and scripts
- `tsconfig.json` - TypeScript configuration
- `manifest.yaml` - Cloud Foundry deployment configuration

Environment variables are configured in the Cloud Foundry manifests and can be overridden per environment.

## Development Workflow

1. **Feature Development**: Work on features in the appropriate service package
2. **Shared Changes**: Update shared utilities in the `shared` package
3. **Testing**: Test changes in the specific service context
4. **Integration**: Test integration between services
5. **Deployment**: Deploy individual services or all services together

## Contributing

1. Create a feature branch from `main`
2. Make changes in the appropriate service package
3. Update shared code if needed
4. Test your changes
5. Submit a pull request

## Troubleshooting

### Common Issues

1. **Build Failures**: Ensure all dependencies are installed with `yarn install`
2. **Type Errors**: Check that shared types are properly exported
3. **Deployment Issues**: Verify manifest files and environment variables

### Getting Help

- Check the individual service README files for specific guidance
- Review the Cloud Foundry logs for deployment issues
- Ensure all environment variables are properly configured

## License

[Add your license information here]
