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
