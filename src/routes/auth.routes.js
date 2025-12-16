import { Router } from 'express';
import { googleOAuthHandler, refreshAccessTokenHandler, logoutHandler } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// The frontend sends an ID token from Google. The backend verifies it and creates a session.
// The path is '/google' to match the frontend API call to '/api/v1/auth/google'.
router.post('/google', googleOAuthHandler);
router.post('/refresh', refreshAccessTokenHandler);

// This is a protected route. It requires a valid access token.
router.post('/logout', verifyJWT, logoutHandler);

export default router;
