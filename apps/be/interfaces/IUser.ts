export interface IUser extends Document {
    email: string;
    username?: string;
    passwordHash: string;
    role: 'user' | 'admin';
    createdAt: Date;
}
