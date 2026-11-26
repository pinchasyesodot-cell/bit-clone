import { customAlphabet } from "nanoid";

export const generateAccountNumber = customAlphabet("0123456789", 12);
