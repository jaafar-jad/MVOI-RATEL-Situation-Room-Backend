import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';

/**
 * Creates a notification for a specific user.
 * @param {string} recipientId - The ID of the user who will receive the notification.
 * @param {string} message - The notification message.
 * @param {string} [link] - An optional link for the notification.
 */
export const createNotification = async (recipientId, message, link) => {
    try {
        await Notification.create({ recipient: recipientId, message, link });
    } catch (error) {
        console.error(`Error creating notification for user ${recipientId}:`, error);
    }
};

/**
 * Creates a notification for all Admins and Staff.
 * @param {string} message - The notification message.
 * @param {string} [link] - An optional link for the notification.
 * @param {'Admin' | 'Staff'} [minimumRole='Staff'] - The minimum role required to receive the notification. 'Staff' means Staff and Admins, 'Admin' means only Admins.
 */
export const notifyAdmins = async (message, link, minimumRole = 'Staff') => {
    try {
        const rolesToNotify = minimumRole === 'Admin' ? ['Admin'] : ['Admin', 'Staff'];
        const admins = await User.find({ role: { $in: rolesToNotify } }).select('_id');
        const notifications = admins.map(admin => ({
            recipient: admin._id,
            message,
            link,
        }));
        if (notifications.length > 0) {
            await Notification.insertMany(notifications);
        }
    } catch (error) {
        console.error('Error notifying admins:', error);
    }
};
