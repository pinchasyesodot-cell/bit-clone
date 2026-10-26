import { SagaStatus, type AccountsSagaState, type Saga, type SagaWithoutIdAndStatus } from "../interfaces/SagaType.js";
import { v4 as uuidv4 } from "uuid";
import { SagaRepository } from "../repository/saga.repository.js";
import { rabbitMQConfig } from "../config/rabbitmq.js";
import { api } from "../api/base.api.js";
import { logger } from "../utils/logger.js";
import socketIo from "./socket.service.js";
import { AppError } from "../utils/AppError.js";

export class SagaService {
    static isProcessing = false;
    static SAGA_TIMEOUT_MS = 10000;

    static createSaga = async (saga: SagaWithoutIdAndStatus): Promise<Saga> => {
        if (saga.senderId === saga.receiverId) {
            throw new AppError("Cannot send money to yourself", 400);
        }
        const sagaId = uuidv4();
        const status = SagaStatus.PENDING;
        const newSaga = await SagaRepository.create({ ...saga, sagaId, status });
        await rabbitMQConfig.publishMessage("debit_queue", { type: "DEBIT_COMMAND", payload: newSaga });
        return newSaga;
    };

    static handleTimeouts = async (): Promise<void> => {
        if (this.isProcessing) return;
        this.isProcessing = true;
        try {
            const cutoff = new Date(Date.now() - this.SAGA_TIMEOUT_MS);
            const timedOutSagas = await SagaRepository.findTimedOut(cutoff);
            for (const saga of timedOutSagas) {
                try {
                    await this.reconcile(saga);
                } catch (error) {
                    logger.error(`Timeout handling failed for saga ${saga.sagaId}: ${error}`);
                }
            }
        } catch (error) {
            logger.error(`General error in handleTimeouts: ${error}`);
        } finally {
            this.isProcessing = false;
        }
    };

    private static reconcile = async (saga: Saga): Promise<void> => {
        const { data } = await api.get<AccountsSagaState>(`/${saga.sagaId}`);
        const open = [SagaStatus.PENDING, SagaStatus.PROCESSING];
        if (data.credited) {
            const done = await SagaRepository.transition(saga.sagaId, open, SagaStatus.COMPLETED);
            if (done) socketIo.emitToUser(done.senderId, "saga:completed", done);
        } else if (data.refunded) {
            const failed = await SagaRepository.transition(saga.sagaId, open, SagaStatus.FAILED);
            if (failed) socketIo.emitToUser(failed.senderId, "saga:failed", failed);
        } else {
            const updated = await SagaRepository.transition(saga.sagaId, open, SagaStatus.COMPENSATING);
            if (updated) {
                await rabbitMQConfig.publishMessage("refund_queue", { type: "REFUND_COMMAND", payload: updated });
                socketIo.emitToUser(saga.senderId, "saga:compensating", updated);
            }
        }
    };

    static consumeSagaMessages = async (): Promise<void> => {
        await rabbitMQConfig.consumeMessages("saga_response_queue", async (msg) => {
            const { type, payload } = msg;
            const { sagaId, success } = payload;
            switch (type) {
                case "DEBIT_RESPONSE":
                    await this.handleDebitResponse(sagaId, success);
                    break;
                case "CREDIT_RESPONSE":
                    await this.handleCreditResponse(sagaId, success);
                    break;
                case "REFUND_RESPONSE":
                    await this.handleRefundResponse(sagaId, success);
                    break;
                default:
                    logger.warn(`Unknown message type: ${type}`);
            }
        });
    };

    private static handleDebitResponse = async (sagaId: string, success: boolean): Promise<void> => {
        if (!success) {
            const saga = await SagaRepository.transition(sagaId, [SagaStatus.PENDING], SagaStatus.FAILED);
            if (!saga) {
                logger.warn(`Ignoring stale FAILED_RESPONSE for ${sagaId}`);
                return;
            }
            socketIo.emitToUser(saga.senderId, "saga:failed", saga);
            return;
        }
        const saga = await SagaRepository.transition(sagaId, [SagaStatus.PENDING], SagaStatus.PROCESSING);
        if (!saga) {
            logger.warn(`Ignoring stale DEBIT_RESPONSE for ${sagaId}`);
            return;
        }
        await rabbitMQConfig.publishMessage("credit_queue", { type: "CREDIT_COMMAND", payload: saga });
        socketIo.emitToUser(saga.senderId, "saga:processing", saga);
    };

    private static handleCreditResponse = async (sagaId: string, success: boolean): Promise<void> => {
        if (!success) {
            const saga = await SagaRepository.transition(sagaId, [SagaStatus.PROCESSING], SagaStatus.COMPENSATING);
            if (!saga) {
                logger.warn(`Ignoring stale CREDIT_RESPONSE for ${sagaId}`);
                return;
            }
            await rabbitMQConfig.publishMessage("refund_queue", {
                type: "REFUND_COMMAND",
                payload: saga,
            });
            socketIo.emitToUser(saga.senderId, "saga:compensating", saga);
            return;
        }
        const saga = await SagaRepository.transition(
            sagaId,
            [SagaStatus.PROCESSING, SagaStatus.COMPENSATING],
            SagaStatus.COMPLETED
        );
        if (!saga) {
            logger.warn(`Ignoring stale CREDIT_RESPONSE for ${sagaId}`);
            return;
        }
        socketIo.emitToUser(saga.senderId, "saga:completed", saga);
    };

    private static handleRefundResponse = async (sagaId: string, success: boolean): Promise<void> => {
        if (success) {
            const saga = await SagaRepository.transition(sagaId, [SagaStatus.COMPENSATING], SagaStatus.FAILED);
            if (!saga) {
                logger.warn(`Ignoring stale Refund_RESPONSE for ${sagaId}`);
                return;
            }
            socketIo.emitToUser(saga.senderId, "saga:failed", saga);
        } else {
            logger.error(`Refund failed for ${sagaId}; stays COMPENSATING and will be retried`);
        }
    };
}
