import { model, Schema } from "mongoose";
import { StepStatus, type AccountSaga } from "../interfaces/account.types.js";

const accountSagaSchema = new Schema<AccountSaga>(
    {
        sagaId: { type: String, required: true, unique: true },
        senderId: { type: String, required: true },
        amount: {
            type: Number,
            required: true,
            min: 1,
            validate: { name: "isInteger", validator: Number.isInteger, message: "{VALUE} is not an integer value" },
        },
        debit: { type: String, enum: Object.values(StepStatus), required: true, default: StepStatus.PENDING },
        credit: { type: String, enum: Object.values(StepStatus), required: true, default: StepStatus.PENDING },
        refund: { type: String, enum: Object.values(StepStatus), required: true, default: StepStatus.PENDING },
        debitError: { type: String },
        creditError: { type: String },
    },
    {
        timestamps: true,
    }
);

export const AccountSagaModel = model<AccountSaga>("AccountSaga", accountSagaSchema);
