import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';

/**
 * Generates access and refresh tokens for a user.
 * @param {mongoose.Document} user - The user document from the database.
 * @param {string} [refreshTokenExpiry] - Optional expiry for the refresh token.
 * @returns { {accessToken: string, refreshToken: string} }
 */
const generateTokens = (user, refreshTokenExpiry) => {
    const accessToken = jwt.sign(
        { _id: user._id, role: user.role },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
        { _id: user._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: refreshTokenExpiry || process.env.REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken };
};

/**
 * Handles the Google OAuth callback.
 * Verifies the ID token, finds or creates a user, and sends back tokens.
 */
export const googleOAuthHandler = async (req, res) => {
    let { idToken, code, rememberMe } = req.body;

    // Fallback: If the frontend API wrapper sends the code in the 'idToken' field, detect it.
    // ID Tokens are JWTs (contain dots). Auth codes are usually opaque strings (often start with 4/).
    if (idToken && !code && !idToken.includes('.')) {
        code = idToken;
    }

    try {
        // Debug: Ensure credentials exist before attempting exchange
        if (!process.env.GOOGLE_OAUTH_CLIENT_ID || !process.env.GOOGLE_OAUTH_CLIENT_SECRET) {
            console.error("❌ CRITICAL ERROR: Google OAuth credentials missing in .env file.");
            return res.status(500).json({ message: "Server configuration error: Missing OAuth credentials." });
        }

        const client = new OAuth2Client(
            process.env.GOOGLE_OAUTH_CLIENT_ID,
            process.env.GOOGLE_OAUTH_CLIENT_SECRET
        );

        let payload;

        if (code) {
            // Exchange authorization code for tokens
            // For 'redirect' flow, we must use the same redirect_uri as the frontend.
            // We infer it from the Origin header or fallback to env.
            const redirectUri = req.headers.origin || process.env.FRONTEND_URL;
            
            const { tokens } = await client.getToken({
                code,
                redirect_uri: redirectUri
            });

            // Verify the ID token returned from the exchange
            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
            });
            payload = ticket.getPayload();
        } else if (idToken) {
            // Legacy/Popup flow: Verify the ID token directly
            const ticket = await client.verifyIdToken({ idToken, audience: process.env.GOOGLE_OAUTH_CLIENT_ID });
            payload = ticket.getPayload();
        } else {
            return res.status(400).json({ message: 'No authentication credentials provided.' });
        }

        if (!payload) {
            return res.status(401).json({ message: 'Invalid Google token.' });
        }

        const { sub: oauthId, email, name: fullName, picture } = payload;

        // 2. Find or create the user in the database
        let user = await User.findOne({ oauthId });

        if (!user) {
            // If user doesn't exist with oauthId, check if an account with that email exists
            user = await User.findOne({ email });
            if (user) {
                // Link the existing email account to this Google OAuth ID
                user.oauthId = oauthId;
            } else {
                // Create a brand new user
                user = await User.create({
                    oauthId,
                    email,
                    fullName,
                    avatarUrl: picture,
                    // Note: 'picture' from Google is not in our schema, so it's ignored.
                });
            }
        }

        // Ensure avatarUrl is updated for existing users on every login
        if (user.avatarUrl !== picture) {
            user.avatarUrl = picture;
        }

        // Update the lastLogin field
        user.lastLogin = new Date();

        // PRD Requirement: Prevent login for inactive/suspended users.
        if (user.status === 'Inactive' || user.status === 'Suspended') {
            // Send a specific status code or message that the frontend can use.
            return res.status(403).json({ email: user.email, message: `Your account has been ${user.status.toLowerCase()}. Please contact support to appeal.` });
        }

        // 3. Generate Access and Refresh Tokens
        // Ensure token lasts 30 days if rememberMe is true, matching the cookie
        const tokenExpiry = rememberMe ? '30d' : '1d';
        const { accessToken, refreshToken } = generateTokens(user, tokenExpiry);

        // 4. Hash and store the refresh token in the database
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        
        // Add new session
        user.sessions.push({
            refreshToken: hashedRefreshToken,
            device: req.headers['user-agent'] || 'Unknown Device',
            ip: req.ip || req.connection.remoteAddress,
            lastActive: new Date()
        });

        await user.save({ validateBeforeSave: false }); // Skip validation to avoid requiring fields not provided by OAuth

        // 5. Send tokens to the client
        const maxAge = rememberMe 
            ? 30 * 24 * 60 * 60 * 1000 // 30 days
            : 24 * 60 * 60 * 1000;     // 1 day

        const options = {
            httpOnly: true, // The cookie is not accessible via client-side JavaScript
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax', // 'none' required for cross-site refresh
            maxAge: maxAge, 
        };

        res.cookie('refreshToken', refreshToken, options);

        // Prepare user data to send back (don't send sensitive info)
        const userResponse = {
            _id: user._id,
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            verificationStatus: user.verificationStatus,
            avatarUrl: user.avatarUrl,
        };

        return res
            .status(200)
            .json({ user: userResponse, accessToken });

    } catch (error) {
        console.error('Google OAuth Error:', error);
        return res.status(500).json({ message: 'Authentication failed. Please try again.' });
    }
};

/**
 * Refreshes the access token using a valid refresh token.
 */
export const refreshAccessTokenHandler = async (req, res) => {
    const incomingRefreshToken = req.cookies.refreshToken;

    if (!incomingRefreshToken) {
        return res.status(401).json({ message: 'Unauthorized. No refresh token provided.' });
    }

    try {
        const decodedToken = jwt.verify(incomingRefreshToken, process.env.REFRESH_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id);

        if (!user) {
            return res.status(401).json({ message: 'Invalid refresh token. User not found.' });
        }

        // Find the session matching this refresh token
        let sessionIndex = -1;
        for (let i = 0; i < user.sessions.length; i++) {
            const isMatch = await bcrypt.compare(incomingRefreshToken, user.sessions[i].refreshToken);
            if (isMatch) {
                sessionIndex = i;
                break;
            }
        }

        if (sessionIndex === -1) {
            // Token reuse detection: If a valid JWT is presented but not found in DB, 
            // it might be a reused token. We could invalidate all sessions here for security.
            // For now, just reject.
            return res.status(401).json({ message: 'Invalid refresh token.' });
        }

        // Generate new tokens (token rotation)
        // Always extend to 30 days on refresh to keep the session alive
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user, '30d');

        // Update the stored refresh token
        const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);
        user.sessions[sessionIndex].refreshToken = hashedRefreshToken;
        user.sessions[sessionIndex].lastActive = new Date();
        
        await user.save({ validateBeforeSave: false });

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
        };

        return res
            .status(200)
            .cookie('refreshToken', newRefreshToken, options)
            .json({ accessToken, message: 'Access token refreshed successfully.' });

    } catch (error) {
        // This catches JWT errors like expiration or malformation
        return res.status(401).json({ message: 'Invalid or expired refresh token.' });
    }
};

/**
 * Logs out the user by clearing their refresh token.
 */
export const logoutHandler = async (req, res) => {
    try {
        const incomingRefreshToken = req.cookies.refreshToken;
        
        if (incomingRefreshToken) {
            const user = await User.findById(req.user._id);
            if (user) {
                // Remove the specific session associated with this token
                // We need to check which hashed token matches
                const newSessions = [];
                for (const session of user.sessions) {
                    const match = await bcrypt.compare(incomingRefreshToken, session.refreshToken);
                    if (!match) newSessions.push(session);
                }
                user.sessions = newSessions;
                await user.save({ validateBeforeSave: false });
            }
        }

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        };

        return res.status(200).clearCookie('refreshToken', options).json({ message: 'User logged out successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Logout failed. Please try again.' });
    }
};
