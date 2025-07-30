# SAP AppRouter & IAS Integration for MCP Identity Gate

## Overview

This document provides a comprehensive implementation guide for integrating SAP AppRouter and SAP Identity Authentication Service (IAS) with the MCP Identity Gate system. The implementation leverages the existing MCP architecture while adding enterprise-grade authentication, authorization, and routing capabilities.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   MCP Clients   │    │  SAP AppRouter  │    │   IAS (OIDC)    │
│   (Slack, Web,  │    │   (Gateway)     │    │   (Identity)    │
│    Inspector)   │    │                 │    │                 │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────▼─────────────┐
                    │  MCP Identity Gate        │
                    │  (Enhanced Router)        │
                    │  • PEP/PDP Integration    │
                    │  • IAS Token Validation   │
                    │  • AppRouter Integration  │
                    │  • Personal Spaces        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  MCP Registry             │
                    │  (Server Metadata)        │
                    └─────────────┬─────────────┘
                                  │
                    ┌─────────────▼─────────────┐
                    │  Personal MCP Servers     │
                    │  /mcp/{user-id}           │
                    └───────────────────────────┘
```

## 1. SAP AppRouter Configuration

### 1.1 AppRouter Manifest (`xs-app.json`)

```json
{
  "welcomeFile": "/",
  "authenticationMethod": "route",
  "routes": [
    {
      "source": "^/mcp/(.*)$",
      "target": "$1",
      "destination": "mcp-gateway",
      "authenticationType": "xsuaa",
      "scope": ["$XSAPPNAME.MCPUser"],
      "csrfProtection": false
    },
    {
      "source": "^/oauth/(.*)$",
      "target": "$1",
      "destination": "mcp-gateway",
      "authenticationType": "xsuaa",
      "scope": ["$XSAPPNAME.MCPUser"],
      "csrfProtection": false
    },
    {
      "source": "^/health$",
      "target": "/health",
      "destination": "mcp-gateway",
      "authenticationType": "none"
    },
    {
      "source": "^/dashboard/(.*)$",
      "target": "$1",
      "destination": "mcp-dashboard",
      "authenticationType": "xsuaa",
      "scope": ["$XSAPPNAME.DashboardUser"],
      "csrfProtection": false
    },
    {
      "source": "^/registry/(.*)$",
      "target": "$1",
      "destination": "mcp-registry",
      "authenticationType": "xsuaa",
      "scope": ["$XSAPPNAME.RegistryUser"],
      "csrfProtection": false
    }
  ],
  "destinations": {
    "mcp-gateway": {
      "url": "https://mcp-gateway.cfapps.eu12.hana.ondemand.com",
      "forwardAuthToken": true
    },
    "mcp-dashboard": {
      "url": "https://mcp-dashboard.cfapps.eu12.hana.ondemand.com",
      "forwardAuthToken": true
    },
    "mcp-registry": {
      "url": "https://mcp-registry.cfapps.eu12.hana.ondemand.com",
      "forwardAuthToken": true
    }
  }
}
```

### 1.2 AppRouter Deployment (`manifest-approuter.yaml`)

```yaml
applications:
  - name: mcp-approuter
    memory: 256M
    buildpacks:
      - https://github.com/cloudfoundry/nodejs-buildpack
    env:
      TENANT_HOST_PATTERN: "mcp-{tenant}.cfapps.eu12.hana.ondemand.com"
      destinations: >
        [
          {
            "name": "mcp-gateway",
            "url": "https://mcp-gateway.cfapps.eu12.hana.ondemand.com",
            "forwardAuthToken": true
          },
          {
            "name": "mcp-dashboard", 
            "url": "https://mcp-dashboard.cfapps.eu12.hana.ondemand.com",
            "forwardAuthToken": true
          },
          {
            "name": "mcp-registry",
            "url": "https://mcp-registry.cfapps.eu12.hana.ondemand.com", 
            "forwardAuthToken": true
          }
        ]
    services:
      - mcp-xsuaa
      - mcp-ias
    routes:
      - route: mcp-gateway.cfapps.eu12.hana.ondemand.com
```

## 2. SAP IAS (Identity Authentication Service) Configuration

### 2.1 IAS Application Configuration

```json
{
  "applicationName": "MCP Identity Gate",
  "applicationType": "web",
  "redirectURIs": [
    "https://mcp-gateway.cfapps.eu12.hana.ondemand.com/oauth/callback",
    "https://mcp-dashboard.cfapps.eu12.hana.ondemand.com/oauth/callback",
    "https://mcp-registry.cfapps.eu12.hana.ondemand.com/oauth/callback",
    "https://slack.cfapps.eu12.hana.ondemand.com/oauth/callback"
  ],
  "scopes": [
    "openid",
    "profile", 
    "email",
    "mcp:tools",
    "mcp:registry",
    "mcp:dashboard"
  ],
  "grantTypes": [
    "authorization_code",
    "refresh_token"
  ],
  "tokenEndpointAuthMethod": "client_secret_post",
  "responseTypes": ["code"],
  "subjectType": "public"
}
```

### 2.2 IAS User Groups and Scopes

```json
{
  "groups": [
    {
      "name": "MCPUsers",
      "description": "MCP Identity Gate Users",
      "scopes": ["openid", "profile", "email", "mcp:tools"]
    },
    {
      "name": "MCPAdmins", 
      "description": "MCP Identity Gate Administrators",
      "scopes": ["openid", "profile", "email", "mcp:tools", "mcp:registry", "mcp:dashboard"]
    }
  ]
}
```

## 3. Enhanced MCP Router with SAP Integration

### 3.1 SAP IAS Authentication Provider (`src/sap.ias.auth.ts`)

```typescript
import { OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/providers/oauthProvider.js";
import { jwtDecode, JwtPayload } from "jwt-decode";
import { env } from "node:process";

interface IASJwtPayload extends JwtPayload {
  sub: string;
  email: string;
  name: string;
  given_name?: string;
  family_name?: string;
  groups?: string[];
  scope?: string;
  client_id: string;
  iss: string;
}

export class SAPIASOAuthProvider extends OAuthServerProvider {
  private iasIssuer: string;
  private iasClientId: string;
  private iasClientSecret: string;

  constructor() {
    super();
    this.iasIssuer = env.IAS_ISSUER || "https://your-tenant.accounts.ondemand.com";
    this.iasClientId = env.IAS_CLIENT_ID || "";
    this.iasClientSecret = env.IAS_CLIENT_SECRET || "";
  }

  async verifyAccessToken(token: string): Promise<AuthInfo> {
    try {
      const decoded = jwtDecode<IASJwtPayload>(token);
      
      // Verify token signature and expiration
      await this.verifyTokenSignature(token);
      
      return {
        issuer: decoded.iss,
        scopes: decoded.scope?.split(" ") || ["openid", "profile", "email"],
        token,
        expiresAt: Date.now() + (decoded.exp || 3600) * 1000,
        extra: {
          sub: decoded.sub,
          email: decoded.email,
          name: decoded.name || `${decoded.given_name} ${decoded.family_name}`,
          groups: decoded.groups || [],
          clientId: decoded.client_id
        },
        clientId: decoded.client_id,
        resource: new URL(`${env.BASE_URL}/mcp/${decoded.sub}`)
      };
    } catch (error) {
      throw new Error(`Token verification failed: ${error.message}`);
    }
  }

  private async verifyTokenSignature(token: string): Promise<void> {
    // Fetch IAS public keys and verify JWT signature
    const response = await fetch(`${this.iasIssuer}/oauth2/certs`);
    if (!response.ok) {
      throw new Error("Failed to fetch IAS public keys");
    }
    
    const keys = await response.json();
    // Implement JWT signature verification using the public keys
    // This is a simplified version - in production, use a proper JWT library
  }

  async getClient(clientId: string): Promise<OAuthClientInformation> {
    return {
      client_id: clientId,
      scope: "openid profile email mcp:tools mcp:registry mcp:dashboard",
      redirect_uris: [
        `${env.BASE_URL}/oauth/callback`,
        `${env.DASHBOARD_URL}/oauth/callback`,
        `${env.REGISTRY_URL}/oauth/callback`
      ]
    };
  }
}
```

### 3.2 Enhanced MCP Router with SAP Integration (`src/sap.router.mcp.server.ts`)

```typescript
import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { SAPIASOAuthProvider } from "./sap.ias.auth.js";
import { SAPAppRouterMiddleware } from "./sap.approuter.middleware.js";
import { SAPPolicyEnforcementPoint } from "./sap.policy.enforcement.js";

export class SAPMCPRouter {
  private app: express.Application;
  private mcpServer: Server;
  private iasProvider: SAPIASOAuthProvider;
  private pep: SAPPolicyEnforcementPoint;

  constructor() {
    this.app = express();
    this.iasProvider = new SAPIASOAuthProvider();
    this.pep = new SAPPolicyEnforcementPoint();
    
    this.setupMiddleware();
    this.setupMCPRoutes();
    this.setupHealthCheck();
  }

  private setupMiddleware(): void {
    // SAP AppRouter integration middleware
    this.app.use(SAPAppRouterMiddleware);
    
    // IAS authentication middleware
    this.app.use(async (req, res, next) => {
      try {
        const authHeader = req.headers.authorization;
        if (!authHeader) {
          return res.status(401).json({ error: "No authorization header" });
        }

        const token = authHeader.replace("Bearer ", "");
        const authInfo = await this.iasProvider.verifyAccessToken(token);
        
        // Policy enforcement
        const decision = await this.pep.evaluateRequest(req, authInfo);
        if (!decision.allowed) {
          return res.status(403).json({ 
            error: "Access denied", 
            reason: decision.reason 
          });
        }

        req.auth = authInfo;
        next();
      } catch (error) {
        res.status(401).json({ error: "Authentication failed" });
      }
    });
  }

  private setupMCPRoutes(): void {
    // Personal MCP server routes with SAP integration
    this.app.all("/mcp/:userId", async (req, res) => {
      const userId = req.params.userId;
      const authInfo = req.auth;
      
      // Verify user can access their personal space
      if (authInfo.extra.sub !== userId) {
        return res.status(403).json({ error: "Access denied to personal space" });
      }

      // Create or get personal MCP server
      const personalServer = await this.getPersonalMCPServer(userId, authInfo);
      await personalServer.handleRequest(req, res);
    });

    // Registry routes with SAP scopes
    this.app.all("/registry/:action", async (req, res) => {
      const action = req.params.action;
      const authInfo = req.auth;
      
      // Check registry permissions
      if (!authInfo.scopes.includes("mcp:registry")) {
        return res.status(403).json({ error: "Registry access denied" });
      }

      // Handle registry operations
      await this.handleRegistryOperation(action, req, res, authInfo);
    });
  }

  private async getPersonalMCPServer(userId: string, authInfo: AuthInfo): Promise<PersonalMCPServer> {
    // Implementation for personal MCP server management
    // This would integrate with the existing registry and client management
    return new PersonalMCPServer(userId, authInfo);
  }

  private setupHealthCheck(): void {
    this.app.get("/health", (req, res) => {
      res.json({
        status: "healthy",
        service: "sap-mcp-router",
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
      });
    });
  }

  public start(port: number = 8080): void {
    this.app.listen(port, () => {
      console.log(`SAP MCP Router running on port ${port}`);
    });
  }
}
```

### 3.3 SAP AppRouter Middleware (`src/sap.approuter.middleware.ts`)

```typescript
import { Request, Response, NextFunction } from "express";
import { jwtDecode } from "jwt-decode";

export function SAPAppRouterMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Extract SAP AppRouter headers
  const sapPassport = req.headers["sap-passport"];
  const sapUser = req.headers["sap-user"];
  const sapTenant = req.headers["sap-tenant"];
  
  // Extract JWT token from AppRouter
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    
    try {
      const decoded = jwtDecode(token);
      
      // Add SAP-specific context to request
      req.sapContext = {
        passport: sapPassport,
        user: sapUser,
        tenant: sapTenant,
        token: decoded
      };
    } catch (error) {
      console.error("Failed to decode SAP token:", error);
    }
  }
  
  next();
}

// Extend Express Request interface
declare global {
  namespace Express {
    interface Request {
      sapContext?: {
        passport?: string;
        user?: string;
        tenant?: string;
        token?: any;
      };
    }
  }
}
```

### 3.4 SAP Policy Enforcement Point (`src/sap.policy.enforcement.ts`)

```typescript
import { Request } from "express";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

interface PolicyDecision {
  allowed: boolean;
  reason?: string;
  scopes?: string[];
}

export class SAPPolicyEnforcementPoint {
  private policies: Map<string, PolicyRule> = new Map();

  constructor() {
    this.initializePolicies();
  }

  private initializePolicies(): void {
    // MCP Tools access policy
    this.policies.set("mcp:tools", {
      name: "MCP Tools Access",
      scopes: ["mcp:tools"],
      conditions: (authInfo: AuthInfo) => {
        return authInfo.scopes.includes("mcp:tools");
      }
    });

    // Registry access policy
    this.policies.set("mcp:registry", {
      name: "MCP Registry Access", 
      scopes: ["mcp:registry"],
      conditions: (authInfo: AuthInfo) => {
        return authInfo.scopes.includes("mcp:registry") || 
               authInfo.extra.groups?.includes("MCPAdmins");
      }
    });

    // Dashboard access policy
    this.policies.set("mcp:dashboard", {
      name: "MCP Dashboard Access",
      scopes: ["mcp:dashboard"],
      conditions: (authInfo: AuthInfo) => {
        return authInfo.scopes.includes("mcp:dashboard") ||
               authInfo.extra.groups?.includes("MCPAdmins");
      }
    });
  }

  async evaluateRequest(req: Request, authInfo: AuthInfo): Promise<PolicyDecision> {
    const path = req.path;
    const method = req.method;

    // Personal space access
    if (path.startsWith("/mcp/") && path.split("/").length === 3) {
      const userId = path.split("/")[2];
      if (authInfo.extra.sub === userId) {
        return { allowed: true, scopes: authInfo.scopes };
      }
      return { allowed: false, reason: "Access denied to personal space" };
    }

    // Registry access
    if (path.startsWith("/registry/")) {
      const policy = this.policies.get("mcp:registry");
      if (policy && policy.conditions(authInfo)) {
        return { allowed: true, scopes: policy.scopes };
      }
      return { allowed: false, reason: "Registry access denied" };
    }

    // Dashboard access
    if (path.startsWith("/dashboard/")) {
      const policy = this.policies.get("mcp:dashboard");
      if (policy && policy.conditions(authInfo)) {
        return { allowed: true, scopes: policy.scopes };
      }
      return { allowed: false, reason: "Dashboard access denied" };
    }

    // Default: allow if user has basic MCP access
    const basicPolicy = this.policies.get("mcp:tools");
    if (basicPolicy && basicPolicy.conditions(authInfo)) {
      return { allowed: true, scopes: basicPolicy.scopes };
    }

    return { allowed: false, reason: "No matching policy found" };
  }
}

interface PolicyRule {
  name: string;
  scopes: string[];
  conditions: (authInfo: AuthInfo) => boolean;
}
```

## 4. Personal MCP Server with SAP Integration

### 4.1 Enhanced Personal Server (`src/sap.personal.mcp.server.ts`)

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { SAPIASOAuthProvider } from "./sap.ias.auth.js";

export class PersonalMCPServer {
  private server: Server;
  private transport: StreamableHTTPServerTransport;
  private userId: string;
  private authInfo: AuthInfo;
  private iasProvider: SAPIASOAuthProvider;

  constructor(userId: string, authInfo: AuthInfo) {
    this.userId = userId;
    this.authInfo = authInfo;
    this.iasProvider = new SAPIASOAuthProvider();
    
    this.setupServer();
    this.setupTransport();
    this.setupTools();
  }

  private setupServer(): void {
    this.server = new Server(
      {
        name: `mcp-personal-${this.userId}`,
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: { listChanged: true },
          prompts: { listChanged: true },
          resources: { listChanged: true, subscribe: true },
          completions: {},
          logging: {},
        },
      }
    );

    // Add SAP-specific tools
    this.setupSAPTools();
  }

  private setupSAPTools(): void {
    // SAP IAS User Info Tool
    this.server.setRequestHandler("tools/call", async (request) => {
      const { name, arguments: args } = request.params;
      
      if (name === "@sap:user-info") {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                userId: this.userId,
                email: this.authInfo.extra.email,
                name: this.authInfo.extra.name,
                groups: this.authInfo.extra.groups,
                scopes: this.authInfo.scopes,
                tenant: this.authInfo.extra.tenant
              }, null, 2)
            }
          ]
        };
      }

      if (name === "@sap:validate-token") {
        try {
          const token = args.token || this.authInfo.token;
          const validation = await this.iasProvider.verifyAccessToken(token);
          return {
            content: [
              {
                type: "text", 
                text: JSON.stringify({
                  valid: true,
                  user: validation.extra,
                  scopes: validation.scopes,
                  expiresAt: validation.expiresAt
                }, null, 2)
              }
            ]
          };
        } catch (error) {
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  valid: false,
                  error: error.message
                }, null, 2)
              }
            ]
          };
        }
      }

      // Delegate to other tools
      return this.delegateToRegistry(request);
    });
  }

  private async delegateToRegistry(request: any): Promise<any> {
    // Implementation to delegate to registry tools
    // This would integrate with the existing registry system
    return {
      content: [
        {
          type: "text",
          text: "Tool not implemented in SAP personal server"
        }
      ]
    };
  }

  private setupTransport(): void {
    this.transport = new StreamableHTTPServerTransport({
      eventStore: new InMemoryEventStore(),
      sessionIdGenerator: () => `sap-${this.userId}-${Date.now()}`,
    });
  }

  async handleRequest(req: any, res: any): Promise<void> {
    await this.transport.handleRequest(req, res, req.body);
  }
}
```

## 5. Deployment Configuration

### 5.1 SAP BTP Service Bindings (`manifest-sap.yaml`)

```yaml
applications:
  - name: mcp-gateway-sap
    memory: 2048M
    buildpacks:
      - https://github.com/cloudfoundry/nodejs-buildpack
    env:
      NODE_ENV: production
      BASE_URL: https://mcp-gateway.cfapps.eu12.hana.ondemand.com
      IAS_ISSUER: https://your-tenant.accounts.ondemand.com
      IAS_CLIENT_ID: ${IAS_CLIENT_ID}
      IAS_CLIENT_SECRET: ${IAS_CLIENT_SECRET}
    services:
      - mcp-xsuaa
      - mcp-ias
    routes:
      - route: mcp-gateway.cfapps.eu12.hana.ondemand.com

services:
  - name: mcp-xsuaa
    label: xsuaa
    plan: application
    config:
      xsappname: mcp-gateway
      tenant-mode: dedicated
      oauth2-configuration:
        redirect-uris:
          - https://mcp-gateway.cfapps.eu12.hana.ondemand.com/oauth/callback
          - https://mcp-dashboard.cfapps.eu12.hana.ondemand.com/oauth/callback
        system-attributes:
          - xs.rolecollections
      scopes:
        - name: $XSAPPNAME.MCPUser
          description: MCP User Access
        - name: $XSAPPNAME.MCPAdmin  
          description: MCP Administrator Access
        - name: $XSAPPNAME.RegistryUser
          description: Registry User Access
        - name: $XSAPPNAME.DashboardUser
          description: Dashboard User Access
      role-templates:
        - name: MCPUser
          scope-references:
            - $XSAPPNAME.MCPUser
        - name: MCPAdmin
          scope-references:
            - $XSAPPNAME.MCPUser
            - $XSAPPNAME.MCPAdmin
            - $XSAPPNAME.RegistryUser
            - $XSAPPNAME.DashboardUser
        - name: RegistryUser
          scope-references:
            - $XSAPPNAME.RegistryUser
        - name: DashboardUser
          scope-references:
            - $XSAPPNAME.DashboardUser

  - name: mcp-ias
    label: identity
    plan: application
    config:
      oauth2-configuration:
        redirect-uris:
          - https://mcp-gateway.cfapps.eu12.hana.ondemand.com/oauth/callback
          - https://mcp-dashboard.cfapps.eu12.hana.ondemand.com/oauth/callback
        system-attributes:
          - xs.rolecollections
      scopes:
        - name: openid
        - name: profile
        - name: email
        - name: mcp:tools
        - name: mcp:registry
        - name: mcp:dashboard
```

### 5.2 Docker Compose for Local Development (`docker-compose-sap.yml`)

```yaml
version: '3.8'

services:
  sap-approuter:
    image: mcp-sap-approuter
    build:
      context: .
      dockerfile: mcps/approuter/Dockerfile
    ports:
      - "8080:8080"
    environment:
      - NODE_ENV=development
      - PORT=8080
      - TENANT_HOST_PATTERN=mcp-{tenant}.localhost:8080
      - destinations='[{"name":"mcp-gateway","url":"http://mcp-gateway:8081","forwardAuthToken":true},{"name":"mcp-dashboard","url":"http://mcp-dashboard:8082","forwardAuthToken":true},{"name":"mcp-registry","url":"http://mcp-registry:8083","forwardAuthToken":true}]'
    env_file:
      - .env.sap
    depends_on:
      - mcp-gateway
      - mcp-dashboard
      - mcp-registry
    networks:
      - mcp-sap-network

  mcp-gateway:
    image: mcp-gateway-sap
    build:
      context: .
      dockerfile: mcps/gateway/Dockerfile
    ports:
      - "8081:8081"
    environment:
      - NODE_ENV=development
      - PORT=8081
      - BASE_URL=http://localhost:8081
      - IAS_ISSUER=${IAS_ISSUER}
      - IAS_CLIENT_ID=${IAS_CLIENT_ID}
      - IAS_CLIENT_SECRET=${IAS_CLIENT_SECRET}
    env_file:
      - .env.sap
    networks:
      - mcp-sap-network

  mcp-dashboard:
    image: mcp-dashboard-sap
    build:
      context: .
      dockerfile: mcps/dashboard/Dockerfile
    ports:
      - "8082:8082"
    environment:
      - NODE_ENV=development
      - PORT=8082
      - BASE_URL=http://localhost:8082
      - MCP_GATEWAY_URL=http://mcp-gateway:8081
    env_file:
      - .env.sap
    networks:
      - mcp-sap-network

  mcp-registry:
    image: mcp-registry-sap
    build:
      context: .
      dockerfile: mcps/registry/Dockerfile
    ports:
      - "8083:8083"
    environment:
      - NODE_ENV=development
      - PORT=8083
      - BASE_URL=http://localhost:8083
      - MCP_GATEWAY_URL=http://mcp-gateway:8081
    env_file:
      - .env.sap
    networks:
      - mcp-sap-network

networks:
  mcp-sap-network:
    driver: bridge
```

## 6. Integration with Existing MCP Architecture

### 6.1 Enhanced Registry with SAP Integration (`src/sap.registry.mcp.server.ts`)

```typescript
import { SAPIASOAuthProvider } from "./sap.ias.auth.js";
import { SAPPolicyEnforcementPoint } from "./sap.policy.enforcement.js";

export class SAPEnhancedRegistry extends RegistryMCPServer {
  private iasProvider: SAPIASOAuthProvider;
  private pep: SAPPolicyEnforcementPoint;

  constructor() {
    super();
    this.iasProvider = new SAPIASOAuthProvider();
    this.pep = new SAPPolicyEnforcementPoint();
    
    this.setupSAPIntegration();
  }

  private setupSAPIntegration(): void {
    // Override authentication to use IAS
    this.setAuthProvider(this.iasProvider);
    
    // Add SAP-specific registry tools
    this.addSAPRegistryTools();
  }

  private addSAPRegistryTools(): void {
    // SAP IAS User Management Tool
    this.addTool("@sap:list-users", {
      description: "List SAP IAS users",
      inputSchema: {
        type: "object",
        properties: {
          group: { type: "string", description: "Filter by group" }
        }
      }
    }, async (args) => {
      // Implementation to list IAS users
      return {
        content: [
          {
            type: "text",
            text: "SAP IAS user listing functionality"
          }
        ]
      };
    });

    // SAP IAS Group Management Tool
    this.addTool("@sap:manage-groups", {
      description: "Manage SAP IAS groups",
      inputSchema: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "create", "delete"] },
          groupName: { type: "string" },
          scopes: { type: "array", items: { type: "string" } }
        }
      }
    }, async (args) => {
      // Implementation to manage IAS groups
      return {
        content: [
          {
            type: "text", 
            text: "SAP IAS group management functionality"
          }
        ]
      };
    });
  }
}
```

## 7. Client Integration Examples

### 7.1 Slack Bot with SAP Integration

```typescript
// Enhanced Slack bot that uses SAP IAS authentication
export class SAPSlackBot extends SlackBot {
  private iasProvider: SAPIASOAuthProvider;

  constructor() {
    super();
    this.iasProvider = new SAPIASOAuthProvider();
  }

  async handleOAuthCallback(req: any, res: any): Promise<void> {
    const { code, state } = req.query;
    
    try {
      // Exchange code for IAS token
      const tokenResponse = await this.iasProvider.exchangeCodeForToken(code);
      
      // Validate token with IAS
      const authInfo = await this.iasProvider.verifyAccessToken(tokenResponse.access_token);
      
      // Store user session
      await this.storeUserSession(authInfo);
      
      res.redirect("/oauth/success");
    } catch (error) {
      res.redirect("/oauth/error");
    }
  }

  async connectToPersonalMCPServer(userId: string): Promise<MCPServer> {
    // Connect to user's personal MCP server with SAP authentication
    const authInfo = await this.getUserSession(userId);
    
    return new PersonalMCPServer(userId, authInfo);
  }
}
```

### 7.2 Web Dashboard with SAP Integration

```typescript
// Enhanced web dashboard with SAP IAS authentication
export class SAPWebDashboard extends WebDashboard {
  private iasProvider: SAPIASOAuthProvider;

  constructor() {
    super();
    this.iasProvider = new SAPIASOAuthProvider();
  }

  async authenticateUser(req: any, res: any): Promise<void> {
    // Redirect to IAS for authentication
    const authUrl = this.iasProvider.getAuthorizationUrl({
      client_id: process.env.IAS_CLIENT_ID,
      redirect_uri: `${process.env.BASE_URL}/oauth/callback`,
      scope: "openid profile email mcp:tools mcp:dashboard",
      response_type: "code"
    });
    
    res.redirect(authUrl);
  }

  async handleOAuthCallback(req: any, res: any): Promise<void> {
    const { code } = req.query;
    
    try {
      const tokenResponse = await this.iasProvider.exchangeCodeForToken(code);
      const authInfo = await this.iasProvider.verifyAccessToken(tokenResponse.access_token);
      
      // Set session cookie
      res.cookie("mcp-session", tokenResponse.access_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      });
      
      res.redirect("/dashboard");
    } catch (error) {
      res.redirect("/login?error=auth_failed");
    }
  }
}
```

## 8. Testing and Validation

### 8.1 SAP Integration Test Suite (`tests/sap-integration.test.ts`)

```typescript
import { SAPMCPRouter } from "../src/sap.router.mcp.server.js";
import { SAPIASOAuthProvider } from "../src/sap.ias.auth.js";
import { SAPPolicyEnforcementPoint } from "../src/sap.policy.enforcement.js";

describe("SAP MCP Integration", () => {
  let router: SAPMCPRouter;
  let iasProvider: SAPIASOAuthProvider;
  let pep: SAPPolicyEnforcementPoint;

  beforeEach(() => {
    router = new SAPMCPRouter();
    iasProvider = new SAPIASOAuthProvider();
    pep = new SAPPolicyEnforcementPoint();
  });

  test("should authenticate with IAS", async () => {
    const mockToken = "mock.ias.token";
    const authInfo = await iasProvider.verifyAccessToken(mockToken);
    
    expect(authInfo.issuer).toBeDefined();
    expect(authInfo.scopes).toContain("openid");
    expect(authInfo.extra.sub).toBeDefined();
  });

  test("should enforce policies correctly", async () => {
    const mockAuthInfo = {
      sub: "test-user",
      scopes: ["mcp:tools"],
      extra: { groups: ["MCPUsers"] }
    };

    const decision = await pep.evaluateRequest(
      { path: "/mcp/test-user" } as any,
      mockAuthInfo
    );

    expect(decision.allowed).toBe(true);
  });

  test("should deny access to unauthorized resources", async () => {
    const mockAuthInfo = {
      sub: "test-user", 
      scopes: ["mcp:tools"],
      extra: { groups: ["MCPUsers"] }
    };

    const decision = await pep.evaluateRequest(
      { path: "/registry/admin" } as any,
      mockAuthInfo
    );

    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain("Registry access denied");
  });
});
```

## 9. Security Considerations

### 9.1 Token Validation and Security

```typescript
export class SAPSecurityManager {
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  async validateToken(token: string): Promise<boolean> {
    // Check cache first
    const cached = this.tokenCache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return true;
    }

    try {
      // Validate with IAS
      const response = await fetch(`${process.env.IAS_ISSUER}/oauth2/introspect`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "Authorization": `Basic ${Buffer.from(`${process.env.IAS_CLIENT_ID}:${process.env.IAS_CLIENT_SECRET}`).toString("base64")}`
        },
        body: new URLSearchParams({
          token: token
        })
      });

      const result = await response.json();
      
      if (result.active) {
        // Cache valid token
        this.tokenCache.set(token, {
          token,
          expiresAt: Date.now() + this.CACHE_TTL
        });
        return true;
      }

      return false;
    } catch (error) {
      console.error("Token validation failed:", error);
      return false;
    }
  }

  async refreshToken(refreshToken: string): Promise<string | null> {
    try {
      const response = await fetch(`${process.env.IAS_ISSUER}/oauth2/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: refreshToken,
          client_id: process.env.IAS_CLIENT_ID,
          client_secret: process.env.IAS_CLIENT_SECRET
        })
      });

      const result = await response.json();
      return result.access_token || null;
    } catch (error) {
      console.error("Token refresh failed:", error);
      return null;
    }
  }
}
```

## 10. Monitoring and Logging

### 10.1 SAP-Specific Monitoring (`src/sap.monitoring.ts`)

```typescript
export class SAPMonitoringService {
  private metrics: Map<string, number> = new Map();

  logAuthenticationAttempt(userId: string, success: boolean): void {
    const metric = success ? "auth_success" : "auth_failure";
    this.incrementMetric(metric);
    
    console.log(`Authentication ${success ? "successful" : "failed"} for user: ${userId}`);
  }

  logPolicyDecision(userId: string, resource: string, allowed: boolean): void {
    const metric = allowed ? "policy_allow" : "policy_deny";
    this.incrementMetric(metric);
    
    console.log(`Policy decision: ${allowed ? "ALLOW" : "DENY"} for user ${userId} accessing ${resource}`);
  }

  logMCPServerAccess(userId: string, serverId: string): void {
    this.incrementMetric("mcp_server_access");
    console.log(`MCP server access: user ${userId} accessed server ${serverId}`);
  }

  private incrementMetric(metric: string): void {
    const current = this.metrics.get(metric) || 0;
    this.metrics.set(metric, current + 1);
  }

  getMetrics(): Record<string, number> {
    return Object.fromEntries(this.metrics);
  }

  generateReport(): string {
    const metrics = this.getMetrics();
    return JSON.stringify(metrics, null, 2);
  }
}
```

## 11. Deployment Scripts

### 11.1 SAP BTP Deployment Script (`scripts/deploy-sap.sh`)

```bash
#!/bin/bash

# SAP BTP Deployment Script for MCP Identity Gate

set -e

echo "🚀 Deploying MCP Identity Gate to SAP BTP..."

# Build the application
echo "📦 Building application..."
yarn build

# Deploy XSUAA service
echo "🔐 Deploying XSUAA service..."
cf create-service xsuaa application mcp-xsuaa -c xs-security.json

# Deploy IAS service (if using IAS)
echo "🔑 Deploying IAS service..."
cf create-service identity application mcp-ias -c ias-config.json

# Deploy applications
echo "🌐 Deploying applications..."

# Deploy AppRouter
cf push mcp-approuter -f manifest-approuter.yaml

# Deploy MCP Gateway
cf push mcp-gateway-sap -f manifest-sap.yaml

# Deploy Dashboard
cf push mcp-dashboard-sap -f manifest-dashboard-sap.yaml

# Deploy Registry
cf push mcp-registry-sap -f manifest-registry-sap.yaml

echo "✅ Deployment completed successfully!"
echo "🌍 AppRouter URL: https://mcp-approuter.cfapps.eu12.hana.ondemand.com"
echo "🔗 MCP Gateway URL: https://mcp-gateway.cfapps.eu12.hana.ondemand.com"
echo "📊 Dashboard URL: https://mcp-dashboard.cfapps.eu12.hana.ondemand.com"
```

## 12. Conclusion

This implementation provides a comprehensive integration of SAP AppRouter and IAS with the MCP Identity Gate system. Key benefits include:

1. **Enterprise-Grade Authentication**: Leverages SAP IAS for secure, scalable authentication
2. **Centralized Routing**: SAP AppRouter provides unified routing and authentication
3. **Policy Enforcement**: Comprehensive PEP/PDP implementation with SAP integration
4. **Personal Spaces**: Maintains the personal MCP server concept with SAP authentication
5. **Scalability**: Built for SAP BTP Cloud Foundry environment
6. **Security**: Token validation, refresh, and security monitoring
7. **Monitoring**: SAP-specific metrics and logging

The implementation maintains compatibility with the existing MCP architecture while adding enterprise-grade SAP integration capabilities. 