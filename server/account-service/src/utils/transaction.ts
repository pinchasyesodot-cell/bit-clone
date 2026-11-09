import { type ClientSession, startSession } from "mongoose";

export const withTransaction = async <T>(fn: (session: ClientSession) => Promise<T>): Promise<T> => {
    const session = await startSession();
    try {
        return await session.withTransaction(() => fn(session));
    } finally {
        await session.endSession();
    }
};
