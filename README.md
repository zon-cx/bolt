# MCP Identity Gate

A comprehensive Model Context Protocol (MCP) implementation featuring Slack integration, identity management, and a web-based dashboard for managing AI agents and their connections.

## 🚀 Overview

This project implements an **MCP Identity Gate** concept with personal MCP server networks, registry aggregation, and enterprise-grade authorization capabilities. The system consists of:

**MCP Servers - Core Components**:
- **MCP Registry**: Server metadata aggregator with dynamic capabilities management
- **MCP Router**: Gateway with transport, authorization, and routing capabilities
- **Personal MCP Servers**: Each user gets `/mcp/{user-id}` with registry tools

**Client Applications - Examples**:
- **Slack Assistant**: AI-powered Slack bot that connects to personal MCP servers
- **Web Dashboard**: React-based interface for managing personal MCP server spaces
- **Inspector**: Development tools for testing personal MCP servers


**Planned Features** (TBD):
- **Authorization Layer**: Dynamic policy guardians and scope control with OAuth 2.0 support
- **Agent Directory**: Complete agent lifecycle management from onboarding to policy assignment

**Key Concept**: Users authenticate and get their own MCP server space where they can add custom servers, with comprehensive registry tools and routing capabilities. Authorization policies and agent management capabilities are planned for future releases.

## 🏗️ Architecture

The system implements an **MCP Identity Gate** with personal MCP server networks, registry aggregation, and authorization capabilities. Here's the enhanced architecture:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Slack Bot     │    │  Cline          │    │   Inspector     │
│   (Assistant)   │    │   (IDE)         │    │   (Dev Tools)   │
│   Client        │    │   Client        │    │   Client        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      MCP Router - Server  │
                    │   (Personal MCP Workspace)│
                    │   (MCP Gate - Transport)  │
                    │   https://mcp-router.     │
                    │   cfapps.eu12.hana.       │
                    │   ondemand.com/mcp        │
                    │   • PEP & PDP             │
                    │   • Token Exchange        │
                    │   • Request Routing       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  MCP Registry             │
                    │  (Server Metadata         │
                    │   Aggregator)             │
                    │   • tools/list            │
                    │   • prompts/list          │
                    │   • completions/list      │
                    │   • resources/list        │
                    │   • Change Notifications  │
                    │   • Generic Tools Support │
                    └─────────────┬─────────────┘
                                  │
           
```

### Personal MCP Server Concept

When a user logs into the MCP router using `https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp` url, they get access to their **personal MCP server space** at:
```
https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp/{user-id}
```

**Each user's personal space includes:**
- **Registry Tools**: Built-in tools to discover and add MCP servers
- **Custom Servers**: Ability to add their own MCP servers
- **Personal URL**: Shareable MCP server URL for other clients
- **Server Management**: Tools to manage connected servers



```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Slack Bot     │    │  Web Dashboard  │    │   Inspector     │
│   (Assistant)   │    │   (React UI)    │    │   (Dev Tools)   │
│   Client        │    │   Client        │    │   Client        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │      MCP Router           │
                    │   (Personal MCP Workspace)│
                    │   (MCP Gate - Transport)  │
                    │   https://mcp-router.     │
                    │   cfapps.eu12.hana.       │
                    │   ondemand.com/mcp        │
                    │   • PEP & PDP             │
                    │   • Token Exchange        │
                    │   • Request Routing       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  MCP Registry             │
                    │  (Server Metadata         │
                    │   Aggregator)             │
                    │   • tools/list            │
                    │   • prompts/list          │
                    │   • completions/list      │
                    │   • resources/list        │
                    │   • Change Notifications  │
                    │   • Generic Tools Support │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  User Personal MCP Server │
                    │  /mcp/{user-id}           │
                    │  • Registry Tools         │
                    │  • Custom Servers         │
                    │  • Personal URL           │
                    │  • X MCP Server Example   │
                    └───────────────────────────┘
```

### Current Architecture (POC Implementation)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Slack Bot     │    │  Web Dashboard  │    │   Inspector     │
│   (Assistant)   │    │   (React UI)    │    │   (Dev Tools)   │
│   Client        │    │   Client        │    │   Client        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │  MCP Registry             │
                    │  (Server Metadata         │
                    │   Aggregator)             │
                    │   • tools/list            │
                    │   • prompts/list          │
                    │   • completions/list      │
                    │   • resources/list        │
                    │   • Change Notifications  │
                    │   • Generic Tools Support │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      MCP Router           │
                    │   (Personal MCP Workspace)│
                    │   (MCP Gate - Transport)  │
                    │   https://mcp-router.     │
                    │   cfapps.eu12.hana.       │
                    │   ondemand.com/mcp        │
                    │   • PEP & PDP             │
                    │   • Token Exchange        │
                    │   • Request Routing       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  User Personal MCP Server │
                    │  /mcp/{user-id}           │
                    │  • Registry Tools         │
                    │  • Custom Servers         │
                    │  • Personal URL           │
                    │  • X MCP Server Example   │
                    └───────────────────────────┘
```

### Future Architecture (With Authorization PEP)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Slack Bot     │    │  Web Dashboard  │    │   Inspector     │
│   (Assistant)   │    │   (React UI)    │    │   (Dev Tools)   │
│   Client        │    │   Client        │    │   Client        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │  MCP Registry             │
                    │  (Server Metadata         │
                    │   Aggregator)             │
                    │   • tools/list            │
                    │   • prompts/list          │
                    │   • completions/list      │
                    │   • resources/list        │
                    │   • Change Notifications  │
                    │   • Generic Tools Support │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      MCP Router           │
                    │   (Personal MCP Workspace)│
                    │   (MCP Gate - Transport)  │
                    │   https://mcp-router.     │
                    │   cfapps.eu12.hana.       │
                    │   ondemand.com/mcp        │
                    │   • PEP & PDP             │
                    │   • Token Exchange        │
                    │   • Request Routing       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Authorization PEP        │
                    │  (Policy Enforcement      │
                    │   Point)                  │
                    │   • Request Validation    │
                    │   • Policy Evaluation     │
                    │   • Token Validation      │
                    │   • Access Control        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Identity Provider (IDP)  │
                    │  • OAuth 2.0 / OIDC       │
                    │  • User Authentication    │
                    │  • Token Issuance         │
                    │  • Consent Management     │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  User Personal MCP Server │
                    │  /mcp/{user-id}           │
                    │  • Registry Tools         │
                    │  • Custom Servers         │
                    │  • Personal URL           │
                    │  • X MCP Server Example   │
                    └───────────────────────────┘
```

### Enterprise Architecture (With ORD & Identity Broker)

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Slack Bot     │    │  Web Dashboard  │    │   Inspector     │
│   (Assistant)   │    │   (React UI)    │    │   (Dev Tools)   │
│   Client        │    │   Client        │    │   Client        │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │  MCP Registry             │
                    │  (Server Metadata         │
                    │   Aggregator)             │
                    │   • tools/list            │
                    │   • prompts/list          │
                    │   • completions/list      │
                    │   • resources/list        │
                    │   • Change Notifications  │
                    │   • Generic Tools Support │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │      MCP Router           │
                    │   (Personal MCP Workspace)│
                    │   (MCP Gate - Transport)  │
                    │   https://mcp-router.     │
                    │   cfapps.eu12.hana.       │
                    │   ondemand.com/mcp        │
                    │   • PEP & PDP             │
                    │   • Token Exchange        │
                    │   • Request Routing       │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Authorization PEP       │
                    │  (Policy Enforcement      │
                    │   Point)                 │
                    │   • Request Validation    │
                    │   • Policy Evaluation     │
                    │   • Token Validation      │
                    │   • Access Control        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Identity Broker          │
                    │  • Multi-IDP Support      │
                    │  • Identity Federation    │
                    │  • Attribute Mapping      │
                    │  • Single Sign-On (SSO)   │
                    │  • Identity Synchronization│
                    │  • Agent Registration     │
                    │  • OIDC App Management    │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  ORD (Open Resource       │
                    │   Discovery)              │
                    │   • Resource Discovery    │
                    │   • API Catalog           │
                    │   • Service Registry      │
                    │   • Metadata Management   │
                    │   • Version Control       │
                    │   • Tool Binding          │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  User Personal MCP Server │
                    │  /mcp/{user-id}           │
                    │  • Registry Tools         │
                    │  • Custom Servers         │
                    │  • Personal URL           │
                    │  • X MCP Server Example   │
                    └───────────────────────────┘
```

### Network of Interconnected Servers

Users can:
1. **Connect to their personal server** from any MCP client
2. **Add other MCP servers** to their personal space
3. **Share their server URL** with other users
4. **Use any MCP client** (Slack, Inspector, Dashboard, etc.) to access their servers

**Example Usage:**
```bash
# Connect to your personal MCP server using any MCP client
# (Slack, Inspector, Dashboard, or any other MCP client)
MCP Url: https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp
# Use registry tools to manage servers in your personal space
@registry:list
@registry:connect --url https://my-custom-server.com/mcp
@registry:disconnect --id my-server-id
# Get your personal MCP server information
@registry:info

# If a server requires authentication, use auth tools:
@auth:server-name --reason "Access to server resources"
```

## 📦 Components

### 1. MCP Registry (`registry.mcp.server.ts`) - Server Metadata Aggregator
- **Purpose**: Comprehensive MCP server metadata aggregator with dynamic capabilities management
- **Features**:
  - **MCP List Methods**: Aggregated `tools/list`, `prompts/list`, `completions/list`, `resources/list`
  - **Dynamic Change Notifications**: Listen to server's list changed notifications
  - **Capabilities Aggregation**: Provide aggregated interface to MCP capabilities method
  - **Protected Resources Metadata**: Aggregated protected resources with policy annotations
  - **Generic Tools Support**: Built-in support for JIRA, Slack, Confluence, and other widely used tools
  - **Configuration Push**: Push aggregated configuration to MCP Gate & Authorization Module
  - **Server Version Management**: Import and maintain MCP server version information
  - **Real-time Updates**: Propagate changes across the network dynamically

### 2. MCP Router (`registry.router.mcp.server.ts`) - MCP Gate Transport
- **Purpose**: Personal MCP server gateway with transport, authorization, and routing capabilities
- **Features**:
  - **Personal Server Spaces**: Each user gets `/mcp/{user-id}` endpoint
  - **Registry Tools Integration**: Built-in tools for server discovery and management
  - **Authentication Tools**: Automatic `@auth:*` tools for OAuth flows
  - **Server Aggregation**: Combines multiple MCP servers into single endpoint
  - **PEP & PDP**: Policy Enforcement Point and Policy Decision Point
  - **Token Exchange**: Downstream IDP token exchange for upstream requests
  - **Request Routing**: Intelligent routing based on aggregated MCP capabilities
  - **MCP Authorization Protocol**: Full support for MCP authorization specification
  - **Transport Handling**: HTTP/SSE transport support with authentication
  - **Session Management**: Persistent connections and state

### 3. Authorization Module (TBD )
- **Purpose**: Comprehensive authorization system with policy management and scope control
- **Features** (Planned):
  - **Aggregated MCP Methods**: Use aggregated tools/list, prompts/list, completions/list, resources/list
  - **Policy Management**: Dynamic policy templates and value lists based on aggregated data
  - **Protected Resource Metadata**: Consume aggregated PRM and adapt with policies
  - **Scope Management**: Update scopes and policies of applications dynamically
  - **OAuth 2.0 Support**: Full OAuth 2.0 authorization flows
  - **MCP Authorization Protocol**: Support for MCP authorization specification
  - **Change Notifications**: Listen to server's list changed notifications and update policies
  - **Token Management**: Handle upstream/downstream token exchange

### 4. Agent Directory (TBD - Planned for Future Release)
- **Purpose**: Complete agent lifecycle management from onboarding to policy assignment
- **Features** (Planned):
  - **Agent Lifecycle Management**: Onboarding, policy assignment, authentication
  - **Agent Schema Support**: Support for agent design and instance management
  - **Custom Attributes**: Annotations for use in authorization policies
  - **Authentication Methods**: Client ID + secret, mTLS, technical user support
  - **OIDC RP Application**: Regular OIDC relying party with specific UI
  - **Credential Provisioning**: Client ID + secret, certificates, JWT tokens
  - **Policy Assignment**: Dynamic policy assignment based on agent attributes

### 5. Identity Broker (TBD - Planned for Future Release)
- **Purpose**: Central component for automated OIDC application management and agent registration
- **Features** (Planned):
  - **Multi-IDP Support**: Support for multiple identity providers
  - **Identity Federation**: Federated identity across different systems
  - **Attribute Mapping**: Map attributes between different identity systems
  - **Single Sign-On (SSO)**: Unified authentication across services
  - **Identity Synchronization**: Keep identities synchronized across systems
  - **Agent Registration**: Automated agent registration as multi-tenant applications
  - **OIDC App Management**: Automatic creation and management of OIDC applications
  - **Credential Management**: Support for mTLS certificates, client secrets, and JWT authentication
  - **Multi-tenant Support**: Enable agents across multiple customer tenants

### 6. ORD (Open Resource Discovery) (TBD )
- **Purpose**: Centralized resource discovery and API catalog management
- **Features** (Planned):
  - **Resource Discovery**: Discover and catalog available resources and APIs
  - **API Catalog**: Comprehensive catalog of available APIs and services
  - **Service Registry**: Registry of available services and their metadata
  - **Metadata Management**: Manage metadata for resources and services
  - **Version Control**: Track versions of APIs and services
  - **Tool Binding**: Define and manage tool bindings for MCP servers
  - **Service Integration**: Integrate with various service providers
  - **Discovery APIs**: Provide APIs for resource discovery

## 🔐 MCP Authorization Protocol Support

The system fully supports the MCP Authorization Protocol specification (https://modelcontextprotocol.io/specification/draft/basic/authorization) with the following capabilities:

### Authorization Server Protocol
- **Grant & Consent Elicitation**: Complete OAuth 2.0 grant and consent flows
- **Authentication & Step-up Tools**: Multi-factor authentication and step-up authentication
- **SAP MCP Server Example**: Built-in support for SAP-based MCP servers
- **Token Exchange**: Seamless token exchange between upstream and downstream IDPs

### Policy Enforcement & Decision
- **PEP (Policy Enforcement Point)**: Enforces authorization policies at the MCP gate
- **PDP (Policy Decision Point)**: Makes authorization decisions based on aggregated policies
- **Dynamic Policy Updates**: Real-time policy updates based on server capability changes
- **Scope Management**: Dynamic scope assignment and validation

### Enterprise Integration
- **Node.js on BTP**: Built on Node.js runtime for SAP Business Technology Platform
- **Server-side Gateway**: Acts as a server-side gateway for MCP client abstraction
- **Open Source Reference**: Leverages open source MCP implementations as reference
- **Production Ready**: Enterprise-grade implementation with comprehensive security

## 🚧 What's Next - Planned Features

### Authorization Module Implementation
- **Policy Management System**: Dynamic policy templates and value lists
- **Scope Management**: Update scopes and policies of applications dynamically
- **Protected Resource Metadata**: Consume aggregated PRM and adapt with policies
- **MCP Authorization Protocol**: Full implementation of MCP authorization specification
- **Token Exchange**: Handle upstream/downstream token exchange

### Agent Directory Implementation
- **Agent Lifecycle Management**: Complete onboarding, policy assignment, and authentication
- **Agent Schema Support**: Support for agent design and instance management
- **Custom Attributes**: Annotations for use in authorization policies
- **Authentication Methods**: Client ID + secret, mTLS, technical user support
- **OIDC RP Application**: Regular OIDC relying party with specific UI
- **Credential Provisioning**: Client ID + secret, certificates, JWT tokens

### Enhanced Registry Capabilities
- **Advanced Metadata Aggregation**: Enhanced tools/list, prompts/list, completions/list, resources/list
- **Real-time Change Propagation**: Improved change notification system
- **Generic Tools Integration**: Enhanced support for JIRA, Slack, Confluence, and other tools
- **Configuration Management**: Advanced configuration push to MCP Gate & Authorization Module

---

**📋 For detailed future plans and roadmap, see [FUTURE_PLANS.md](./FUTURE_PLANS.md)**

## Client Examples

### 1. Slack Assistant (`chat.ui.slack.ts`)
- **Purpose**: AI-powered Slack bot that connects to personal MCP servers
- **Features**:
  - **Personal MCP Connection**: Connects to user's personal MCP server space
  - **OAuth Authentication**: Secure authentication flow
  - **Real-time Message Processing**: Handles Slack messages and events
  - **Tool Calling**: Executes tools from connected MCP servers
  - **Thread-based Conversations**: Maintains conversation context
  - **Status Updates**: Real-time status and progress updates
  - **Suggested Prompts**: AI-generated conversation suggestions

### 2. Web Dashboard (`registry.identity.dashboard.tsx`)
- **Purpose**: React-based web interface for managing personal MCP server spaces
- **Features**:
  - **Personal Server Management**: Manage your personal MCP server space
  - **Server Discovery**: Find and add MCP servers to your space
  - **Real-time Tool Monitoring**: Monitor tools from connected servers
  - **OAuth Authentication**: Secure login and session management
  - **Server Status Tracking**: Real-time status of connected servers
  - **Interactive Tool Testing**: Test tools directly in the interface
  - **URL Sharing**: Get your personal MCP server URL for sharing

## Server Examples

### 5. Whoami MCP Server (`whoami.mcp.server.ts`)
- **Purpose**: Simple MCP server for testing downstream authentication flows, use with @registry:connect
- **Features**:
  - **Authentication Testing**: Test OAuth flows and token validation
  - **Basic MCP Implementation**: Demonstrates standard MCP server patterns
  - **Downstream Auth**: Shows how authentication works in MCP networks
  - **Development Tool**: Used for testing authentication in the personal server network

## 🛠️ Technology Stack

- **Runtime**: Node.js 22.16.0 (SAP BTP Compatible)
- **Language**: TypeScript
- **Framework**: Express.js, Hono
- **State Management**: XState
- **UI**: React 19, Tailwind CSS
- **Real-time**: YJS, WebSockets
- **Authentication**: OAuth 2.0, JWT, mTLS
- **Authorization**: MCP Authorization Protocol, PEP/PDP
- **Protocol**: Model Context Protocol (MCP)
- **Enterprise**: SAP BTP Integration, Agent Directory
- **Registry**: Dynamic Metadata Aggregation, Change Notifications
- **Build Tool**: pkgroll
- **Package Manager**: Yarn 1.22.22

## 🚀 Quick Start

### Prerequisites

- Node.js 22.16.0
- Yarn 1.22.22
- Slack App credentials
- Cloud Foundry account (for deployment)

### Understanding the Personal MCP Server Concept

Before starting, understand that this system provides **personal MCP server spaces**:

1. **Each user gets their own MCP server** at `/mcp/{user-id}`
2. **Registry tools are always available** for server management
3. **Users can add custom servers** to their personal space
4. **Personal URLs are shareable** with other users
5. **Any MCP client can connect** to personal servers

### Local Development

1. **Clone and Install**
   ```bash
   git clone <repository-url>
   cd slack
   yarn install
   ```

2. **Environment Setup**
   ```bash
   cp .env.example .env.local
   # Configure your environment variables
   ```

3. **Start Development Servers**
   ```bash
   # Start Slack bot
   yarn dev
   
   # Start web dashboard
   yarn dashboard
   
   # Start registry server
   yarn registry
   
   # Start router
   yarn router
   ```

### Production Deployment

The project is configured for Cloud Foundry deployment with multiple applications:

```bash
# Build the project
yarn build

# Deploy to Cloud Foundry
yarn deploy:mta
```

## 📋 Available Scripts

| Script | Description |
|--------|-------------|
| `yarn dev` | Start Slack bot in development mode |
| `yarn web` | Start web interface |
| `yarn dashboard` | Start identity dashboard |
| `yarn registry` | Start MCP registry server |
| `yarn router` | Start MCP router |
| `yarn inspector` | Start MCP inspector |
| `yarn build` | Build all components |
| `yarn test` | Run tests |
| `yarn deploy:mta` | Deploy to Cloud Foundry |

## 🔧 Configuration

### Environment Variables

```bash
# Core Configuration
NODE_ENV=production
BASE_URL=https://your-domain.com

# MCP Configuration (Production URLs from manifest.yaml)
MCP_GATEWAY_URL=https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp
MCP_REGISTRY_URL=https://registry.cfapps.eu12.hana.ondemand.com/mcp
MCP_DASHBOARD_URL=https://dashboard.cfapps.eu12.hana.ondemand.com
MCP_INSPECTOR_URL=https://inspector.cfapps.eu12.hana.ondemand.com

# Slack Configuration
SLACK_BOT_TOKEN=xoxb-your-bot-token
SLACK_SIGNING_SECRET=your-signing-secret

# YJS Configuration
YJS_URL=wss://hp.cfapps.us10-001.hana.ondemand.com

# Authentication
OAUTH_CLIENT_ID=your-oauth-client-id
OAUTH_CLIENT_SECRET=your-oauth-client-secret
```

### Personal MCP Server URLs

Each user gets their personal MCP server at:
```
https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp/{user-id}
```

**Available Production Services:**
- **MCP Router**: `https://mcp-router.cfapps.eu12.hana.ondemand.com`
- **Registry Server**: `https://registry.cfapps.eu12.hana.ondemand.com`
- **Dashboard**: `https://dashboard.cfapps.eu12.hana.ondemand.com`
- **Inspector**: `https://inspector.cfapps.eu12.hana.ondemand.com`
- **Slack Bot**: `https://slack.cfapps.eu12.hana.ondemand.com`
- **Web Assistant**: `https://assistant.cfapps.eu12.hana.ondemand.com`

### Slack App Setup

1. Create a new Slack app at https://api.slack.com/apps
2. Enable the following features:
   - Assistant API
   - OAuth & Permissions
   - Event Subscriptions
3. Configure OAuth scopes:
   - `chat:write`
   - `users:read`
   - `channels:read`
4. Set up event subscriptions for:
   - `assistant_thread_started`
   - `message`

## 🔐 Authentication & Personal Spaces

The system uses OAuth 2.0 for authentication and provides **personal MCP server spaces** for each user.

### Authentication Providers

- **Slack OAuth**: For Slack bot authentication
- **Dashboard OAuth**: For web dashboard access
- **MCP OAuth**: For MCP client-server authentication
- **Personal Server OAuth**: For accessing personal MCP server spaces

### Personal MCP Server Access

When a user authenticates, they get access to their personal MCP server space:

1. **User logs in** via OAuth
2. **Personal server is created** at `/mcp/{user-id}`
3. **Registry tools are available** by default
4. **User can add custom servers** to their space
5. **Personal URL is generated** for sharing

### OAuth Flow

1. User initiates authentication
2. System redirects to OAuth provider
3. User authorizes the application
4. Provider returns authorization code
5. System exchanges code for access token
6. **Personal MCP server space is created/accessed**
7. Token is stored and used for subsequent requests

### Using Personal MCP Servers

**From any MCP client (Slack, Inspector, Dashboard, etc.):**
```bash
# Connect to your personal server using any MCP client
# URL: https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp/your-user-id

# Use registry tools to manage your server space
@registry:list
@registry:connect --url https://example.com/mcp
@registry:disconnect --id server-id

# Get your personal server information
@registry:info
# Returns your personal MCP server URL for sharing
```

### Authentication Tools (`@auth:*`)

The system automatically provides **authentication tools** for servers that require OAuth authentication:

**How `@auth:*` tools work:**
- **Automatic Generation**: When you connect to a server that requires authentication, an `@auth:{server-name}` tool is automatically created
- **OAuth Flow**: These tools handle the OAuth 2.0 authentication flow for connected servers
- **Authorization URLs**: They provide authorization URLs that users can visit to authenticate
- **Dynamic Availability**: Auth tools only appear when servers are in "authenticating" state

**Example Usage:**
```bash
# When a server requires authentication, you'll see tools like:
@auth:github
@auth:google-drive
@auth:custom-server

# Use the auth tool to get authorization URL
@auth:github --reason "Access to repositories"

# Returns:
{
  "authorizationUrl": "https://github.com/login/oauth/authorize?..."
}

# Visit the URL to authenticate, then the server becomes available
```

**Authentication Flow:**
1. **Connect to server** that requires OAuth
2. **Auth tool appears** automatically (`@auth:server-name`)
3. **Call auth tool** to get authorization URL
4. **Visit URL** to authenticate with the service
5. **Server becomes ready** and tools become available
6. **Auth tool disappears** once authenticated

## 🧪 Testing

```bash
# Run all tests
yarn test

# Run specific test suites
yarn test:integration
yarn test:unit
```

## 📊 Monitoring

The system includes comprehensive monitoring:

- **Memory Monitoring**: Automatic memory usage tracking
- **Connection Monitoring**: Real-time connection status
- **Error Tracking**: Centralized error handling and logging
- **Performance Metrics**: Request/response timing

## 🔍 Debugging & Testing

### MCP Inspector

Use the standard MCP Inspector for debugging personal MCP servers:

```bash
yarn inspector
```

This provides:
- **Protocol inspection** for MCP messages
- **Connection testing** to personal servers
- **Tool validation** from connected servers
- **Performance analysis** of MCP operations
- **Standard MCP debugging** using the official MCP Inspector tool

### Testing Personal MCP Servers

**Test your personal server using the MCP Inspector:**
```bash
# Start the MCP Inspector
yarn inspector

# Connect to your personal server
# URL: https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp/your-user-id

# Test registry tools
@registry:info
@registry:list
@registry:connect --url https://example.com/mcp

# Test authentication tools (if server requires auth)
@auth:example-server --reason "Testing authentication"

# Test custom servers you've added to your space
@your-custom-server:some-tool
```

**Test with different MCP clients:**
```bash
# Test with Slack bot
# Configure Slack to connect to your personal server

# Test with web dashboard
# Login to dashboard and connect to your personal server

# Test with any other MCP client
# Connect to: https://mcp-router.cfapps.eu12.hana.ondemand.com/mcp/your-user-id
```

### Logging

Enable detailed logging with:

```bash
LOG_SENSITIVE_CONNECTION_DATA=true
LOG_REMOTE_USER=true
LOG_REFERER=true
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

ISC License

## 🆘 Support

For issues and questions:
1. Check the documentation
2. Review existing issues
3. Create a new issue with detailed information

## 🔄 Version History

- **v0.0.3**: Enhanced MCP Identity Gate POC with registry and routing capabilities
  - Added MCP Registry with metadata aggregation
  - Enhanced MCP Router with transport and routing capabilities
  - Basic PEP/PDP framework (TBD for full implementation)
  - SAP BTP integration preparation
  - Authorization Module and Agent Directory planned for future releases
- **v0.0.2**: Full MCP implementation with personal server spaces
- **v0.0.1**: Initial release with basic Slack integration

---

**Note**: This is a production-ready system designed for enterprise use with comprehensive authentication, monitoring, and scalability features.
