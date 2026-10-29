import joi from "joi";
import type { bodySaga } from "../interfaces/SagaType.js";

export const sagaValidationSchema = joi.object<bodySaga>({
    receiverId: joi.string().required().trim().length(9).messages({
        "string.base": "Receiver ID must be a text string",
        "string.empty": "Receiver ID is required",
        "string.length": "Receiver ID must be exactly 9 characters",
        "any.required": "Receiver ID is a required field",
    }),
    amount: joi.number().required().strict().greater(0).precision(2).max(1_000_000).messages({
        "number.base": "Amount must be a valid number",
        "number.greater": "Amount must be greater than 0",
        "any.required": "Amount is a required field",
    }),
});
