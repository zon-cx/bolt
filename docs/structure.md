# Project Structure
 - `mcp.client.ts` - Main MCP client implementation
- `mcp.client.auth.ts` - Authentication handling
- `mcp.client.store.ts` - Client-side store
- `mcp.client.agent.ts` - Agent implementation
- `mcp.client.agent.manager.ts` - Agent management
- `mcp.client.agent.app.tsx` - Agent application UI
- `mcp.client.agent.app.mcp.ts` - MCP-specific agent app logic

 - `chat.ts` - Core chat functionality
- `chat.store.ts` - Chat state management
- `chat.app.web.tsx` - Web interface
- `chat.app.slack.ts` - Slack integration
- `chat.app.cli.ts` - Command-line interface
- `chat.app.slack.messages.ts` - Slack message handling

 - `chat.handler.message.ts` - Message handling
- `chat.handler.thread.ts` - Thread handling
- `chat.handler.bootstrap.ts` - Bootstrap process
- `chat.handler.tools.ts` - Tool integration

 - `mcp.auth.server.ts` - Server-side authentication
- `mcp.client.agent.server.ts` - Server-side agent logic
- `whoami.mcp.server.ts` - User identification

 - `store.yjs.ts` - YJS-based storage implementation

 
 src/
├── chat.core.ts                    # Core chat functionality (was chat.ts)
├── chat.store.ts                   # Chat state management (was chat.store.ts)
├── chat.ui.web.tsx                 # Web interface (was chat.app.web.tsx)
├── chat.ui.slack.ts                # Slack interface (was chat.app.slack.ts)
├── chat.ui.cli.ts                  # CLI interface (was chat.app.cli.ts)
├── chat.handler.message.ts         # Message handling (was chat.handler.message.ts)
├── chat.handler.thread.ts          # Thread handling (was chat.handler.thread.ts)
├── chat.handler.bootstrap.ts       # Bootstrap process (was chat.handler.bootstrap.ts)
├── chat.handler.tools.ts           # Tool integration (was chat.handler.tools.ts)
├── chat.store.yjs.ts               # YJS storage (was store.yjs.ts)
│
├── mcp.client.ts                   # Core MCP functionality (was mcp.client.ts)
├── mcp.client.agent.ts                    # Agent implementation (was mcp.client.agent.ts)
├── mcp.client.auth.ts              # Client authentication (was mcp.client.auth.ts)
├── mcp.client.store.ts             # Client state management (was mcp.client.store.ts)
├── mcp.server.agent.ts                # Agent management (was mcp.client.agent.manager.ts)
├── mcp.server.agent.dashboard.tsx         # Agent UI (was mcp.client.agent.app.tsx)
├── mcp.server.agent.manager.ts             # MCP-specific agent manger logic (was mcp.client.agent.app.mcp.ts)
├── mcp.server.auth.ts              # Server authentication (was mcp.auth.server.ts)
├── mcp.server.agent.ts             # Server agent logic (was mcp.client.agent.server.ts)
├── mcp.server.whoami.ts            # User identification (was whoami.mcp.server.ts)






 
 src/
├── chat.core.ts                    # Core chat functionality (was chat.ts)
├── chat.store.ts                   # Chat state management (was chat.store.ts)
├── chat.handler.message.ts         # Message handling (was chat.handler.message.ts)
├── chat.handler.thread.ts          # Thread handling (was chat.handler.thread.ts)
├── chat.handler.bootstrap.ts       # Bootstrap process (was chat.handler.bootstrap.ts)
├── chat.handler.tools.ts           # Tool integration (was chat.handler.tools.ts)
 

 ├── mcp.client.ts                   # Core MCP functionality (was mcp.client.ts)

├── mcp.client.web.tsx                 # Web interface (was chat.app.web.tsx)
├── mcp.client.slack.ts                # Slack interface (was chat.app.slack.ts)
├── mcp.client.cli.ts                  # CLI interface (was chat.app.cli.ts)


 
├── auth.mcp.client.ts              # Client authentication (was mcp.client.auth.ts)
├── auth.mcp.server.ts        # Server authentication

├── agent.store.ts                    # Agent implementation (was mcp.client.agent.ts)
├── agnet.mcp.client.ts              # Agent implementation (was mcp.client.agent.ts)
├── agent.mcp.server.ts             # Agent management (was mcp.client.agent.manager.ts)
├── agent.dashboard.tsx         # Agent UI (was mcp.client.agent.app.tsx)
├── agent.manager.mcp.server.ts             # MCP-specific agent manger logic (was mcp.client.agent.app.mcp.ts)
 

├── whoami.mcp.server.ts            # User identification (was whoami.mcp.server.ts)



├── chat.core.ts              # Core chat functionality
├── chat.store.ts             # Chat state management
├── chat.ui.web.tsx           # Web interface
├── chat.ui.slack.ts          # Slack interface
├── chat.ui.cli.ts            # CLI interface
├── chat.handler.message.ts   # Message handling
├── chat.handler.thread.ts    # Thread handling
├── mcp.core.ts               # Core MCP functionality
├── mcp.client.agent.ts       # Agent implementation
├── mcp.client.auth.ts        # Client authentication
├── mcp.client.store.ts       # Client state management
├── mcp.server.auth.ts        # Server authentication
└── mcp.server.agent.ts       # Server agent logic

src/
├── core.chat.ts              # Core chat functionality
├── core.mcp.ts               # Core MCP functionality
├── store.chat.ts             # Chat state management
├── store.mcp.client.ts       # Client state management
├── ui.chat.web.tsx           # Web interface
├── ui.chat.slack.ts          # Slack interface
├── ui.chat.cli.ts            # CLI interface
├── handler.chat.message.ts   # Message handling
├── handler.chat.thread.ts    # Thread handling
├── auth.mcp.client.ts        # Client authentication
├── auth.mcp.server.ts        # Server authentication
└── agent.mcp.server.ts       # Server agent logic
├── agent.mcp.client.ts       # Agent implementation
   

   