import Joi from "joi";
import type { SagaCommand } from "../interfaces/saga.type.js";

const sagaId = Joi.string().guid({ version: "uuidv4" }).required();
// Same rule as userId in user-service (a 9-digit number), which arrives here as a string.
const userId = Joi.string().pattern(/^\d{9}$/).required();

export const commandSchema = (type: SagaCommand["type"]): Joi.ObjectSchema<SagaCommand> =>
    Joi.object<SagaCommand>({
        type: Joi.string().valid(type).required(),
        payload: Joi.object({
            sagaId,
            senderId: userId,
            receiverId: userId,
            amount: Joi.number().integer().min(1).required(),
        })
            .unknown(true)
            .required(),
    });
