export enum AccountStatus {
    ACTIVE = "ACTIVE",
    FROZEN = "FROZEN",
}

export enum AccountType {
    SAVINGS = "SAVINGS",
    CHECKING = "CHECKING",
}

export interface Account {
    accountNumber: string;
    userId: string;
    balance: number;
    status: AccountStatus;
    type: AccountType;
    createdAt: Date;
    updatedAt: Date;
}

export type CreateAccountRequest = Omit<Account, "accountNumber" | "balance" | "status" | "createdAt" | "updatedAt">;

export type AccountDTO = Omit<Account, "createdAt" | "updatedAt">;

export enum StepStatus {
    PENDING = "PENDING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
}

export interface AccountSaga {
    sagaId: string;
    senderId: string;
    amount: number;
    debit: StepStatus;
    credit: StepStatus;
    refund: StepStatus;
    debitError?: string;
    creditError?: string;
    createdAt: Date;
    updatedAt: Date;
}

export type AccountSagaDTO = Omit<AccountSaga, "createdAt" | "updatedAt">;

export enum AccountError {
    ACCOUNT_NOT_FOUND = "ACCOUNT_NOT_FOUND",
    ACCOUNT_FROZEN = "ACCOUNT_FROZEN",
    INSUFFICIENT_FUNDS = "INSUFFICIENT_FUNDS",
    SAGA_CANCELLED = "SAGA_CANCELLED",
    ALREADY_REFUNDED = "ALREADY_REFUNDED",
}
