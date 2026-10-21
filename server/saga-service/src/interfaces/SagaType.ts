export enum SagaStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    COMPENSATING = "COMPENSATING",
}

export interface Saga {
    sagaId: string;
    senderId: string;
    receiverId: string;
    amount: number;
    status: SagaStatus;
}

export type SagaWithoutIdAndStatus = Omit<Saga, "sagaId" | "status">;

export interface SagaCommand {
    type: "DEBIT_COMMAND" | "CREDIT_COMMAND" | "REFUND_COMMAND";
    payload: Saga;
}

export interface SagaResponse {
    type: "DEBIT_RESPONSE" | "CREDIT_RESPONSE" | "REFUND_RESPONSE";
    payload: {
        sagaId: string;
        success: boolean;
        error?: string;
    };
}

export interface AccountsSagaState {
    debited: boolean;
    credited: boolean;
    refunded: boolean;
}
