import Joi from "joi";
import { AppError } from "../utils/AppError.js";
import { logger } from "../utils/logger.js";
import type { ErrorRequestHandler } from "express";

export const errorHndeler: ErrorRequestHandler = (
  err,
  _req,
  res,
  _next,
): void => {
  if (err.name === "MongoServerError" && err.code === 11000) {
    logger.error("MongoDB Duplicate Key Error:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(409).json({ error: "Conflict: Duplicate value entered" });
    return;
  }

  if (err.name === "ValidationError") {
    logger.error("MongoDB Validation Error:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(400).json({ error: "Bad Request: Validation failed" });
    return;
  }

  if (err.name === "CastError") {
    logger.error("MongoDB Cast Error:", {
      message: err.message,
      stack: err.stack,
    });
    res.status(400).json({ error: "Bad Request: Invalid ID format" });
    return;
  }

  if (err instanceof AppError) {
    if (err.statusCode >= 400 && err.statusCode < 500) {
      logger.error("Client Error:", {
        message: err.message,
        stack: err.stack,
      });
      res.status(err.statusCode).json({ error: err.message });
      return;
    } else {
      logger.error("Server Error:", {
        message: err.message,
        stack: err.stack,
      });
      res.status(500).json({ error: "Internal Server Error" });
      return;
    }
  }
  if (err instanceof Joi.ValidationError) {
    logger.error("Joi Validation Error:", {
      details: err.details,
    });
    res
      .status(400)
      .json({ error: err.details.map((detail) => detail.message).join(", ") });
    return;
  }
};
