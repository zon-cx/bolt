import type { Tool } from "../mcp/Tool.js";

const messageBuilder = {
    buildToolMessage: (tools: Tool[]) => {
        const toolList = {
            blocks: [
                messageBuilder.buildRichTextSection([{ text: "These are the mcp tools available to me:" }]),
                messageBuilder.buildDivider(),
                messageBuilder.buildTextList(
                    tools.map((tool) => ({
                        text: tool.serverName + "." + tool.name + " - " + tool.description,
                    })),
                ),
                messageBuilder.buildDivider(),
            ],
            text: "Here are the tools available to me.",
        };

        return toolList;
    },

    buildInitializingMessage: () => {
        return {
            blocks: [
                messageBuilder.buildRichTextSection([{ text: "Connecting to your mcp servers... Give me a sec!" }]),
                messageBuilder.buildDivider(),
            ],
            text: "Here are the servers currently configured.",
        };
    },

    buildWelcomeMessage: () => {
        return {
            blocks: [
                messageBuilder.buildRichTextSection([
                    { text: "Hello 🏴‍☠️! \nThese are the servers currently configured:" },
                ]),
                messageBuilder.buildDivider(),
            ],
        };
    },

    buildDisconnectedMessage: (name: string, clientId: string) => {
        return {
            text: " - *" + name + "* - Disconnected  ❌",
            blocks: [
                messageBuilder.buildTextSection(` - *${name}* - Disconnected  ❌`),
                // messageBuilder.buildActionsSection([
                //     {
                //         text: "Connect to" + " " + name,
                //         value: clientId,
                //         action_id: "connect_client",
                //         style: "primary",
                //     },
                // ]),
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

    buildDivider: () => {
        return {
            type: "divider",
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
