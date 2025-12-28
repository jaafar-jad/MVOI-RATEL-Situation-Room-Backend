// c:\Users\Dell\Desktop\RatelSituationRoom\backend\src\models\notificationInteraction.model.js

import mongoose from 'mongoose';

const notificationInteractionSchema = new mongoose.Schema({
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    notification: { type: mongoose.Schema.Types.ObjectId, ref: 'Notification' },
    action: { type: String, enum: ['view_details', 'snooze', 'dismiss'], required: true },
    timestamp: { type: Date, default: Date.now }
});

export default mongoose.model('NotificationInteraction', notificationInteractionSchema);
