import type { User, UserLogin, UserWithoutPassword } from "../interfaces/userType.js";
import { UserRepository } from "../repository/user.repository.js";
import { NotFound } from "../utils/AppError.js";
import { Hash } from "../utils/hash.js";
import { JWT } from "../utils/jwt.js";
import { config } from "../config/env.js";

export class UserService {
  static createUser = async (user: User): Promise<UserWithoutPassword> => {
    const hashedPassword = await Hash.hashPassword(user.password);
    user.password = hashedPassword;
    return await UserRepository.createUser(user);
  };

  static login = async (
    user: UserLogin,
  ): Promise<UserWithoutPassword & { token: string }> => {
    const userData = await UserRepository.getUserByName(user.userName);
    if (!userData) throw new NotFound("User not found");
    const isMatch = await Hash.comparePassword(
      user.password,
      userData.password,
    );
    if (!isMatch) throw new NotFound("Invalid credentials");
    const { password, ...result } = userData;
    const token = JWT.generateToken(result, config.JWT_SECRET, "1h");
    return { ...result, token };
  };
}
