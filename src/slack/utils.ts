import { type } from "os";
import type { Tool } from "../mcp/Tool.js";

export function formatWelcomeMessage(tools: Tool[]) {
    const toolList = {
        blocks: [
            buildTextSection([{ text: "Hello! How can I help you today 🏴‍☠️?" }]),
            buildTextSection([{ text: "These are the mcp tools available to me:" }]),
            buildDivider(),
            buildTextList(
                tools.map((tool) => ({ text: tool.serverName + "." + tool.name + " - " + tool.description })),
            ),
            buildDivider(),
        ],
        text: "Hello! How can I help you today 🏴‍☠️?",
    };

    return toolList;
}

function buildDivider() {
    return {
        type: "divider",
    };
}

export function buildApprovalButtons(message: string, value: string) {
    return {
        text: message,
        blocks: [
            buildTextSection([{ text: message }]),
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

export function buildTextSection(
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
