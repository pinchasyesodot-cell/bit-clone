import type { Request, Response } from "express";
import { AccountService } from "../services/account.service.js";

export class AccountController {
    static getSagaState = async (req: Request<{ sagaId: string }>, res: Response): Promise<void> => {
        const { sagaId } = req.params;
        const result = await AccountService.getSagaState(sagaId);
        res.status(200).json(result);
    };
}
