// Service Worker dedicado a push notifications.
// Não cacheia nada — apenas escuta `push` e `notificationclick`.
// Coexiste com o SW do vite-plugin-pwa (que tem outro escopo/arquivo).

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Readify", body: event.data?.text() || "" }; }

  const title = data.title || "Readify";
  const options = {
    body: data.body || "",
    icon: "/favicon.ico",
    badge: "/favicon.ico",
    data: { link: data.link || "/", notification_id: data.notification_id },
    tag: data.notification_id || undefined,
    renotify: false,
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = event.notification.data?.link || "/";
  event.waitUntil((async () => {
    const allClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const client of allClients) {
      if ("focus" in client) {
        client.focus();
        if ("navigate" in client) try { await client.navigate(link); } catch { /* noop */ }
        return;
      }
    }
    if (self.clients.openWindow) await self.clients.openWindow(link);
  })());
});
