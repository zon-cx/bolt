import { pino } from "pino";
import { get } from "./utils.js";

const logger = pino({
    level: get("LOG_LEVEL", "info"),
    transport: {
        target: "pino-pretty",
    },
});

export default logger;
