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
        if (!user) {
            return res.status(404).json({ message: 'User with this email not found.' });
        }

        // Store the appeal reason on the user document
        user.appealReason = reason;
        await user.save();

        // Create a notification for all admins and staff
        await notifyAdmins(
            `New account appeal from ${user.fullName} (${email}).`,
            `/admin/users/${user._id}`, // Link to the user detail page
            'Admin' // Only notify Admins about account appeals
        );

        return res.status(200).json({ message: 'Your appeal has been submitted and will be reviewed by an administrator.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error submitting appeal.', error: error.message });
    }
};
