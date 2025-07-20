# MCP Gate Kubernetes Deployment

This directory contains Kubernetes manifests for deploying the MCP Gate services.

## Services

1. **Slack Service** (`slack-deployment.yaml`)
   - Port: 3000
   - Purpose: Slack integration for MCP agents
   - Replicas: 2

2. **Router Service** (`router-deployment.yaml`)
   - Port: 8090
   - Purpose: MCP router for handling requests
   - Replicas: 2

3. **Registry Service** (`registry-deployment.yaml`)
   - Port: 80
   - Purpose: MCP registry for service discovery
   - Replicas: 2

4. **Inspector Service** (`inspector-deployment.yaml`)
   - Ports: 6274 (client), 6277 (server)
   - Purpose: MCP inspector for debugging
   - Replicas: 1

## Configuration

- **Namespace**: `mcp-gate`
- **ConfigMap**: `mcp-config` contains shared environment variables
- **Ingress**: Routes traffic to different services based on path

## Deployment

The Jenkins pipeline will:
1. Build Docker images for all services
2. Push images to Harbor registry
3. Apply Kubernetes manifests
4. Perform rolling updates
5. Wait for deployments to be ready

## Manual Deployment

```bash
# Apply namespace and config
kubectl apply -f namespace.yaml
kubectl apply -f configmap.yaml

# Deploy services
kubectl apply -f slack-deployment.yaml
kubectl apply -f router-deployment.yaml
kubectl apply -f registry-deployment.yaml
kubectl apply -f inspector-deployment.yaml
kubectl apply -f ingress.yaml

# Check deployment status
kubectl get pods -n mcp-gate
kubectl get services -n mcp-gate
kubectl get ingress -n mcp-gate
```

## Environment Variables

The following environment variables are configured via ConfigMap:
- `NODE_ENV`: Production environment
- `REGISTRY_URL`: Internal registry service URL
- `BASE_URL`: Base URL for the application
- `DANGEROUSLY_OMIT_AUTH`: Authentication bypass for inspector
- `CLIENT_PORT`: Inspector client port
- `SERVER_PORT`: Inspector server port

## Health Checks

All services include:
- Liveness probes to detect and restart failed containers
- Readiness probes to ensure traffic is only sent to ready containers
- Resource limits and requests for proper resource management 