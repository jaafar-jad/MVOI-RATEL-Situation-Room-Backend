import Notification from '../models/notification.model.js';
import User from '../models/user.model.js';
import webpush from 'web-push';

// Initialize Web Push
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(
        'mailto:support@mvoi-ratel.com',
        process.env.VAPID_PUBLIC_KEY,
        process.env.VAPID_PRIVATE_KEY
    );
}

/**
 * Creates a notification for a specific user.
 * @param {string} recipientId - The ID of the user who will receive the notification.
 * @param {string} message - The notification message.
 * @param {string} [link] - An optional link for the notification.
 * @param {object} [options] - Optional settings (title, urgency).
 */
export const createNotification = async (recipientId, message, link, options = {}) => {
    try {
        // 1. Create the notification in DB to get the ID
        const notification = await Notification.create({ recipient: recipientId, message, link });
        
        // --- Trigger Web Push ---
        const user = await User.findById(recipientId).select('pushSubscription');
        if (user && user.pushSubscription && user.pushSubscription.endpoint) {
            
            // 2. Generate Tag for Grouping (Stacking by Case ID)
            const tag = link && link.includes('/complaint/') 
                ? `case-${link.split('/').pop()}` 
                : 'general';

            const payload = JSON.stringify({
                title: options.title || 'MVOI-RATEL Update',
                body: message,
                icon: options.icon || '/images/logo.png', // Profile picture or default logo
                image: options.image, // Image Preview (Big Picture)
                tag: tag, // Grouping Tag
                actions: [
                    { action: 'mark_read', title: 'Mark as Read' },
                    { action: 'snooze', title: 'Snooze (1h)' },
                    { action: 'explore', title: 'View Details' }
                ],
                data: { 
                    url: link || '/complainant/dashboard',
                    urgency: options.urgency || 'normal', // 'normal' | 'high'
                    notificationId: notification._id // Required for Mark as Read / Snooze
                }
            });

            try {
                await webpush.sendNotification(user.pushSubscription, payload);
            } catch (error) {
                if (error.statusCode === 410) {
                    // Subscription is dead (user revoked or cleared cache), remove it
                    user.pushSubscription = undefined;
                    await user.save();
                }
                console.error('Web Push Error:', error.message);
            }
        }
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
