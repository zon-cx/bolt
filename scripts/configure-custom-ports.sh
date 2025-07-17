#!/bin/bash

# Script to configure custom ports for MCP Inspector app on Cloud Foundry
# Based on: https://docs.cloudfoundry.org/devguide/custom-ports.html

APP_NAME="inspector"
CLIENT_PORT=6274
SERVER_PORT=6277

echo "Configuring custom ports for $APP_NAME..."

# Step 1: Get the app GUID and process type
echo "Getting app GUID and process type..."
APP_INFO=$(cf app $APP_NAME --guid)
APP_GUID=$(echo "$APP_INFO" | grep "guid:" | awk '{print $2}')
PROCESS_TYPE=$(echo "$APP_INFO" | grep "type:" | awk '{print $2}')

echo "App GUID: $APP_GUID"
echo "Process Type: $PROCESS_TYPE"

# Step 2: Get the route GUID
echo "Getting route GUID..."
ROUTE_HOSTNAME="mcp-inspector"
ROUTES_INFO=$(cf curl "/v3/apps/$APP_GUID/routes?hosts=$ROUTE_HOSTNAME")
ROUTE_GUID=$(echo "$ROUTES_INFO" | jq -r '.resources[0].guid')

echo "Route GUID: $ROUTE_GUID"

# Step 3: Configure client port (6274)
echo "Configuring client port $CLIENT_PORT..."
cf curl -X PATCH "/v3/routes/$ROUTE_GUID/destinations" -d "{
  \"destinations\": [
    {
      \"app\": {
        \"guid\": \"$APP_GUID\",
        \"process\": {
          \"type\": \"$PROCESS_TYPE\"
        }
      },
      \"port\": $CLIENT_PORT,
      \"protocol\": \"http1\"
    }
  ]
}"

# Step 4: Create a second route for the server port if needed
# Note: You might need to create a separate route for the server port
# This depends on your domain configuration

echo "Custom port configuration completed!"
echo "Client port $CLIENT_PORT configured on route: https://mcp-inspector.cfapps.eu12.hana.ondemand.com"
echo "Server port $SERVER_PORT may need a separate route configuration" 