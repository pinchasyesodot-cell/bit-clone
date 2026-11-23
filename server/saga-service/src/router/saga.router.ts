import { Router } from "express";
import { SagaController } from "../controller/saga.controller.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { sagaValidationSchema } from "../validations/saga.validation.js";
import { validateToken } from "../middlewares/validateToken.js";
import { transferRateLimit } from "../middlewares/transferRateLimit.js";

class SagaRouter {
    public router: Router;

    constructor() {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.post(
            "/",
            validateToken,
            transferRateLimit,
            validateRequest(sagaValidationSchema, "body"),
            SagaController.createSaga
        );
    }
}

export default new SagaRouter().router;
