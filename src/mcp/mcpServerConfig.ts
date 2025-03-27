import { readFileSync } from "fs";
import { z } from "zod";
import logger from "../shared/logger.js";
import type { mcpConfig } from "./mcp.types.js";
import { McpConfig } from "./mcp.types.js";
/**
 * Load server configuration from JSON file.
 * @param filePath - Path to the JSON configuration file.
 * @returns mcpConfig containing server configuration.
 * @throws {Error} If configuration file doesn't exist or is invalid JSON.
 * @throws {z.ZodError} If configuration file is invalid.
 */
export function loadConfig(filePath: string): mcpConfig {
    try {
        const fileContent = readFileSync(filePath, "utf-8");
        const config = JSON.parse(fileContent);
        logger.info("Loaded configuration: " + JSON.stringify(config));
        return McpConfig.parse(config);
    } catch (error) {
        if (error instanceof Error) {
            if ("code" in error && error.code === "ENOENT") {
                throw new Error(`Configuration file not found: ${filePath}`);
            }
            if (error instanceof SyntaxError) {
                throw new Error(`Invalid JSON in configuration file: ${filePath}`);
            }
            if (error instanceof z.ZodError) {
                throw new Error(`Invalid configuration file: ${filePath} - ${error.message}`);
            }
        }
        throw error;
    }
}
