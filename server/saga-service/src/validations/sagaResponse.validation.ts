import Joi from "joi";
import type { SagaResponse } from "../interfaces/SagaType.js";

export const sagaResponseSchema = Joi.object<SagaResponse>({
    type: Joi.string().valid("DEBIT_RESPONSE", "CREDIT_RESPONSE", "REFUND_RESPONSE").required(),
    payload: Joi.object({
        sagaId: Joi.string().guid({ version: "uuidv7" }).required(),
        success: Joi.boolean().strict().required(),
        error: Joi.string(),
    })
        .unknown(true)
        .required(),
}).unknown(true);
