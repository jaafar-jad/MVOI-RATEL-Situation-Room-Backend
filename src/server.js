// src/server.js
import dotenv from 'dotenv';
import app from './app.js';
import connectDB from './config/db.js';

// Configure environment variables
dotenv.config();

const PORT = process.env.PORT || 8000;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
};

startServer();
