import { type MouseEvent } from "react";

import dayjs from "dayjs";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { Session, SessionEvent } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { updateSession } from "@/store/slices/sessionsSlice";

import styles from "./SessionCard.module.scss";

function formatCutoffHours(hours: number): string {
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  return `${hours} hour${hours === 1 ? "" : "s"}`;
}

const useSessionCard = (session: Session) => {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();
  const { rescheduleCutoffHours } = useAuth();

  const toggleNoShowOrPayment = (e: MouseEvent<HTMLButtonElement>) => {
    const actionType = e.currentTarget.getAttribute("data-action-type");
    if (actionType === "payment") {
      dispatch(updateSession({ id: session.id, paid: !session.paid }));
      showToast("Updated payment status");
      // notify client when admin marks as paid (not when unmarking)
      if (!session.paid) {
        supabase.functions.invoke("send-payment-notification", {
          body: { session_id: session.id },
        });
      }
    }
  };

  const markAttended = () => {
    const next = session.attended === true ? null : true;
    dispatch(updateSession({ id: session.id, attended: next }));
    showToast(next === true ? "Marked as attended" : "Attendance cleared");
  };

  const markNoShow = () => {
    const next = session.attended === false ? null : false;
    dispatch(updateSession({ id: session.id, attended: next }));
    showToast(next === false ? "Marked as no show" : "Attendance cleared");
  };

  function getStatusClass(status: string, attended: boolean | null, paid: boolean, scheduled_at: string): string {
    if (attended === false) return styles.statusNoShow;
    if (attended === true && paid === true && dayjs(scheduled_at).isBefore(dayjs())) {
      return styles.statusCompleted;
    }
    switch (status) {
      case "cancelled":
        return styles.statusCancelled;
      case "rescheduled":
        return styles.statusRescheduled;
      default:
        return styles.statusScheduled;
    }
  }

  function getCardClass(status: string, attended: boolean | null): string {
    if (attended === false) return styles.sessionItemNoShow;
    if (status === "cancelled") return styles.sessionItemCancelled;
    if (status === "rescheduled") return styles.sessionItemRescheduled;
    return "";
  }

  function formatEventLabel(ev: SessionEvent): string {
    switch (ev.event_type) {
      case "scheduled":
        return "Scheduled";
      case "rescheduled": {
        const from = ev.metadata?.from ? dayjs(ev.metadata.from).format("D MMM [at] h:mma") : null;
        const to = ev.metadata?.to ? dayjs(ev.metadata.to).format("D MMM [at] h:mma") : null;
        return from && to ? `Rescheduled from ${from} to ${to}` : "Rescheduled";
      }
      case "cancelled":
        return "Cancelled";
      case "paid":
        return "Marked as unpaid";
      case "unpaid":
        return "Marked as paid";
      case "attended":
        return "Attended";
      case "no_show":
        return "No show";
      default:
        return ev.event_type;
    }
  }
  // undefined (not loaded yet) falls back to the 48h default so buttons
  // don't briefly unlock while the setting is still being fetched.
  const cutoffHours = rescheduleCutoffHours === undefined ? 48 : rescheduleCutoffHours;
  const isWithinRescheduleCutoff =
    cutoffHours != null && dayjs(session.scheduled_at).isBefore(dayjs().add(cutoffHours, "hour"));
  const rescheduleCutoffMessage = `Sessions cannot be changed within ${formatCutoffHours(cutoffHours ?? 48)} of the appointment`;

  const restoreSession = () => {
    dispatch(updateSession({ id: session.id, status: "scheduled" }));
    showToast("Session restored.", "success");
  };

  return {
    toggleNoShowOrPayment,
    markAttended,
    markNoShow,
    restoreSession,
    getStatusClass,
    isWithinRescheduleCutoff,
    rescheduleCutoffMessage,
    getCardClass,
    formatEventLabel,
  };
};

export default useSessionCard;
