import { model, Schema } from "mongoose";
import { SagaStatus, type Saga } from "../interfaces/SagaType.js";

const sagaSchema = new Schema<Saga>(
    {
        sagaId: { type: String, required: true, unique: true },
        senderId: { type: String, required: true },
        receiverId: { type: String, required: true },
        amount: { type: Number, required: true },
        status: {
            type: String,
            enum: SagaStatus,
            default: SagaStatus.PENDING,
        },
    },
    { timestamps: true }
);

export const sagaModel = model<Saga>("Saga", sagaSchema);
