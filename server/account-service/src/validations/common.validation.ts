import Joi from "joi";

export const sagaId = Joi.string().guid({ version: "uuidv4" }).required();
// Same shape as userId in user-service (9 digits), which arrives here as a string.
export const userId = Joi.string()
    .pattern(/^\d{9}$/)
    .required();
