// src/app.js
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import userRouter from './routes/user.routes.js';
import complaintRouter from './routes/complaint.routes.js';
import adminRouter from './routes/admin.routes.js';
import notificationRouter from './routes/notification.routes.js';
import publicRouter from './routes/public.routes.js'; // Import the new public router
import appealRouter from './routes/appeal.routes.js'; // Import the new appeal router
import invitationRouter from './routes/invitation.routes.js'; // Import invitation router

// Create an Express application
const app = express();

// --- Middleware ---
// Enable Cross-Origin Resource Sharing for all routes
app.use(cors({
    origin: 'http://localhost:3000', // The origin of your Next.js frontend
    credentials: true // Important for sending cookies (for refresh tokens)
}));

// Parse incoming JSON requests
app.use(express.json());
// Parse cookies
app.use(cookieParser());


// --- Basic Test Route ---
app.get('/api/v1', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Advocacy and Dispute Resolution API is running!'
    });
});

// --- API Routes ---
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/complaints', complaintRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/public', publicRouter); // Register the new public routes
app.use('/api/v1/appeals', appealRouter); // Register the new appeal routes
app.use('/api/v1/invitations', invitationRouter); // Register invitation routes

export default app;
