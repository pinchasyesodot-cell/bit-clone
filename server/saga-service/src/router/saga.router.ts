import { Router } from "express";
import { SagaController } from "../controller/saga.controller.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { sagaValidationSchema } from "../validations/saga.validation.js";
import { validateToken } from "../validations/token.validation.js";

class SagaRouter {
    public router: Router;

    constructor() {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.post("/", validateToken, validateRequest(sagaValidationSchema, "body"), SagaController.createSaga);
    }
}

export default new SagaRouter().router;
