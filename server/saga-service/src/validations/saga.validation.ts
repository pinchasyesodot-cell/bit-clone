import joi from "joi";
import type { bodySaga } from "../interfaces/SagaType.js";

export const sagaValidationSchema = joi.object<bodySaga>({
    receiverId: joi
        .string()
        .required()
        .trim()
        .pattern(/^\d{9}$/)
        .messages({
            "string.base": "Receiver ID must be a text string",
            "string.empty": "Receiver ID is required",
            "string.pattern.base": "Receiver ID must be exactly 9 digits",
            "any.required": "Receiver ID is a required field",
        }),

    amount: joi.number().required().strict().integer().min(1).max(100_000_000).messages({
        "number.base": "Amount must be a valid number",
        "number.integer": "Amount must be a whole number of agorot",
        "number.min": "Amount must be at least 1 agora",
        "number.max": "Amount must be at most 100,000,000 agorot (1,000,000 ₪)",
        "any.required": "Amount is a required field",
    }),
});
