import { Router } from "express";
import { UserController } from "../controller/user.controller.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import {
  loginValidationSchema,
  userValidationSchema,
} from "../validations/user.validation.js";
import { validateToken } from "../validations/token.validation.js";

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
    this.router.post(
      "/login",
      validateRequest(loginValidationSchema, "body"),
      UserController.login,
    );
    this.router.get("/profile",validateToken, UserController.getUserByUserId);
  };
}

export default new UserRouter().router;
