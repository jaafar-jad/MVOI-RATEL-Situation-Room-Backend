// In your backend database connection file
import mongoose from 'mongoose';

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI, {
            // RESILIENCE OPTIONS
            serverSelectionTimeoutMS: 5000, // Fail faster if no server found (default is 30s)
            socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
            
            // NETWORK FIXES
            family: 4, // Force IPv4. Fixes "getaddrinfo ENOTFOUND" on some networks
            
            // POOLING
            maxPoolSize: 10, // Maintain up to 10 socket connections
            minPoolSize: 2, // Keep at least 2 connections open
            
            // TIMEOUTS
            connectTimeoutMS: 10000, // Give up initial connection after 10 seconds
        });

        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error: ${error.message}`);
        process.exit(1);
    }
};

export default connectDB;
