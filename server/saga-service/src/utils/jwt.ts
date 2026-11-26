import jwt from "jsonwebtoken";

export class JWT {
    // Throws jwt.TokenExpiredError or jwt.JsonWebTokenError; errorHandler turns both into a 401.
    static verifyToken = (token: string, secret: jwt.Secret): jwt.JwtPayload | string => {
        return jwt.verify(token, secret, { algorithms: ["HS256"] });
    };

    static getUserId = (token: string, secret: jwt.Secret): number | null => {
        const payload = JWT.verifyToken(token, secret);
        const userId = typeof payload === "string" ? NaN : Number(payload.userId);
        return Number.isInteger(userId) ? userId : null;
    };
}
