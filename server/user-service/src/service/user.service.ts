import type { User } from "../interfaces/userType.js";
import { UserRepository } from "../repository/user.repository.js";
import { Hash } from "../utils/hash.js";


export class UserService {
    static createUser = async (user: User): Promise<User> => {
        const hashedPassword = await Hash.hashPassword(user.password);
        user.password = hashedPassword;
        return await UserRepository.createUser(user);
    }
}
