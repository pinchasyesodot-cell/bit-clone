import type { User, UserWithoutPassword } from "../interfaces/userType.js";
import { userModel } from "../models/User.js";

export class UserRepository {
  static createUser = async (user: User): Promise<UserWithoutPassword> => {
    const newUser = new userModel(user);
    return (await newUser.save()).toJSON();
  };

  static getUserByName = async (userName: string): Promise<User | null> => {
    return await userModel
      .findOne({ userName })
      .lean()
      .select(" -_id -__v -updatedAt -createdAt ")
      .exec();
  };

  static getUserByUserId = async (
    userId: number,
  ): Promise<UserWithoutPassword | null> => {
    return await userModel
      .findOne({ userId })
      .lean()
      .select(" -_id -password -__v -updatedAt -createdAt ")
      .exec();
  };
}
