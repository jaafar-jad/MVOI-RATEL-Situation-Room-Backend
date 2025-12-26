import mongoose from 'mongoose';

const appSettingsSchema = new mongoose.Schema({
    autoVerifyUsers: {
        type: Boolean,
        default: false, // Default to Manual Review
    },
    autoAcceptComplaints: {
        type: Boolean,
        default: false, // Default to Manual Acceptance
    },
    allowPublicView: {
        type: Boolean,
        default: false, // Default to disabled
    },
    maintenanceMode: {
        type: Boolean,
        default: false,
    },
    maintenanceScheduledAt: {
        type: Date,
        default: null,
    },
    maintenanceNotice: {
        type: String,
        default: 'The system will be down for scheduled maintenance soon.',
    },
    bypassList: {
        type: [String], // Array of whitelisted emails
        default: [],
    },
    bypassRoles: {
        type: [String], // Array of whitelisted roles (e.g., 'Staff', 'User')
        default: [],
    },
});

// Create a singleton-like model. We only ever want one document.
const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
