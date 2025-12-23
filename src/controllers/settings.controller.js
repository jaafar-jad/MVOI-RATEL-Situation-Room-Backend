import AppSettings from '../models/settings.model.js';

/**
 * @description Get application settings.
 * @route GET /api/v1/admin/settings
 * @access Admin/Staff
 */
export const getAppSettings = async (req, res) => {
    try {
        // Find the single settings document, or create it if it doesn't exist
        let settings = await AppSettings.findOne().lean();
        if (!settings) {
            settings = await AppSettings.create({}); // Create with defaults
        }
        return res.status(200).json({ settings });
    } catch (error) {
        return res.status(500).json({ message: 'Error fetching app settings.', error: error.message });
    }
};

/**
 * @description Update application settings.
 * @route PUT /api/v1/admin/settings
 * @access Admin
 */
export const updateAppSettings = async (req, res) => {
    // Only Admin can update settings
    if (req.user.role !== 'Admin') {
        return res.status(403).json({ message: 'Forbidden. Only administrators can update settings.' });
    }

    const { autoVerifyUsers, autoAcceptComplaints, allowPublicView } = req.body;

    try {
        // Find the single settings document, or create it if it doesn't exist
        let settings = await AppSettings.findOne();
        if (!settings) {
            settings = await AppSettings.create({});
        }

        if (typeof autoVerifyUsers === 'boolean') settings.autoVerifyUsers = autoVerifyUsers;
        if (typeof autoAcceptComplaints === 'boolean') settings.autoAcceptComplaints = autoAcceptComplaints;
        if (typeof allowPublicView === 'boolean') settings.allowPublicView = allowPublicView;

        await settings.save();
        return res.status(200).json({ settings, message: 'App settings updated successfully.' });
    } catch (error) {
        return res.status(500).json({ message: 'Error updating app settings.', error: error.message });
    }
};
