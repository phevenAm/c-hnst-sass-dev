import { useEffect, useState } from "react";

import type { Dayjs } from "dayjs";
import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import DateInput from "@components/shared/DateInput/DateInput";
import InfoTooltip from "@components/shared/InfoTooltip/InfoTooltip";
import Lookup from "@components/shared/Lookup/Lookup";
import Modal from "@components/shared/Modal/Modal";

import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { supabase } from "@/lib/supabase.js";
import { Session } from "@/models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@/store/hooks";
import { fetchPracticeSettings } from "@/store/slices/practiceSettingsSlice";
import { createSession, updateSession } from "@/store/slices/sessionsSlice";

import styles from "./CreateSessionModal.module.scss";

// Deep-links to the Practice tab and scrolls the "Session types & prices"
// card into view (see SettingsCard's `id`/`?section=` handling).
const SESSION_TYPES_SETTINGS_URL = "/settings?tab=practice&section=packages";

export type StubSavePayload = {
  dates: string[];
  duration_minutes: number;
  price_pence: number;
  paid: boolean;
  address: string;
  notes: string;
  reference_code: string;
};

type CreateSessionModalTypes = {
  clientId?: string;
  clientName?: string;
  onClose: () => void;
  session?: Session | null;
  onSave?: (payload: StubSavePayload) => Promise<void>;
  // Pre-fill the date/time field for a brand-new session (e.g. the admin
  // scheduler's click-an-empty-slot flow). Ignored when editing an existing one.
  initialStart?: Dayjs | null;
};

const CreateSessionModal = ({
  clientId,
  onClose,
  clientName,
  session = null,
  onSave,
  initialStart = null,
}: CreateSessionModalTypes) => {
  const { authUser, isDemo } = useAuth();
  const { showToast } = useToast();
  const dispatch = useAppDispatch();
  const allSessions = useAppSelector((state) => state.sessions.sessions);
  const [scheduledAt, setScheduledAt] = useState<Dayjs | null>(session ? dayjs(session.scheduled_at) : initialStart);

  const [isSaving, setIsSaving] = useState(false);
  // Whether the picked session type is a recurring block, and how many
  // sessions it contains. Both are driven entirely by the selected type in
  // Settings — there's no manual "recurring" toggle any more.
  const [isRecurring, setIsRecurring] = useState(false);
  const [sessionCount, setSessionCount] = useState(1);
  const [sessionDuration, setSessionDuration] = useState(session?.duration_minutes ?? 50);
  const [isPrepaid, setIsPrepaid] = useState(session?.paid ?? false);
  const [pricePounds, setPricePounds] = useState(
    session?.price_pence ? (session.price_pence / 100).toFixed(2) : "60.00",
  );
  const [location, setLocation] = useState<"remote" | "in_person">(session?.location ?? "in_person");
  const [sessionAddress, setSessionAddress] = useState(session?.address ?? "");
  const [notes, setNotes] = useState(session?.notes ?? "");
  const [referenceCode, setReferenceCode] = useState(session?.reference_code ?? "");
  const [isSupervision, _setIsSupervision] = useState((session as any)?.is_supervision ?? false);
  const [trackAsCpd, setTrackAsCpd] = useState(false);
  const [supervisionCost, setSupervisionCost] = useState(
    (session as any)?.supervision_cost_pence ? ((session as any).supervision_cost_pence / 100).toFixed(2) : "",
  );
  const [sendConfirmation, setSendConfirmation] = useState(true);
  const [sendReminders, setSendReminders] = useState(true);
  const [sendRescheduleNotification, setSendRescheduleNotification] = useState(true);
  const [error, setError] = useState("");
  const [savedLocations, setSavedLocations] = useState<string[]>([]);
  const [savingLocation, setSavingLocation] = useState(false);
  const [sessionPackages, setSessionPackages] = useState<
    {
      id: string;
      name: string;
      price_pence: number;
      duration_minutes: number;
      is_recurring: boolean;
      session_count: number;
    }[]
  >([]);
  const [selectedPackageId, setSelectedPackageId] = useState("");

  useFetchOnIdle((state) => state.practiceSettings.status, fetchPracticeSettings, "Failed to load practice settings");
  const cachedSavedLocations = useAppSelector((state) => state.practiceSettings.data?.saved_locations);
  useEffect(() => {
    if (cachedSavedLocations) setSavedLocations(cachedSavedLocations as string[]);
  }, [cachedSavedLocations]);

  // Session types configured in Settings — picking one just prefills duration
  // and price below; both stay freely editable after, since not every booking
  // fits a preset (sliding scale, one-off rate, etc).
  useEffect(() => {
    if (!authUser?.id) return;
    supabase
      .from("session_packages")
      .select("id, name, price_pence, duration_minutes, is_recurring, session_count")
      .eq("admin_id", authUser.id)
      .eq("archived", false)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setSessionPackages(data);
      });
  }, [authUser?.id]);

  const handleSelectPackage = (id: string) => {
    setSelectedPackageId(id);
    const pkg = sessionPackages.find((p) => p.id === id);
    if (!pkg) {
      // "Custom — set below": a hand-priced one-off, never a block.
      setIsRecurring(false);
      setSessionCount(1);
      return;
    }
    setSessionDuration(pkg.duration_minutes);
    // For a recurring type, price_pence is the whole-block price. The field
    // below shows it as such; handleSave divides it across the rows.
    setPricePounds((pkg.price_pence / 100).toFixed(2));
    setIsRecurring(pkg.is_recurring);
    setSessionCount(pkg.is_recurring ? pkg.session_count : 1);
  };

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
      for (let i = 1; i < sessionCount; i++) {
        dates.push(scheduledAt.add(i, "week"));
      }
    }

    // For a recurring block the fee field holds the WHOLE-BLOCK price. Split
    // it evenly across the rows so each session carries its own per-session
    // fee and the block still sums to the total — create-checkout-session
    // sums price_pence across a block, so an undivided price would overcharge
    // by a factor of N. Any rounding remainder lands on the first session.
    const totalPence = pricePounds ? Math.round(parseFloat(pricePounds) * 100) : 0;
    const n = dates.length;
    const perSessionPence = Math.floor(totalPence / n);
    const priceForIndex = (i: number) => (i === 0 ? totalPence - perSessionPence * (n - 1) : perSessionPence);

    if (onSave) {
      try {
        await onSave({
          dates: dates.map((d) => d.toISOString()),
          duration_minutes: sessionDuration,
          price_pence: n > 1 ? Math.round(totalPence / n) : totalPence,
          paid: isPrepaid,
          address: sessionAddress,
          notes: notes.trim(),
          reference_code: referenceCode.trim(),
        });
      } catch (err: any) {
        setError(err?.message || "Failed to save session.");
      }
      setIsSaving(false);
      return;
    }

    // Overlap check — block double booking before any inserts.
    for (const d of dates) {
      const start = d.toDate();
      const end = dayjs(start).add(sessionDuration, "minute").toDate();
      const clash = allSessions.some((s) => {
        if (s.status === "cancelled") return false;
        const sStart = new Date(s.scheduled_at);
        const sEnd = dayjs(sStart)
          .add(s.duration_minutes ?? 50, "minute")
          .toDate();
        return start < sEnd && end > sStart;
      });
      if (clash) {
        setError(`${d.format("D MMM [at] h:mma")} overlaps with an existing session.`);
        setIsSaving(false);
        return;
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
            price_pence: priceForIndex(i),
            duration_minutes: sessionDuration,
            notes: notes.trim() || undefined,
            reference_code: referenceCode.trim() || undefined,
            location: location,
            address: sessionAddress,
            is_supervision: isSupervision || undefined,
            supervision_cost_pence:
              isSupervision && supervisionCost ? Math.round(parseFloat(supervisionCost) * 100) : undefined,
            send_reminders: sendReminders,
            created_by: authUser.id,
            metadata: blockId
              ? {
                  block_id: blockId,
                  block_pos: i + 1,
                  block_total: dates.length,
                  block_start: scheduledAt.toISOString(),
                  block_price_pence: totalPence,
                }
              : undefined,
          }),
        ),
      ),
    );

    const allSuccess = result.every((i) => i?.meta.requestStatus === "fulfilled");

    if (allSuccess) {
      if (sendConfirmation) {
        // One email for the whole block, not one per session.
        const ids = result.filter((r) => r?.meta.requestStatus === "fulfilled").map((r) => (r.payload as Session).id);
        if (blockId && ids.length > 1) {
          supabase.functions.invoke("notify-block-booked", { body: { session_ids: ids } });
        } else if (ids[0]) {
          supabase.functions.invoke("notify-session-booked", { body: { session_id: ids[0] } });
        }
      }
      const emailNote = sendConfirmation ? " — confirmation email sent" : "";
      showToast(`${dates.length > 1 ? `${dates.length} sessions` : "Session"} scheduled${emailNote}.`);
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

    if (onSave) {
      try {
        await onSave({
          dates: [scheduledAt.toISOString()],
          duration_minutes: sessionDuration,
          price_pence: pricePounds ? Math.round(parseFloat(pricePounds) * 100) : 0,
          paid: isPrepaid,
          address: sessionAddress,
          notes: notes.trim(),
          reference_code: referenceCode.trim(),
        });
        onClose();
      } catch (err: any) {
        setError(err?.message || "Failed to update session.");
      }
      setIsSaving(false);
      return;
    }

    // Overlap check — exclude the session being edited.
    const updStart = scheduledAt.toDate();
    const updEnd = dayjs(updStart).add(sessionDuration, "minute").toDate();
    const updateClash = allSessions.some((s) => {
      if (s.id === sess.id || s.status === "cancelled") return false;
      const sStart = new Date(s.scheduled_at);
      const sEnd = dayjs(sStart)
        .add(s.duration_minutes ?? 50, "minute")
        .toDate();
      return updStart < sEnd && updEnd > sStart;
    });
    if (updateClash) {
      setError("This time overlaps with an existing session.");
      setIsSaving(false);
      return;
    }

    try {
      await dispatch(
        updateSession({
          id: sess.id,
          paid: isPrepaid,
          price_pence: pricePounds ? Math.round(parseFloat(pricePounds) * 100) : 0,
          notes: notes.trim() || null,
          reference_code: referenceCode.trim() || null,
          scheduled_at: scheduledAt.toISOString(),
          duration_minutes: sessionDuration,
          location: location,
          address: sessionAddress,
          is_supervision: isSupervision || undefined,
          supervision_cost_pence:
            isSupervision && supervisionCost ? Math.round(parseFloat(supervisionCost) * 100) : undefined,
          status: "rescheduled",
        }),
      ).unwrap();
      if (sendRescheduleNotification) {
        supabase.functions.invoke("notify-session-rescheduled", {
          body: { session_id: sess.id, previous_date: sess.scheduled_at },
        });
      }
      onClose();
      setIsSaving(false);
      showToast("Session updated successfully.", "success");
    } catch (err: any) {
      const message = err?.message || String(err) || "oops";
      setError(message);
      showToast(`Something went wrong: ${message}`);
    }
  };

  const dynamicNewSessionModal = () => {
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
            <DateInput mode="datetime" value={scheduledAt} onChange={setScheduledAt} />
          </fieldset>

          {sessionPackages.length > 0 ? (
            <fieldset className={styles.fieldGroup}>
              <legend className={styles.label}>
                Session type
                <InfoTooltip
                  variant="rich"
                  title="Session types"
                  text={
                    "Presets you set up once in Settings → Billing & payments → Session types & prices.\n" +
                    "Picking one fills in the price and duration below — everything stays editable.\n" +
                    "A recurring block creates several weekly sessions in one step, starting from the date above. The block price is split evenly across them and paid for as a unit."
                  }
                />
              </legend>
              <div className={styles.inputWrapper}>
                <select
                  id="session-package"
                  className={styles.input}
                  value={selectedPackageId}
                  onChange={(e) => handleSelectPackage(e.target.value)}
                >
                  <option value="">Custom — set below</option>
                  {sessionPackages.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} — £{(p.price_pence / 100).toFixed(2)}
                      {p.is_recurring ? ` · ${p.session_count}-week block` : ""} · {p.duration_minutes} min
                    </option>
                  ))}
                </select>
              </div>
              <a className={styles.settingsLink} href={SESSION_TYPES_SETTINGS_URL} target="_blank" rel="noreferrer">
                Manage session types →
              </a>
            </fieldset>
          ) : (
            !session && (
              <p className={styles.hint}>
                Tip: save your usual prices and durations as{" "}
                <a className={styles.settingsLink} href={SESSION_TYPES_SETTINGS_URL} target="_blank" rel="noreferrer">
                  session types in Settings
                </a>{" "}
                — including recurring blocks — so you can pick them here instead of retyping.
              </p>
            )
          )}

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

          {isRecurring && !session && (
            <div className={styles.fieldGroup}>
              <p className={styles.label}>Recurring block</p>
              <p className={styles.hint} data-testid="recurring-summary">
                Creates {sessionCount} sessions, one week apart starting from the date above. They're tracked and paid
                together — marking any one of them as paid marks the whole block as paid.
              </p>
            </div>
          )}

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="session-price">
              {isRecurring && !session ? `Block fee (£) — covers ${sessionCount} sessions` : "Session fee (£)"}
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
            {isRecurring && !session && pricePounds && sessionCount > 1 && (
              <p className={styles.hint} data-testid="per-session-fee">
                The client pays this once for the whole block. Each session shows £
                {(parseFloat(pricePounds) / sessionCount).toFixed(2)}.
              </p>
            )}
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

          <div className={styles.fieldGroup}>
            <label className={styles.label} htmlFor="session-code">
              Reference code <span className={styles.optional}>(optional)</span>
            </label>
            <input
              id="session-code"
              className={styles.input}
              type="text"
              placeholder="e.g. S-001"
              maxLength={20}
              value={referenceCode}
              onChange={(e) => setReferenceCode(e.target.value)}
            />
          </div>

          {/* <div className={styles.checkboxGroup}>
            <input
              id="is-supervision"
              type="checkbox"
              checked={isSupervision}
              onChange={(e) => setIsSupervision(e.target.checked)}
            />
            <label htmlFor="is-supervision" className={styles.checkboxLabel}>
              Add to supervision log
            </label>
          </div> */}

          {isSupervision && (
            <>
              <div className={styles.fieldGroup}>
                <label className={styles.label} htmlFor="supervision-cost">
                  Supervision fee <span className={styles.optional}>(optional)</span>
                </label>
                <input
                  id="supervision-cost"
                  className={styles.input}
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="e.g. 80.00"
                  value={supervisionCost}
                  onChange={(e) => setSupervisionCost(e.target.value)}
                />
              </div>

              <div className={styles.checkboxGroup}>
                <input
                  id="track-as-cpd"
                  type="checkbox"
                  checked={trackAsCpd}
                  onChange={(e) => setTrackAsCpd(e.target.checked)}
                />
                <label htmlFor="track-as-cpd" className={styles.checkboxLabel}>
                  Track as CPD item
                </label>
              </div>
            </>
          )}

          {!onSave && !session && (
            <fieldset className={styles.fieldGroup}>
              <legend className={styles.label}>Email notifications</legend>
              <div className={styles.checkboxGroup}>
                <input
                  id="send-confirmation"
                  type="checkbox"
                  checked={sendConfirmation}
                  onChange={(e) => setSendConfirmation(e.target.checked)}
                />
                <label htmlFor="send-confirmation" className={styles.checkboxLabel}>
                  Send booking confirmation now
                </label>
              </div>
              <div className={styles.checkboxGroup}>
                <input
                  id="send-reminders"
                  type="checkbox"
                  checked={sendReminders}
                  onChange={(e) => setSendReminders(e.target.checked)}
                />
                <label htmlFor="send-reminders" className={styles.checkboxLabel}>
                  Send automatic reminder emails
                </label>
              </div>
            </fieldset>
          )}

          {!onSave && session && (
            <fieldset className={styles.fieldGroup}>
              <legend className={styles.label}>Email notifications</legend>
              <div className={styles.checkboxGroup}>
                <input
                  id="send-reschedule-notification"
                  type="checkbox"
                  checked={sendRescheduleNotification}
                  onChange={(e) => setSendRescheduleNotification(e.target.checked)}
                />
                <label htmlFor="send-reschedule-notification" className={styles.checkboxLabel}>
                  Notify client of change by email
                </label>
              </div>
            </fieldset>
          )}

          {error && <p className={styles.error}>{error}</p>}
        </div>
      </Modal>
    );
  };

  return dynamicNewSessionModal();
};

export default CreateSessionModal;
