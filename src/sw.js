// src/sw.js
import { precacheAndRoute } from 'workbox-precaching';

const manifest = self.__WB_MANIFEST;
if (manifest && Array.isArray(manifest)) {
  precacheAndRoute(manifest);
} else {
  console.log("No manifest found - this is expected in development mode.");
}

// src/sw.js
self.addEventListener('install', () => {
  self.skipWaiting(); // Forces the waiting Service Worker to become the active one
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim()); // Takes control of all open tabs immediately
});

self.addEventListener('push', (event) => {
  console.log('[Service Worker] Push Received.');

  let data = { title: 'New Message', body: 'Default message body' };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      // Fallback if the data isn't valid JSON
      data = { title: 'Notification', body: event.data.text() };
    }
  }

  const options = {
    body: data.body,
    icon: '/pwa-192x192.png', // Ensure these paths are correct!
    badge: '/pwa-192x192.png',
    vibrate: [100, 50, 100],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: '2'
    }
  };

  // Crucial: event.waitUntil keeps the SW alive until the promise resolves
  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('[Service Worker] Notification click Received.');

  event.notification.close(); // Close the popup

  // This ensures the app opens/focuses when the notification is clicked
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // If a window is already open, focus it
      for (const client of clientList) {
        if (client.url === '/' && 'focus' in client) {
          return client.focus();
        }
      }
      // If no window is open, open a new one
      if (clients.openWindow) {
        return clients.openWindow('/');
      }
    })
  );
});