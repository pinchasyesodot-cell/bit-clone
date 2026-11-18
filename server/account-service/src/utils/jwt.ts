import jwt from "jsonwebtoken";

export class JWT {
    static verifyToken(token: string, secret: jwt.Secret): jwt.JwtPayload | string {
        return jwt.verify(token, secret);
    }
}
