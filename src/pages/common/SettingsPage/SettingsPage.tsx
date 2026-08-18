import { useEffect, useRef, useState } from "react";

import { KEYWORDS } from "@constants/constants";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { isPageStatusLoading, pickColor } from "@Helpers/Helpers";
import { hardRefresh } from "@Hooks/useVersionCheck";
import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import UploadAndDisplayImage from "@components/shared/UploadAndDisplayImage/UploadAndDisplayImage";
import WIP from "@components/shared/WIP/WIP";
import { useAuth } from "@context/AuthContext";
import { useEncryption } from "@context/EncryptionContext";
import { useInterfacePrefs } from "@context/InterfacePrefsContext";
import { useToast } from "@context/ToastContext";
import { useWalkthrough } from "@context/WalkthroughContext";

import Spinner from "@/components/shared/Spinner/Spinner";
import {
  previewPaymentReceived,
  previewSessionBooked,
  previewSessionCancelled,
  previewSessionReminder,
  previewSessionRescheduled,
} from "@/emails/emailHelpers";
import { supabase } from "@/lib/supabase";
import ChangePasswordModal from "./ChangePasswordModal/ChangePasswordModal";
import DeleteUserModal from "./DeleteUserModal/DeleteUserModal";

import styles from "./SettingsPage.module.scss";

type AdminTab = "profile" | "practice" | "emails" | "interface";

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "practice", label: "Practice" },
  { id: "emails", label: "Emails" },
  { id: "interface", label: "Interface" },
];

const BUSINESS_FIELDS = [
  { key: "business_name", label: "Business name" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "address", label: "Address" },
] as const;

type BusinessField = (typeof BUSINESS_FIELDS)[number]["key"];

const BANK_FIELDS = [
  { key: "bank_name", label: "Bank name", placeholder: "e.g. Barclays" },
  { key: "bank_account_name", label: "Account name", placeholder: "e.g. Sarah Smith Therapy" },
  { key: "bank_sort_code", label: "Sort code", placeholder: "e.g. 20-00-00" },
  { key: "bank_account_number", label: "Account number", placeholder: "e.g. 12345678" },
  { key: "bank_payment_reference", label: "Payment reference", placeholder: "e.g. Clarity — use your name as ref" },
] as const;

type BankField = (typeof BANK_FIELDS)[number]["key"];

// These fields are encrypted at rest. business_name excluded — shown in superadmin UI.
const PII_BUSINESS_KEYS: BusinessField[] = ["email", "phone", "address"];
const PII_BANK_KEYS: BankField[] = [
  "bank_name",
  "bank_account_name",
  "bank_sort_code",
  "bank_account_number",
  "bank_payment_reference",
];

const SettingsPage = () => {
  const { userProfile, updateProfile, isAdmin, isDemo, loading, practiceSettings, refreshPracticeSettings } = useAuth();
  const { status: encStatus, encryptPII, decryptPII } = useEncryption();
  const { hiddenSections, toggleSection, reduceMotion, setReduceMotion } = useInterfacePrefs();
  const { resetAll: resetWalkthrough, isDismissedGlobally: walkthroughOff } = useWalkthrough();
  const { showToast } = useToast();
  const [name, setName] = useState(userProfile?.display_name ?? "");
  const [imageUrl, setImageUrl] = useState(userProfile?.avatar_url ?? "");
  const [keywords, setKeywords] = useState<string[]>(userProfile?.focus_keywords ?? []);
  const [saving, setSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("profile");

  const [practiceDetails, setPracticeDetails] = useState<Record<BusinessField, string>>({
    business_name: "",
    email: "",
    phone: "",
    address: "",
  });
  const [logoUrl, setLogoUrl] = useState("");
  const [savingBusiness, setSavingBusiness] = useState(false);

  const [bankDetails, setBankDetails] = useState<Record<BankField, string>>({
    bank_name: "",
    bank_account_name: "",
    bank_sort_code: "",
    bank_account_number: "",
    bank_payment_reference: "",
  });
  const [savingBank, setSavingBank] = useState(false);
  const [piiLocked, setPiiLocked] = useState(false);
  const [stripeConnected, setStripeConnected] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [billingCustomerId, setBillingCustomerId] = useState<string | null>(null);

  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    google_email: string | null;
    sync_enabled: boolean;
  } | null>(null);
  const [savingGoogleSync, setSavingGoogleSync] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);

  const [useCodenames, setUseCodenames] = useState(false);
  const [savingCodenames, setSavingCodenames] = useState(false);
  const [autoCancelEnabled, setAutoCancelEnabled] = useState(false);
  const [savingAutoCancel, setSavingAutoCancel] = useState(false);
  const [rescheduleCutoffEnabled, setRescheduleCutoffEnabled] = useState(true);
  const [rescheduleCutoffHours, setRescheduleCutoffHours] = useState(48);
  const [savingRescheduleCutoff, setSavingRescheduleCutoff] = useState(false);
  const [consentEnabled, setConsentEnabled] = useState(false);
  const [consentTitle, setConsentTitle] = useState("Before you continue");
  const [consentBody, setConsentBody] = useState("");
  const [consentPdfUrl, setConsentPdfUrl] = useState("");
  const [consentCounsellorCta, setConsentCounsellorCta] = useState(
    "If you have any questions, speak to your counsellor.",
  );
  const [savingConsent, setSavingConsent] = useState(false);
  const [sidebarBtnPos, setSidebarBtnPos] = useState<"top" | "middle" | "bottom">(
    () => (localStorage.getItem("adminSidebarBtnPos") as "top" | "middle" | "bottom") ?? "top",
  );

  const [reminderHours, setReminderHours] = useState(120);
  const [reminderSubject, setReminderSubject] = useState("");
  const [reminderBody, setReminderBody] = useState("");
  const [savingReminders, setSavingReminders] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<string | null>(null);
  const [sendingTest, setSendingTest] = useState<string | null>(null);
  const [disabledEmailTypes, setDisabledEmailTypes] = useState<string[]>([]);
  const [paymentDeadlineHours, setPaymentDeadlineHours] = useState(48);
  const [reminderHeading, setReminderHeading] = useState("");

  const reminderHeadingRef = useRef<HTMLInputElement>(null);
  const reminderSubjectRef = useRef<HTMLInputElement>(null);
  const reminderBodyRef = useRef<HTMLTextAreaElement>(null);

  function insertVar<T extends HTMLInputElement | HTMLTextAreaElement>(
    ref: React.RefObject<T>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    token: string,
  ) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? el.value.length;
    setter(el.value.slice(0, start) + token + el.value.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }

  const avatarColor = userProfile?.id ? pickColor(userProfile.id) : "teal";

  useEffect(() => {
    setName(userProfile?.display_name ?? userProfile?.first_name ?? "");
    setImageUrl(userProfile?.avatar_url ?? "");
    setKeywords(userProfile?.focus_keywords ?? []);
  }, [userProfile]);

  useEffect(() => {
    if (!isAdmin || !userProfile?.id) return;
    supabase
      .from("practice_settings")
      .select("*")
      .eq("admin_id", userProfile.id)
      .single()
      .then(async ({ data }) => {
        if (!data) return;

        // Detect whether any sensitive field has been encrypted
        const allPIIKeys = [...PII_BUSINESS_KEYS, ...PII_BANK_KEYS];
        const hasEncrypted = allPIIKeys.some((k) => {
          const v = data[k as string];
          return v && v.startsWith("{");
        });

        if (hasEncrypted && encStatus !== "unlocked") {
          // Sensitive fields are encrypted and the key isn't in memory yet —
          // show the lock notice instead of ciphertext in the inputs
          setPiiLocked(true);
        } else {
          setPiiLocked(false);
        }

        // Decrypt PII fields when the key is available
        const decrypt = encStatus === "unlocked" ? decryptPII : (v: string) => Promise.resolve(v);

        const businessData: Record<BusinessField, string> = {
          business_name: data.business_name ?? "",
          email: await decrypt(data.email ?? ""),
          phone: await decrypt(data.phone ?? ""),
          address: await decrypt(data.address ?? ""),
        };
        const bankData: Record<BankField, string> = {
          bank_name: await decrypt(data.bank_name ?? ""),
          bank_account_name: await decrypt(data.bank_account_name ?? ""),
          bank_sort_code: await decrypt(data.bank_sort_code ?? ""),
          bank_account_number: await decrypt(data.bank_account_number ?? ""),
          bank_payment_reference: await decrypt(data.bank_payment_reference ?? ""),
        };

        setPracticeDetails(businessData);
        setLogoUrl(data.logo_url ?? "");
        setBankDetails(bankData);
        setStripeConnected(data.stripe_connect_onboarded ?? false);
        setBillingCustomerId(data.billing_customer_id ?? null);
        setReminderHours(data.reminder_hours_before ?? 120);
        setReminderSubject(data.reminder_email_subject ?? "");
        setReminderBody(data.reminder_email_body ?? "");
        setReminderHeading(data.reminder_email_heading ?? "");
        setDisabledEmailTypes(data.disabled_email_types ?? []);
        setPaymentDeadlineHours(data.payment_deadline_hours ?? 48);
        setUseCodenames(data.use_client_codenames ?? false);
        setAutoCancelEnabled(data.auto_cancel_enabled ?? false);
        setRescheduleCutoffEnabled(data.reschedule_cutoff_hours != null);
        setRescheduleCutoffHours(data.reschedule_cutoff_hours ?? 48);
        setConsentEnabled(data.consent_enabled ?? false);
        setConsentTitle(data.consent_title ?? "Before you continue");
        setConsentBody(data.consent_body ?? "");
        setConsentPdfUrl(data.consent_pdf_url ?? "");
        setConsentCounsellorCta(data.consent_counsellor_cta ?? "If you have any questions, speak to your counsellor.");
      });
  }, [isAdmin, userProfile?.id, encStatus, decryptPII]);

  useEffect(() => {
    if (!isAdmin || !userProfile?.id) return;
    supabase.rpc("get_google_calendar_status").then(({ data }) => {
      const row = data?.[0];
      if (row) setGoogleStatus(row);
    });
  }, [isAdmin, userProfile?.id]);

  const toggleKeyword = (kw: string) =>
    setKeywords((prev) => (prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]));

  const handleUpdateProfile = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    setSaving(true);
    await updateProfile({
      display_name: name,
      avatar_url: imageUrl,
      focus_keywords: keywords.length > 0 ? keywords : null,
    });
    setSaving(false);
  };

  const handleUpdateBank = async () => {
    if (!userProfile?.id) return;
    setSavingBank(true);
    const encrypt = encStatus === "unlocked" ? encryptPII : (v: string) => Promise.resolve(v);
    const toSave: Record<BankField, string> = {
      bank_name: await encrypt(bankDetails.bank_name),
      bank_account_name: await encrypt(bankDetails.bank_account_name),
      bank_sort_code: await encrypt(bankDetails.bank_sort_code),
      bank_account_number: await encrypt(bankDetails.bank_account_number),
      bank_payment_reference: await encrypt(bankDetails.bank_payment_reference),
    };
    await supabase.from("practice_settings").update(toSave).eq("admin_id", userProfile.id);
    setSavingBank(false);
    showToast("Bank details updated.");
  };

  const handleUpdateBusiness = async () => {
    if (!userProfile?.id) return;
    setSavingBusiness(true);
    const encrypt = encStatus === "unlocked" ? encryptPII : (v: string) => Promise.resolve(v);
    const toSave = {
      business_name: practiceDetails.business_name,
      email: await encrypt(practiceDetails.email),
      phone: await encrypt(practiceDetails.phone),
      address: await encrypt(practiceDetails.address),
      logo_url: logoUrl || null,
    };
    await supabase.from("practice_settings").update(toSave).eq("admin_id", userProfile.id);
    setSavingBusiness(false);
    showToast("Business information updated.");
  };

  const handleSaveCodenames = async () => {
    if (!userProfile?.id) return;
    setSavingCodenames(true);
    await supabase
      .from("practice_settings")
      .update({ use_client_codenames: useCodenames })
      .eq("admin_id", userProfile.id);
    await refreshPracticeSettings();
    setSavingCodenames(false);
    showToast("Client display settings saved.");
  };

  const handleSendTest = async (type: string) => {
    setSendingTest(type);
    try {
      const { error: fnError } = await supabase.functions.invoke("send-test-email", {
        body: {
          type,
          ...(type === "reminder" ? { custom_body: reminderBody || undefined, hours_before: reminderHours } : {}),
        },
      });
      if (fnError) throw new Error(fnError.message);
      showToast("Test email sent — check your inbox.");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to send test email", "error");
    }
    setSendingTest(null);
  };

  const handleSaveReminderSettings = async () => {
    if (!userProfile?.id) return;
    setSavingReminders(true);
    await supabase
      .from("practice_settings")
      .update({
        reminder_hours_before: reminderHours,
        reminder_email_subject: reminderSubject || null,
        reminder_email_body: reminderBody || null,
        reminder_email_heading: reminderHeading || null,
        disabled_email_types: disabledEmailTypes,
      })
      .eq("admin_id", userProfile.id);
    setSavingReminders(false);
    showToast("Email settings saved.");
  };

  const handleSaveAutoCancel = async () => {
    if (!userProfile?.id) return;
    setSavingAutoCancel(true);
    await supabase
      .from("practice_settings")
      .update({
        auto_cancel_enabled: autoCancelEnabled,
        payment_deadline_hours: paymentDeadlineHours,
      })
      .eq("admin_id", userProfile.id);
    setSavingAutoCancel(false);
    showToast("Auto-cancel settings saved.");
  };

  const handleSaveRescheduleCutoff = async () => {
    if (!userProfile?.id) return;
    setSavingRescheduleCutoff(true);
    await supabase
      .from("practice_settings")
      .update({
        reschedule_cutoff_hours: rescheduleCutoffEnabled ? rescheduleCutoffHours : null,
      })
      .eq("admin_id", userProfile.id);
    setSavingRescheduleCutoff(false);
    showToast("Reschedule cutoff saved.");
  };

  const handleSaveConsent = async () => {
    if (!userProfile?.id) return;
    setSavingConsent(true);
    await supabase
      .from("practice_settings")
      .update({
        consent_enabled: consentEnabled,
        consent_title: consentTitle || "Before you continue",
        consent_body: consentBody,
        consent_pdf_url: consentPdfUrl || null,
        consent_counsellor_cta: consentCounsellorCta || null,
      })
      .eq("admin_id", userProfile.id);
    setSavingConsent(false);
    showToast("Consent settings saved.");
  };

  const handleManageSubscription = async () => {
    setLoadingPortal(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("create-billing-portal-session");
      if (fnError) {
        // supabase-js only gives a generic "non-2xx status code" message by default —
        // the real reason is in the response body.
        let message = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          const body = await fnError.context.json().catch(() => null);
          if (body?.error) message = body.error;
        }
        throw new Error(message);
      }
      if (!data?.url) throw new Error("No portal URL returned");
      window.location.href = data.url;
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
      setLoadingPortal(false);
    }
  };

  const handleConnectGoogleCalendar = () => {
    const clientId = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID;
    const redirect = `${window.location.origin}/settings/google-callback`;
    const scope = "https://www.googleapis.com/auth/calendar.events";
    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}` +
      `&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  };

  const handleToggleGoogleSync = async () => {
    if (!googleStatus) return;
    const nextEnabled = !googleStatus.sync_enabled;
    setSavingGoogleSync(true);
    const { error: rpcError } = await supabase.rpc("set_google_calendar_sync_enabled", { p_enabled: nextEnabled });
    if (rpcError) {
      showToast(rpcError.message, "error");
    } else {
      setGoogleStatus({ ...googleStatus, sync_enabled: nextEnabled });
      showToast(nextEnabled ? "Google Calendar sync resumed." : "Google Calendar sync paused.");
    }
    setSavingGoogleSync(false);
  };

  const handleDisconnectGoogleCalendar = async () => {
    setDisconnectingGoogle(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("google-calendar-disconnect");
      if (fnError) throw new Error(fnError.message);
      setGoogleStatus({ connected: false, google_email: null, sync_enabled: false });
      showToast("Google Calendar disconnected.");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to disconnect Google Calendar", "error");
    }
    setDisconnectingGoogle(false);
  };

  if (loading || !userProfile)
    return (
      <div className="page">
        <Spinner />
      </div>
    );

  return (
    <div className="page">
      <div className={`inner ${styles.columns}`}>
        <div className={styles.pageHeader} id="settings-header">
          <h1>Settings</h1>
          <p>{isAdmin ? "Manage your profile, practice, and account" : "Update or remove your profile"}</p>
        </div>

        {/* ── Tab bar (admin only) ── */}
        {isAdmin && (
          <div className={styles.tabs} id="settings-tabs">
            {ADMIN_TABS.map((tab) => (
              <button
                key={tab.id}
                type="button"
                className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
                onClick={() => setActiveTab(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </div>
        )}

        {/* ── Profile tab ── */}
        {(!isAdmin || activeTab === "profile") && (
          <Card className={styles.card}>
            <div className={styles.topRow}>
              <section className={styles.left}>
                <form className={styles.form}>
                  <h2 className={styles.sectionTitle}>Edit profile</h2>
                  <div className={styles.field}>
                    <label htmlFor="displayName">
                      Display name <small>(shown on your dashboard — use a nickname or short name)</small>
                    </label>
                    <input
                      id="displayName"
                      onChange={(e) => setName(e.target.value)}
                      maxLength={40}
                      value={name}
                      placeholder="e.g. Alex"
                      name="display name"
                    />
                  </div>
                  <div className={styles.field}>
                    <label>Profile picture</label>
                    <UploadAndDisplayImage
                      userId={userProfile?.id ?? ""}
                      onUpload={async (url) => {
                        setImageUrl(url);
                        await updateProfile({ avatar_url: url });
                        showToast("Profile photo updated.");
                      }}
                    />
                  </div>
                </form>
              </section>

              <section className={styles.right}>
                <div className={styles.avatarCard}>
                  <Avatar name={name} imageSrc={imageUrl} color={avatarColor} size={210} />
                  <h2>{name}</h2>
                </div>
              </section>
            </div>

            {!isAdmin && (
              <section className={styles.keywords}>
                <h2>Focus keywords</h2>
                <p>Pick topics that shape the quotes you see on your dashboard.</p>
                <div className={styles.chipList}>
                  {KEYWORDS.map((kw) => (
                    <button
                      key={kw}
                      type="button"
                      className={`${styles.chip} ${keywords.includes(kw) ? styles.chipSelected : ""}`}
                      onClick={() => toggleKeyword(kw)}
                    >
                      {kw}
                    </button>
                  ))}
                </div>
              </section>
            )}

            <div className={styles.actions}>
              <Button
                variant="primary"
                className={styles.saveButton}
                onClick={async (e) => {
                  e.preventDefault();
                  await handleUpdateProfile();
                }}
              >
                {saving ? "Updating profile..." : "Update profile"}
              </Button>
              {!isDemo && (
                <Button variant="secondary" size="sm" onClick={() => setShowChangePasswordModal(true)}>
                  Change password
                </Button>
              )}
              {!isAdmin && !isDemo && (
                <div className={styles.deleteAccountBlock}>
                  <Button variant="ghost-danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
                    Delete account
                  </Button>
                </div>
              )}
              <Button variant="ghost" size="sm" onClick={hardRefresh}>
                Force app update
              </Button>
            </div>
          </Card>
        )}

        {/* ── Practice tab (admin only) ── */}
        {isAdmin && activeTab === "practice" && (
          <>
            {piiLocked && (
              <div
                style={{
                  padding: "var(--sp-3) var(--sp-4)",
                  background: "var(--surface-secondary)",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "var(--sp-4)",
                  fontSize: "0.875rem",
                  color: "var(--text-secondary)",
                }}
              >
                Contact details and bank fields are encrypted. Open any client note and unlock encryption to view or
                edit them.
              </div>
            )}

            {/* Business info */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Business information</h2>
                <p>This information can be used across the app and in client communications.</p>
                <form className={styles.form}>
                  {BUSINESS_FIELDS.map(({ key, label }) => (
                    <div className={styles.field} key={key}>
                      <label>{label}</label>
                      <input
                        value={practiceDetails[key] ?? ""}
                        onChange={(e) => setPracticeDetails((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                  <div className={styles.field}>
                    <label>Logo</label>
                    {logoUrl ? (
                      <>
                        <img src={logoUrl} alt="Practice logo" className={styles.logoPreview} />
                        <Button variant="ghost-danger" size="sm" onClick={() => setLogoUrl("")}>
                          Remove logo
                        </Button>
                      </>
                    ) : (
                      <UploadAndDisplayImage
                        userId={userProfile?.id ?? ""}
                        bucket="logos"
                        onUpload={(url) => setLogoUrl(url)}
                      />
                    )}
                  </div>
                </form>
              </section>
              <div className={styles.actions}>
                <Button variant="primary" className={styles.saveButton} onClick={handleUpdateBusiness}>
                  {savingBusiness ? "Saving…" : "Save business info"}
                </Button>
              </div>
            </Card>

            {/* Bank details */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Bank details</h2>
                <p>Shown to clients as a payment option when they pay for a session.</p>
                <form className={styles.form}>
                  {BANK_FIELDS.map(({ key, label, placeholder }) => (
                    <div className={styles.field} key={key}>
                      <label>{label}</label>
                      <input
                        value={bankDetails[key]}
                        placeholder={placeholder}
                        onChange={(e) => setBankDetails((prev) => ({ ...prev, [key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </form>
              </section>
              <div className={styles.actions}>
                <Button variant="primary" className={styles.saveButton} onClick={handleUpdateBank}>
                  {savingBank ? "Saving…" : "Save bank details"}
                </Button>
              </div>
            </Card>

            {/* Stripe Connect */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Card payments</h2>
                <p>
                  Connect your Stripe account so clients can pay by card. Money goes directly to you — no platform cut.
                </p>
                {stripeConnected ? (
                  <p style={{ color: "var(--color-success)", fontWeight: 600 }}>Stripe connected</p>
                ) : (
                  <Button
                    variant="primary"
                    onClick={() => {
                      const clientId = import.meta.env.VITE_STRIPE_CONNECT_CLIENT_ID;
                      const redirect = `${window.location.origin}/settings/stripe-callback`;
                      window.location.href = `https://connect.stripe.com/oauth/authorize?response_type=code&client_id=${clientId}&scope=read_write&redirect_uri=${encodeURIComponent(redirect)}`;
                    }}
                  >
                    Connect Stripe account
                  </Button>
                )}
              </section>
            </Card>

            {/* Calendar sync */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Calendar sync</h2>
                <p>Choose how your sessions show up in your own calendar.</p>

                <div style={{ display: "grid", gap: "var(--sp-3)", marginBottom: "var(--sp-5)" }}>
                  <div>
                    <strong>Built-in (.ics download)</strong>
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      Download a calendar file for any session and import it manually. Works with any calendar app —
                      nothing is connected automatically, so changes made in-app won't update a file you've already
                      imported.
                    </p>
                  </div>
                  <div>
                    <strong>Google Calendar (auto-sync)</strong>
                    <p style={{ margin: 0, color: "var(--text-secondary)", fontSize: "0.9rem" }}>
                      Connect your Google account once — every session you book, reschedule, or cancel is pushed to your
                      Google Calendar automatically. One-way only: changes made directly in Google don't come back into
                      Clarity.
                    </p>
                  </div>
                </div>

                {googleStatus?.connected ? (
                  <>
                    <label className={styles.toggleRow}>
                      <span className={styles.toggleLabel}>
                        <strong>Sync to Google Calendar</strong>
                        <span>Connected as {googleStatus.google_email ?? "unknown account"}</span>
                      </span>
                      <span
                        className={`${styles.toggleSwitch} ${googleStatus.sync_enabled ? styles.toggleSwitchOn : ""}`}
                      >
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={googleStatus.sync_enabled}
                          disabled={savingGoogleSync}
                          onChange={handleToggleGoogleSync}
                        />
                        <span className={styles.toggleThumb} />
                      </span>
                    </label>
                    <div className={styles.actions} style={{ marginTop: "var(--sp-4)" }}>
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={handleDisconnectGoogleCalendar}
                        disabled={disconnectingGoogle}
                      >
                        {disconnectingGoogle ? "Disconnecting…" : "Disconnect Google Calendar"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <WIP>
                    <Button variant="primary" onClick={handleConnectGoogleCalendar}>
                      Connect Google Calendar
                    </Button>
                  </WIP>
                )}
              </section>
            </Card>

            {/* Session automation */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Session automation</h2>
                <p>
                  Off by default. When enabled, any session that remains unpaid past the cutoff date is{" "}
                  <strong>automatically cancelled</strong> and a{" "}
                  <strong>cancellation email is sent to the client</strong>.
                </p>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Auto-cancel unpaid sessions</strong>
                    <span>
                      {autoCancelEnabled
                        ? "On — sessions will be cancelled and clients emailed when payment is missed."
                        : "Off — no sessions will be automatically cancelled."}
                    </span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${autoCancelEnabled ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={autoCancelEnabled}
                      onChange={(e) => setAutoCancelEnabled(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                {autoCancelEnabled && (
                  <div className={styles.field} style={{ marginTop: "var(--sp-4)" }}>
                    <label htmlFor="paymentDeadlinePractice">Cutoff period</label>
                    <select
                      id="paymentDeadlinePractice"
                      value={paymentDeadlineHours}
                      onChange={(e) => setPaymentDeadlineHours(Number(e.target.value))}
                      className={styles.select}
                    >
                      <option value={24}>1 day</option>
                      <option value={48}>2 days</option>
                      <option value={72}>3 days</option>
                      <option value={168}>1 week</option>
                    </select>
                    <p className={styles.toggleHint}>
                      How long after the session date before the session is cancelled and the cancellation email is
                      sent.
                    </p>
                  </div>
                )}
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveAutoCancel}
                  disabled={savingAutoCancel}
                >
                  {savingAutoCancel ? "Saving…" : "Save"}
                </Button>
              </div>
            </Card>

            {/* Reschedule cutoff */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Reschedule &amp; cancellation cutoff</h2>
                <p>
                  Controls how close to a session clients can still pay, reschedule, or cancel it themselves through
                  their portal. Doesn't affect what you can do from the admin side.
                </p>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Enforce a cutoff</strong>
                    <span>
                      {rescheduleCutoffEnabled
                        ? "On — clients are blocked from changing a session within the window below."
                        : "Off — clients can pay, reschedule, or cancel right up until the session starts."}
                    </span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${rescheduleCutoffEnabled ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={rescheduleCutoffEnabled}
                      onChange={(e) => setRescheduleCutoffEnabled(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                {rescheduleCutoffEnabled && (
                  <div className={styles.field} style={{ marginTop: "var(--sp-4)" }}>
                    <label htmlFor="rescheduleCutoffHours">Cutoff window</label>
                    <select
                      id="rescheduleCutoffHours"
                      value={rescheduleCutoffHours}
                      onChange={(e) => setRescheduleCutoffHours(Number(e.target.value))}
                      className={styles.select}
                    >
                      <option value={12}>12 hours</option>
                      <option value={24}>1 day</option>
                      <option value={48}>2 days</option>
                      <option value={72}>3 days</option>
                      <option value={168}>1 week</option>
                    </select>
                    <p className={styles.toggleHint}>
                      How long before a session starts clients lose the ability to pay, reschedule, or cancel it.
                    </p>
                  </div>
                )}
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveRescheduleCutoff}
                  disabled={savingRescheduleCutoff}
                >
                  {savingRescheduleCutoff ? "Saving…" : "Save"}
                </Button>
              </div>
            </Card>

            {/* Client consent */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Client consent</h2>
                <p>
                  When enabled, new clients must read and agree to your terms before they can access the app. Existing
                  clients who signed up before this was turned on are not affected.
                </p>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Require consent before app access</strong>
                    <span>
                      {consentEnabled
                        ? "On — new clients will see this screen before they can continue."
                        : "Off — clients can access the app immediately after signing up."}
                    </span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${consentEnabled ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={consentEnabled}
                      onChange={(e) => setConsentEnabled(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>

                <div className={styles.field} style={{ marginTop: "var(--sp-5)" }}>
                  <label htmlFor="consentTitle">Heading</label>
                  <input
                    id="consentTitle"
                    value={consentTitle}
                    onChange={(e) => setConsentTitle(e.target.value)}
                    placeholder="Before you continue"
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="consentBody">Agreement text</label>
                  <textarea
                    id="consentBody"
                    className={styles.textarea}
                    rows={6}
                    value={consentBody}
                    onChange={(e) => setConsentBody(e.target.value)}
                    placeholder="Write your terms, confidentiality agreement, or any text the client should read before using the app."
                  />
                </div>

                <div className={styles.field}>
                  <label htmlFor="consentPdfUrl">
                    PDF link <small>(optional — clients can read this document in-app)</small>
                  </label>
                  <input
                    id="consentPdfUrl"
                    type="url"
                    value={consentPdfUrl}
                    onChange={(e) => setConsentPdfUrl(e.target.value)}
                    placeholder="https://…"
                  />
                  <p className={styles.toggleHint}>
                    Paste a link to a PDF hosted anywhere (e.g. Google Drive, Dropbox). Clients will see it embedded
                    in-app alongside your agreement text.
                  </p>
                </div>

                <div className={styles.field}>
                  <label htmlFor="consentCta">Footer message</label>
                  <input
                    id="consentCta"
                    value={consentCounsellorCta}
                    onChange={(e) => setConsentCounsellorCta(e.target.value)}
                    placeholder="If you have any questions, speak to your counsellor."
                  />
                  <p className={styles.toggleHint}>Shown below the agree button as a soft prompt.</p>
                </div>
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveConsent}
                  disabled={savingConsent}
                >
                  {savingConsent ? "Saving…" : "Save consent settings"}
                </Button>
              </div>
            </Card>

            {/* Subscription */}
            {practiceSettings && (
              <Card className={styles.card}>
                <section className={styles.businessSection}>
                  <h2>Subscription</h2>
                  <p>
                    Status:{" "}
                    <strong
                      style={{
                        color:
                          practiceSettings.subscription_status === "active" ||
                          practiceSettings.subscription_status === "trialing"
                            ? "var(--color-success)"
                            : practiceSettings.subscription_status === "paused"
                              ? "var(--color-warning, #f59e0b)"
                              : "var(--color-danger)",
                        textTransform: "capitalize",
                      }}
                    >
                      {practiceSettings.subscription_status}
                    </strong>
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "var(--spacing-xs)" }}>
                    {billingCustomerId
                      ? "Manage your plan, update your payment method, or cancel through the Stripe billing portal."
                      : "This account isn't linked to a Stripe subscription — there's nothing to manage here."}
                  </p>
                </section>
                {billingCustomerId && (
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      className={styles.saveButton}
                      onClick={handleManageSubscription}
                      disabled={loadingPortal}
                    >
                      {loadingPortal ? "Opening…" : "Manage subscription"}
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </>
        )}

        {/* ── Interface tab (admin only) ── */}
        {isAdmin && activeTab === "interface" && (
          <>
            {/* Clients */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Clients</h2>
                <p>Show or hide parts of the clients interface.</p>
                {(
                  [
                    { id: "clients-search", label: "Hide search bar", desc: "Search input on the clients list" },
                    {
                      id: "client-progress-chart",
                      label: "Hide progress chart",
                      desc: "Survey progress chart on client detail pages",
                    },
                  ] as const
                ).map(({ id, label, desc }) => (
                  <label key={id} className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>
                      <strong>{label}</strong>
                      <span>{desc}</span>
                    </span>
                    <span
                      className={`${styles.toggleSwitch} ${hiddenSections.includes(id) ? styles.toggleSwitchOn : ""}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={hiddenSections.includes(id)}
                        onChange={() => toggleSection(id)}
                      />
                      <span className={styles.toggleThumb} />
                    </span>
                  </label>
                ))}
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Use codenames</strong>
                    <span>Show codenames instead of real names in your admin UI</span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${useCodenames ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={useCodenames}
                      onChange={(e) => setUseCodenames(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                <p className={styles.toggleHint}>
                  Set each client's codename from their profile page. If no codename is set, their real name is used as
                  a fallback.
                </p>
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveCodenames}
                  disabled={savingCodenames}
                >
                  {savingCodenames ? "Saving…" : "Save"}
                </Button>
              </div>
            </Card>

            {/* Dashboard */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Dashboard</h2>
                <p>Show or hide widgets on the admin dashboard.</p>
                {(
                  [
                    { id: "dashboard-todos", label: "Hide to-do list", desc: "Task list widget on the dashboard" },
                    {
                      id: "dashboard-revenue",
                      label: "Hide revenue chart",
                      desc: "Monthly revenue trend on the dashboard",
                    },
                  ] as const
                ).map(({ id, label, desc }) => (
                  <label key={id} className={styles.toggleRow}>
                    <span className={styles.toggleLabel}>
                      <strong>{label}</strong>
                      <span>{desc}</span>
                    </span>
                    <span
                      className={`${styles.toggleSwitch} ${hiddenSections.includes(id) ? styles.toggleSwitchOn : ""}`}
                    >
                      <input
                        type="checkbox"
                        className={styles.toggleInput}
                        checked={hiddenSections.includes(id)}
                        onChange={() => toggleSection(id)}
                      />
                      <span className={styles.toggleThumb} />
                    </span>
                  </label>
                ))}
              </section>
            </Card>

            {/* Accessibility */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Accessibility</h2>
                <p>Adjust the app's visual behaviour.</p>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Stop animations</strong>
                    <span>Disables all transitions and animations across the app</span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${reduceMotion ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={reduceMotion}
                      onChange={(e) => setReduceMotion(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
              </section>
            </Card>

            {/* Guided tour */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Guided tours</h2>
                <p>
                  Page walkthroughs appear the first time you visit each section. Reset them here to replay any tour.
                </p>
                <div className={styles.settingRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Walkthrough status</strong>
                    <span>
                      {walkthroughOff
                        ? "All walkthroughs are turned off."
                        : "Walkthroughs play automatically on first visit to each page."}
                    </span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      resetWalkthrough();
                      showToast("Walkthroughs reset — they'll play again on each page.", "success");
                    }}
                  >
                    Reset walkthroughs
                  </Button>
                </div>
              </section>
            </Card>

            {/* Sidebar */}
            <Card className={styles.card}>
              <section className={styles.businessSection}>
                <h2>Sidebar</h2>
                <p>Customise the position of the sidebar expand button.</p>
                <div className={styles.settingRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Expand button position</strong>
                    <span>Where the sidebar toggle sits vertically</span>
                  </span>
                  <div className={styles.segmented}>
                    {(["top", "middle", "bottom"] as const).map((pos) => (
                      <button
                        key={pos}
                        type="button"
                        className={`${styles.segmentedOption} ${sidebarBtnPos === pos ? styles.segmentedActive : ""}`}
                        onClick={() => {
                          setSidebarBtnPos(pos);
                          localStorage.setItem("adminSidebarBtnPos", pos);
                          window.dispatchEvent(new CustomEvent("adminBtnPosChange", { detail: pos }));
                        }}
                      >
                        {pos.charAt(0).toUpperCase() + pos.slice(1)}
                      </button>
                    ))}
                  </div>
                </div>
              </section>
            </Card>
          </>
        )}

        {/* ── Emails tab (admin only) ── */}
        {isAdmin && activeTab === "emails" && (
          <Card className={styles.card}>
            <section className={styles.businessSection}>
              <h2>Manage emails</h2>
              <p>Control which emails go out, customise their content, and send tests to your inbox.</p>
            </section>

            {[
              {
                id: "reminder",
                label: "Session reminder",
                desc: "Sent to clients before their session",
                preview: previewSessionReminder(reminderBody || undefined, reminderHours, reminderHeading || undefined),
              },
              {
                id: "session_booked",
                label: "Session confirmed",
                desc: "Sent to clients when a session is booked",
                preview: previewSessionBooked(),
              },
              {
                id: "session_cancelled",
                label: "Session cancelled",
                desc: "Sent to clients when a session is cancelled",
                preview: previewSessionCancelled(),
              },
              {
                id: "session_rescheduled",
                label: "Session rescheduled",
                desc: "Sent to clients when a session is rescheduled",
                preview: previewSessionRescheduled(),
              },
              {
                id: "payment_received",
                label: "Payment confirmation",
                desc: "Sent to clients when their payment is confirmed",
                preview: previewPaymentReceived(),
              },
            ].map((tpl) => (
              <div key={tpl.id} className={styles.emailRow}>
                <div className={styles.emailRowHeader}>
                  <button
                    type="button"
                    className={styles.emailRowExpandBtn}
                    onClick={() => setExpandedTemplate(expandedTemplate === tpl.id ? null : tpl.id)}
                  >
                    <div>
                      <span className={styles.emailRowLabel}>{tpl.label}</span>
                      <span className={styles.emailRowDesc}>{tpl.desc}</span>
                    </div>
                    <span className={styles.emailRowChevron}>{expandedTemplate === tpl.id ? "▲" : "▼"}</span>
                  </button>
                  <label
                    className={`${styles.toggleSwitch} ${!disabledEmailTypes.includes(tpl.id) ? styles.toggleSwitchOn : ""} ${styles.emailRowToggle}`}
                    title={
                      disabledEmailTypes.includes(tpl.id) ? "Paused — click to enable" : "Sending — click to pause"
                    }
                  >
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={!disabledEmailTypes.includes(tpl.id)}
                      onChange={() =>
                        setDisabledEmailTypes((prev) =>
                          prev.includes(tpl.id) ? prev.filter((t) => t !== tpl.id) : [...prev, tpl.id],
                        )
                      }
                    />
                    <span className={styles.toggleThumb} />
                  </label>
                </div>

                {expandedTemplate === tpl.id && (
                  <div className={styles.emailRowBody}>
                    {tpl.id === "reminder" && (
                      <div className={styles.reminderControls}>
                        <div className={styles.field}>
                          <label htmlFor="reminderHeading">
                            Greeting <small>(optional — supports {"{{name}}"})</small>
                          </label>
                          <div className={styles.varChips}>
                            {["{{name}}"].map((v) => (
                              <button
                                key={v}
                                type="button"
                                className={styles.varChip}
                                onClick={() => insertVar(reminderHeadingRef, setReminderHeading, v)}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                          <input
                            ref={reminderHeadingRef}
                            id="reminderHeading"
                            value={reminderHeading}
                            onChange={(e) => setReminderHeading(e.target.value)}
                            placeholder="Hi {{name}},"
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="reminderTiming">Send reminder</label>
                          <select
                            id="reminderTiming"
                            value={reminderHours}
                            onChange={(e) => setReminderHours(Number(e.target.value))}
                            className={styles.select}
                          >
                            <option value={24}>1 day before</option>
                            <option value={48}>2 days before</option>
                            <option value={72}>3 days before</option>
                            <option value={120}>5 days before (default)</option>
                            <option value={168}>1 week before</option>
                          </select>
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="reminderSubject">
                            Custom subject <small>(optional)</small>
                          </label>
                          <div className={styles.varChips}>
                            {["{{name}}", "{{date}}"].map((v) => (
                              <button
                                key={v}
                                type="button"
                                className={styles.varChip}
                                onClick={() => insertVar(reminderSubjectRef, setReminderSubject, v)}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                          <input
                            ref={reminderSubjectRef}
                            id="reminderSubject"
                            value={reminderSubject}
                            onChange={(e) => setReminderSubject(e.target.value)}
                            placeholder="e.g. Reminder: your session on {{date}}"
                          />
                        </div>
                        <div className={styles.field}>
                          <label htmlFor="reminderBody">
                            Custom message body <small>(optional)</small>
                          </label>
                          <div className={styles.varChips}>
                            {["{{name}}", "{{date}}", "{{location}}", "{{duration}}"].map((v) => (
                              <button
                                key={v}
                                type="button"
                                className={styles.varChip}
                                onClick={() => insertVar(reminderBodyRef, setReminderBody, v)}
                              >
                                {v}
                              </button>
                            ))}
                          </div>
                          <textarea
                            ref={reminderBodyRef}
                            id="reminderBody"
                            className={styles.textarea}
                            rows={4}
                            value={reminderBody}
                            onChange={(e) => setReminderBody(e.target.value)}
                            placeholder="Hi {{name}}, just a reminder about your session on {{date}}."
                          />
                        </div>
                      </div>
                    )}

                    <iframe
                      title={tpl.label}
                      srcDoc={tpl.preview}
                      className={styles.emailIframe}
                      sandbox="allow-same-origin allow-scripts"
                    />

                    <div className={styles.emailRowActions}>
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => handleSendTest(tpl.id)}
                        disabled={sendingTest === tpl.id}
                      >
                        {sendingTest === tpl.id ? "Sending…" : "Send test to me"}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            <div className={styles.actions}>
              <Button
                variant="primary"
                className={styles.saveButton}
                onClick={handleSaveReminderSettings}
                disabled={savingReminders}
              >
                {savingReminders ? "Saving…" : "Save email settings"}
              </Button>
            </div>
          </Card>
        )}
      </div>

      {isDeleteModalOpen && <DeleteUserModal onClose={() => setIsDeleteModalOpen(false)} />}
      {showChangePasswordModal && <ChangePasswordModal onClose={() => setShowChangePasswordModal(false)} />}
    </div>
  );
};

export default SettingsPage;
