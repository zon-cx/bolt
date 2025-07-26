FROM node:22.16.0-alpine AS base

# Install latest npm ispector
RUN npm install -g npm@latest
RUN npm install -g @modelcontextprotocol/inspector@latest

# Set default port values as environment variables
ENV CLIENT_PORT=6274
ENV SERVER_PORT=6277

# Document which ports the application uses internally
EXPOSE ${CLIENT_PORT} 
EXPOSE ${SERVER_PORT}

ENTRYPOINT ["npx", "@modelcontextprotocol/inspector"]