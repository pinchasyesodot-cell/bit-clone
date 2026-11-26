export interface User {
    userId: number;
    userName: string;
    password: string;
}

export type UserWithoutPassword = Omit<User, "password">;

export type UserLogin = Omit<User, "userName">;

export interface UserCreatedEvent {
    type: "USER_CREATED";
    payload: { userId: string };
}
