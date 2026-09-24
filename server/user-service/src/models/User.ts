import { model, Schema } from "mongoose";
import type { User } from "../interfaces/userType.js";

export const userSchema = new Schema<User>(
  {
    userId: {
      type: Number,
      required: true,
      unique: true,
      maxlength: 9,
    },
    userName: { type: String, required: true, trim: true },
    password: { type: String, required: true, trim: true, minlength: 6 },
  },
  {
    timestamps: true,
    toJSON: {
      transform: (_doc, ret: Record<string, unknown>) => {
        delete ret.__v;
        delete ret.updatedAt;
        delete ret.password;
        delete ret._id
        return ret;
      },
    },
  },
);

export const userModel = model<User>("User", userSchema);
