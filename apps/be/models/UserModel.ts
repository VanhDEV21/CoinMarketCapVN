import { Schema, model } from "mongoose";
import { IUser } from "../interfaces/IUser";


const UserShema = new Schema<IUser>({
    email: { type: String, required: true, unique: true, index: true, lowercase: true, trim: true },
    username: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    createdAt: { type: Date, default: Date.now },
    telegramChatId: { type: Number, unique: true, sparse: true },
    notificationsEnabled: { type: Boolean, default: true }, 
});

export default model<IUser>('User', UserShema);