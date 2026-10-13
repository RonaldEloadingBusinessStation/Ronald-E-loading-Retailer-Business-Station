self.addEventListener("push", event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch (_) {}
  const title = data.title || "RONALD E-LOADING BUSINESS STATION";
  const options = { body: data.body || "Your order status has been updated.", icon: "./eloading.jpg", badge: "./eloading.jpg", data: { url: data.url || "./#track-order", orderNumber: data.orderNumber || "" }, tag: data.orderNumber || "ronald-order-update", renotify: true };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || "./#track-order", self.location.origin).href;
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then(list => {
    for (const client of list) { if (client.url.startsWith(self.location.origin) && "focus" in client) { client.navigate(url); return client.focus(); } }
    return clients.openWindow ? clients.openWindow(url) : undefined;
  }));
});
