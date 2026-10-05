import { Router } from "express";
import { SagaController } from "../controller/saga.controller.js";
class SagaRouter {
    public router: Router;
    constructor() {
        this.router = Router();
        this.initializeRoutes();
    }
    private initializeRoutes() {
        this.router.post("/", SagaController.createSaga);
    }
}

export default new SagaRouter().router;
