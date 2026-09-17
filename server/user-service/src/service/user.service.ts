import type { User } from "../interfaces/userType.js";
import { UserRepository } from "../repository/user.repository.js";

export class UserService {
    static createUser = async (user: User): Promise<User> => {
        return await UserRepository.createUser(user);
    }
}
