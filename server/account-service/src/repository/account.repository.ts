import type { ClientSession } from "mongoose";
import { AccountModel } from "../models/account.model.js";
import { AccountStatus, AccountType, type AccountDTO } from "../interfaces/account.types.js";

const EXCLUDED_FIELDS = "-_id -__v -updatedAt -createdAt";

export class AccountRepository {
    static debit = async (userId: string, amount: number, session: ClientSession): Promise<AccountDTO | null> => {
        return await AccountModel.findOneAndUpdate(
            {
                userId,
                status: AccountStatus.ACTIVE,
                balance: { $gte: amount },
            },
            {
                $inc: { balance: -amount },
            },
            { returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static findByUserId = async (userId: string, session?: ClientSession): Promise<AccountDTO | null> => {
        return await AccountModel.findOne({ userId })
            .session(session ?? null)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static credit = async (userId: string, amount: number, session: ClientSession): Promise<AccountDTO | null> => {
        return await AccountModel.findOneAndUpdate(
            { userId, status: AccountStatus.ACTIVE },
            { $inc: { balance: amount } },
            { returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static refund = async (userId: string, amount: number, session: ClientSession): Promise<AccountDTO | null> => {
        return await AccountModel.findOneAndUpdate(
            { userId },
            { $inc: { balance: amount } },
            { returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static openAccount = async (userId: string, accountNumber: string): Promise<boolean> => {
        const result = await AccountModel.updateOne(
            { userId },
            {
                $setOnInsert: {
                    accountNumber,
                    balance: 0,
                    status: AccountStatus.ACTIVE,
                    type: AccountType.CHECKING,
                },
            },
            { upsert: true }
        ).exec();
        return result.upsertedCount === 1;
    };
}
