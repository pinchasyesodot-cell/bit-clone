import type { User } from "../interfaces/userType.js";
import { userModel } from "../models/User.js";

export class UserRepository {
  static createUser = async (user: User): Promise<User> => {
    const newUser = new userModel(user);
    return (await newUser.save()).toJSON();
  }
}
