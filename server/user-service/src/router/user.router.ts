import { Router } from "express";
import { UserController } from "../controller/user.controller.js";

class UserRouter {
    public router:Router;
    constructor() {
        this.router = Router();
        this.initRoutes();
    }
    private initRoutes = (): void => {
        this.router.post("/", UserController.createUser);
    }
}

export default new UserRouter().router;
