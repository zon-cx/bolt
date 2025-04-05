import { pino } from "pino";
import { getConfig } from "./utils.js";

const logger = pino({
    level: getConfig("LOG_LEVEL", "info"),
    transport: {
        target: "pino-pretty",
    },
});

export default logger;
