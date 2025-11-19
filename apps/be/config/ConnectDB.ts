import mongoose from 'mongoose';
import {Env} from './env';



export const connectToDatabase = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(Env.MONGO_URI);
        console.log('Connected to MongoDB successfully');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
};
