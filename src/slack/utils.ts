import type { Tool } from "../mcp/Tool.js";
import type { Session } from "./Session.js";

export function buildToolMessage(session: Session) {
    const toolList = {
        blocks: [
            buildRichTextSection([{ text: "These are the mcp tools available to me:" }]),
            buildDivider(),
            buildTextList(
                session.mcpHost.tools.map((tool) => ({
                    text: tool.serverName + "." + tool.name + " - " + tool.description,
                })),
            ),
            buildDivider(),
        ],
        text: "Hello! How can I help you today 🏴‍☠️?",
    };

    return toolList;
}

export function buildWelcomeMessages(session: Session) {
    const blocks = {
        blocks: [
            buildRichTextSection([{ text: "Hello 🏴‍☠️! These are the servers currently configured:" }]),
            buildDivider(),
            ...Object.entries(session.mcpHost.clients).flatMap(([name, client]) =>
                buildClientConnectionMessage(name, client, session.sessionId),
            ),
        ],
    };
    return blocks;
}

function buildClientConnectionMessage(
    name: string,
    client: { serverName: string; connected: boolean },
    sessionId: string,
) {
    if (!client.connected) {
        return [
            buildTextSection(` - *${client.serverName}* - Disconnected  ❌`),
            buildActionsSection([
                {
                    text: "Connect to" + " " + client.serverName,
                    value: sessionId + "_" + client.serverName,
                    action_id: "connect_client",
                    style: "primary",
                },
            ]),
        ];
    } else {
        return [buildTextSection(` - *${client.serverName}* - Connected  ✅`)];
    }
}

function buildDivider() {
    return {
        type: "divider",
    };
}

export function buildRedirectButton(url: string) {
    return {
        blocks: [
            {
                type: "actions",
                elements: [
                    {
                        type: "button",
                        text: {
                            type: "plain_text",
                            text: "Connect",
                        },
                        url: url,
                        action_id: "redirect",
                        value: url,
                    },
                ],
            },
        ],
    };
}

export function buildApprovalButtons(message: string, value: string) {
    return {
        text: message,
        blocks: [
            buildRichTextSection([{ text: message }]),
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
}

export function buildMarkdownSection(text: string) {
    return {
        type: "markdown",
        text: text,
    };
}

function buildTextSection(markdownText: string) {
    return {
        type: "section",
        text: {
            type: "mrkdwn",
            text: markdownText,
        },
    };
}

function buildActionsSection(actions: { text: string; value: string; action_id: string; style: string }[]) {
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
}

export function buildRichTextSection(
    texts: {
        text: string;
        style?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };
    }[],
) {
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
}

function buildTextList(
    texts: {
        text: string;
        style?: { bold?: boolean; italic?: boolean; underline?: boolean; strikethrough?: boolean };
    }[],
    indent: number = 0,
) {
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
}
