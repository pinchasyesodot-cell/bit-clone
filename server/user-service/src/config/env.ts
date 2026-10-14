import dotenv from "dotenv";
import env from "env-var";

dotenv.config({ path: process.env.NODE_ENV === "test" ? ".env.test" : ".env" });

export const config = {
    PORT: env.get("PORT").required().asPortNumber(),
    NODE_ENV: env.get("NODE_ENV").required().asString(),
    MONGO_URI: env.get("MONGO_URI").required().asString(),
    JWT_SECRET: env.get("JWT_SECRET").required().asString(),
    URL_CLIENT: env.get("URL_CLIENT").asString()
};
