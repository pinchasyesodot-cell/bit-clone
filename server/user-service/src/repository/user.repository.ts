import type { User, UserWithoutPassword } from "../interfaces/userType.js";
import { userModel } from "../models/User.js";

const EXCLUDED_FIELDS = "-_id -__v -updatedAt -createdAt";

// One select() call: Mongoose ignores a later select("+password") once the projection excludes fields.
const findByUserId = (userId: number, projection = EXCLUDED_FIELDS) =>
    userModel.findOne({ userId }).lean().select(projection);

export class UserRepository {
    static createUser = async (user: User): Promise<UserWithoutPassword> => {
        const newUser = new userModel(user);
        return (await newUser.save()).toJSON();
    };

    static getUserByUserId = async (userId: number): Promise<UserWithoutPassword | null> => {
        return await findByUserId(userId).exec();
    };

    static getUserLogin = async (userId: number): Promise<User | null> => {
        return await findByUserId(userId, `${EXCLUDED_FIELDS} +password`).exec();
    };

    static deleteUser = async (userId: number): Promise<void> => {
        await userModel.deleteOne({ userId }).exec();
    };
}
