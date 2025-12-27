// src/server.js
import 'dotenv/config';
import app from './app.js';
import connectDB from './config/db.js';

const PORT = process.env.PORT || 8000;

const startServer = async () => {
    await connectDB();
    app.listen(PORT, () => {
        console.log(`🚀 Server is running on port ${PORT}`);
    });
};

startServer();
