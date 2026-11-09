import { type Saga } from "../interfaces/saga.type.js";
import { AccountSagaModel } from "../models/accountSaga.model.js";
import { mongo } from "mongoose";
import { logger } from "../utils/logger.js";
import type { ClientSession } from "mongoose";
import { AccountError, StepStatus, type AccountSagaDTO } from "../interfaces/account.types.js";

const EXCLUDED_FIELDS = "-_id -__v -updatedAt -createdAt";

export class AccountSagaRepository {
    static ensureSaga = async (saga: Saga): Promise<void> => {
        try {
            await AccountSagaModel.updateOne(
                { sagaId: saga.sagaId },
                {
                    $setOnInsert: {
                        amount: saga.amount,
                        senderId: saga.senderId,
                    },
                },
                { runValidators: true, upsert: true }
            ).exec();
        } catch (error: unknown) {
            if (error instanceof mongo.MongoServerError && error.code === 11000) {
                logger.debug("MongoDB Duplicate Key Error:", {
                    message: error.message,
                });
                return;
            }
            throw error;
        }
    };

    static completeDebit = async (sagaId: string, session: ClientSession): Promise<AccountSagaDTO | null> => {
        return await AccountSagaModel.findOneAndUpdate(
            { sagaId, debit: StepStatus.PENDING, refund: StepStatus.PENDING },
            { $set: { debit: StepStatus.COMPLETED } },
            { runValidators: true, returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static rejectDebit = async (
        sagaId: string,
        error: AccountError,
        session: ClientSession
    ): Promise<AccountSagaDTO | null> => {
        return await AccountSagaModel.findOneAndUpdate(
            { sagaId, debit: StepStatus.PENDING },
            { $set: { debit: StepStatus.FAILED, debitError: error } },
            { runValidators: true, returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static findBySagaId = async (sagaId: string, session?: ClientSession): Promise<AccountSagaDTO | null> => {
        return await AccountSagaModel.findOne({ sagaId })
            .session(session ?? null)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static completeCredit = async (sagaId: string, session: ClientSession): Promise<AccountSagaDTO | null> => {
        return await AccountSagaModel.findOneAndUpdate(
            { sagaId, credit: StepStatus.PENDING, debit: StepStatus.COMPLETED, refund: { $ne: StepStatus.COMPLETED } },
            { $set: { credit: StepStatus.COMPLETED } },
            { runValidators: true, returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static rejectCredit = async (
        sagaId: string,
        error: AccountError,
        session: ClientSession
    ): Promise<AccountSagaDTO | null> => {
        return await AccountSagaModel.findOneAndUpdate(
            { sagaId, credit: StepStatus.PENDING },
            {
                $set: { credit: StepStatus.FAILED, creditError: error },
            },
            { runValidators: true, returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };

    static completeRefund = async (sagaId: string, session: ClientSession): Promise<AccountSagaDTO | null> => {
        return await AccountSagaModel.findOneAndUpdate(
            {
                sagaId,
                credit: { $ne: StepStatus.COMPLETED },
                refund: StepStatus.PENDING,
            },
            {
                $set: { refund: StepStatus.COMPLETED },
            },
            { runValidators: true, returnDocument: "after" }
        )
            .session(session)
            .select(EXCLUDED_FIELDS)
            .lean()
            .exec();
    };
}
