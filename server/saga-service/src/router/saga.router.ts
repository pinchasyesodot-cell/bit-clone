import { Router } from "express";
import { SagaController } from "../controller/saga.controller.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { sagaValidationSchema } from "../validations/saga.validation.js";
class SagaRouter {
    public router: Router;
    constructor() {
        this.router = Router();
        this.initializeRoutes();
    }
    private initializeRoutes() {
        this.router.post("/", validateRequest(sagaValidationSchema, "body"), SagaController.createSaga);
    }
}

export default new SagaRouter().router;
