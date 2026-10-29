import joi from "joi";
import type { User } from "../interfaces/userType.js";

export const loginValidationSchema = joi.object({
    userName: joi.string().required().trim().messages({
        "string.empty": "User name is required",
        "string.trimmed": "User name cannot have leading or trailing whitespace",
    }),
    password: joi.string().required().trim().min(6).max(72).messages({
        "string.empty": "Password is required",
        "string.trimmed": "Password cannot have leading or trailing whitespace",
        "string.min": "Password must be at least 6 characters long",
        "string.max": "Password must be at most 72 characters long",
    }),
});

export const userValidationSchema = loginValidationSchema.append<User>({
    userId: joi.number().required().integer().min(100000000).max(999999999).messages({
        "number.base": "User ID must be a number",
        "number.integer": "User ID must be an integer",
        "number.min": "User ID must be exactly 9 digits long",
        "number.max": "User ID must be exactly 9 digits long",
    }),
});
