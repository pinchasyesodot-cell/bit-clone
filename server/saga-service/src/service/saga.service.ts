import { SagaStatus, type SagaWithoutIdAndStatus } from "../interfaces/SagaType.js";
import { v4 as uuidv4 } from "uuid";
import { SagaRepository } from "../repository/saga.repository.js";
import { rabbitMQConfig } from "../config/rabbitmq.js";

export class SagaService {
    static createSaga = async (saga: SagaWithoutIdAndStatus) => {
        const sagaId = uuidv4();
        const status = SagaStatus.PENDING;
        const newSaga = await SagaRepository.createSaga({ ...saga, sagaId, status });
        await rabbitMQConfig.publishMessage("saga_queue", { type: "DEBIT_COMMAND", payload: newSaga });
        return newSaga;
    };
}
