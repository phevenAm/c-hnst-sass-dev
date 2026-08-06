import { useEffect, useMemo, useState } from "react";

import type { TimeView } from "@mui/x-date-pickers";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import Modal from "@components/shared/Modal/Modal";

import { bookableWindowsForDate } from "@/components/shared/SchedulerCalendar/schedulerUtils";
import { useToast } from "@/context/ToastContext";
import { useCounsellorName } from "@/Hooks/useCounsellorName";
import { supabase } from "@/lib/supabase.js";
import { Session } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector } from "@/store/hooks";
import { fetchAvailability } from "@/store/slices/availabilitySlice";

type ClientRescheduleModalProps = {
  session: Session;
  onClose: () => void;
};

const ClientRescheduleModal = ({ session, onClose }: ClientRescheduleModalProps) => {
  const { showToast } = useToast();
  const counsellorName = useCounsellorName();
  const dispatch = useAppDispatch();
  const [requestedAt, setRequestedAt] = useState<Dayjs | null>(null);
  const [message, setMessage] = useState("");
  const [isSending, setIsSending] = useState(false);

  // The picker constrains requests to the counsellor's real availability. Rules
  // + overrides are readable by the client via RLS; make sure they're loaded
  // (ClientSchedule usually has them already, but the modal can't assume it).
  const rules = useAppSelector((s) => s.availability.rules);
  const overrides = useAppSelector((s) => s.availability.overrides);
  const availabilityStatus = useAppSelector((s) => s.availability.status);

  // Busy slots from all sessions in this practice (no client data, just times).
  // We exclude the session being rescheduled so its own slot doesn't block itself.
  const [busySlots, setBusySlots] = useState<{ slot_start: string; slot_end: string }[]>([]);

  useEffect(() => {
    if (availabilityStatus === "idle") dispatch(fetchAvailability());
  }, [availabilityStatus, dispatch]);

  useEffect(() => {
    supabase
      .rpc("get_practice_busy_slots", { exclude_session_id: session.id })
      .then(({ data }) => setBusySlots(data ?? []));
  }, [session.id]);

  const durationMs = (session.duration_minutes ?? 50) * 60_000;

  const constraints = useMemo(() => {
    const isConflictingBusy = (t: number): boolean =>
      busySlots.some((slot) => {
        const sStart = new Date(slot.slot_start).getTime();
        const sEnd = new Date(slot.slot_end).getTime();
        return t < sEnd && t + durationMs > sStart;
      });

    // A day is bookable if it has at least one window long enough for the session.
    const shouldDisableDate = (date: Dayjs): boolean => {
      if (date.endOf("day").valueOf() < Date.now()) return true;
      return !bookableWindowsForDate(date.toDate(), rules, overrides).some(
        (w) => w.end.getTime() - w.start.getTime() >= durationMs,
      );
    };

    // A specific start time is valid only if it fits in an availability window
    // AND doesn't overlap with an already-booked session.
    const isStartBookable = (value: Dayjs): boolean => {
      const t = value.valueOf();
      if (t < Date.now()) return false;
      const fitsInWindow = bookableWindowsForDate(value.toDate(), rules, overrides).some(
        (w) => t >= w.start.getTime() && t + durationMs <= w.end.getTime(),
      );
      return fitsInWindow && !isConflictingBusy(t);
    };

    // The hours column: enable an hour if ANY minute in it yields a valid start,
    // so a partially-open hour (e.g. 3:00–3:10) isn't wrongly greyed out.
    const hourHasBookableStart = (value: Dayjs): boolean => {
      const hourStart = value.minute(0).second(0).millisecond(0).valueOf();
      const hourEnd = hourStart + 3_599_999;
      if (hourEnd < Date.now()) return false;
      return bookableWindowsForDate(value.toDate(), rules, overrides).some((w) => {
        const latestStart = w.end.getTime() - durationMs;
        return latestStart >= hourStart && w.start.getTime() <= hourEnd;
      });
    };

    const shouldDisableTime = (value: Dayjs, view: TimeView): boolean =>
      view === "hours" ? !hourHasBookableStart(value) : !isStartBookable(value);

    return { shouldDisableDate, shouldDisableTime, isStartBookable };
  }, [rules, overrides, durationMs, busySlots]);

  const handleSubmit = async () => {
    if (!requestedAt) return;
    if (!constraints.isStartBookable(requestedAt)) {
      showToast("Please pick a time inside your counsellor's availability.", "warning");
      return;
    }
    setIsSending(true);

    const { error, data } = await supabase.functions.invoke("request-reschedule", {
      body: {
        session_id: session.id,
        requested_at: requestedAt.toISOString(),
        message: message.trim() || undefined,
      },
    });

    if (error || data?.error) {
      const msg = data?.error ?? "Failed to send request. Please try again.";
      showToast(msg, "danger");
    } else {
      showToast(`Reschedule request sent to ${counsellorName}.`);
      onClose();
    }
    setIsSending(false);
  };

  return (
    <Modal
      title="Request a reschedule"
      onClose={onClose}
      size="sm"
      actions={
        <div style={{ display: "flex", gap: "0.75rem" }}>
          <Button onClick={handleSubmit} disabled={!requestedAt || isSending}>
            {isSending ? "Sending…" : "Send request"}
          </Button>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
        </div>
      }
    >
      <p style={{ marginBottom: "1rem", fontSize: "0.9rem" }}>
        Your current session is on <strong>{dayjs(session.scheduled_at).format("dddd D MMM [at] h:mma")}</strong>. Pick
        a time inside {counsellorName}'s availability — only open days and times can be selected. They'll confirm.
      </p>
      <DateInput
        mode="datetime"
        value={requestedAt}
        onChange={setRequestedAt}
        disablePast
        shouldDisableDate={constraints.shouldDisableDate}
        shouldDisableTime={constraints.shouldDisableTime}
      />
      <textarea
        placeholder="Any context for the change? (optional)"
        value={message}
        onChange={(e) => setMessage(e.target.value)}
        rows={3}
        style={{ width: "100%", marginTop: "0.75rem", resize: "vertical", fontFamily: "inherit", fontSize: "0.9rem" }}
      />
    </Modal>
  );
};

export default ClientRescheduleModal;
