import { toast } from "sonner";

export type AppNotification = {
  type: string;
  title: string;
  message: string;
  level: "info" | "warning" | "danger";
};

const PERM_KEY = "gastos:notif-asked";

export function notificationsSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

/** Pede permissão para notificações do sistema (uma vez, ou sob demanda). */
export async function requestNotificationPermission(force = false): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  if (!force && localStorage.getItem(PERM_KEY)) return Notification.permission;
  localStorage.setItem(PERM_KEY, "1");
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

function systemNotify(n: AppNotification) {
  if (!notificationsSupported() || Notification.permission !== "granted") return false;
  try {
    const notif = new Notification(n.title, {
      body: n.message,
      icon: "/favicon.ico",
      badge: "/favicon.ico",
      tag: `${n.type}-${Date.now()}`,
      // vibração no Android
      // @ts-expect-error nem todo navegador tipa vibrate
      vibrate: n.level === "danger" ? [200, 100, 200] : [120],
    });
    notif.onclick = () => {
      window.focus();
      notif.close();
    };
    return true;
  } catch {
    return false;
  }
}

/** Mostra a notificação: pop-up dentro do app + notificação do sistema (quando permitido). */
export function showAppNotification(n: AppNotification) {
  const opts = {
    description: n.message,
    duration: n.level === "info" ? 6000 : 10000,
  };
  if (n.level === "danger") toast.error(n.title, opts);
  else if (n.level === "warning") toast.warning(n.title, opts);
  else toast.success(n.title, opts);

  systemNotify(n);
}

export function showAppNotifications(list?: AppNotification[] | null) {
  if (!list?.length) return;
  list.forEach((n, i) => setTimeout(() => showAppNotification(n), i * 700));
}
