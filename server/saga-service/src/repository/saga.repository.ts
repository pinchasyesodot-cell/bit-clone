import { SagaStatus, type Saga } from "../interfaces/SagaType.js";
import { sagaModel } from "../models/sagaModel.js";

const EXCLUDED_FIELDS = "-_id -__v -updatedAt -createdAt";

export class SagaRepository {
    static create = async (saga: Saga): Promise<Saga> => {
        const doc = new sagaModel(saga);
        return (await doc.save()).toJSON() as Saga;
    };

    static findById = async (sagaId: string): Promise<Saga | null> => {
        return sagaModel.findOne({ sagaId }).lean().select(EXCLUDED_FIELDS).exec() as Promise<Saga | null>;
    };

    static findByIdempotencyKey = async (key: string): Promise<Saga | null> => {
        return sagaModel
            .findOne({ idempotencyKey: key })
            .lean()
            .select(EXCLUDED_FIELDS)
            .exec() as Promise<Saga | null>;
    };

    static updateStatus = async (sagaId: string, status: SagaStatus): Promise<Saga | null> => {
        return sagaModel
            .findOneAndUpdate({ sagaId }, { status }, { new: true })
            .lean()
            .select(EXCLUDED_FIELDS)
            .exec() as Promise<Saga | null>;
    };
    
    static findTimedOut = async (cutoff: Date): Promise<Saga[]> => {
        return sagaModel
            .find({
                status: { $in: [SagaStatus.PENDING, SagaStatus.PROCESSING] },
                startedAt: { $lt: cutoff },
            })
            .lean()
            .select(EXCLUDED_FIELDS)
            .exec() as Promise<Saga[]>;
    };
}

