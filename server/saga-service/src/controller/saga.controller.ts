import type { bodySaga } from "../interfaces/SagaType.js";
import { SagaService } from "../service/saga.service.js";
import { AppError } from "../utils/AppError.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import type { Request, Response } from "express";

export class SagaController {
    static createSaga = wrapAsync(async (req: Request, res: Response) => {
        if (!req.user) throw new AppError("Unauthorized", 401);
        const body: bodySaga = req.body;
        const newSaga = await SagaService.createSaga({ ...body, senderId: String(req.user.userId) });
        res.status(201).json(newSaga);
    });
}
