import type { Request, Response } from "express";
import type { User } from "../interfaces/userType.js";
import { UserService } from "../service/user.service.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export class UserController {
  static createUser = wrapAsync(async (req: Request, res: Response): Promise<void> => {
        const userData: User = req.body;
        const newUser = await UserService.createUser(userData);
        res.status(201).json(newUser);
  });
}
