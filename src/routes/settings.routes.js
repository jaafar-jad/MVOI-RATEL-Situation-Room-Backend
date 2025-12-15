import notificationRouter from './routes/notification.routes.js';
import publicRouter from './routes/public.routes.js'; // Import the new public router
import appealRouter from './routes/appeal.routes.js'; // Import the new appeal router
import settingsRouter from './routes/settings.routes.js'; // Import settings router
import invitationRouter from './routes/invitation.routes.js'; // Import invitation router

// Create an Express application
app.use('/api/v1/notifications', notificationRouter);
app.use('/api/v1/public', publicRouter); // Register the new public routes
app.use('/api/v1/appeals', appealRouter); // Register the new appeal routes
app.use('/api/v1/admin/settings', settingsRouter); // Register settings routes
app.use('/api/v1/invitations', invitationRouter); // Register invitation routes

export default app;