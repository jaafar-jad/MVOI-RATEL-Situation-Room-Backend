import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import authRouter from './routes/auth.routes.js';
import userRouter from './routes/user.routes.js';
import complaintRouter from './routes/complaint.routes.js';
import adminRouter from './routes/admin.routes.js';
import notificationRouter from './routes/notification.routes.js';
import publicRouter from './routes/public.routes.js';
import appealRouter from './routes/appeal.routes.js';
import invitationRouter from './routes/invitation.routes.js';

// Create an Express application
const app = express();

// --- Middleware ---
// Enable Cross-Origin Resource Sharing for all routes
const allowedOrigins = [
    'https://mvoi-ratel-situation-room.vercel.app', // Your Vercel frontend
    'http://localhost:3000', // Local development
    process.env.FRONTEND_URL // Fallback from env variables
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true // Important for sending cookies (for refresh tokens)
}));

// Parse incoming JSON requests
app.use(express.json());
// Parse cookies
app.use(cookieParser());

// --- Routes ---
// Root route to fix "Cannot GET /"
app.get('/', (req, res) => {
    res.status(200).send('MVOI Ratel Situation Room API is running 🚀');
});

app.get('/api/v1', (req, res) => {
    res.status(200).json({ status: 'success', message: 'Mvoi-Ratel Situation Room API is running!' });
});

app.use('/api/v1/auth', authRouter);
app.use('/api/v1/users', userRouter);
app.use('/api/v1/complaints', complaintRouter);
app.use('/api/v1/admin', adminRouter);
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/public', publicRouter);
app.use('/api/v1/appeals', appealRouter);
app.use('/api/v1/invitations', invitationRouter);

export default app;