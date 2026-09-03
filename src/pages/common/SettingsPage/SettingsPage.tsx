import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";

import { KEYWORDS } from "@constants/constants";
import { FunctionsHttpError } from "@supabase/supabase-js";

import { isPdfUrl, pickColor } from "@Helpers/Helpers";
import { hardRefresh } from "@Hooks/useVersionCheck";
import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import ConfirmModal from "@components/shared/ConfirmModal/ConfirmModal";
import { ChevronDown, CopyIcon } from "@components/shared/Icons/Icons";
import InfoTooltip from "@components/shared/InfoTooltip/InfoTooltip";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import SendAnnouncementModal from "@components/shared/SendAnnouncementModal/SendAnnouncementModal";
import UploadAndDisplayImage from "@components/shared/UploadAndDisplayImage/UploadAndDisplayImage";
import WIP from "@components/shared/WIP/WIP";
import { useAuth } from "@context/AuthContext";
import { useEncryption } from "@context/EncryptionContext";
import { APP_ZOOM_LEVELS, type AppZoom, useInterfacePrefs } from "@context/InterfacePrefsContext";
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
import RegenerateCodeModal from "./RegenerateCodeModal/RegenerateCodeModal";

import styles from "./SettingsPage.module.scss";

type AdminTab = "profile" | "practice" | "schedule" | "billing" | "emails" | "interface";

const ADMIN_TABS: { id: AdminTab; label: string }[] = [
  { id: "profile", label: "Profile" },
  { id: "practice", label: "Practice" },
  { id: "schedule", label: "Schedule & bookings" },
  { id: "billing", label: "Billing" },
  { id: "emails", label: "Emails" },
  { id: "interface", label: "Interface & accessibility" },
];

// Display-only pricing for the subscription tier switcher. Capacity comes from
// the plan_limits table (source of truth, shared with enforcement); the £ figures
// live here and in the marketing page's TIERS array — keep the two in step.
type TierKey = "starter" | "growth" | "unlimited";
const TIER_DISPLAY: Record<TierKey, { label: string; monthly: number; annual: number; blurb: string }> = {
  starter: { label: "Starter", monthly: 7.99, annual: 79, blurb: "For a small caseload" },
  growth: { label: "Growth", monthly: 13.99, annual: 139, blurb: "For a growing practice" },
  unlimited: { label: "Unlimited", monthly: 23.99, annual: 199, blurb: "No client limit" },
};
const TIER_ORDER: TierKey[] = ["starter", "growth", "unlimited"];

type PlanLimitRow = { plan: string; max_active: number | null; max_archived: number | null; sort_order: number };
type PlanUsage = { active: number; archived: number };

function subscriptionStatusColor(status: string | null | undefined, cancelAtPeriodEnd: boolean): string {
  if (cancelAtPeriodEnd) return "var(--warning)";
  if (status === "active" || status === "trialing") return "var(--success)";
  if (status === "paused") return "var(--warning)";
  return "var(--danger)";
}

function subscriptionHintText(cancelAtPeriodEnd: boolean, hasBillingCustomer: boolean): string {
  if (cancelAtPeriodEnd) {
    return "You've cancelled — access continues until the date above, then the account reverts to free. Resubscribe any time before then through the Stripe billing portal.";
  }
  if (hasBillingCustomer) {
    return "Switch tier below, or update your card / cancel through the Stripe billing portal.";
  }
  return "This account isn't linked to a Stripe subscription — there's nothing to manage here.";
}

function PlanUsageBar({ label, used, max }: { label: string; used: number; max: number | null }) {
  const unlimited = max == null;
  const over = !unlimited && used > (max as number);
  const pct = unlimited ? 100 : Math.min(100, Math.round((used / Math.max(max as number, 1)) * 100));
  return (
    <div className={styles.usageBar}>
      <div className={styles.usageBarHead}>
        <span>{label}</span>
        <span className={over ? styles.usageOver : undefined}>
          {unlimited ? `${used} · unlimited` : `${used} / ${max}`}
        </span>
      </div>
      <div className={styles.usageTrack}>
        <div
          className={`${styles.usageFill} ${over ? styles.usageFillOver : ""} ${unlimited ? styles.usageFillMuted : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

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

// Reads a persisted collapse state — falls back to open (true) so existing
// settings stay visible for anyone who hasn't touched a given section yet.
const readCardOpen = (storageKey: string): boolean => {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw === null ? true : raw === "1";
  } catch {
    return true;
  }
};

// Every Practice/Interface section shares this shape: a collapsible white
// card with its own title, filterable by the tab's search box. storageKey
// persists open/closed per section across reloads, same as CollapsibleSection
// elsewhere in the app — kept separate here since these sections' padding
// (.businessSection + .actions as independent full-bleed blocks) doesn't fit
// CollapsibleSection's single-body layout without reworking every section.
function SettingsCard({
  title,
  storageKey,
  searchQuery,
  children,
  id,
}: {
  title: string;
  storageKey: string;
  searchQuery: string;
  children: React.ReactNode;
  // Stable slug for deep-linking: `/settings?tab=practice&section=<id>` opens
  // this card and scrolls it into view (used by the "Manage session types"
  // link in the session-booking modal).
  id?: string;
}) {
  const [open, setOpen] = useState(() => readCardOpen(storageKey));
  const [searchParams, setSearchParams] = useSearchParams();
  const domId = id ? `settings-section-${id}` : undefined;
  const deepLinkHandled = useRef(false);

  useEffect(() => {
    if (deepLinkHandled.current || !id || searchParams.get("section") !== id) return;
    deepLinkHandled.current = true;
    setOpen(true);
    // Two nudges: one after the tab switch settles, one after this card's
    // body has expanded (its height changes where the page ends up). These
    // deliberately aren't cancelled on cleanup — clearing the `section`
    // param below re-runs this effect, and a cancel-on-cleanup would kill
    // the pending scroll. A late scroll to an already-visible card is a
    // harmless no-op.
    [220, 600].forEach((ms) =>
      setTimeout(() => {
        document.getElementById(`settings-section-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, ms),
    );
    const next = new URLSearchParams(searchParams);
    next.delete("section");
    setSearchParams(next, { replace: true });
  }, [id, searchParams, setSearchParams]);

  if (searchQuery.trim() && !title.toLowerCase().includes(searchQuery.trim().toLowerCase())) return null;

  const toggle = () => {
    setOpen((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(storageKey, next ? "1" : "0");
      } catch {
        /* ignore write failures (private mode etc.) */
      }
      return next;
    });
  };

  return (
    <Card className={styles.card} id={domId}>
      <button type="button" className={styles.cardToggle} onClick={toggle} aria-expanded={open}>
        <span className={`${styles.cardChevron} ${open ? styles.cardChevronOpen : ""}`} aria-hidden="true">
          <ChevronDown />
        </span>
        <h2 className={styles.cardToggleTitle}>{title}</h2>
      </button>
      {open && children}
    </Card>
  );
}

// A plain (non-card) label above a cluster of related SettingsCards. Hides
// itself under an active search unless at least one card it introduces
// would still match — same substring rule SettingsCard uses for its own
// title, so a heading never sits above an empty, fully-filtered-out group.
function GroupHeading({
  title,
  searchQuery,
  cardTitles,
}: {
  title: string;
  searchQuery: string;
  cardTitles: string[];
}) {
  const query = searchQuery.trim().toLowerCase();
  if (query && !cardTitles.some((t) => t.toLowerCase().includes(query))) return null;
  return <h3 className={styles.groupHeading}>{title}</h3>;
}

const SettingsPage = () => {
  const { userProfile, updateProfile, isAdmin, isDemo, loading, practiceSettings, refreshPracticeSettings } = useAuth();
  const { status: encStatus, encryptPII, decryptPII } = useEncryption();
  const { hiddenSections, toggleSection, reduceMotion, setReduceMotion, appZoom, setAppZoom } = useInterfacePrefs();
  const { resetAll: resetWalkthrough, isDismissedGlobally: walkthroughOff } = useWalkthrough();
  const { showToast } = useToast();

  // Every save/action handler on this page starts with this — practice_settings
  // itself isn't covered by the DB's block_demo_write trigger (it has to stay
  // writable for real admins saving their own settings), so nothing stops a
  // demo visitor from actually saving here unless each handler checks first.
  const guardDemo = () => {
    if (!isDemo) return false;
    showToast("Demo mode — changes are not saved.");
    return true;
  };

  const [name, setName] = useState(userProfile?.display_name ?? "");
  const [imageUrl, setImageUrl] = useState(userProfile?.avatar_url ?? "");
  const [keywords, setKeywords] = useState<string[]>(userProfile?.focus_keywords ?? []);
  const [saving, setSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);
  const [showRegenerateCodeModal, setShowRegenerateCodeModal] = useState(false);
  const [activeTab, setActiveTab] = useState<AdminTab>("profile");
  const [practiceSearch, setPracticeSearch] = useState("");
  const [scheduleSearch, setScheduleSearch] = useState("");
  const [billingSearch, setBillingSearch] = useState("");
  const [interfaceSearch, setInterfaceSearch] = useState("");
  const [announceOpen, setAnnounceOpen] = useState(false);

  // Deep-link to a tab via ?tab=practice (used by FirstClientTipsModal, etc.).
  // Only consume `tab` here — `section` is left in place for the matching
  // SettingsCard to act on (open + scroll) and clear itself.
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && ADMIN_TABS.some((tab) => tab.id === t)) {
      setActiveTab(t as AdminTab);
      const next = new URLSearchParams(searchParams);
      next.delete("tab");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

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
  const [cardPaymentsEnabled, setCardPaymentsEnabled] = useState(false);
  const [savingCardPayments, setSavingCardPayments] = useState(false);
  const [disconnectingStripe, setDisconnectingStripe] = useState(false);
  const [confirmDisconnectStripe, setConfirmDisconnectStripe] = useState(false);
  const [loadingPortal, setLoadingPortal] = useState(false);
  const [referralCopied, setReferralCopied] = useState(false);
  const [billingCustomerId, setBillingCustomerId] = useState<string | null>(null);

  // Subscription tier switcher. planLimits === null while loading / if the
  // plan_limits table isn't there yet (migration not applied) — the whole
  // switcher block just stays hidden in that case, leaving the existing
  // status + "Manage subscription" button untouched.
  const [planLimits, setPlanLimits] = useState<PlanLimitRow[] | null>(null);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);
  const [tierBilling, setTierBilling] = useState<"monthly" | "annual">("monthly");
  const [switchingPlan, setSwitchingPlan] = useState<string | null>(null);
  const [planSwitchError, setPlanSwitchError] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState<{ plan: TierKey; billing: "monthly" | "annual" } | null>(null);

  const [googleStatus, setGoogleStatus] = useState<{
    connected: boolean;
    google_email: string | null;
    sync_enabled: boolean;
  } | null>(null);
  const [savingGoogleSync, setSavingGoogleSync] = useState(false);
  const [disconnectingGoogle, setDisconnectingGoogle] = useState(false);
  const [confirmDisconnectGoogle, setConfirmDisconnectGoogle] = useState(false);

  const [microsoftStatus, setMicrosoftStatus] = useState<{
    connected: boolean;
    microsoft_email: string | null;
    sync_enabled: boolean;
    create_teams_links: boolean;
  } | null>(null);
  const [savingMicrosoftSync, setSavingMicrosoftSync] = useState(false);
  const [savingTeamsLinks, setSavingTeamsLinks] = useState(false);
  const [disconnectingMicrosoft, setDisconnectingMicrosoft] = useState(false);
  const [confirmDisconnectMicrosoft, setConfirmDisconnectMicrosoft] = useState(false);

  const [useCodenames, setUseCodenames] = useState(false);
  const [hideProfilePii, setHideProfilePii] = useState(false);
  const [savingCodenames, setSavingCodenames] = useState(false);
  const [autoCancelEnabled, setAutoCancelEnabled] = useState(false);
  const [savingAutoCancel, setSavingAutoCancel] = useState(false);
  const [rescheduleCutoffEnabled, setRescheduleCutoffEnabled] = useState(true);
  const [rescheduleCutoffHours, setRescheduleCutoffHours] = useState(48);
  const [savingRescheduleCutoff, setSavingRescheduleCutoff] = useState(false);
  const [sessionBufferMinutes, setSessionBufferMinutes] = useState(10);
  const [savingSessionBuffer, setSavingSessionBuffer] = useState(false);
  const [allowBlockSessionCancellation, setAllowBlockSessionCancellation] = useState(true);
  const [savingBlockCancellation, setSavingBlockCancellation] = useState(false);
  const [adminRemindersEnabled, setAdminRemindersEnabled] = useState(true);
  const [adminReminderLeadMinutes, setAdminReminderLeadMinutes] = useState(1440);
  const [savingAdminReminders, setSavingAdminReminders] = useState(false);
  const [reminderMutes, setReminderMutes] = useState<
    { id: string; client_id: string | null; stub_id: string | null }[]
  >([]);
  const [clientOptions, setClientOptions] = useState<{ id: string; name: string }[]>([]);
  const [stubOptions, setStubOptions] = useState<{ id: string; name: string }[]>([]);
  const [selectedMuteCandidate, setSelectedMuteCandidate] = useState("");
  const [savingMute, setSavingMute] = useState(false);
  const [consentEnabled, setConsentEnabled] = useState(false);
  const [consentTitle, setConsentTitle] = useState("Before you continue");
  const [consentBody, setConsentBody] = useState("");
  const [consentPdfUrl, setConsentPdfUrl] = useState("");
  const [consentPdfUrlError, setConsentPdfUrlError] = useState("");
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
  const [newPackageName, setNewPackageName] = useState("");
  const [newPackagePrice, setNewPackagePrice] = useState("");
  const [newPackageDuration, setNewPackageDuration] = useState("50");
  const [newPackageRecurring, setNewPackageRecurring] = useState(false);
  const [newPackageSessionCount, setNewPackageSessionCount] = useState("4");
  const [addingPackage, setAddingPackage] = useState(false);
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
          return v?.startsWith("{");
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
        setCardPaymentsEnabled(data.card_payments_enabled ?? false);
        setBillingCustomerId(data.billing_customer_id ?? null);
        setReminderHours(data.reminder_hours_before ?? 120);
        setReminderSubject(data.reminder_email_subject ?? "");
        setReminderBody(data.reminder_email_body ?? "");
        setReminderHeading(data.reminder_email_heading ?? "");
        setDisabledEmailTypes(data.disabled_email_types ?? []);
        setPaymentDeadlineHours(data.payment_deadline_hours ?? 48);
        setUseCodenames(data.use_client_codenames ?? false);
        setHideProfilePii(data.hide_client_profile_pii ?? false);
        setAutoCancelEnabled(data.auto_cancel_enabled ?? false);
        setRescheduleCutoffEnabled(data.reschedule_cutoff_hours != null);
        setRescheduleCutoffHours(data.reschedule_cutoff_hours ?? 48);
        setSessionBufferMinutes(data.session_buffer_minutes ?? 10);
        setAllowBlockSessionCancellation(data.allow_block_session_cancellation ?? true);
        setAdminRemindersEnabled(data.admin_reminders_enabled ?? true);
        setAdminReminderLeadMinutes(data.admin_reminder_lead_minutes ?? 1440);
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

  useEffect(() => {
    if (!isAdmin || !userProfile?.id) return;
    supabase.rpc("get_microsoft_calendar_status").then(({ data }) => {
      const row = data?.[0];
      if (row) setMicrosoftStatus(row);
    });
  }, [isAdmin, userProfile?.id]);

  useEffect(() => {
    if (!isAdmin || !userProfile?.id) return;
    supabase
      .from("session_packages")
      .select("id, name, price_pence, duration_minutes, is_recurring, session_count")
      .eq("admin_id", userProfile.id)
      .eq("archived", false)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setSessionPackages(data);
      });
  }, [isAdmin, userProfile?.id]);

  useEffect(() => {
    if (!isAdmin || !userProfile?.id) return;
    supabase
      .from("admin_reminder_mutes")
      .select("id, client_id, stub_id")
      .eq("admin_id", userProfile.id)
      .then(({ data }) => {
        if (data) setReminderMutes(data);
      });
    supabase
      .from("users")
      .select("id, first_name, last_name")
      .eq("admin_id", userProfile.id)
      .eq("role", "client")
      .then(({ data }) => {
        setClientOptions((data ?? []).map((u) => ({ id: u.id, name: `${u.first_name} ${u.last_name}` })));
      });
    supabase
      .from("client_stubs")
      .select("id, first_name, last_name, codename")
      .eq("created_by", userProfile.id)
      .then(({ data }) => {
        setStubOptions((data ?? []).map((s) => ({ id: s.id, name: s.codename || `${s.first_name} ${s.last_name}` })));
      });
  }, [isAdmin, userProfile?.id]);

  const toggleKeyword = (kw: string) =>
    setKeywords((prev) => (prev.includes(kw) ? prev.filter((k) => k !== kw) : [...prev, kw]));

  const handleUpdateProfile = async () => {
    if (guardDemo()) return;
    setSaving(true);
    await updateProfile({
      display_name: name,
      avatar_url: imageUrl,
      focus_keywords: keywords.length > 0 ? keywords : null,
    });
    setSaving(false);
  };

  const handleUpdateBank = async () => {
    if (guardDemo()) return;
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
    if (guardDemo()) return;
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
    if (guardDemo()) return;
    if (!userProfile?.id) return;
    setSavingCodenames(true);
    await supabase
      .from("practice_settings")
      .update({ use_client_codenames: useCodenames, hide_client_profile_pii: hideProfilePii })
      .eq("admin_id", userProfile.id);
    await refreshPracticeSettings();
    setSavingCodenames(false);
    showToast("Client display settings saved.");
  };

  const handleSendTest = async (type: string) => {
    if (guardDemo()) return;
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
    if (guardDemo()) return;
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
    if (guardDemo()) return;
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
    if (guardDemo()) return;
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

  const handleSaveSessionBuffer = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id) return;
    setSavingSessionBuffer(true);
    await supabase
      .from("practice_settings")
      .update({ session_buffer_minutes: sessionBufferMinutes })
      .eq("admin_id", userProfile.id);
    await refreshPracticeSettings();
    setSavingSessionBuffer(false);
    showToast("Session buffer saved.");
  };

  const handleSaveBlockCancellation = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id) return;
    setSavingBlockCancellation(true);
    await supabase
      .from("practice_settings")
      .update({ allow_block_session_cancellation: allowBlockSessionCancellation })
      .eq("admin_id", userProfile.id);
    setSavingBlockCancellation(false);
    showToast("Block cancellation setting saved.");
  };

  const handleSaveAdminReminders = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id) return;
    setSavingAdminReminders(true);
    await supabase
      .from("practice_settings")
      .update({
        admin_reminders_enabled: adminRemindersEnabled,
        admin_reminder_lead_minutes: adminReminderLeadMinutes,
      })
      .eq("admin_id", userProfile.id);
    setSavingAdminReminders(false);
    showToast("Session-prep reminder settings saved.");
  };

  const handleAddMute = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id || !selectedMuteCandidate) return;
    const [kind, id] = selectedMuteCandidate.split(":");
    setSavingMute(true);
    const { data, error } = await supabase
      .from("admin_reminder_mutes")
      .insert({
        admin_id: userProfile.id,
        client_id: kind === "client" ? id : null,
        stub_id: kind === "stub" ? id : null,
      })
      .select("id, client_id, stub_id")
      .single();
    if (error) {
      showToast("Failed to mute client.", "danger");
    } else {
      // Guard against the initial load (a separate, independent fetch) resolving
      // late and re-adding this same row on top of this optimistic update.
      setReminderMutes((prev) => (prev.some((m) => m.id === data.id) ? prev : [...prev, data]));
      setSelectedMuteCandidate("");
    }
    setSavingMute(false);
  };

  const handleRemoveMute = async (id: string) => {
    if (guardDemo()) return;
    const { error } = await supabase.from("admin_reminder_mutes").delete().eq("id", id);
    if (error) {
      showToast("Failed to unmute client.", "danger");
      return;
    }
    setReminderMutes((prev) => prev.filter((m) => m.id !== id));
  };

  const handleSaveConsent = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id) return;
    if (consentPdfUrl && !isPdfUrl(consentPdfUrl)) {
      setConsentPdfUrlError("This must be a direct link to a .pdf file.");
      showToast("PDF link must point directly to a .pdf file.", "danger");
      return;
    }
    setConsentPdfUrlError("");
    setSavingConsent(true);
    await supabase
      .from("practice_settings")
      .update({
        consent_enabled: consentEnabled,
        consent_title: consentTitle || "Before you continue",
        consent_body: consentBody,
        consent_pdf_url: consentPdfUrl || null,
        // consent_counsellor_cta is NOT NULL (default: the same fallback
        // sentence used here) — sending null when the field is cleared
        // violates that constraint and fails the whole save with a raw
        // Postgres error (found via live testing of AdminSetupPage's copy of
        // this same field, which hit it immediately since it starts blank).
        consent_counsellor_cta: consentCounsellorCta || "If you have any questions, speak to your counsellor.",
      })
      .eq("admin_id", userProfile.id);
    setSavingConsent(false);
    showToast("Consent settings saved.");
  };

  const handleAddPackage = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id || !newPackageName.trim() || !newPackagePrice) return;
    setAddingPackage(true);
    // A recurring type is booked as one block: price_pence here is the
    // whole-block price and session_count is how many sessions it covers.
    // CreateSessionModal divides the price across the individual rows.
    const sessionCount = newPackageRecurring ? Math.max(2, Number(newPackageSessionCount) || 2) : 1;
    const { data, error } = await supabase
      .from("session_packages")
      .insert({
        admin_id: userProfile.id,
        name: newPackageName.trim(),
        price_pence: Math.round(parseFloat(newPackagePrice) * 100),
        duration_minutes: Number(newPackageDuration) || 50,
        is_recurring: newPackageRecurring,
        session_count: sessionCount,
        sort_order: sessionPackages.length,
      })
      .select("id, name, price_pence, duration_minutes, is_recurring, session_count")
      .single();
    if (error) {
      showToast("Failed to add session type.", "danger");
    } else {
      setSessionPackages((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data]));
      setNewPackageName("");
      setNewPackagePrice("");
      setNewPackageDuration("50");
      setNewPackageRecurring(false);
      setNewPackageSessionCount("4");
    }
    setAddingPackage(false);
  };

  const handleRemovePackage = async (id: string) => {
    if (guardDemo()) return;
    const { error } = await supabase.from("session_packages").update({ archived: true }).eq("id", id);
    if (error) {
      showToast("Failed to remove session type.", "danger");
      return;
    }
    setSessionPackages((prev) => prev.filter((p) => p.id !== id));
  };

  const handleCopyReferralLink = async () => {
    if (!practiceSettings?.referral_code) return;
    const link = `${window.location.origin}/register?ref=${practiceSettings.referral_code}`;
    try {
      await navigator.clipboard.writeText(link);
      setReferralCopied(true);
      setTimeout(() => setReferralCopied(false), 2000);
    } catch {
      showToast("Couldn't copy — try selecting and copying the code manually.", "error");
    }
  };

  // Load tier capacity + current usage for the switcher. Silently no-ops if
  // the plan_limits table / plan_change_check RPC aren't deployed yet, so the
  // switcher block just stays hidden.
  useEffect(() => {
    if (!isAdmin || !userProfile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: limits } = await supabase.from("plan_limits").select("*").order("sort_order");
      if (cancelled) return;
      if (limits?.length) setPlanLimits(limits as PlanLimitRow[]);

      const { data: usage } = await supabase.rpc("plan_change_check", {
        p_target: practiceSettings?.subscription_plan ?? "starter",
      });
      if (cancelled || !usage) return;
      setPlanUsage({ active: usage.active, archived: usage.archived });
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, userProfile?.id, practiceSettings?.subscription_plan]);

  // Default the billing toggle to whatever they're currently on.
  useEffect(() => {
    const interval = (practiceSettings as { billing_interval?: string } | null)?.billing_interval;
    setTierBilling(interval === "year" ? "annual" : "monthly");
  }, [practiceSettings]);

  const overshootMessage = (targetPlan: TierKey, activeOver: number, archivedOver: number) => {
    const over = Math.max(activeOver ?? 0, archivedOver ?? 0);
    return (
      `You have ${over} ${archivedOver > activeOver ? "archived " : ""}client${over === 1 ? "" : "s"} more than ` +
      `${TIER_DISPLAY[targetPlan].label} allows. Archive or remove ${over === 1 ? "one" : over} before switching down.`
    );
  };

  const runPlanSwitch = async (targetPlan: TierKey, billing: "monthly" | "annual") => {
    if (guardDemo()) return;
    setSwitchingPlan(targetPlan);
    setPlanSwitchError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke("change-subscription-plan", {
        body: { plan: targetPlan, billing },
      });
      if (fnError) {
        let message = fnError.message;
        if (fnError instanceof FunctionsHttpError) {
          const body = await fnError.context.json().catch(() => null);
          if (body?.error === "PLAN_LIMIT" && body.detail) {
            message = overshootMessage(targetPlan, body.detail.active_over, body.detail.archived_over);
          } else if (body?.error) {
            message = body.error;
          }
        }
        throw new Error(message);
      }
      if (!(data as { unchanged?: boolean } | null)?.unchanged) {
        showToast(`You're now on ${TIER_DISPLAY[targetPlan].label}.`);
      }
      await refreshPracticeSettings();
      const { data: usage } = await supabase.rpc("plan_change_check", { p_target: targetPlan });
      if (usage) setPlanUsage({ active: usage.active, archived: usage.archived });
    } catch (err) {
      setPlanSwitchError(err instanceof Error ? err.message : "Couldn't switch plan.");
    } finally {
      setSwitchingPlan(null);
      setConfirmSwitch(null);
    }
  };

  const handlePickPlan = async (targetPlan: TierKey, billing: "monthly" | "annual") => {
    if (guardDemo()) return;
    setPlanSwitchError(null);
    // Pre-flight the capacity check so a blocked downgrade never opens the
    // confirm dialog — it surfaces the "archive N first" message straight away.
    const { data: check } = await supabase.rpc("plan_change_check", { p_target: targetPlan });
    if (check && !check.ok) {
      setPlanSwitchError(overshootMessage(targetPlan, check.active_over, check.archived_over));
      return;
    }
    setConfirmSwitch({ plan: targetPlan, billing });
  };

  const handleManageSubscription = async () => {
    if (guardDemo()) return;
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
      window.open(data.url, "_blank", "noopener,noreferrer");
      setLoadingPortal(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Something went wrong", "error");
      setLoadingPortal(false);
    }
  };

  const handleConnectGoogleCalendar = () => {
    if (guardDemo()) return;
    const clientId = import.meta.env.VITE_GOOGLE_CALENDAR_CLIENT_ID;
    const redirect = `${window.location.origin}/settings/google-callback`;
    const scope = "https://www.googleapis.com/auth/calendar.events";
    window.location.href =
      `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirect)}` +
      `&response_type=code&scope=${encodeURIComponent(scope)}&access_type=offline&prompt=consent`;
  };

  const handleToggleCardPayments = async () => {
    if (guardDemo()) return;
    if (!userProfile?.id) return;
    const next = !cardPaymentsEnabled;
    setSavingCardPayments(true);
    const { error } = await supabase
      .from("practice_settings")
      .update({ card_payments_enabled: next })
      .eq("admin_id", userProfile.id);
    if (error) {
      showToast("Couldn't update card payments — please try again.", "error");
    } else {
      setCardPaymentsEnabled(next);
      showToast(next ? "Card payments are now offered to clients." : "Card payments turned off for clients.");
    }
    setSavingCardPayments(false);
  };

  const handleDisconnectStripe = async () => {
    if (guardDemo()) return;
    setDisconnectingStripe(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("disconnect-stripe");
      if (fnError) throw new Error(fnError.message);
      setStripeConnected(false);
      setCardPaymentsEnabled(false);
      showToast("Stripe disconnected. Clients can no longer pay by card.");
      setConfirmDisconnectStripe(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Couldn't disconnect Stripe — please try again.", "error");
    }
    setDisconnectingStripe(false);
  };

  const handleToggleGoogleSync = async () => {
    if (guardDemo()) return;
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
    if (guardDemo()) return;
    setDisconnectingGoogle(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("google-calendar-disconnect");
      if (fnError) throw new Error(fnError.message);
      setGoogleStatus({ connected: false, google_email: null, sync_enabled: false });
      showToast("Google Calendar disconnected.");
      setConfirmDisconnectGoogle(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to disconnect Google Calendar", "error");
    }
    setDisconnectingGoogle(false);
  };

  const handleConnectMicrosoftCalendar = () => {
    if (guardDemo()) return;
    const clientId = import.meta.env.VITE_MICROSOFT_CALENDAR_CLIENT_ID;
    const redirect = `${window.location.origin}/settings/microsoft-callback`;
    const scope = "offline_access Calendars.ReadWrite OnlineMeetings.ReadWrite User.Read";
    window.location.href =
      `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}` +
      `&redirect_uri=${encodeURIComponent(redirect)}&response_type=code&response_mode=query` +
      `&scope=${encodeURIComponent(scope)}&prompt=consent`;
  };

  const handleToggleMicrosoftSync = async () => {
    if (guardDemo()) return;
    if (!microsoftStatus) return;
    const nextEnabled = !microsoftStatus.sync_enabled;
    setSavingMicrosoftSync(true);
    const { error: rpcError } = await supabase.rpc("set_microsoft_calendar_sync_enabled", { p_enabled: nextEnabled });
    if (rpcError) {
      showToast(rpcError.message, "error");
    } else {
      setMicrosoftStatus({ ...microsoftStatus, sync_enabled: nextEnabled });
      showToast(nextEnabled ? "Outlook sync resumed." : "Outlook sync paused.");
    }
    setSavingMicrosoftSync(false);
  };

  const handleToggleTeamsLinks = async () => {
    if (guardDemo()) return;
    if (!microsoftStatus) return;
    const nextEnabled = !microsoftStatus.create_teams_links;
    setSavingTeamsLinks(true);
    const { error: rpcError } = await supabase.rpc("set_microsoft_teams_links_enabled", { p_enabled: nextEnabled });
    if (rpcError) {
      showToast(rpcError.message, "error");
    } else {
      setMicrosoftStatus({ ...microsoftStatus, create_teams_links: nextEnabled });
      showToast(
        nextEnabled
          ? "New online sessions will get a Teams meeting link."
          : "Teams meeting links turned off — sessions still sync to Outlook.",
      );
    }
    setSavingTeamsLinks(false);
  };

  const handleDisconnectMicrosoftCalendar = async () => {
    if (guardDemo()) return;
    setDisconnectingMicrosoft(true);
    try {
      const { error: fnError } = await supabase.functions.invoke("microsoft-calendar-disconnect");
      if (fnError) throw new Error(fnError.message);
      setMicrosoftStatus({ connected: false, microsoft_email: null, sync_enabled: false, create_teams_links: false });
      showToast("Microsoft calendar disconnected.");
      setConfirmDisconnectMicrosoft(false);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed to disconnect Microsoft calendar", "error");
    }
    setDisconnectingMicrosoft(false);
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
          <Card className={styles.tabsCard}>
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
          </Card>
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
              {!isDemo && isAdmin && (encStatus === "unlocked" || encStatus === "locked") && (
                <Button variant="secondary" size="sm" onClick={() => setShowRegenerateCodeModal(true)}>
                  Get a new encryption code
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

        {/* ── Interface (clients only — admins have their own tab below) ── */}
        {!isAdmin && (
          <Card className={styles.card}>
            <section className={styles.clientPrefs}>
              <h2>Interface</h2>
              <p>These settings only affect this device.</p>

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

              <div className={styles.settingRow}>
                <span className={styles.toggleLabel}>
                  <strong>App zoom</strong>
                  <span>Scales the whole app — useful on smaller screens</span>
                </span>
                <select
                  id="appZoomClient"
                  aria-label="App zoom"
                  value={appZoom}
                  onChange={(e) => setAppZoom(Number(e.target.value) as AppZoom)}
                  className={styles.select}
                >
                  {APP_ZOOM_LEVELS.map((level) => (
                    <option key={level} value={level}>
                      {Math.round(level * 100)}%
                    </option>
                  ))}
                </select>
              </div>

              <div className={styles.settingRow}>
                <span className={styles.toggleLabel}>
                  <strong>Guided tours</strong>
                  <span>
                    {walkthroughOff
                      ? "Walkthroughs are turned off."
                      : "Walkthroughs play the first time you open each page."}
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
        )}

        {/* ── Practice tab (admin only) ── */}
        {isAdmin && activeTab === "practice" && (
          <>
            <input
              type="search"
              className={styles.sectionSearch}
              placeholder="Search practice settings…"
              value={practiceSearch}
              onChange={(e) => setPracticeSearch(e.target.value)}
              aria-label="Search practice settings"
            />
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
            <SettingsCard
              title="Business information"
              storageKey="settings:practice:business"
              searchQuery={practiceSearch}
            >
              <section className={styles.businessSection}>
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
                  <WIP>
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
                  </WIP>
                </form>
              </section>
              <div className={styles.actions}>
                <Button variant="primary" className={styles.saveButton} onClick={handleUpdateBusiness}>
                  {savingBusiness ? "Saving…" : "Save business info"}
                </Button>
              </div>
            </SettingsCard>

            {/* Client announcements */}
            <SettingsCard
              title="Client announcements"
              storageKey="settings:practice:announcements"
              searchQuery={practiceSearch}
            >
              <section className={styles.businessSection}>
                <p>
                  Send a one-off email to some or all of your clients — a closure notice, a waiting-list update, or
                  general practice news. Clients who have opted out of practice emails are skipped automatically.
                </p>
                <div className={styles.actions}>
                  <Button variant="primary" onClick={() => setAnnounceOpen(true)}>
                    Compose announcement
                  </Button>
                </div>
              </section>
            </SettingsCard>

            {/* Client codenames */}
            <SettingsCard
              title="Client codenames"
              storageKey="settings:practice:codenames"
              searchQuery={practiceSearch}
            >
              <section className={styles.businessSection}>
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

                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Hide age, email &amp; last seen</strong>
                    <span>Force-hide these on every client profile, whatever each client's toggles say</span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${hideProfilePii ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={hideProfilePii}
                      onChange={(e) => setHideProfilePii(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                <p className={styles.toggleHint}>
                  Age, email and last-seen are off by default and turned on per client from their profile. This switch
                  hides all three everywhere — handy when your screen is visible to others.
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
            </SettingsCard>

            {/* Client consent */}
            <SettingsCard title="Client consent" storageKey="settings:practice:consent" searchQuery={practiceSearch}>
              <section className={styles.businessSection}>
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

                {consentEnabled && (
                  <div className={styles.consentConfig}>
                    <p className={styles.toggleHint}>
                      This is the agreement new clients must read and sign (typing their name) before they can use the
                      app. Add a heading, the agreement text, and optionally a PDF.
                    </p>

                    <div className={styles.field}>
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
                        PDF link <small>(optional — must end in .pdf — clients can read this document in-app)</small>
                      </label>
                      <input
                        id="consentPdfUrl"
                        type="url"
                        value={consentPdfUrl}
                        onChange={(e) => {
                          setConsentPdfUrl(e.target.value);
                          if (consentPdfUrlError) setConsentPdfUrlError("");
                        }}
                        placeholder="https://example.com/document.pdf"
                        aria-invalid={!!consentPdfUrlError}
                      />
                      {consentPdfUrlError && <p className={styles.fieldError}>{consentPdfUrlError}</p>}
                      <PdfUpload
                        adminId={userProfile?.id ?? ""}
                        value={consentPdfUrl}
                        onChange={(url) => {
                          setConsentPdfUrl(url);
                          if (consentPdfUrlError) setConsentPdfUrlError("");
                        }}
                      />
                      <p className={styles.toggleHint}>
                        Upload a PDF, or paste a direct link ending in .pdf (a Dropbox share link works if it points at
                        the file itself; a Google Drive "view" link will not). Clients will see it embedded in-app
                        alongside your agreement text.
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
                  </div>
                )}
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
            </SettingsCard>
          </>
        )}

        {/* ── Schedule tab (admin only) ── */}
        {isAdmin && activeTab === "schedule" && (
          <>
            <input
              type="search"
              className={styles.sectionSearch}
              placeholder="Search schedule settings…"
              value={scheduleSearch}
              onChange={(e) => setScheduleSearch(e.target.value)}
              aria-label="Search schedule settings"
            />

            {/* Calendar sync */}
            <SettingsCard title="Calendar sync" storageKey="settings:practice:calendar" searchQuery={scheduleSearch}>
              <section className={styles.businessSection}>
                <p>Choose how your sessions show up in your own calendar.</p>

                <div className={styles.syncOptions}>
                  <div className={styles.syncOption}>
                    <h3 className={styles.syncOptionTitle}>Built-in (.ics download)</h3>
                    <p className={styles.syncOptionDesc}>
                      Download a calendar file for any session and import it manually. Works with any calendar app —
                      nothing is connected automatically, so changes made in-app won't update a file you've already
                      imported.
                    </p>
                  </div>
                  <div className={styles.syncOption}>
                    <h3 className={styles.syncOptionTitle}>Google Calendar (auto-sync)</h3>
                    <p className={styles.syncOptionDesc}>
                      Connect your Google account once — every session you book, reschedule, or cancel is pushed to your
                      Google Calendar automatically. One-way only: changes made directly in Google don't come back into
                      Clarity.
                    </p>
                  </div>
                  <div className={styles.syncOption}>
                    <h3 className={styles.syncOptionTitle}>Microsoft 365 / Outlook (auto-sync)</h3>
                    <p className={styles.syncOptionDesc}>
                      Connect your Microsoft account once — sessions push to your Outlook calendar automatically,
                      one-way, the same as Google. Online sessions also get a Microsoft Teams meeting link added
                      automatically (needs a Microsoft 365 Business account with Teams).
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
                        onClick={() => setConfirmDisconnectGoogle(true)}
                        disabled={disconnectingGoogle}
                      >
                        {disconnectingGoogle ? "Disconnecting…" : "Disconnect Google Calendar"}
                      </Button>
                    </div>
                  </>
                ) : (
                  <Button variant="primary" onClick={handleConnectGoogleCalendar}>
                    Connect Google Calendar
                  </Button>
                )}

                {microsoftStatus?.connected ? (
                  <div style={{ marginTop: "var(--sp-6)" }}>
                    <label className={styles.toggleRow}>
                      <span className={styles.toggleLabel}>
                        <strong>Sync to Outlook</strong>
                        <span>Connected as {microsoftStatus.microsoft_email ?? "unknown account"}</span>
                      </span>
                      <span
                        className={`${styles.toggleSwitch} ${
                          microsoftStatus.sync_enabled ? styles.toggleSwitchOn : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={microsoftStatus.sync_enabled}
                          disabled={savingMicrosoftSync}
                          onChange={handleToggleMicrosoftSync}
                        />
                        <span className={styles.toggleThumb} />
                      </span>
                    </label>
                    <label className={styles.toggleRow}>
                      <span className={styles.toggleLabel}>
                        <strong>Add Teams meeting links</strong>
                        <span>Online sessions get a Microsoft Teams join link automatically</span>
                      </span>
                      <span
                        className={`${styles.toggleSwitch} ${
                          microsoftStatus.create_teams_links ? styles.toggleSwitchOn : ""
                        }`}
                      >
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={microsoftStatus.create_teams_links}
                          disabled={savingTeamsLinks || !microsoftStatus.sync_enabled}
                          onChange={handleToggleTeamsLinks}
                        />
                        <span className={styles.toggleThumb} />
                      </span>
                    </label>
                    <div className={styles.actions} style={{ marginTop: "var(--sp-4)" }}>
                      <Button
                        variant="ghost-danger"
                        size="sm"
                        onClick={() => setConfirmDisconnectMicrosoft(true)}
                        disabled={disconnectingMicrosoft}
                      >
                        {disconnectingMicrosoft ? "Disconnecting…" : "Disconnect Microsoft calendar"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button variant="primary" onClick={handleConnectMicrosoftCalendar}>
                    Connect Microsoft calendar
                  </Button>
                )}
              </section>
            </SettingsCard>

            {/* Session automation */}
            <SettingsCard
              title="Session automation"
              storageKey="settings:practice:auto-cancel"
              searchQuery={scheduleSearch}
            >
              <section className={styles.businessSection}>
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
            </SettingsCard>

            {/* Reschedule cutoff */}
            <SettingsCard
              title="Reschedule & cancellation cutoff"
              storageKey="settings:practice:cutoff"
              searchQuery={scheduleSearch}
            >
              <section className={styles.businessSection}>
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
            </SettingsCard>

            {/* Session buffer strip on the scheduler calendar */}
            <SettingsCard title="Session buffer" storageKey="settings:practice:buffer" searchQuery={scheduleSearch}>
              <section className={styles.businessSection}>
                <p>
                  A shaded strip drawn on your scheduler calendar after every booked session — a visual gap for notes
                  and turnaround before the next one. It doesn't block bookings, it's just a guide.
                </p>
                <div className={styles.field}>
                  <label htmlFor="sessionBufferMinutes">Buffer length</label>
                  <select
                    id="sessionBufferMinutes"
                    value={sessionBufferMinutes}
                    onChange={(e) => setSessionBufferMinutes(Number(e.target.value))}
                    className={styles.select}
                  >
                    <option value={0}>Off — no strip</option>
                    <option value={5}>5 minutes</option>
                    <option value={10}>10 minutes</option>
                    <option value={15}>15 minutes</option>
                    <option value={20}>20 minutes</option>
                    <option value={30}>30 minutes</option>
                  </select>
                </div>
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveSessionBuffer}
                  disabled={savingSessionBuffer}
                >
                  {savingSessionBuffer ? "Saving…" : "Save"}
                </Button>
              </div>
            </SettingsCard>

            {/* Admin session-prep reminders */}
            <SettingsCard
              title="Session-prep reminders"
              storageKey="settings:practice:prep-reminders"
              searchQuery={scheduleSearch}
            >
              <section className={styles.businessSection}>
                <p>
                  Get an in-app notification before your own sessions so you can review the client's history first.
                  Doesn't email anyone — it's just for you.
                </p>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Remind me before sessions</strong>
                    <span>
                      {adminRemindersEnabled
                        ? "On — you'll get a notification before each session."
                        : "Off — no reminders."}
                    </span>
                  </span>
                  <span className={`${styles.toggleSwitch} ${adminRemindersEnabled ? styles.toggleSwitchOn : ""}`}>
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={adminRemindersEnabled}
                      onChange={(e) => setAdminRemindersEnabled(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
                {adminRemindersEnabled && (
                  <div className={styles.field} style={{ marginTop: "var(--sp-4)" }}>
                    <label htmlFor="adminReminderLead">Remind me</label>
                    <select
                      id="adminReminderLead"
                      value={adminReminderLeadMinutes}
                      onChange={(e) => setAdminReminderLeadMinutes(Number(e.target.value))}
                      className={styles.select}
                    >
                      <option value={60}>1 hour before</option>
                      <option value={180}>3 hours before</option>
                      <option value={1440}>1 day before</option>
                      <option value={2880}>2 days before</option>
                    </select>
                  </div>
                )}

                <div className={styles.field} style={{ marginTop: "var(--sp-5)" }}>
                  <label>Muted clients</label>
                  <p className={styles.toggleHint}>
                    These clients won't trigger a reminder, even when the setting above is on.
                  </p>
                  {reminderMutes.length > 0 && (
                    <ul style={{ listStyle: "none", padding: 0, margin: "var(--sp-3) 0 0" }}>
                      {reminderMutes.map((m) => {
                        const name =
                          (m.client_id && clientOptions.find((c) => c.id === m.client_id)?.name) ||
                          (m.stub_id && stubOptions.find((s) => s.id === m.stub_id)?.name) ||
                          "Unknown client";
                        return (
                          <li
                            key={m.id}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              padding: "var(--sp-2) 0",
                            }}
                          >
                            <span>{name}</span>
                            <Button variant="ghost" size="sm" onClick={() => handleRemoveMute(m.id)}>
                              Unmute
                            </Button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                  <div
                    style={{
                      display: "flex",
                      gap: "var(--sp-2)",
                      marginTop: "var(--sp-3)",
                      flexWrap: "wrap",
                    }}
                  >
                    <select
                      className={styles.select}
                      value={selectedMuteCandidate}
                      onChange={(e) => setSelectedMuteCandidate(e.target.value)}
                    >
                      <option value="">— mute a client —</option>
                      {clientOptions
                        .filter((c) => !reminderMutes.some((m) => m.client_id === c.id))
                        .map((c) => (
                          <option key={c.id} value={`client:${c.id}`}>
                            {c.name}
                          </option>
                        ))}
                      {stubOptions
                        .filter((s) => !reminderMutes.some((m) => m.stub_id === s.id))
                        .map((s) => (
                          <option key={s.id} value={`stub:${s.id}`}>
                            {s.name} (offline)
                          </option>
                        ))}
                    </select>
                    <Button size="sm" onClick={handleAddMute} disabled={!selectedMuteCandidate || savingMute}>
                      {savingMute ? "Muting…" : "Mute"}
                    </Button>
                  </div>
                </div>
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveAdminReminders}
                  disabled={savingAdminReminders}
                >
                  {savingAdminReminders ? "Saving…" : "Save"}
                </Button>
              </div>
            </SettingsCard>

            {/* Block session cancellation */}
            <SettingsCard
              title="Block booking cancellations"
              storageKey="settings:practice:block-cancellation"
              searchQuery={scheduleSearch}
            >
              <section className={styles.businessSection}>
                <p>
                  Controls whether clients can request to cancel a single session that's part of a block booking.
                  Doesn't affect blocks that are already fully paid — those can never be cancelled session-by-session,
                  regardless of this setting.
                </p>
                <label className={styles.toggleRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Allow block session cancellation requests</strong>
                    <span>
                      {allowBlockSessionCancellation
                        ? "On — clients can request to cancel individual sessions in a block, same as any other session."
                        : "Off — clients see a message explaining they need to contact you instead."}
                    </span>
                  </span>
                  <span
                    className={`${styles.toggleSwitch} ${allowBlockSessionCancellation ? styles.toggleSwitchOn : ""}`}
                  >
                    <input
                      type="checkbox"
                      className={styles.toggleInput}
                      checked={allowBlockSessionCancellation}
                      onChange={(e) => setAllowBlockSessionCancellation(e.target.checked)}
                    />
                    <span className={styles.toggleThumb} />
                  </span>
                </label>
              </section>
              <div className={styles.actions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.saveButton}
                  onClick={handleSaveBlockCancellation}
                  disabled={savingBlockCancellation}
                >
                  {savingBlockCancellation ? "Saving…" : "Save"}
                </Button>
              </div>
            </SettingsCard>
          </>
        )}

        {/* ── Billing tab (admin only) ── */}
        {isAdmin && activeTab === "billing" && (
          <>
            <input
              type="search"
              className={styles.sectionSearch}
              placeholder="Search billing settings…"
              value={billingSearch}
              onChange={(e) => setBillingSearch(e.target.value)}
              aria-label="Search billing settings"
            />
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
                Bank details are encrypted. Open any client note and unlock encryption to view or edit them.
              </div>
            )}

            {/* Session types & prices */}
            <SettingsCard
              title="Session types & prices"
              storageKey="settings:practice:packages"
              searchQuery={billingSearch}
              id="packages"
            >
              <section className={styles.businessSection}>
                <p>
                  What you'll pick from when booking a client's session.{" "}
                  <InfoTooltip
                    variant="rich"
                    title="Session types & prices"
                    text={
                      "These are booking presets — nothing here is shown to clients.\n" +
                      "When you book a session (from '+ New session' on a client's page or in the Scheduler), picking a type fills in its price and duration. Every field stays editable on the session itself, so a one-off rate or a sliding scale still works.\n" +
                      "Tick 'Recurring block' to make a type that books several weekly sessions in one step. The price you enter is the whole-block price — it's split evenly across the sessions, and the block is paid for as a unit."
                    }
                  />
                </p>
                {sessionPackages.length > 0 && (
                  <ul className={styles.packageList}>
                    {sessionPackages.map((p) => (
                      <li key={p.id} className={styles.packageItem}>
                        <span>
                          {p.name}
                          <span className={styles.packageMeta}>
                            {" "}
                            — £{(p.price_pence / 100).toFixed(2)}
                            {p.is_recurring
                              ? ` · ${p.session_count}-week block · £${(p.price_pence / 100 / p.session_count).toFixed(
                                  2,
                                )}/session`
                              : ""}{" "}
                            · {p.duration_minutes} min
                          </span>
                        </span>
                        <Button variant="ghost" size="sm" onClick={() => handleRemovePackage(p.id)}>
                          Remove
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className={styles.packageAddCard}>
                  <p className={styles.packageAddHeading}>Add a session type</p>

                  <label htmlFor="settings-pkg-recurring" className={styles.checkboxRow}>
                    <input
                      id="settings-pkg-recurring"
                      type="checkbox"
                      checked={newPackageRecurring}
                      onChange={(e) => setNewPackageRecurring(e.target.checked)}
                    />
                    Recurring block — several weekly sessions booked and paid for together
                  </label>

                  <div className={styles.packageRow}>
                    <div className={styles.field}>
                      <label htmlFor="settings-pkg-name">Name</label>
                      <input
                        id="settings-pkg-name"
                        value={newPackageName}
                        onChange={(e) => setNewPackageName(e.target.value)}
                        placeholder="e.g. Standard session"
                      />
                    </div>

                    <div className={styles.field}>
                      <label htmlFor="settings-pkg-price">
                        {newPackageRecurring ? "Block price (£)" : "Price (£)"}
                      </label>
                      <input
                        id="settings-pkg-price"
                        type="number"
                        min="0"
                        step="0.01"
                        value={newPackagePrice}
                        onChange={(e) => setNewPackagePrice(e.target.value)}
                        placeholder={newPackageRecurring ? "240.00" : "60.00"}
                      />
                      {newPackageRecurring && newPackagePrice && Number(newPackageSessionCount) >= 2 && (
                        <span className={styles.packageMeta}>
                          £{(parseFloat(newPackagePrice) / Number(newPackageSessionCount)).toFixed(2)} per session ·
                          client pays the block price once
                        </span>
                      )}
                    </div>

                    <div className={styles.packageNumRow}>
                      {newPackageRecurring && (
                        <div className={styles.field}>
                          <label htmlFor="settings-pkg-count">Number of weeks</label>
                          <input
                            id="settings-pkg-count"
                            type="number"
                            min="2"
                            max="52"
                            value={newPackageSessionCount}
                            onChange={(e) => setNewPackageSessionCount(e.target.value)}
                          />
                          <span className={styles.packageMeta}>
                            {Number(newPackageSessionCount) >= 2
                              ? `${Number(newPackageSessionCount)} weekly sessions in total.`
                              : "One session per week."}
                          </span>
                        </div>
                      )}
                      <div className={styles.field}>
                        <label htmlFor="settings-pkg-duration">Duration (min)</label>
                        <input
                          id="settings-pkg-duration"
                          type="number"
                          min="5"
                          value={newPackageDuration}
                          onChange={(e) => setNewPackageDuration(e.target.value)}
                        />
                      </div>
                    </div>

                    <div className={styles.packageAddActions}>
                      <Button
                        onClick={handleAddPackage}
                        disabled={!newPackageName.trim() || !newPackagePrice || addingPackage}
                      >
                        {addingPackage ? "Adding…" : "+ Add session type"}
                      </Button>
                    </div>
                  </div>
                </div>
              </section>
            </SettingsCard>

            {/* Bank details */}
            <SettingsCard title="Bank details" storageKey="settings:practice:bank" searchQuery={billingSearch}>
              <section className={styles.businessSection}>
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
            </SettingsCard>

            {/* Stripe Connect */}
            <SettingsCard
              title="Card payments"
              storageKey="settings:practice:card-payments"
              searchQuery={billingSearch}
            >
              <section className={styles.businessSection}>
                <p>
                  Connect your Stripe account so clients can pay by card. Money goes directly to you — no platform cut.
                </p>
                {stripeConnected ? (
                  <>
                    <p style={{ color: "var(--color-success)", fontWeight: 600 }}>Stripe connected</p>
                    <label className={styles.toggleRow}>
                      <span className={styles.toggleLabel}>
                        <strong>Offer card payments to clients</strong>
                        <span>
                          Off by default even once connected — turn on when you're ready for clients to see "Pay with
                          Stripe" as an option.
                        </span>
                      </span>
                      <span className={`${styles.toggleSwitch} ${cardPaymentsEnabled ? styles.toggleSwitchOn : ""}`}>
                        <input
                          type="checkbox"
                          className={styles.toggleInput}
                          checked={cardPaymentsEnabled}
                          disabled={savingCardPayments}
                          onChange={handleToggleCardPayments}
                        />
                        <span className={styles.toggleThumb} />
                      </span>
                    </label>
                    <Button variant="ghost" onClick={() => setConfirmDisconnectStripe(true)}>
                      Disconnect Stripe
                    </Button>
                  </>
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
            </SettingsCard>

            {/* Subscription */}
            {practiceSettings && (
              <SettingsCard
                title="Subscription"
                storageKey="settings:practice:subscription"
                searchQuery={billingSearch}
                id="subscription"
              >
                <section className={styles.businessSection}>
                  <p>
                    Status:{" "}
                    <strong
                      style={{
                        color: subscriptionStatusColor(
                          practiceSettings.subscription_status,
                          practiceSettings.subscription_cancel_at_period_end,
                        ),
                        textTransform: "capitalize",
                      }}
                    >
                      {practiceSettings.subscription_status}
                    </strong>
                    {practiceSettings.subscription_cancel_at_period_end && (
                      <>
                        {" "}
                        — cancels{" "}
                        {practiceSettings.subscription_current_period_end
                          ? `on ${new Date(practiceSettings.subscription_current_period_end).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`
                          : "at the end of the current billing period"}
                      </>
                    )}
                  </p>
                  <p style={{ color: "var(--text-secondary)", fontSize: "0.9rem", marginTop: "var(--spacing-xs)" }}>
                    {subscriptionHintText(practiceSettings.subscription_cancel_at_period_end, !!billingCustomerId)}
                  </p>
                </section>

                {planLimits &&
                  (() => {
                    // Legacy rows still say "app"/"bundle"/"website" until the tier
                    // migration backfills them — treat anything unrecognised as starter.
                    const rawPlan = (practiceSettings.subscription_plan as string) ?? "starter";
                    const currentPlan: TierKey = TIER_ORDER.includes(rawPlan as TierKey)
                      ? (rawPlan as TierKey)
                      : "starter";
                    const currentLimit = planLimits.find((l) => l.plan === currentPlan);
                    return (
                      <section className={styles.businessSection}>
                        <h2>Your plan</h2>

                        {planUsage && currentLimit && (
                          <div className={styles.planUsage}>
                            <PlanUsageBar
                              label="Active clients"
                              used={planUsage.active}
                              max={currentLimit.max_active}
                            />
                            <PlanUsageBar
                              label="Archived clients"
                              used={planUsage.archived}
                              max={currentLimit.max_archived}
                            />
                          </div>
                        )}

                        <div className={styles.tierToggle} role="tablist" aria-label="Billing period">
                          <button
                            type="button"
                            role="tab"
                            aria-selected={tierBilling === "monthly"}
                            className={`${styles.tierToggleBtn} ${tierBilling === "monthly" ? styles.tierToggleBtnActive : ""}`}
                            onClick={() => setTierBilling("monthly")}
                          >
                            Monthly
                          </button>
                          <button
                            type="button"
                            role="tab"
                            aria-selected={tierBilling === "annual"}
                            className={`${styles.tierToggleBtn} ${tierBilling === "annual" ? styles.tierToggleBtnActive : ""}`}
                            onClick={() => setTierBilling("annual")}
                          >
                            Annual · 2 months free
                          </button>
                        </div>

                        <div className={styles.tierGrid}>
                          {TIER_ORDER.map((key) => {
                            const d = TIER_DISPLAY[key];
                            const limit = planLimits.find((l) => l.plan === key);
                            const isCurrent = key === currentPlan;
                            const price = tierBilling === "annual" ? d.annual : d.monthly;
                            return (
                              <div
                                key={key}
                                className={`${styles.tierCard} ${isCurrent ? styles.tierCardCurrent : ""}`}
                              >
                                <div className={styles.tierName}>{d.label}</div>
                                <div className={styles.tierPrice}>
                                  £{price}
                                  <span>{tierBilling === "annual" ? "/yr" : "/mo"}</span>
                                </div>
                                <div className={styles.tierCap}>
                                  {!limit || limit.max_active == null
                                    ? "Unlimited clients"
                                    : `${limit.max_active} active + ${limit.max_archived} archived`}
                                </div>
                                <div className={styles.tierBlurb}>{d.blurb}</div>
                                {isCurrent ? (
                                  <span className={styles.tierCurrentBadge}>Current plan</span>
                                ) : (
                                  <Button
                                    variant="secondary"
                                    onClick={() => handlePickPlan(key, tierBilling)}
                                    disabled={!!switchingPlan || !billingCustomerId}
                                  >
                                    {switchingPlan === key ? "Switching…" : "Switch"}
                                  </Button>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {planSwitchError && (
                          <p className={styles.planSwitchError} role="alert">
                            {planSwitchError}
                          </p>
                        )}
                        {!billingCustomerId && <p>Start a subscription below before you can switch tier.</p>}
                      </section>
                    );
                  })()}

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
              </SettingsCard>
            )}

            {/* Refer a friend */}
            {practiceSettings?.referral_code && (
              <SettingsCard title="Refer a friend" storageKey="settings:practice:referral" searchQuery={billingSearch}>
                <section className={styles.businessSection}>
                  <p>
                    Share your link — when a colleague subscribes with it, you get <strong>2 months free</strong>{" "}
                    credited to your account.
                  </p>
                  <p>
                    The credit lands automatically once their subscription <strong>renews into its second month</strong>
                    , so a sign-up that's cancelled straight away doesn't count — and you need to still be subscribed
                    yourself when it lands.
                  </p>
                  <div className={styles.field}>
                    <label>Your referral link</label>
                    <button
                      type="button"
                      className={styles.copyField}
                      onClick={handleCopyReferralLink}
                      title="Click to copy"
                    >
                      <span className={styles.copyFieldValue}>
                        {`${window.location.origin}/register?ref=${practiceSettings.referral_code}`}
                      </span>
                      <span className={styles.copyFieldIcon}>{referralCopied ? "Copied ✓" : <CopyIcon />}</span>
                    </button>
                  </div>
                </section>
              </SettingsCard>
            )}
          </>
        )}

        {/* ── Interface tab (admin only) ── */}
        {isAdmin && activeTab === "interface" && (
          <>
            <input
              type="search"
              className={styles.sectionSearch}
              placeholder="Search interface settings…"
              value={interfaceSearch}
              onChange={(e) => setInterfaceSearch(e.target.value)}
              aria-label="Search interface settings"
            />

            {/* Clients */}
            <SettingsCard title="Clients" storageKey="settings:interface:clients" searchQuery={interfaceSearch}>
              <section className={styles.businessSection}>
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
              </section>
            </SettingsCard>

            {/* Dashboard */}
            <SettingsCard title="Dashboard" storageKey="settings:interface:dashboard" searchQuery={interfaceSearch}>
              <section className={styles.businessSection}>
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
            </SettingsCard>

            {/* Accessibility */}
            <SettingsCard
              title="Accessibility"
              storageKey="settings:interface:accessibility"
              searchQuery={interfaceSearch}
            >
              <section className={styles.businessSection}>
                <p>Adjust how the app looks and moves. These settings only affect your own browser.</p>
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

                <div className={styles.settingRow}>
                  <span className={styles.toggleLabel}>
                    <strong>App zoom</strong>
                    <span>Scales the whole app on this device — useful on smaller screens</span>
                  </span>
                  <select
                    id="appZoomAdmin"
                    aria-label="App zoom"
                    value={appZoom}
                    onChange={(e) => setAppZoom(Number(e.target.value) as AppZoom)}
                    className={styles.select}
                  >
                    {APP_ZOOM_LEVELS.map((level) => (
                      <option key={level} value={level}>
                        {Math.round(level * 100)}%
                      </option>
                    ))}
                  </select>
                </div>

                <div className={styles.settingRow}>
                  <span className={styles.toggleLabel}>
                    <strong>Sidebar expand button</strong>
                    <span>Where the sidebar's open/close toggle sits vertically</span>
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
            </SettingsCard>

            {/* Guided tour */}
            <SettingsCard title="Guided tours" storageKey="settings:interface:tours" searchQuery={interfaceSearch}>
              <section className={styles.businessSection}>
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
            </SettingsCard>
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
      {showRegenerateCodeModal && <RegenerateCodeModal onClose={() => setShowRegenerateCodeModal(false)} />}
      {announceOpen && (
        <SendAnnouncementModal
          useCodenames={practiceSettings?.use_client_codenames ?? false}
          onClose={() => setAnnounceOpen(false)}
        />
      )}
      {confirmDisconnectGoogle && (
        <ConfirmModal
          title="Disconnect Google Calendar?"
          onClose={() => setConfirmDisconnectGoogle(false)}
          onConfirm={handleDisconnectGoogleCalendar}
          confirming={disconnectingGoogle}
          confirmLabel="Yes, disconnect"
        >
          <p>Future sessions will stop syncing to Google Calendar. Events already created there won't be removed.</p>
        </ConfirmModal>
      )}
      {confirmDisconnectMicrosoft && (
        <ConfirmModal
          title="Disconnect Microsoft calendar?"
          onClose={() => setConfirmDisconnectMicrosoft(false)}
          onConfirm={handleDisconnectMicrosoftCalendar}
          confirming={disconnectingMicrosoft}
          confirmLabel="Yes, disconnect"
        >
          <p>
            Future sessions will stop syncing to Outlook and no new Teams links will be created. Events and meetings
            already in your calendar won't be removed.
          </p>
        </ConfirmModal>
      )}
      {confirmDisconnectStripe && (
        <ConfirmModal
          title="Disconnect Stripe?"
          onClose={() => setConfirmDisconnectStripe(false)}
          onConfirm={handleDisconnectStripe}
          confirming={disconnectingStripe}
          confirmLabel="Yes, disconnect"
          danger
        >
          <p>
            Clients will no longer be able to pay by card — bank transfer stays available. You'll need to reconnect and
            turn card payments back on to offer it again.
          </p>
        </ConfirmModal>
      )}
      {confirmSwitch && (
        <ConfirmModal
          title={`Switch to ${TIER_DISPLAY[confirmSwitch.plan].label}?`}
          onClose={() => setConfirmSwitch(null)}
          onConfirm={() => runPlanSwitch(confirmSwitch.plan, confirmSwitch.billing)}
          confirming={!!switchingPlan}
          confirmLabel="Switch plan"
          danger={false}
        >
          <p>
            You'll move to <strong>{TIER_DISPLAY[confirmSwitch.plan].label}</strong> at £
            {confirmSwitch.billing === "annual"
              ? `${TIER_DISPLAY[confirmSwitch.plan].annual}/year`
              : `${TIER_DISPLAY[confirmSwitch.plan].monthly}/month`}
            . The change takes effect straight away and your renewal date stays the same.
          </p>
          <p>
            We don't refund unused time on your current plan — any difference is applied as account credit or added to
            your next invoice.
          </p>
        </ConfirmModal>
      )}
    </div>
  );
};

export default SettingsPage;
