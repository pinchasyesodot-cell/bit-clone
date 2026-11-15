import { Router } from "express";
import { AccountController } from "../controller/account.controller.js";
import { validateToken } from "../middlewares/validateToken.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { setStatusSchema } from "../validations/account.validation.js";

class AccountRouter {
    public router: Router;

    constructor() {
        this.router = Router();
        this.initializeRoutes();
    }

    private initializeRoutes(): void {
        this.router.get("/sagas/:sagaId", AccountController.getSagaState);
        this.router.get("/me", validateToken, AccountController.getMyAccount);
        this.router.patch(
            "/:userId/status",
            validateToken,
            validateRequest(setStatusSchema, "body"),
            AccountController.setStatus
        );
    }
}

export default new AccountRouter().router;
