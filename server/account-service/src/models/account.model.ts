import { model, Schema } from "mongoose";
import { AccountStatus, AccountType, type Account } from "../interfaces/account.types.js";

const accountSchema = new Schema<Account>(
    {
        accountNumber: { type: String, required: true, unique: true },
        userId: { type: String, required: true, unique: true },
        balance: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
            validate: { name: "isInteger", validator: Number.isInteger, message: "{VALUE} is not an integer value" },
        },
        status: { type: String, enum: Object.values(AccountStatus), required: true, default: AccountStatus.ACTIVE },
        type: { type: String, enum: Object.values(AccountType), required: true },
    },
    {
        timestamps: true,
        toJSON: {
            transform: (_doc, ret: Record<string, unknown>) => {
                delete ret._id;
                delete ret.__v;
                delete ret.createdAt;
                delete ret.updatedAt;
                return ret;
            },
        },
    }
);

export const AccountModel = model<Account>("Account", accountSchema);
