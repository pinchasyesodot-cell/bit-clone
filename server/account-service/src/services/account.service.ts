import type { ClientSession } from "mongoose";
import { AccountError, AccountStatus, StepStatus, type StepResult } from "../interfaces/account.types.js";
import { AccountRepository } from "../repository/account.repository.js";
import { type Saga, ALREADY_CREDITED } from "../interfaces/saga.type.js";
import { AccountSagaRepository } from "../repository/accountSaga.repository.js";
import { withTransaction } from "../utils/transaction.js";

export class AccountService {
    private static getDebitFailureReason = async (userId: string, session: ClientSession): Promise<AccountError> => {
        const accountUser = await AccountRepository.findByUserId(userId, session);
        if (!accountUser) {
            return AccountError.ACCOUNT_NOT_FOUND;
        } else if (accountUser.status === AccountStatus.FROZEN) {
            return AccountError.ACCOUNT_FROZEN;
        }
        return AccountError.INSUFFICIENT_FUNDS;
    };

    private static getCreditFailureReason = async (userId: string, session: ClientSession): Promise<AccountError> => {
        const accountUser = await AccountRepository.findByUserId(userId, session);
        if (!accountUser) {
            return AccountError.ACCOUNT_NOT_FOUND;
        }
        return AccountError.ACCOUNT_FROZEN;
    };

    static handleDebit = async (saga: Saga): Promise<StepResult> => {
        await AccountSagaRepository.ensureSaga(saga);

        return await withTransaction(async (session) => {
            const card = await AccountSagaRepository.findBySagaId(saga.sagaId, session);
            if (!card) {
                throw new Error(`AccountSaga card not found for saga ${saga.sagaId}`);
            }
            if (card.debit === StepStatus.COMPLETED) return { success: true };

            if (card.debit === StepStatus.FAILED) {
                return { success: false, ...(card.debitError && { error: card.debitError }) };
            }
            if (card.refund === StepStatus.COMPLETED) {
                await AccountSagaRepository.rejectDebit(card.sagaId, AccountError.SAGA_CANCELLED, session);
                return { success: false, error: AccountError.SAGA_CANCELLED };
            }
            const account = await AccountRepository.debit(card.senderId, card.amount, session);
            if (!account) {
                const reason = await this.getDebitFailureReason(card.senderId, session);
                await AccountSagaRepository.rejectDebit(card.sagaId, reason, session);
                return { success: false, error: reason };
            }
            const update = await AccountSagaRepository.completeDebit(card.sagaId, session);
            if (!update) throw new Error(`Failed to mark debit as completed for saga ${card.sagaId}`);
            return { success: true };
        });
    };

    static handleCredit = async (saga: Saga): Promise<StepResult> => {
        await AccountSagaRepository.ensureSaga(saga);

        return await withTransaction(async (session) => {
            const card = await AccountSagaRepository.findBySagaId(saga.sagaId, session);
            if (!card) {
                throw new Error(`AccountSaga card not found for saga ${saga.sagaId}`);
            }
            if (card.credit === StepStatus.COMPLETED) return { success: true };
            if (card.credit === StepStatus.FAILED) {
                return { success: false, ...(card.creditError && { error: card.creditError }) };
            }
            if (card.refund === StepStatus.COMPLETED) {
                await AccountSagaRepository.rejectCredit(card.sagaId, AccountError.ALREADY_REFUNDED, session);
                return { success: false, error: AccountError.ALREADY_REFUNDED };
            }
            const account = await AccountRepository.credit(saga.receiverId, card.amount, session);
            if (!account) {
                const reason = await this.getCreditFailureReason(saga.receiverId, session);
                await AccountSagaRepository.rejectCredit(card.sagaId, reason, session);
                return { success: false, error: reason };
            }
            const update = await AccountSagaRepository.completeCredit(card.sagaId, session);
            if (!update) throw new Error(`Failed to mark credit as completed for saga ${card.sagaId}`);
            return { success: true };
        });
    };

    static handleRefund = async (saga: Saga): Promise<StepResult> => {
        await AccountSagaRepository.ensureSaga(saga);
        return await withTransaction(async (session) => {
            const card = await AccountSagaRepository.findBySagaId(saga.sagaId, session);
            if (!card) {
                throw new Error(`AccountSaga card not found for saga ${saga.sagaId}`);
            }
            if (card.refund === StepStatus.COMPLETED) return { success: true };
            if (card.credit === StepStatus.COMPLETED) return { success: false, error: ALREADY_CREDITED };
            if (card.debit !== StepStatus.COMPLETED) {
                const complete = await AccountSagaRepository.completeRefund(card.sagaId, session);
                if (!complete) {
                    throw new Error(`Failed to mark refund as completed (no debit) for saga ${card.sagaId}`);
                }
                return { success: true };
            }
            const refund = await AccountRepository.refund(card.senderId, card.amount, session);
            if (!refund)
                throw new Error(`Refund failed: sender account ${card.senderId} not found for saga ${card.sagaId}`);
            const update = await AccountSagaRepository.completeRefund(card.sagaId, session);
            if (!update) throw new Error(`Failed to mark refund as completed for saga ${card.sagaId}`);
            return { success: true };
        });
    };
}
