import type { User, UserLogin, UserWithoutPassword } from "../interfaces/userType.js";
import { UserRepository } from "../repository/user.repository.js";
import { AppError, NotFound } from "../utils/AppError.js";
import { Hash } from "../utils/hash.js";
import { JWT } from "../utils/jwt.js";
import { config } from "../config/env.js";
import { rabbitMQConfig } from "../config/rabbitmq.js";
import { logger } from "../utils/logger.js";
import { errorMessage } from "../utils/errorMessage.js";

const dummyHashString = await Hash.hashPassword("not-a-real-password");

export class UserService {
    static createUser = async (user: User): Promise<UserWithoutPassword> => {
        const hashedPassword = await Hash.hashPassword(user.password);
        user.password = hashedPassword;
        const newUser = await UserRepository.createUser(user);
        await this.announceUserCreated(newUser.userId);
        return newUser;
    };

    static login = async (user: UserLogin): Promise<UserWithoutPassword & { token: string }> => {
        const userData = await UserRepository.getUserLogin(user.userId);
        const isMatch = await Hash.comparePassword(user.password, userData?.password ?? dummyHashString);
        if (!userData || !isMatch) throw new AppError("Invalid credentials", 401);
        const { password, ...result } = userData;
        const token = JWT.generateToken(result, config.JWT_SECRET, "1h");
        return { ...result, token };
    };

    static getUserByUserId = async (userId: number): Promise<UserWithoutPassword> => {
        const userData = await UserRepository.getUserByUserId(userId);
        if (!userData) throw new NotFound("User not found");
        return userData;
    };

    // account-service opens the 0 ₪ account when it gets this event. A user without an account could
    // log in but never send or receive money, and could not sign up again (409), so if the broker does
    // not confirm the event, the user is removed and the signup fails: the client can simply retry.
    private static announceUserCreated = async (userId: number): Promise<void> => {
        try {
            await rabbitMQConfig.publishMessage("user_created_queue", {
                type: "USER_CREATED",
                payload: { userId: String(userId) },
            });
        } catch (error) {
            logger.error("USER_CREATED was not confirmed, removing the new user", {
                userId,
                error: errorMessage(error),
            });
            await UserRepository.deleteUser(userId).catch((deleteError: unknown) => {
                logger.error("Could not remove the user after the failed announcement", {
                    userId,
                    error: errorMessage(deleteError),
                });
            });
            throw new Error("Could not announce the new user", { cause: error });
        }
    };
}
