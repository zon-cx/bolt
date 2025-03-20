import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import bolt from '@slack/bolt';
import dotenv from "dotenv";

dotenv.config();

const transport = new SSEClientTransport(
  new URL("http://localhost:3001/sse")
);

const client = new Client(
  {
    name: "slack-mcp-client",
    version: "1.0.0"
  },
  {
    capabilities: {
      prompts: {},
      resources: {},
      tools: {}
    }
  }
);
 
await client.connect(transport);
const tools = await client.listTools();


const app = new bolt.App({
    token: process.env.SLACK_BOT_TOKEN,
    appToken: process.env.APP_LVL_TOKEN,
    signingSecret: process.env.SLACK_SIGNING_SECRET,
    logLevel: bolt.LogLevel.DEBUG,
    socketMode: true,
});
  

app.event("message", async ({ event }: { event: any }) => {
    app.logger.info(event);
});


(async () => {
    try {
        await app.start(process.env.PORT || 3000);
        app.logger.info("⚡️ Bolt app is running");
    } catch (error) {
        app.logger.error(error);
    }
})();
