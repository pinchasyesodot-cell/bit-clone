import joi from "joi";
import type { User, UserLogin } from "../interfaces/userType.js";

const userId = joi.number().required().integer().min(100000000).max(999999999).messages({
    "number.base": "User ID must be a number",
    "number.integer": "User ID must be an integer",
    "number.min": "User ID must be exactly 9 digits long",
    "number.max": "User ID must be exactly 9 digits long",
});

// Printable ASCII only: catches a password typed with the keyboard in Hebrew by mistake,
// and keeps one character = one byte, so the 72-character limit matches bcrypt's 72-byte limit.
const password = joi
    .string()
    .required()
    .min(6)
    .max(72)
    .pattern(/^[\x20-\x7E]+$/)
    .message("Password can contain only English letters, digits, symbols and spaces")
    .pattern(/\S/)
    .message("Password cannot be only spaces")
    .messages({
        "string.empty": "Password is required",
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
