export const errorMessage = (error: unknown): string => {
    if (!(error instanceof Error)) return String(error);
    return error.cause instanceof Error ? `${error.message}: ${errorMessage(error.cause)}` : error.message;
};
