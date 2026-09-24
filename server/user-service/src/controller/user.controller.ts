import type { Request, Response } from "express";
import type { User, UserLogin } from "../interfaces/userType.js";
import { UserService } from "../service/user.service.js";
import { wrapAsync } from "../utils/wrapAsync.js";

export class UserController {
  static createUser = wrapAsync(
    async (req: Request, res: Response): Promise<void> => {
      const userData: User = req.body;
      const newUser = await UserService.createUser(userData);
      res.status(201).json(newUser);
    },
  );

  static login = wrapAsync(
    async (req: Request, res: Response): Promise<void> => {
      const userData: UserLogin = req.body;
      const loginResult = await UserService.login(userData);
      res.setHeader("Authorization", `Bearer ${loginResult.token}`);
      res
        .status(200)
        .json({ userId: loginResult.userId, userName: loginResult.userName });
    },
  );

  static getUserByUserId = wrapAsync(
    async (req: Request, res: Response): Promise<void> => {
      const userId = Number(req.user?.userId);
      const userData = await UserService.getUserByUserId(userId);
      res.status(200).json(userData);
    },
  );
}
