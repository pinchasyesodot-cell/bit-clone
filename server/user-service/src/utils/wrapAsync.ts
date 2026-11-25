import type { NextFunction, Request, Response } from "express";

export const wrapAsync =
    (func: (req: Request, res: Response, next: NextFunction) => Promise<void>) =>
    (req: Request, res: Response, next: NextFunction): void => {
        func(req, res, next).catch((error: unknown) => {
            next(error ?? new Error("Handler rejected without an error"));
        });
    };
