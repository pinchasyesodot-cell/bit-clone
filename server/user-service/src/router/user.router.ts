import { Router } from "express";
import { UserController } from "../controller/user.controller.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { userValidationSchema } from "../validations/user.validation.js";

class UserRouter {
  public router: Router;
  constructor() {
    this.router = Router();
    this.initRoutes();
  }
  private initRoutes = (): void => {
    this.router.post(
      "/",
      validateRequest(userValidationSchema, "body"),
      UserController.createUser,
    );
  };
}

export default new UserRouter().router;
