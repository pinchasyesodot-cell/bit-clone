import winston from "winston";
import { config } from "../config/env.js";

const production = config.NODE_ENV === "production";

const json = winston.format.combine(
    winston.format.errors({ stack: true }),
    winston.format.timestamp(),
    winston.format.json()
);

export const logger = winston.createLogger({
    level: "info",
    silent: config.NODE_ENV === "test",
    format: json,
    transports: [
        new winston.transports.Console(
            production ? {} : { format: winston.format.combine(winston.format.colorize(), winston.format.simple()) }
        ),
    ],
});

if (config.NODE_ENV === "development") {
    logger.add(new winston.transports.File({ filename: "logs/combined.log" }));
    logger.add(new winston.transports.File({ filename: "logs/error.log", level: "error" }));
}
