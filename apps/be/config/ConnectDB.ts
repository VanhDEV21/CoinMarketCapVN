import mongoose from 'mongoose';

const MONGO_URI = 'mongodb://127.0.0.1:27017/coinmarketappCMC';

export const connectToDatabase = async () => {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGO_URI);
        console.log('Connected to MongoDB successfully');
    } catch (error) {
        console.error('Error connecting to MongoDB:', error);
    }
};
