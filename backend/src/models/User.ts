import { Schema, model, Document, Types } from 'mongoose';

export interface IUser {
  name: string;
  email: string;
  createdAt: Date;
}

export interface UserDocument extends IUser, Document {
  _id: Types.ObjectId;
}

const userSchema = new Schema<UserDocument>(
  {
    name: {
      type: String,
      required: [true, 'User name is required'],
      trim: true,
    },
    email: {
      type: String,
      required: [true, 'Email is required'],
      unique: true,
      trim: true,
      lowercase: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    versionKey: false,
  },
);

export const User = model<UserDocument>('User', userSchema);
