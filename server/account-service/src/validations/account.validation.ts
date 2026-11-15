import Joi from "joi";
import { AccountStatus } from "../interfaces/account.types.js";

export const setStatusSchema = Joi.object({
    status: Joi.string()
        .valid(...Object.values(AccountStatus))
        .required(),
});
