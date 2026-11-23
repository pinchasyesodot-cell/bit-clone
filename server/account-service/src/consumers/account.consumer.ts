import type Joi from "joi";
import { rabbitMQConfig } from "../config/rabbitmq.js";
import type { StepResult } from "../interfaces/account.types.js";
import type { Saga, SagaCommand, SagaResponse } from "../interfaces/saga.type.js";
import { AccountService } from "../services/account.service.js";
import { logger } from "../utils/logger.js";
import { commandSchema } from "../validations/sagaCommand.validation.js";
import { userCreatedSchema } from "../validations/userEvent.validation.js";
import { validateMessage } from "../validations/validateMessage.js";

const SAGA_RESPONSE_QUEUE = "saga_response_queue";
const debitSchema = commandSchema("DEBIT_COMMAND");
const creditSchema = commandSchema("CREDIT_COMMAND");
const refundSchema = commandSchema("REFUND_COMMAND");

const processCommand = async (
    message: unknown,
    schema: Joi.ObjectSchema<SagaCommand>,
    handler: (saga: Saga) => Promise<StepResult>,
    responseType: SagaResponse["type"]
): Promise<void> => {
    const command = validateMessage(schema, message);
    const result = await handler(command.payload);
    if (result.success) logger.info("Command succeeded", { sagaId: command.payload.sagaId, responseType });
    else logger.warn("Command rejected", { sagaId: command.payload.sagaId, responseType, error: result.error });
    await rabbitMQConfig.publishMessage(SAGA_RESPONSE_QUEUE, {
        type: responseType,
        payload: { sagaId: command.payload.sagaId, ...result },
    });
};

const handleUserCreated = async (message: unknown): Promise<void> => {
    const event = validateMessage(userCreatedSchema, message);

    const opened = await AccountService.openAccount(event.payload.userId);
    logger.info(opened ? "Account opened" : "Account already exists");
};

export const startConsumers = async (): Promise<void> => {
    await rabbitMQConfig.consumeMessages("debit_queue", (cmd) =>
        processCommand(cmd, debitSchema, AccountService.handleDebit, "DEBIT_RESPONSE")
    );
    await rabbitMQConfig.consumeMessages("credit_queue", (cmd) =>
        processCommand(cmd, creditSchema, AccountService.handleCredit, "CREDIT_RESPONSE")
    );
    await rabbitMQConfig.consumeMessages("refund_queue", (cmd) =>
        processCommand(cmd, refundSchema, AccountService.handleRefund, "REFUND_RESPONSE")
    );
    await rabbitMQConfig.consumeMessages("user_created_queue", handleUserCreated);
};
