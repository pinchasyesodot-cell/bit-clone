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
            enum: Object.values(SagaStatus),
            default: SagaStatus.PENDING,
        },
        idempotencyKey: { type: String },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret: Record<string, unknown>) => {
                delete ret.__v;
                delete ret.updatedAt;
                delete ret.createdAt;
                delete ret._id;
                return ret;
            },
        },
    }
);

sagaSchema.index({ status: 1, updatedAt: 1 });
sagaSchema.index(
    { senderId: 1, idempotencyKey: 1 },
    { unique: true, partialFilterExpression: { idempotencyKey: { $type: "string" } } }
);

export const sagaModel = model<Saga>("Saga", sagaSchema);
