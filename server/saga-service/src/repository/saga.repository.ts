import type { Saga } from "../interfaces/SagaType.js";
import { sagaModel } from "../models/sagaModel.js";

export class SagaRepository {
    static createSaga = async (saga: Saga) => {
        const newSaga = new sagaModel(saga);
        return (await newSaga.save()).toJSON() as Saga;
    };

    static updateSagaStatus = async (sagaId: string, status: string): Promise<Saga | null> => {
        return sagaModel
            .findOneAndUpdate({ sagaId }, { status }, { new: true })
            .lean()
            .select(" -_id -__v -updatedAt -createdAt")
            .exec();
    };
}
