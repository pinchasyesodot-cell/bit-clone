export interface User {
  userId: number;
  userName: string;
  password: string;
}

export type UserWithoutPassword = Omit<User, "password">;

export type UserLogin = Omit<User, "userId">;
