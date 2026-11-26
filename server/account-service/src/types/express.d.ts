export interface TokenPayload {
    userId: number;
}

declare global {
    namespace Express {
        interface Request {
            user?: TokenPayload;
        }
    }
}
