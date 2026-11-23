import { mongo } from "mongoose";

export const isDuplicateKey = (error: unknown, field?: string): error is mongo.MongoServerError => {
    return (
        error instanceof mongo.MongoServerError &&
        error.code === 11000 &&
        (field === undefined || field in (error.keyPattern ?? {}))
    );
};
