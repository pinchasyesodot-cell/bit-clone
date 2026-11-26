import joi from "joi";
import type { User, UserLogin } from "../interfaces/userType.js";

const userId = joi.number().required().integer().min(100000000).max(999999999).messages({
    "number.base": "User ID must be a number",
    "number.integer": "User ID must be an integer",
    "number.min": "User ID must be exactly 9 digits long",
    "number.max": "User ID must be exactly 9 digits long",
});

const password = joi.string().required().trim().min(6).max(72).messages({
    "string.empty": "Password is required",
    "string.trimmed": "Password cannot have leading or trailing whitespace",
    "string.min": "Password must be at least 6 characters long",
    "string.max": "Password must be at most 72 characters long",
});

// Users log in with their ID: it is unique, while two people may share a name.
export const loginValidationSchema = joi.object<UserLogin>({ userId, password });

export const userValidationSchema = loginValidationSchema.append<User>({
    userName: joi.string().required().trim().messages({
        "string.empty": "User name is required",
        "string.trimmed": "User name cannot have leading or trailing whitespace",
    }),
});
