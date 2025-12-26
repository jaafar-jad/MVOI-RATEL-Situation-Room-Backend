import jwt from 'jsonwebtoken';
import User from '../models/user.model.js';
import AppSettings from '../models/settings.model.js';

/**
 * Middleware to verify JWT access token and attach user to the request.
 */
export const verifyJWT = async (req, res, next) => {
    try {
        const token = req.header('Authorization')?.replace('Bearer ', '');

        if (!token) {
            return res.status(401).json({ message: 'Unauthorized request. No token provided.' });
        }

        const decodedToken = jwt.verify(token, process.env.ACCESS_TOKEN_SECRET);

        const user = await User.findById(decodedToken?._id).select('-password -refreshToken');

        if (!user) {
            // This could happen if the user was deleted after the token was issued.
            return res.status(401).json({ message: 'Invalid access token. User not found.' });
        }

        req.user = user;

        next();
    } catch (error) {
        let message = 'Invalid access token.';
        if (error.name === 'TokenExpiredError') {
            message = 'Access token expired.';
        }
        // For other errors like JsonWebTokenError, the default message is fine.

        return res.status(401).json({ message });
    }
};

/**
 * Middleware to verify if the user is an Admin or Staff.
 * This should be used AFTER verifyJWT.
 */
export const verifyAdminOrStaff = (req, res, next) => {
    if (!req.user || !['Admin', 'Staff'].includes(req.user.role)) {
        return res.status(403).json({ message: 'Forbidden. Administrator or Staff access required.' });
    }
    next();
};