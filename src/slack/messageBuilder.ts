import type { Tool } from "../mcp/Tool.js";

const messageBuilder = {
    // buildToolsMessage: (tools: Tool[]) => {
    //     const toolList = {
    //         blocks: [
    //             messageBuilder.buildDivider(),
    //             messageBuilder.buildRichTextSection([{ text: "These are the mcp tools available to me:" }]),
    //             messageBuilder.buildTextList(
    //                 tools.map((tool) => ({
    //                     text: tool.serverName + "." + tool.name + " - " + tool.description,
    //                 })),
    //             ),
    //             messageBuilder.buildDivider(),
    //         ],
    //         text: "Here are the tools available to me.",
    //     };

    //     return toolList;
    // },

    buildInitializingHeader: () => {
        return {
            blocks: [
                messageBuilder.buildRichTextSection([{ text: "Hello 🏴‍☠️!" }]),
                messageBuilder.buildDivider(),
                messageBuilder.buildRichTextSection([{ text: "Connecting to your MCP servers... Give me a sec! 🔄" }]),
            ],
            text: "Here are the servers currently configured.",
        };
    },

    buildWelcomeHeader: () => {
        return {
            text: "Here are the servers currently configured.",
            blocks: [
                messageBuilder.buildRichTextSection([{ text: "Hello 🏴‍☠️!" }]),
                messageBuilder.buildDivider(),
                messageBuilder.buildRichTextSection([{ text: "These are the MCP servers currently configured:" }]),
            ],
        };
    },

    buildConnectingMessage: (name: string) => {
        return {
            text: " - *" + name + "* - Connecting...  🔄",
            blocks: [messageBuilder.buildTextSection(` - *${name}* - Connecting...  🔄`)],
        };
    },

    buildConnectedMessage: (name: string) => {
        return {
            text: " - *" + name + "* - Connected  ✅",
            blocks: [messageBuilder.buildTextSection(` - *${name}* - Connected  ✅`)],
        };
    },

    buildDisconnectedMessage: (name: string, clientId: string) => {
        return {
            text: " - *" + name + "* - Disconnected  ❌",
            blocks: [messageBuilder.buildTextSection(` - *${name}* - Disconnected  ❌`)],
        };
    },

    buildAuthorizeMessage: (serverName: string, url: string, value: string, text: string = "Authorize") => {
        return {
            blocks: [
                messageBuilder.buildTextSection(` - *${serverName}* - Requires authorization ⚠️`),
                {
                    type: "actions",
                    elements: [
                        {
                            type: "button",
                            text: {
                                type: "plain_text",
                                text: text,
                            },
                            url: url,
                            action_id: "redirect",
                            value: value,
                        },
                    ],
                },
            ],
        };
    },

    buildCheckingToolsHeader: () => {
        return {
            blocks: [
                messageBuilder.buildDivider(),
                messageBuilder.buildTextSection("Checking what tools are available... 🔄"),
            ],
        };
    },

    buildListToolsHeader: () => {
        return {
            blocks: [
                messageBuilder.buildDivider(),
                messageBuilder.buildTextSection("These are the tools available to me:"),
            ],
        };
    },

    buildCheckingServerToolMessage: (serverName: string) => {
        return {
            blocks: [messageBuilder.buildTextSection(`- *${serverName}* - Checking what tools are available... 🔍`)],
            text: " - " + serverName + ": Checking what tools are available...",
        };
    },

    buildListToolsMessage: (name: string, tools: Tool[]) => {
        if (tools.length === 0) {
            return {
                blocks: [messageBuilder.buildTextSection(`- *${name}* - No tools available... ❌`)],
            };
        }
        return {
            blocks: [
                messageBuilder.buildTextSection(`- *${name}*:`),
                messageBuilder.buildTextList(
                    tools.map((tool) => ({
                        text: tool.name + " - " + tool.description,
                    })),
                ),
            ],
        };
    },

    buildDivider: () => {
        return {
            type: "divider",
        };
    },

    buildApprovalButtons: (message: string, value: string) => {
        return {
            text: message,
            blocks: [
                messageBuilder.buildRichTextSection([{ text: message }]),
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
        };
    },

    buildMarkdownSection: (text: string) => {
        return {
            type: "markdown",
            text: text,
        };
    },

    buildTextSection: (markdownText: string) => {
        return {
            type: "section",
            text: {
                type: "mrkdwn",
                text: markdownText,
            },
        };
    },

    buildActionsSection: (actions: { text: string; value: string; action_id: string; style: string }[]) => {
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

    buildRichTextSection: (
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

    buildTextList: (
        texts: {
            text: string;
            style?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };
        }[],
        indent: number = 0,
    ) => {
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
