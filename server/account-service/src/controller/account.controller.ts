import type { Request, Response } from "express";
import { AccountService } from "../services/account.service.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import { AppError } from "../utils/AppError.js";

export class AccountController {
    static getSagaState = async (req: Request<{ sagaId: string }>, res: Response): Promise<void> => {
        const { sagaId } = req.params;
        const result = await AccountService.getSagaState(sagaId);
        res.status(200).json(result);
    };

    static getMyAccount = wrapAsync(async (req: Request, res: Response): Promise<void> => {
        if (!req.user) throw new AppError("Unauthorized", 401);
        const account = await AccountService.getMyAccount(String(req.user.userId));
        res.status(200).json(account);
    });
}
