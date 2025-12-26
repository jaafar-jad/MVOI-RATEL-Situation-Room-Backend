import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../models/user.model.js';

const client = new OAuth2Client(process.env.GOOGLE_OAUTH_CLIENT_ID);

/**
 * Generates access and refresh tokens for a user.
 * @param {mongoose.Document} user - The user document from the database.
 * @returns { {accessToken: string, refreshToken: string} }
 */
const generateTokens = (user) => {
    const accessToken = jwt.sign(
        { _id: user._id, role: user.role },
        process.env.ACCESS_TOKEN_SECRET,
        { expiresIn: process.env.ACCESS_TOKEN_EXPIRY }
    );

    const refreshToken = jwt.sign(
        { _id: user._id },
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRY }
    );

    return { accessToken, refreshToken };
};

/**
 * Handles the Google OAuth callback.
 * Verifies the ID token, finds or creates a user, and sends back tokens.
 */
export const googleOAuthHandler = async (req, res) => {
    const { idToken } = req.body;

    if (!idToken) {
        return res.status(400).json({ message: 'ID token not provided.' });
    }

    try {
        // 1. Verify the ID token from Google
        const ticket = await client.verifyIdToken({
            idToken,
            audience: process.env.GOOGLE_OAUTH_CLIENT_ID,
        });
        const payload = ticket.getPayload();

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
        const { accessToken, refreshToken } = generateTokens(user);

        // 4. Hash and store the refresh token in the database
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        user.refreshToken = hashedRefreshToken;
        await user.save({ validateBeforeSave: false }); // Skip validation to avoid requiring fields not provided by OAuth

        // 5. Send tokens to the client
        const options = {
            httpOnly: true, // The cookie is not accessible via client-side JavaScript
            secure: process.env.NODE_ENV === 'production', // Only send over HTTPS in production
            sameSite: 'strict',
            maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days in milliseconds
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

        // Verify that the incoming token matches the one stored in the DB
        const isTokenValid = await bcrypt.compare(incomingRefreshToken, user.refreshToken);

        if (!isTokenValid) {
            // This is a security risk - someone might be trying to use an old/stolen token.
            // For enhanced security, you could invalidate all user's tokens here.
            return res.status(401).json({ message: 'Invalid refresh token.' });
        }

        // Generate new tokens (token rotation)
        const { accessToken, refreshToken: newRefreshToken } = generateTokens(user);

        // Update the stored refresh token
        const hashedRefreshToken = await bcrypt.hash(newRefreshToken, 10);
        user.refreshToken = hashedRefreshToken;
        await user.save({ validateBeforeSave: false });

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
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
        // req.user is attached by the verifyJWT middleware
        await User.findByIdAndUpdate(
            req.user._id,
            { $unset: { refreshToken: 1 } }, // Remove the refreshToken field
            { new: true }
        );

        const options = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
        };

        return res.status(200).clearCookie('refreshToken', options).json({ message: 'User logged out successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Logout failed. Please try again.' });
    }
};
