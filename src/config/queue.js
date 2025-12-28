import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null,
});

connection.on('error', (err) => {
    console.error('[Queue] Redis connection error:', err.message);
});

export const notificationQueue = new Queue('notificationQueue', { connection });

export default connection;