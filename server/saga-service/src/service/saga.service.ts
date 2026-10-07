import { SagaStatus, type Saga, type SagaWithoutIdAndStatus } from "../interfaces/SagaType.js";
import { v4 as uuidv4 } from "uuid";
import { SagaRepository } from "../repository/saga.repository.js";
import { rabbitMQConfig } from "../config/rabbitmq.js";
import { AppError, NotFound } from "../utils/AppError.js";

export class SagaService {
    static createSaga = async (saga: SagaWithoutIdAndStatus):Promise<Saga> => {
        const sagaId = uuidv4();
        const status = SagaStatus.PENDING;
        const newSaga = await SagaRepository.createSaga({ ...saga, sagaId, status });
        await rabbitMQConfig.publishMessage("debit_queue", { type: "DEBIT_COMMAND", payload: newSaga });
        return newSaga;
    };

    static consumeSagaMessages = async (): Promise<void> => {
        await rabbitMQConfig.consumeMessages("saga_response_queue", async (msg) => {
            const { type, payload } = msg;
            const { sagaId, status } = payload;
            const updatedSaga = await SagaRepository.updateSagaStatus(sagaId, status);
            if (!updatedSaga) {
                throw new NotFound(`Saga with ID ${sagaId} not found.`);
            }
            if (type === "DEBIT_COMMAND" && status === SagaStatus.COMPLETED) {
                await rabbitMQConfig.publishMessage("credit_queue", {
                    type: "CREDIT_COMMAND",
                    payload: updatedSaga,
                });
            } else if (type === "CREDIT_COMMAND" && status === SagaStatus.FAILED) {
                await rabbitMQConfig.publishMessage("refund_queue", {
                    type: "REFUND_COMMAND",
                    payload: updatedSaga,
                });
            }
        });
    };
}
