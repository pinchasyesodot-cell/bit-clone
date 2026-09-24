import joi from "joi";
import type { User } from "../interfaces/userType.js";

export const loginValidationSchema = joi.object({
  userName: joi.string().required().trim().messages({
    "string.empty": "User name is required",
    "string.trimmed": "User name cannot have leading or trailing whitespace",
  }),
  password: joi.string().required().trim().min(6).messages({
    "string.empty": "Password is required",
    "string.trimmed": "Password cannot have leading or trailing whitespace",
    "string.min": "Password must be at least 6 characters long",
  }),
});

export const userValidationSchema = loginValidationSchema.append<User>({
  userId: joi.number().required().integer().min(9).max(9).messages({
    "number.empty": "User ID is required",
    "number.integer": "User ID must be an integer",
    "number.min": "User ID must be exactly 9 digits long",
    "number.max": "User ID must be exactly 9 digits long",
  }),
});
