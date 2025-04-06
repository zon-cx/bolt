import type { Request, Response, NextFunction } from "express";
import logger from "../shared/logger.js";
import { userStore } from "../shared/userStore.js";

export const callback = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const authCode = req.query.code;
        const encodedState = req.query.state;

        if (!authCode || !encodedState) {
            return res.status(400).json({ error: "Wrong request" });
        }

        if (typeof authCode !== "string") {
            return res.status(400).json({ error: "Invalid authorization code" });
        }

        let stateData;
        try {
            const decodedState = Buffer.from(encodedState as string, "base64").toString("utf-8");
            stateData = JSON.parse(decodedState);
        } catch (error) {
            logger.error("Error decoding state parameter:", error);
            return res.status(400).json({ error: "Invalid state parameter" });
        }

        const userId = stateData.userId;
        const serverUrl = stateData.serverUrl;

        if (!userId || !serverUrl) {
            return res.status(400).json({ error: "Wrong request" });
        }

        const user = userStore.get(userId);
        const mcpSession = user?.mcpSession;
        if (!user || !mcpSession) {
            return res.status(404).json({ error: "MCP session not found" });
        }
        logger.debug("Handling auth callback for user " + userId + " and serverUrl " + serverUrl);
        await mcpSession.handleAuthCallback(serverUrl, authCode);

        res.status(201).json({ message: "Callback successful!" });
    } catch (error) {
        logger.error("Error in callback handler:", error);
        next(error);
    }
};
