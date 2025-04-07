# slack-mcp-client
A slack bot with an MCP client for slack in Typescript

Current support for:
- HTTP Streamable, SSE & Stdio MCP servers.
- MCP Tools only (more coming soon)

## Installation

Follow those instructions to run it locally.

### Setup the Slack App

- Add a new App, you can configure it with the slack-app-manifest.json file. By default it is set in socket mode tu easily run it locally.

- Create an .env file

```bash
cp .env.example .env
```
- Populate with the slack tokens:
  - The Signing Secret from the App Basic Information page
  - The App level token with a connections:write scope that you can generate in the App Basic Information page. 
  - The Slack bot token that you can find in the OAuth & Permission page


### Requirements

- Node 22 (`lts/jod`)
- pnpm 10
- Some MCP servers running accessible over stdio or sse (example: http://localhost:3001/sse)

### Instructions

- Install dependencies:

```bash
pnpm install
```

- Create the mcp.json file and add your mcp servers config. Check [this list of MCP servers](https://github.com/modelcontextprotocol/servers) if you need.

```bash
cp mcp-example.json mcp.json
```

- Run the client:

```bash
pnpm run dev
```

- Open a new thread of discussion with your bot and have fun.


# Useful Doc:

- Bolt AI Assistant Apps: https://tools.slack.dev/bolt-js/concepts/ai-apps/