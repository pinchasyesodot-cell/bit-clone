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
  },
);

export const sagaModel = model<Saga>("Saga", sagaSchema);
