export class AppError extends Error {
    public statusCode: number;
    constructor(message: string, statusCode: number, options?: ErrorOptions) {
        super(message, options);
        this.statusCode = statusCode;
    }
}

export class NotFound extends AppError {
    constructor(message: string) {
        super(message, 404);
    }
}
