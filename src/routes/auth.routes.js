import { Router } from 'express';
import { googleOAuthHandler, refreshAccessTokenHandler, logoutHandler } from '../controllers/auth.controller.js';
import { verifyJWT } from '../middleware/auth.middleware.js';

const router = Router();

// As per the PRD, the frontend will handle the Google Sign-In and send us an ID token.
// Our backend will verify this token and then create a session.
router.post('/oauth/google', googleOAuthHandler);
router.post('/refresh', refreshAccessTokenHandler);

// This is a protected route. It requires a valid access token.
router.post('/logout', verifyJWT, logoutHandler);

export default router;
