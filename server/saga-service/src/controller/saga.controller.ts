import type { bodySaga } from "../interfaces/SagaType.js";
import { SagaManager } from "../managers/saga.manager.js";
import { AppError } from "../utils/AppError.js";
import { wrapAsync } from "../utils/wrapAsync.js";
import type { Request, Response } from "express";
import { validate as isUuid } from "uuid";

export class SagaController {
    static createSaga = wrapAsync(async (req: Request, res: Response) => {
        if (!req.user) throw new AppError("Unauthorized", 401);

        const idempotencyKey = req.get("Idempotency-Key");
        if (idempotencyKey !== undefined && !isUuid(idempotencyKey)) {
            throw new AppError("Idempotency-Key must be a UUID", 400);
        }
        const body: bodySaga = req.body;
        const { saga, created } = await SagaManager.createSaga(
            { ...body, senderId: String(req.user.userId) },
            idempotencyKey
        );

        res.status(created ? 201 : 200).json(saga);
    });
}
