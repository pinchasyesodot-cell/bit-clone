import Joi from "joi";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import type { ErrorRequestHandler } from "express";
import { isDuplicateKey } from "../utils/mongoErrors.js";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";

export const errorHandler: ErrorRequestHandler = (err: unknown, _req, res, _next): void => {
    if (err instanceof Joi.ValidationError) {
        logger.warn("Joi Validation Error", {
            message: err.message,
        });
        res.status(400).json({ error: err.details.map((detail) => detail.message).join(", ") });
        return;
    }

    if (isDuplicateKey(err)) {
        logger.warn("MongoDB Duplicate Key Error", {
            message: err.message,
        });
        res.status(409).json({ error: "Conflict: Duplicate value entered" });
        return;
    }

    if (err instanceof mongoose.Error.ValidationError) {
        logger.warn("MongoDB Validation Error", {
            message: err.message,
        });
        res.status(400).json({ error: "Bad Request: Validation failed" });
        return;
    }

    if (err instanceof mongoose.Error.CastError) {
        logger.warn("MongoDB Cast Error", {
            message: err.message,
        });
        res.status(400).json({ error: "Bad Request: Invalid value" });
        return;
    }

    if (err instanceof AppError) {
        if (err.statusCode >= 400 && err.statusCode < 500) {
            logger.warn("Client Error", {
                message: err.message,
            });
            res.status(err.statusCode).json({ error: err.message });
            return;
        } else {
            logger.error("Server Error", {
                message: err.message,
                stack: err.stack,
            });
            res.status(500).json({ error: "Internal Server Error" });
            return;
        }
    }

    if (err instanceof jwt.TokenExpiredError) {
        logger.warn("Expired token", { message: err.message });
        res.status(401).json({ error: "Unauthorized: Token expired" });
        return;
    }
    if (err instanceof jwt.JsonWebTokenError) {
        logger.warn("Invalid token", { message: err.message });
        res.status(401).json({ error: "Unauthorized: Invalid token" });
        return;
    }

    logger.error("Unhandled Error", {
        error: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
    });
    res.status(500).json({ error: "Internal Server Error" });
};
