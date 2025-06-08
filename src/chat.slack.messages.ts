import type { ColorScheme, KnownBlock, Block } from "@slack/web-api";
import { Tool } from "ai";

const messageBuilder = {
    initializingHeader: (): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [
                messageBuilder.textSection("Hello 🏴‍☠️!"),
                messageBuilder.divider(),
                messageBuilder.textSection("Connecting to your MCP servers... Give me a sec! 🔄"),
            ],
            text: "Here are the servers currently configured.",
        };
    },

    welcomeHeader: (): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [
                messageBuilder.textSection("Hello 🏴‍☠️!"),
                messageBuilder.divider(),
                messageBuilder.textSection("These are the MCP servers currently configured:"),
            ],
            text: "Here are the servers currently configured.",
        };
    },

    connectingMessage: (
        name: string,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [messageBuilder.textSection(` - *${name}* - Connecting...  🔄`)],
            text: " - *" + name + "* - Connecting...  🔄",
        };
    },

    connectedMessage: (
        name: string,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [messageBuilder.textSection(` - *${name}* - Connected  ✅`)],
            text: " - *" + name + "* - Connected  ✅",
        };
    },

    disconnectedMessage: (
        name: string,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [messageBuilder.textSection(` - *${name}* - Disconnected  ❌`)],
            text: " - *" + name + "* - Disconnected  ❌",
        };
    },

    authorizeMessage: (
        serverName: string,
        url: string,
        value: string,
        text: string = "Authorize",
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [
                messageBuilder.textSection(` - *${serverName}* - Requires authorization ⚠️`),
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: text || "Authorize",
                            },
                            url: url,
                            action_id: "redirect",
                            value: value || url,
                        },
                    ],
                },
            ],
            text: " - *" + serverName + "* - Requires authorization ⚠️",
        };
    },

    checkingToolsHeader: (): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [messageBuilder.divider(), messageBuilder.textSection("Checking what tools are available... 🔄")],
            text: "Checking what tools are available...",
        };
    },

    listToolsHeader: (): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [messageBuilder.divider(), messageBuilder.textSection("These are the tools available to me:")],
            text: "These are the tools available to me:",
        };
    },

    checkingServerToolMessage: (
        serverName: string,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [messageBuilder.textSection(`- *${serverName}* - Checking what tools are available... 🔍`)],
            text: " - " + serverName + ": Checking what tools are available...",
        };
    },
    listTools: (
        name: string,
        tools:string[]
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
    
        
        return {
          blocks: [
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: tools.length 
                    ? `🔍 *${name}*: ${tools.join(', ')}`
                    : `🔍 *${name}*: No tools ❌`
                },
                // {
                //   type: "mrkdwn",
                //   text: toolEntries.length 
                //     ? `🔍 *${name}*: ${toolEntries.map(t => JSON.stringify(t,null,2)).join('\n/n')} `
                //     : `🔍 *${name}*: No tools ❌`
                // }
              ]
            }
          ],
          text: `${name}: ${tools.length || 'No'} tools`
        };
    },
    listToolsMessage: (
        name: string,
        tools:Map<string, Tool>,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        const toolEntries = Array.from(tools.entries()).map(([name, tool]) => ({
            name, ...tool
        }));
        
        return {
          blocks: [
            {
              type: "context",
              elements: [
                {
                  type: "mrkdwn",
                  text: toolEntries.length 
                    ? `🔍 *${name}*: ${toolEntries.map(t => t.name).join(', ')}`
                    : `🔍 *${name}*: No tools ❌`
                },
                // {
                //   type: "mrkdwn",
                //   text: toolEntries.length 
                //     ? `🔍 *${name}*: ${toolEntries.map(t => JSON.stringify(t,null,2)).join('\n/n')} `
                //     : `🔍 *${name}*: No tools ❌`
                // }
              ]
            }
          ],
          text: `${name}: ${toolEntries.length || 'No'} tools`
        };
    },

    divider: (): KnownBlock => {
        return {
            type: "divider",
        };
    },

    toolRequest: (
        toolRequests: {toolName:string, toolArgs:Record<string, unknown>}[],
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        const plural = toolRequests.length > 1 ? "s" : "";
        return {
            blocks: [
                messageBuilder.textSection(`I want to use the following tool${plural}:`),
                messageBuilder.textList(
                    toolRequests.map((toolRequest) => ({
                        text: toolRequest.toolName + " with arguments:\n" + JSON.stringify(toolRequest.toolArgs),
                    })),
                ),
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Go for it",
                                emoji: true,
                            },
                            value: "approve_tool_call",
                            action_id: "approve_tool_call",
                            style: "primary",
                        },
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Plz no",
                                emoji: true,
                            },
                            value: "cancel_tool_call",
                            action_id: "cancel_tool_call",
                            style: "danger",
                        },
                    ],
                },
            ],
            text: `I want to use the following tool${plural}:`,
        };
    },

    approvalButtons: (
        message: string,
        value: string,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [
                messageBuilder.textSection(message),
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Go for it",
                                emoji: true,
                            },
                            value: value,
                            action_id: "approve_tool_call",
                            style: "primary",
                        },
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: "Plz no",
                                emoji: true,
                            },
                            value: value,
                            action_id: "cancel_tool_call",
                            style: "danger",
                        },
                    ],
                },
            ],
            text: message,
        };
    },

    markdownSection: (
        text: string,
    ): {
        blocks: (KnownBlock | Block)[];
        text?: string;
    } => {
        return {
            blocks: [{ type: "section", text: { type: "mrkdwn", text: text } }],
            text: text,
        };
    },

    textSection: (markdownText: string): KnownBlock => {
        return {
            type: "section",
            text: {
                type: "mrkdwn",
                text: markdownText,
            },
        };
    },

    actionsSection: (actions: { text: string; value: string; action_id: string; style: ColorScheme }[]): KnownBlock => {
        return {
            type: "actions",
            elements: actions.map((action) => ({
                type: "button",
                text: {
                    type: "plain_text",
                    text: action.text,
                    emoji: true,
                },
                value: action.value,
                action_id: action.action_id,
                style: action.style,
            })),
        };
    },

    richTextSection: (
        texts: {
            text: string;
            style?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };
        }[],
    ) => {
        return {
            type: "rich_text",
            elements: [
                {
                    type: "rich_text_section",
                    elements: texts.map((text) => ({
                        type: "text",
                        text: text.text,
                        style: text.style,
                    })),
                },
            ],
        };
    },

    textList: (
        texts: {
            text: string;
            style?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };
        }[],
        indent: number = 0,
    ): KnownBlock => {
        return {
            type: "rich_text",
            elements: [
                {
                    type: "rich_text_list",
                    style: "bullet",
                    indent: indent,
                    elements: texts.map((element) => ({
                        type: "rich_text_section",
                        elements: [{ type: "text", text: element.text, style: element.style }],
                    })),
                },
            ],
        };
    },
};

export default messageBuilder;