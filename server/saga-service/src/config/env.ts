import "dotenv/config";
import env from "env-var";

export const config = {
    PORT: env.get("PORT").required().asPortNumber(),
    NODE_ENV: env.get("NODE_ENV").required().asString(),
    MONGO_URI: env.get("MONGO_URI").required().asString(),
    RABBITMQ_URI: env.get("RABBITMQ_URI").required().asString(),
}
