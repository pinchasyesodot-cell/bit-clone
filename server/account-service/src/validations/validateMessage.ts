import type Joi from "joi";
import { InvalidMessageError } from "../utils/InvalidMessageError.js";

export const validateMessage = <T>(schema: Joi.ObjectSchema<T>, message: unknown): T => {
    const result = schema.validate(message, { abortEarly: false });
    if (result.error) throw new InvalidMessageError(result.error.message);
    return result.value;
};
