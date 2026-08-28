import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

import dayjs from "dayjs";

import { BellIcon } from "@components/shared/Icons/Icons";

import { useAuth } from "@/context/AuthContext";
import { supabase } from "@/lib/supabase.js";

import styles from "./NotificationBell.module.scss";

type Notification = {
  id: string;
  type: string;
  message: string;
  read: boolean;
  created_at: string;
  url: string | null;
};

export function NotificationBell() {
  const { userProfile, isDemo } = useAuth();
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const unreadCount = notifications.filter((n) => !n.read).length;
  const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
    typeof Notification !== "undefined" ? Notification.permission : "denied",
  );

  useEffect(() => {
    if (notifPermission !== "default") return;
    Notification.requestPermission().then((result) => setNotifPermission(result));
  }, [notifPermission]);

  useEffect(() => {
    if (!userProfile?.id) return;

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userProfile.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) setNotifications(data as Notification[]);
      });

    const channel = supabase
      .channel(`notifications-${userProfile.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userProfile.id}` },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userProfile?.id]);

  useEffect(() => {
    const nav = navigator as Navigator & {
      setAppBadge?: (count: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (!nav.setAppBadge) return;
    if (unreadCount > 0) {
      nav.setAppBadge(unreadCount).catch((e) => void e);
    } else {
      nav.clearAppBadge?.().catch((e) => void e);
    }
  }, [unreadCount]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const markAllRead = async () => {
    if (!userProfile?.id || unreadCount === 0) return;
    await supabase.from("notifications").update({ read: true }).eq("user_id", userProfile.id).eq("read", false);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const clearAll = async () => {
    if (!userProfile?.id || isDemo) return;
    await supabase.from("notifications").delete().eq("user_id", userProfile.id);
    setNotifications([]);
  };

  const dismissOne = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await supabase.from("notifications").delete().eq("id", id);
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  };

  const handleToggle = () => {
    const next = !open;
    setOpen(next);
    if (next) markAllRead();
  };

  return (
    <div ref={ref} className={styles.wrapper}>
      <button type="button" className={styles.bell} onClick={handleToggle} aria-label="Notifications">
        <BellIcon />
        {unreadCount > 0 && <span className={styles.badge}>{unreadCount > 9 ? "9+" : unreadCount}</span>}
      </button>

      {open && (
        <div className={styles.dropdown}>
          <div className={styles.titleRow}>
            <p className={styles.title}>Notifications</p>
            {notifications.length > 0 && (
              <button type="button" className={styles.clearAll} onClick={clearAll}>
                Clear all
              </button>
            )}
          </div>
          {notifications.length === 0 && <p className={styles.empty}>Nothing here yet</p>}
          {notifications.length > 0 && isDemo && (
            <p className={styles.demoMessage}>Notifications are hidden in demo mode</p>
          )}
          {notifications.length > 0 && !isDemo && (
            <ul className={styles.list}>
              {notifications.map((n) => (
                <li key={n.id} className={[styles.item, !n.read ? styles.unread : ""].filter(Boolean).join(" ")}>
                  {n.url ? (
                    <button
                      type="button"
                      className={[styles.itemBody, styles.clickable].filter(Boolean).join(" ")}
                      onClick={() => {
                        setOpen(false);
                        navigate(n.url?.replace(window.location.origin, ""));
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setOpen(false);
                          navigate(n.url?.replace(window.location.origin, ""));
                        }
                      }}
                    >
                      <p className={styles.message}>{n.message}</p>
                      <p className={styles.date}>{dayjs(n.created_at).format("D MMM [at] h:mma")}</p>
                    </button>
                  ) : (
                    <div className={styles.itemBody}>
                      <p className={styles.message}>{n.message}</p>
                      <p className={styles.date}>{dayjs(n.created_at).format("D MMM [at] h:mma")}</p>
                    </div>
                  )}

                  <button
                    type="button"
                    className={styles.dismiss}
                    onClick={(e) => dismissOne(n.id, e)}
                    aria-label="Dismiss"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
