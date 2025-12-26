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
});

// Create a singleton-like model. We only ever want one document.
const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

export default AppSettings;
