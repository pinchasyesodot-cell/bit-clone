import { rabbitMQConfig } from "../config/rabbitmq.js";
import type { StepResult } from "../interfaces/account.types.js";
import type { Saga, SagaCommand, SagaResponse } from "../interfaces/saga.type.js";
import { AccountService } from "../services/account.service.js";
import { logger } from "../utils/logger.js";

const SAGA_RESPONSE_QUEUE = "saga_response_queue";

const processCommand = async (
    command: SagaCommand,
    handler: (saga: Saga) => Promise<StepResult>,
    responseType: SagaResponse["type"]
): Promise<void> => {
    const result = await handler(command.payload);
    if (result.success) logger.info("Command succeeded", { sagaId: command.payload.sagaId, responseType });
    else logger.warn("Command rejected", { sagaId: command.payload.sagaId, responseType, error: result.error });
    await rabbitMQConfig.publishMessage(SAGA_RESPONSE_QUEUE, {
        type: responseType,
        payload: { sagaId: command.payload.sagaId, ...result },
    });
};

export const startConsumers = async (): Promise<void> => {
    await rabbitMQConfig.consumeMessages("debit_queue", (cmd) =>
        processCommand(cmd, AccountService.handleDebit, "DEBIT_RESPONSE")
    );
    await rabbitMQConfig.consumeMessages("credit_queue", (cmd) =>
        processCommand(cmd, AccountService.handleCredit, "CREDIT_RESPONSE")
    );
    await rabbitMQConfig.consumeMessages("refund_queue", (cmd) =>
        processCommand(cmd, AccountService.handleRefund, "REFUND_RESPONSE")
    );
};
