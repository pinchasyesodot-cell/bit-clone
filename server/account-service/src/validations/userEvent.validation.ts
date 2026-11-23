import Joi from "joi";
import type { UserCreatedEvent } from "../interfaces/user.type.js";
import { userId } from "./common.validation.js";

export const userCreatedSchema = Joi.object<UserCreatedEvent>({
    type: Joi.string().valid("USER_CREATED").required(),
    payload: Joi.object({ userId }).unknown(true).required(),
}).unknown(true);
