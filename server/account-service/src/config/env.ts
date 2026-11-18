import "dotenv/config";
import env from "env-var";

export const config = {
    PORT: env.get("PORT").required().asPortNumber(),
    NODE_ENV: env.get("NODE_ENV").required().asString(),
    MONGO_URI: env.get("MONGO_URI").required().asString(),
    RABBITMQ_URI: env.get("RABBITMQ_URI").required().asString(),
    URL_CLIENT: env.get("URL_CLIENT").required().asUrlObject().origin,
    JWT_SECRET: env.get("JWT_SECRET").required().asString(),
    INTERNAL_API_KEY: env.get("INTERNAL_API_KEY").required().asString(),
};

if (config.INTERNAL_API_KEY.length < 32) {
    throw new Error("INTERNAL_API_KEY must be at least 32 characters");
}
