import joi from "joi";
import type { SagaWithoutIdAndStatus } from "../interfaces/SagaType.js";

export const sagaValidationSchema = joi.object<SagaWithoutIdAndStatus>({
    amount: joi.number().positive().required().min(1).max(10000).messages({
        "number.empty": "Amount is required.",
        "number.positive": "Amount must be a positive number.",
        "number.min": "Amount must be at least 1.",
        "number.max": "Amount must be at most 10000.",
    }),
    senderId: joi.number().required().integer().min(100000000).max(999999999).messages({
        "number.empty": "Sender ID must be a number.",
        "number.integer": "Sender ID must be an integer.",
        "number.min": "Sender ID must be at least 9 digits.",
        "number.max": "Sender ID must be at most 9 digits.",
    }),
    receiverId: joi.number().required().integer().min(100000000).max(999999999).messages({
        "number.empty": "Receiver ID must be a number.",
        "number.integer": "Receiver ID must be an integer.",
        "number.min": "Receiver ID must be at least 9 digits.",
        "number.max": "Receiver ID must be at most 9 digits.",
    }),
});
