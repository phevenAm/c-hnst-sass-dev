import { useEffect, useState } from "react";

import { DateTimePicker } from "@mui/x-date-pickers";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import Lookup from "@components/shared/Lookup/Lookup";
import Modal from "@components/shared/Modal/Modal";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { Session } from "@/models/globalTypes";
import { useAppDispatch } from "@/store/hooks";
import { createSession, updateSession } from "@/store/slices/sessionsSlice";

import styles from "./CreateSessionModal.module.scss";

type CreateSessionModalTypes = {
  clientId: string;
  clientName?: string;
  onClose: () => void;
  session?: Session | null;
};

const CreateSessionModal = ({ clientId, onClose, clientName, session = null }: CreateSessionModalTypes) => {
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const [scheduledAt, setScheduledAt] = useState<Dayjs | null>(session ? dayjs(session.scheduled_at) : null);
  const [isSaving, setIsSaving] = useState(false);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurringWeeks, setRecurringWeeks] = useState(3);
  const [sessionDuration, setSessionDuration] = useState(session?.duration_minutes ?? 50);
  const [isPrepaid, setIsPrepaid] = useState(session?.paid ?? false);
  const [pricePounds, setPricePounds] = useState(
    session?.price_pence ? (session.price_pence / 100).toFixed(2) : "60.00",
  );
  const [location, setLocation] = useState<"remote" | "in_person">(session?.location ?? "in_person");
  const [sessionAddress, setSessionAddress] = useState(session?.address ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [error, setError] = useState("");
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);

  useEffect(() => {
    if (!authUser) return;
    supabase
      .from("practice_settings")
      .select("saved_locations")
      .eq("admin_id", authUser.id)
      .single()
      .then(({ data }) => {
        if (data?.saved_locations) setSavedLocations(data.saved_locations as string[]);
      });
  }, [authUser?.id]);

  const handleSaveLocation = async () => {
    if (!sessionAddress.trim() || !authUser) return;
    const updated = [...new Set([...savedLocations, sessionAddress.trim()])];
    setSavingLocation(true);
    const { error } = await supabase
      .from("practice_settings")
      .update({ saved_locations: updated })
      .eq("admin_id", authUser.id);
    if (!error) setSavedLocations(updated);
    setSavingLocation(false);
  };

  const handleRemoveLocation = async (loc: string) => {
    if (!authUser) return;
    const updated = savedLocations.filter((l) => l !== loc);
    await supabase.from("practice_settings").update({ saved_locations: updated }).eq("admin_id", authUser.id);
    setSavedLocations(updated);
  };

  const handleSave = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      onClose();
      return;
    }
    if (!authUser || !scheduledAt) return;
    setIsSaving(true);
    setError("");

    const dates = [scheduledAt];
    if (isRecurring) {
      for (let i = 1; i <= recurringWeeks; i++) {
        dates.push(scheduledAt.add(i, "week"));
      }
    }

    // For batch creates, tag every session with a shared block_id so the
    // counsellor can see "Block 15 Jan · 2/4" on each card and track cadence.
    const blockId = isRecurring ? crypto.randomUUID().slice(0, 6) : null;

    const result = await Promise.all(
      dates.map((date, i) =>
        dispatch(
          createSession({
            client_id: clientId,
            scheduled_at: date.toISOString(),
            paid: isPrepaid,
            price_pence: pricePounds ? Math.round(parseFloat(pricePounds) * 100) : 0,
            duration_minutes: sessionDuration,
            notes: notes.trim() || undefined,
            location: location,
            address: sessionAddress,
            created_by: authUser.id,
            metadata: blockId
              ? {
                  block_id: blockId,
                  block_pos: i + 1,
                  block_total: dates.length,
                  block_start: scheduledAt.toISOString(),
                }
              : undefined,
          }),
        ),
      ),
    );

    const allSuccess = result.every((i) => i?.meta.requestStatus === "fulfilled");

    if (allSuccess) {
      result.forEach((r) => {
        if (r?.meta.requestStatus === "fulfilled") {
          supabase.functions.invoke("notify-session-booked", { body: { session_id: (r.payload as Session).id } });
        }
      });
      showToast("Sessions saved!");
      onClose();
    } else {
      setError("Failed to schedule session. Please try again.");
    }
    setIsSaving(false);
  };

  const handleSessionUpdate = async (sess: Session) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      onClose();
      return;
    }

    if (!authUser || !scheduledAt) return;
    setError("");
    setIsSaving(true);

    try {
      await dispatch(
        updateSession({
          id: sess.id,
          paid: isPrepaid,
          price_pence: pricePounds ? Math.round(parseFloat(pricePounds) * 100) : 0,
          notes: notes.trim() || null,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: sessionDuration,
          location: location,
          address: sessionAddress,
          status: "rescheduled",
        }),
      ).unwrap();
      supabase.functions.invoke("notify-session-rescheduled", {
        body: { session_id: sess.id, previous_date: sess.scheduled_at },
      });
      onClose();
      setIsSaving(false);
      showToast("Session updated successfully.", "success");
    } catch (err: any) {
      const message = err?.message || String(err) || "oops";
      setError(message);
      showToast(`Something went wrong: ${message}`);
    }
  };

  return (
    <Modal
      title={session ? "Update session" : `Create session - ${clientName}`}
      onClose={onClose}
      size="sm"
      actions={
        <div className={styles.modalActions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          {session ? (
            <Button onClick={() => handleSessionUpdate(session)} disabled={!scheduledAt || isSaving}>
              {isSaving ? "Updating session..." : "Update session"}
            </Button>
          ) : (
            <Button onClick={handleSave} disabled={!scheduledAt || isSaving}>
              {/** biome-ignore lint/style/noNestedTernary: <explanation> */}
              {isSaving ? "Scheduling…" : isRecurring ? "Schedule sessions" : "Schedule session"}
            </Button>
          )}
        </div>
      }
    >
      <div className={styles.form}>
        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Date & time</legend>
          <DateTimePicker
            value={scheduledAt}
            onChange={(val) => setScheduledAt(val)}
            slotProps={{ textField: { fullWidth: true } }}
          />
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Session duration</legend>
          <div className={styles.inputWrapper}>
            <input
              id="session-duration"
              className={styles.input}
              type="number"
              min={10}
              max={90}
              value={sessionDuration}
              onChange={(e) => setSessionDuration(Number(e.target.value))}
            />
          </div>
        </fieldset>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Session location</legend>
          <div className={styles.locationRadios}>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="sessionLocation"
                checked={location === "in_person"}
                onChange={() => setLocation("in_person")}
              />
              In-person
            </label>
            <label className={styles.radioLabel}>
              <input
                type="radio"
                name="sessionLocation"
                checked={location === "remote"}
                onChange={() => setLocation("remote")}
              />
              Remote
            </label>
          </div>
          {location === "in_person" ? (
            <Lookup
              value={sessionAddress}
              onChange={setSessionAddress}
              options={savedLocations}
              onSave={handleSaveLocation}
              onRemove={handleRemoveLocation}
              saving={savingLocation}
              saveLabel="+ Save this location"
              placeholder="e.g. 15 London Rd, LD5 4EO (optional)"
            />
          ) : (
            <input
              className={styles.input}
              type="url"
              placeholder="Meeting link (optional)"
              value={sessionAddress}
              onChange={(e) => setSessionAddress(e.target.value)}
            />
          )}
        </fieldset>

        {!session && (
          <div className={styles.checkboxGroup}>
            <input
              id="recurring"
              type="checkbox"
              checked={isRecurring}
              onChange={(e) => {
                setIsRecurring(e.target.checked);
                setPricePounds((prev) => {
                  if (e.target.checked && prev === "60.00") return "55.00";
                  if (!e.target.checked && prev === "55.00") return "60.00";
                  return prev;
                });
              }}
            />
            <label htmlFor="recurring" className={styles.checkboxLabel}>
              Repeat weekly
            </label>
          </div>
        )}

        {isRecurring && !session && (
          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="recurring-weeks">
              Additional weeks
            </label>
            <input
              id="recurring-weeks"
              className={styles.input}
              type="number"
              min={1}
              max={3}
              value={recurringWeeks}
              onChange={(e) => setRecurringWeeks(Number(e.target.value))}
            />
          </div>
        )}

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="session-price">
            Session fee (£)
          </label>
          <input
            id="session-price"
            className={styles.input}
            type="number"
            min={0}
            step={0.01}
            placeholder="e.g. 70.00"
            value={pricePounds}
            onChange={(e) => setPricePounds(e.target.value)}
          />
        </div>

        <fieldset className={styles.fieldGroup}>
          <legend className={styles.label}>Payment</legend>
          <div className={styles.radioGroup}>
            <label className={styles.radioLabel}>
              <input type="radio" name="payment" checked={!isPrepaid} onChange={() => setIsPrepaid(false)} />
              Payment pending
            </label>
            <label className={styles.radioLabel}>
              <input type="radio" name="payment" checked={isPrepaid} onChange={() => setIsPrepaid(true)} />
              Prepaid
            </label>
          </div>
        </fieldset>

        <div className={styles.fieldGroup}>
          <label className={styles.label} htmlFor="session-notes">
            Notes <span className={styles.optional}>(optional)</span>
          </label>
          <textarea
            id="session-notes"
            className={styles.textarea}
            placeholder="Any prep notes or context for this session…"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {error && <p className={styles.error}>{error}</p>}
      </div>
    </Modal>
  );
};

export default CreateSessionModal;
