import Notification from '../models/notification.model.js';

/**
 * @description Get all notifications for the authenticated user.
 * @route GET /api/v1/notifications
 * @access Private
 */
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50); // Limit to the 50 most recent notifications

        const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

        return res.status(200).json({ notifications, unreadCount });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching notifications.', error: error.message });
    }
};

/**
 * @description Mark a single notification as read.
 * @route PUT /api/v1/notifications/read/:id
 * @access Private
 */
export const markAsRead = async (req, res) => {
    try {
        const notification = await Notification.findOneAndUpdate(
            { _id: req.params.id, recipient: req.user._id }, // Ensure user can only mark their own notifications
            { isRead: true },
            { new: true }
        );

        if (!notification) {
            return res.status(404).json({ message: 'Notification not found or you are not authorized to update it.' });
        }

        return res.status(200).json({ message: 'Notification marked as read.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating notification.', error: error.message });
    }
};

/**
 * @description Mark all notifications for the user as read.
 * @route PUT /api/v1/notifications/read/all
 * @access Private
 */
export const markAllAsRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { recipient: req.user._id, isRead: false },
            { isRead: true }
        );

        return res.status(200).json({ message: 'All notifications marked as read.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating notifications.', error: error.message });
    }
};
