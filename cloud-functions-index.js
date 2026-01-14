/**
 * Firebase Cloud Functions for Push Notifications
 * Deploy to Firebase Cloud Functions
 * 
 * Setup:
 * 1. firebase init functions
 * 2. Replace functions/index.js with this file
 * 3. firebase deploy --only functions
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

admin.initializeApp();
const db = admin.firestore();
const messaging = admin.messaging();

/**
 * Send notification to specific app users
 * POST /api/send-notification
 */
exports.sendNotification = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const { appId, appName, type, title, body, icon, downloadUrl } = req.body;

            // Validate required fields
            if (!appId || !type) {
                return res.status(400).json({ error: 'Missing required fields: appId, type' });
            }

            // Query users subscribed to this app
            const tokensSnapshot = await db.collection('notification_tokens').get();
            const tokens = [];

            tokensSnapshot.forEach(doc => {
                if (doc.exists) {
                    const token = doc.data().token;
                    if (token) tokens.push(token);
                }
            });

            if (tokens.length === 0) {
                return res.status(404).json({ error: 'No notification tokens found' });
            }

            // Prepare notification message
            const message = {
                notification: {
                    title: title || appName,
                    body: body || `Update available for ${appName}`,
                    icon: icon || 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png'
                },
                data: {
                    appId: appId,
                    appName: appName,
                    type: type,
                    downloadUrl: downloadUrl || '',
                    timestamp: new Date().toISOString()
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        defaultSound: true,
                        clickAction: 'FLUTTER_NOTIFICATION_CLICK'
                    }
                },
                webpush: {
                    fcmOptions: {
                        link: '/'
                    },
                    notification: {
                        icon: icon || 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png',
                        badge: 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png'
                    }
                }
            };

            // Send to all tokens (batch)
            const response = await messaging.sendMulticast({
                tokens: tokens,
                ...message
            });

            // Log results
            console.log(`Notification sent - Success: ${response.successCount}, Failed: ${response.failureCount}`);

            // Clean up failed tokens
            if (response.failureCount > 0) {
                const failedTokens = response.responses
                    .map((resp, idx) => resp.success ? null : tokens[idx])
                    .filter(token => token);

                for (const token of failedTokens) {
                    await db.collection('notification_tokens').where('token', '==', token).get()
                        .then(snapshot => {
                            snapshot.forEach(doc => doc.ref.delete());
                        });
                }
            }

            res.json({
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount,
                totalSent: tokens.length,
                message: `Notification sent to ${response.successCount} devices`
            });
        } catch (error) {
            console.error('Error sending notification:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Send download progress notification
 * POST /api/send-progress
 */
exports.sendDownloadProgress = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            const { appId, appName, progress, deviceToken } = req.body;

            if (!appId || progress === undefined) {
                return res.status(400).json({ error: 'Missing required fields' });
            }

            // If specific device token provided
            if (deviceToken) {
                await messaging.send({
                    token: deviceToken,
                    data: {
                        type: 'DOWNLOAD_PROGRESS',
                        appId: appId,
                        appName: appName,
                        progress: progress.toString(),
                        timestamp: new Date().toISOString()
                    },
                    android: {
                        priority: 'high'
                    }
                });

                return res.json({
                    success: true,
                    message: 'Progress notification sent'
                });
            }

            // Otherwise broadcast to all devices
            const tokensSnapshot = await db.collection('notification_tokens').get();
            const tokens = [];

            tokensSnapshot.forEach(doc => {
                if (doc.exists && doc.data().token) {
                    tokens.push(doc.data().token);
                }
            });

            if (tokens.length === 0) {
                return res.status(404).json({ error: 'No devices found' });
            }

            const response = await messaging.sendMulticast({
                tokens: tokens,
                data: {
                    type: 'DOWNLOAD_PROGRESS',
                    appId: appId,
                    appName: appName,
                    progress: progress.toString(),
                    timestamp: new Date().toISOString()
                }
            });

            res.json({
                success: true,
                successCount: response.successCount,
                failureCount: response.failureCount
            });
        } catch (error) {
            console.error('Error sending progress:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Notify all users when app is updated
 * Triggered on app document update
 */
exports.notifyOnAppUpdate = functions.firestore
    .document('apps/{appId}')
    .onUpdate(async (change, context) => {
        try {
            const newData = change.after.data();
            const oldData = change.before.data();
            const appId = context.params.appId;

            // Only notify if version changed
            if (oldData.version === newData.version) {
                return;
            }

            console.log(`App ${appId} updated from ${oldData.version} to ${newData.version}`);

            // Get all notification tokens
            const tokensSnapshot = await db.collection('notification_tokens').get();
            const tokens = [];

            tokensSnapshot.forEach(doc => {
                if (doc.exists && doc.data().token) {
                    tokens.push(doc.data().token);
                }
            });

            if (tokens.length === 0) {
                console.log('No tokens to notify');
                return;
            }

            // Send notification about update
            const response = await messaging.sendMulticast({
                tokens: tokens,
                notification: {
                    title: `${newData.name} Updated`,
                    body: `Version ${newData.version} is now available`,
                    icon: 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png'
                },
                data: {
                    type: 'APP_DOWNLOAD_AVAILABLE',
                    appId: appId,
                    appName: newData.name,
                    appIcon: newData.icon || '',
                    version: newData.version,
                    timestamp: new Date().toISOString()
                },
                android: {
                    priority: 'high',
                    notification: {
                        sound: 'default',
                        defaultSound: true
                    }
                }
            });

            console.log(`Update notification sent - Success: ${response.successCount}, Failed: ${response.failureCount}`);

            // Save notification to log
            await db.collection('notification_logs').add({
                appId: appId,
                appName: newData.name,
                type: 'UPDATE',
                version: newData.version,
                sentCount: response.successCount,
                failureCount: response.failureCount,
                timestamp: new Date()
            });

            return response;
        } catch (error) {
            console.error('Error notifying on app update:', error);
            throw error;
        }
    });

/**
 * Clean up expired notification tokens
 * Scheduled daily cleanup
 */
exports.cleanupTokens = functions.pubsub
    .schedule('every day 03:00')
    .onRun(async (context) => {
        try {
            console.log('Starting token cleanup...');

            // Delete tokens older than 90 days
            const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

            const snapshot = await db.collection('notification_tokens')
                .where('timestamp', '<', ninetyDaysAgo)
                .get();

            let deletedCount = 0;
            const batch = db.batch();

            snapshot.forEach(doc => {
                batch.delete(doc.ref);
                deletedCount++;
            });

            await batch.commit();

            console.log(`Cleaned up ${deletedCount} expired tokens`);

            return {
                message: `Cleaned up ${deletedCount} tokens`,
                timestamp: new Date()
            };
        } catch (error) {
            console.error('Error cleaning up tokens:', error);
            throw error;
        }
    });

/**
 * Get notification statistics
 * GET /api/notification-stats
 */
exports.getNotificationStats = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'GET') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            // Get total tokens
            const tokensSnapshot = await db.collection('notification_tokens').get();
            const totalTokens = tokensSnapshot.size;

            // Get notification logs from last 30 days
            const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            const logsSnapshot = await db.collection('notification_logs')
                .where('timestamp', '>', thirtyDaysAgo)
                .get();

            let totalSent = 0;
            let totalFailed = 0;

            logsSnapshot.forEach(doc => {
                const data = doc.data();
                totalSent += data.sentCount || 0;
                totalFailed += data.failureCount || 0;
            });

            res.json({
                totalTokens: totalTokens,
                successRate: totalSent > 0 ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(2) + '%' : '0%',
                last30Days: {
                    sent: totalSent,
                    failed: totalFailed,
                    total: totalSent + totalFailed
                }
            });
        } catch (error) {
            console.error('Error getting stats:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});

/**
 * Test notification (admin only)
 * POST /api/test-notification
 */
exports.testNotification = functions.https.onRequest((req, res) => {
    cors(req, res, async () => {
        try {
            if (req.method !== 'POST') {
                return res.status(405).json({ error: 'Method not allowed' });
            }

            const { token, appName } = req.body;

            if (!token) {
                return res.status(400).json({ error: 'Device token required' });
            }

            await messaging.send({
                token: token,
                notification: {
                    title: 'Test Notification',
                    body: `Testing notifications for ${appName || 'Test App'}`,
                    icon: 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png'
                },
                data: {
                    type: 'TEST',
                    timestamp: new Date().toISOString()
                }
            });

            res.json({
                success: true,
                message: 'Test notification sent'
            });
        } catch (error) {
            console.error('Error sending test notification:', error);
            res.status(500).json({
                success: false,
                error: error.message
            });
        }
    });
});
