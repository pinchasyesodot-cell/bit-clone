import Joi from "joi";
import type { SagaCommand } from "../interfaces/saga.type.js";
import { sagaId, userId } from "./common.validation.js";

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
