import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import { createNotification } from '../utils/notification.js';
import NotificationInteraction from '../models/notificationInteraction.model.js';
import { notificationQueue } from '../config/queue.js';

/**
 * @description Get all notifications for the authenticated user.
 * @route GET /api/v1/notifications
 * @access Private
 */
export const getNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ recipient: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50) // Limit to the 50 most recent notifications
            .lean();

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

/**
 * @description Subscribe a user to Web Push Notifications.
 * @route POST /api/v1/notifications/subscribe
 * @access Private
 */
export const subscribeToPush = async (req, res) => {
    const subscription = req.body;

    if (!subscription || !subscription.endpoint) {
        return res.status(400).json({ message: 'Invalid subscription object.' });
    }

    try {
        await User.findByIdAndUpdate(req.user._id, { pushSubscription: subscription });
        return res.status(200).json({ message: 'Push notifications enabled.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error saving subscription.', error: error.message });
    }
};

/**
 * @description Send a test push notification to the current user.
 * @route POST /api/v1/notifications/test
 * @access Private
 */
export const sendTestNotification = async (req, res) => {
    try {
        await createNotification(
            req.user._id, 
            'This is a test of the urgent alert protocol. Vibration pattern should be distinct.', 
            '/admin/dashboard',
            { title: 'System Test: Urgent', urgency: 'high' }
        );
        return res.status(200).json({ message: 'Test notification dispatched.' });
    } catch (error) {
        return res.status(500).json({ message: 'Failed to send test.', error: error.message });
    }
};

/**
 * @description Track user interaction (Snooze vs View).
 * @route POST /api/v1/notifications/:id/track
 * @access Private
 */
export const trackNotificationInteraction = async (req, res) => {
    const { action } = req.body; // 'view_details' | 'snooze' | 'dismiss'
    try {
        await NotificationInteraction.create({
            user: req.user._id,
            notification: req.params.id,
            action
        });
        return res.status(200).json({ message: 'Interaction recorded.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error tracking interaction.', error: error.message });
    }
};

/**
 * @description Log a snooze action.
 * @route POST /api/v1/notifications/:id/snooze
 * @access Private
 */
export const snoozeNotification = async (req, res) => {
    try {
        // Add job to BullMQ with a 1-hour delay (3600000 ms)
        // For testing, you might want to use 10000 (10 seconds)
        await notificationQueue.add('snooze-notification', {
            originalNotificationId: req.params.id,
            userId: req.user._id
        }, {
            delay: 3600000 // 1 Hour
        });

        return res.status(200).json({ message: 'Snooze logged.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error snoozing.', error: error.message });
    }
};
