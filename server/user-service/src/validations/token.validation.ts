import type { Request, Response, NextFunction } from "express";
import { JWT } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { logger } from "../utils/logger.js";
import type { TokenPayload } from "../types/express.index.js";

export const validateToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const token = req.get("Authorization")?.split(" ")[1];
  if (!token) {
    logger.error("Access denied. No token provided.");
    return res
      .status(401)
      .json({ message: "Access denied. No token provided." });
  }
  try {
    const validToken = JWT.verifyToken(token, config.JWT_SECRET);
    req.user = validToken as TokenPayload;
    return next();
  } catch (error) {
    return next(error);
  }
};
