# slack-mcp-client
A slack bot with an MCP client for slack in Typescript

Current support for:
- HTTP Streamable, SSE & Stdio MCP servers.
- MCP Tools only (more coming soon)

## Installation

Follow those instructions to run it locally.

### Setup ngrok to run the app locally  

- Expose your http://localhost:3000 to the web: https://ngrok.com/docs/getting-started/
- You can also use the socketMode of slack apps if you do not want to use ngrok. You'll need to set socketMode to true when instanciating the bolt App, and activate the socketMode of your app in the slack App management dashboard.


### Setup the Slack App

- Edit the slack-app-manifest.json: copy your ngrok url in the request_url fields.
- Add a new App in your slack workspace, you can configure it with the slack-app-manifest.json file.
- Create an .env file from the env.example file

```bash
cp .env.example .env
```
- Populate with the slack tokens:
  - The Signing Secret from the App Basic Information page
  - The App level token with a connections:write scope that you can generate in the App Basic Information page. 
  - The Slack bot token that you can find in the OAuth & Permission page
  - Update the auth redirect url with your ngrok url.


### Requirements

- Node 22 (`lts/jod`)
- pnpm 10
- Some MCP servers running accessible over stdio, sse or streamable http

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