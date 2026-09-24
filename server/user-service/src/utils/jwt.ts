import jwt from "jsonwebtoken";
import { logger } from "./logger.js";

export class JWT {
  static generateToken(
    payload: object,
    secret: jwt.Secret,
    expiresIn: string | number,
  ): string {
    const token = jwt.sign(payload, secret, { expiresIn } as jwt.SignOptions);
    return token;
  }

  static verifyToken(token: string, secret: jwt.Secret): jwt.JwtPayload | string {
    try {
      const decoded = jwt.verify(token, secret);
      return decoded;
    } catch (error) {
      logger.error("JWT verification failed:", error);
      throw new Error("Invalid token");
    }
  }
}
