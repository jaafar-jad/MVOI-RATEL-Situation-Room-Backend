// c:\Users\Dell\Desktop\RatelSituationRoom\backend\src\workers\notification.worker.js

import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import Notification from '../models/notification.model.js';
import { createNotification } from '../utils/notification.js';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
    retryStrategy: (times) => Math.min(times * 50, 2000), // Retry connection without crashing
});

// Handle connection errors gracefully to prevent server crash
connection.on('error', (err) => {
    console.warn('[Worker] Redis connection failed. Queue features will be disabled.');
});

const worker = new Worker('notificationQueue', async (job) => {
    const { originalNotificationId, userId } = job.data;

    console.log(`[Worker] Processing snooze for notification ${originalNotificationId}`);

    try {
        // Fetch the original notification to get the content
        const original = await Notification.findById(originalNotificationId);
        
        if (original) {
            // Re-send the notification
            await createNotification(
                userId,
                original.message,
                original.link,
                { 
                    title: 'Snoozed Reminder', 
                    urgency: 'normal' // Reset urgency for reminders
                }
            );
            console.log(`[Worker] Snoozed notification resent to ${userId}`);
        }
    } catch (error) {
        console.error(`[Worker] Failed to process snooze job:`, error);
    }
}, { connection });

export default worker;
