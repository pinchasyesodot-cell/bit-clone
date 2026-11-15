import { Router } from "express";
import { AccountController } from "../controller/account.controller.js";

class AccountRouter {
    public router: Router;

    constructor() {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.get("/sagas/:sagaId", AccountController.getSagaState);
    }
}

export default new AccountRouter().router;
