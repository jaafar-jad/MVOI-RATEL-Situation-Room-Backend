import { notifyAdmins } from '../utils/notification.js';
import User from '../models/user.model.js';

/**
 * @description Submit an account appeal.
 * @route POST /api/v1/appeals
 * @access Public
 */
export const submitAppeal = async (req, res) => {
    const { email, reason } = req.body;

    if (!email || !reason) {
        return res.status(400).json({ message: 'Email and reason for appeal are required.' });
    }

    try {
        const user = await User.findOne({ email });
        const userName = user ? user.fullName : 'An unknown user';

        // Create a notification for all admins and staff
        await notifyAdmins(
            `New account appeal from ${userName} (${email}).`,
            '/admin/users' // Link to the user management page
        );

        return res.status(200).json({ message: 'Your appeal has been submitted and will be reviewed by an administrator.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error submitting appeal.', error: error.message });
    }
};

