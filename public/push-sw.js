// Push handlers importados pelo Service Worker principal do VitePWA.
// Este arquivo NÃO registra um segundo SW e NÃO controla install/activate.

function safeInternalPath(value) {
  if (typeof value !== "string") return "/";
  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path.slice(0, 1024);
}

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Readify", body: event.data?.text() || "" };
  }

  const title = typeof data.title === "string"
    ? data.title.slice(0, 160)
    : "Readify";
  const body = typeof data.body === "string"
    ? data.body.slice(0, 1000)
    : "";
  const link = safeInternalPath(data.link);
  const notificationId = typeof data.notification_id === "string"
    ? data.notification_id.slice(0, 128)
    : undefined;

  const options = {
    body,
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { link, notification_id: notificationId },
    tag: notificationId,
    renotify: false,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const link = safeInternalPath(event.notification.data?.link);

  event.waitUntil((async () => {
    const targetUrl = new URL(link, self.location.origin).href;
    const allClients = await self.clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (const client of allClients) {
      try {
        if ("navigate" in client) await client.navigate(targetUrl);
        if ("focus" in client) await client.focus();
        return;
      } catch {
        // Tenta o próximo cliente ou abre nova janela.
      }
    }

    if (self.clients.openWindow) await self.clients.openWindow(targetUrl);
  })());
});
