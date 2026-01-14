// Firebase Service Worker for Push Notifications
// This service worker handles background notifications from Firebase Cloud Messaging

importScripts('https://www.gstatic.com/firebasejs/9.6.10/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.6.10/firebase-messaging-compat.js');

// Initialize Firebase (same config as main app)
const firebaseConfig = {
    apiKey: "AIzaSyBKh-YOUR-API-KEY",
    authDomain: "your-project.firebaseapp.com",
    projectId: "your-project",
    storageBucket: "your-project.appspot.com",
    messagingSenderId: "YOUR-SENDER-ID",
    appId: "YOUR-APP-ID"
};

firebase.initializeApp(firebaseConfig);

// Get Firebase Messaging instance
const messaging = firebase.messaging();

// Handle background notifications
messaging.onBackgroundMessage((payload) => {
    console.log('Background message received:', payload);

    const notificationTitle = payload.notification?.title || 'App Update Available';
    const notificationOptions = {
        body: payload.notification?.body || 'A new app version is ready to download',
        icon: payload.notification?.icon || 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png',
        badge: 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png',
        tag: 'app-download-notification',
        requireInteraction: false,
        actions: [
            {
                action: 'open',
                title: 'Download',
                icon: 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png'
            },
            {
                action: 'close',
                title: 'Dismiss',
                icon: 'https://i.ibb.co.com/hJCt1BMP/Picsart-26-01-03-19-21-09-763.png'
            }
        ],
        data: {
            appId: payload.data?.appId || '',
            downloadUrl: payload.data?.downloadUrl || '',
            appName: payload.data?.appName || '',
            appIcon: payload.data?.appIcon || '',
            timestamp: new Date().toISOString()
        }
    };

    // Show notification
    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
    console.log('Notification clicked:', event.notification);
    event.notification.close();

    if (event.action === 'open' || !event.action) {
        // Open the app and trigger download
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
                // Check if the app is already open
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url === '/' || client.url.includes('index.html')) {
                        // Focus existing window
                        client.focus();
                        // Send message to client
                        client.postMessage({
                            type: 'NOTIFICATION_CLICKED',
                            data: event.notification.data
                        });
                        return client;
                    }
                }
                // If no window is open, open a new one
                if (clients.openWindow) {
                    return clients.openWindow('/').then((client) => {
                        if (client) {
                            client.postMessage({
                                type: 'NOTIFICATION_CLICKED',
                                data: event.notification.data
                            });
                        }
                        return client;
                    });
                }
            })
        );
    }
});

// Handle notification close
self.addEventListener('notificationclose', (event) => {
    console.log('Notification closed:', event.notification);
});
