export interface UserCreatedEvent {
    type: "USER_CREATED";
    payload: { userId: string };
}
