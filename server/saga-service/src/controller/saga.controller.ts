import type { SagaWithoutIdAndStatus } from "../interfaces/SagaType.js";
import { SagaService } from "../service/saga.service.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import type { Request, Response } from "express";

export class SagaController {
    static createSaga = wrapAsync(async (req: Request, res: Response) => {
        const body: SagaWithoutIdAndStatus = req.body;
        const newSaga = await SagaService.createSaga(body);
        res.status(201).json(newSaga);
    });
}

