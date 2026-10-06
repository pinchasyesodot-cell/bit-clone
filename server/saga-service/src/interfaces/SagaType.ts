export enum SagaStatus {
    PENDING = "PENDING",
    PROCESSING = "PROCESSING",
    COMPLETED = "COMPLETED",
    FAILED = "FAILED",
    COMPENSATING = "COMPENSATING"
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
