import type Joi from "joi";
import type { NextFunction, Request, Response } from "express";

export const validateRequest = (schema: Joi.Schema, source: "body" | "query" | "params") => {
    return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
        const value: unknown = await schema.validateAsync(req[source], {
            abortEarly: false,
        });
        req[source] = value;
        return next();
    };
};
