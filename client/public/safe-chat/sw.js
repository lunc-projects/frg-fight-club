/* Safe Chat service worker — Android Chrome only allows notifications
   through a service worker (the page Notification constructor throws
   "Illegal constructor" there), so all Safe Chat alerts go through here. */
self.addEventListener('install', function (e) { self.skipWaiting(); });
self.addEventListener('activate', function (e) { e.waitUntil(self.clients.claim()); });
self.addEventListener('notificationclick', function (e) {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (var i = 0; i < list.length; i++) {
        if (list[i].url.indexOf('/safe-chat/') >= 0) return list[i].focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('/safe-chat/');
    })
  );
});
