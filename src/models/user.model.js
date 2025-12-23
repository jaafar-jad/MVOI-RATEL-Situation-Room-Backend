import mongoose from 'mongoose';

const statusHistorySchema = new mongoose.Schema({
    status: { type: String, required: true },
    changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reason: String,
    timestamp: { type: Date, default: Date.now }
});

const userSchema = new mongoose.Schema(
    {
        oauthId: {
            type: String,
            unique: true,
            index: true,
            sparse: true, // Allows multiple documents to have a null value for this field
        },
        email: {
            type: String,
            required: [true, 'Email is required.'],
            unique: true,
            lowercase: true,
            trim: true,
        },
        fullName: {
            type: String,
            required: [true, 'Full name is required.'],
            trim: true,
        },
        contactInfo: {
            phone: { type: String, trim: true },
            address: { type: String, trim: true },
        },
        role: {
            type: String,

            enum: ['User', 'Admin', 'Staff'],
            default: 'User',
        },
        status: {
            type: String,
            enum: ['Active', 'Inactive', 'Suspended'],
            default: 'Active',
        },
        verificationStatus: {
            type: String,
            enum: ['Not Submitted', 'Pending', 'Verified', 'Rejected'],
            default: 'Not Submitted',
        },
        idDocumentUrl: {
            type: String,
        },
        avatarUrl: {
            type: String,
        },
        refreshToken: {
            type: String,
            index: true,
        },
        lastLogin: {
            type: Date,
        },
        appealReason: {
            type: String,
            trim: true,
        },
        statusHistory: [statusHistorySchema],
    },
    { timestamps: true } // Automatically adds createdAt and updatedAt fields
);

// Add a text index for efficient searching on fullName and email
userSchema.index({ fullName: 'text', email: 'text' });

const User = mongoose.model('User', userSchema);

export default User;
