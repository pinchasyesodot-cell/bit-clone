import { model, Schema } from "mongoose";
import type { User } from "../interfaces/userType.js";

export const userSchema = new Schema<User>(
  {
    userId: { type: String, required: true, unique: true },
    userName: { type: String, required: true },
    password: { type: String, required: true },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        delete ret.updatedAt;
        return ret;
      },
    },
  },
);

export const userModel = model<User>("User", userSchema);
