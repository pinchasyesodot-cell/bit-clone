import jwt from "jsonwebtoken";

const ALGORITHM = "HS256";

export class JWT {
    static generateToken(
        payload: object,
        secret: jwt.Secret,
        expiresIn: NonNullable<jwt.SignOptions["expiresIn"]>
    ): string {
        const token = jwt.sign(payload, secret, { algorithm: ALGORITHM, expiresIn });
        return token;
    }

    static verifyToken(token: string, secret: jwt.Secret): jwt.JwtPayload | string {
        return jwt.verify(token, secret, { algorithms: [ALGORITHM] });
    }
}
