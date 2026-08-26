import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { LeafLogoMark } from "@components/shared/Icons/Icons";
import ImageBlurBlock from "@components/shared/ImageBlurBlock/ImageBlurBlock";
import InfoTooltip from "@components/shared/InfoTooltip/InfoTooltip";
import { useAuth } from "@context/AuthContext";
import { useEncryption } from "@context/EncryptionContext";
import { useToast } from "@context/ToastContext";
import { supabase } from "@lib/supabase";

import styles from "./AdminSetupPage.module.scss";

type SessionPackage = {
  id: string;
  name: string;
  price_pence: number;
  duration_minutes: number;
};

type BankField =
  | "bank_name"
  | "bank_account_name"
  | "bank_sort_code"
  | "bank_account_number"
  | "bank_payment_reference";

const BANK_FIELDS: { key: BankField; label: string; placeholder: string }[] = [
  { key: "bank_name", label: "Bank name", placeholder: "e.g. Barclays" },
  { key: "bank_account_name", label: "Account name", placeholder: "e.g. Sarah Smith Therapy" },
  { key: "bank_sort_code", label: "Sort code", placeholder: "e.g. 20-00-00" },
  { key: "bank_account_number", label: "Account number", placeholder: "e.g. 12345678" },
  { key: "bank_payment_reference", label: "Payment reference", placeholder: "e.g. use your name as ref" },
];

const STEP_TITLES = [
  "Business information",
  "Session types & prices",
  "Client codenames",
  "Client onboarding form",
  "Bank details",
];
const TOTAL_STEPS = STEP_TITLES.length;

// Steps 1-2 are required to use the app at all; everything after that is a
// nice-to-have the admin can turn on later from Settings, so each gets an
// explicit Skip button rather than forcing a decision here.
const SKIPPABLE_STEPS = new Set([3, 4, 5]);

// First-run gate for admins who signed up after onboarding_required shipped
// (20260824000003) — existing admins are grandfathered and never see this.
// Blocks the rest of the app until business info + at least one session
// package exist, then flips practice_settings.onboarding_required to false.
// Staged into steps (2026-08-25, extended 2026-08-26) — one section per
// screen instead of one very tall wall of form, same problem
// CounsellorSignupPage already solved with its own step-dots pattern, reused
// here. Only business info + session types are required; codenames, the
// onboarding form, and bank details are all optional and skippable.
// Bank details are offered here too (same encrypted-at-rest fields Settings
// uses) since a client can't be shown "how to pay" details for a payment
// method that was never filled in — but they're optional, since Stripe
// Connect alone is a valid setup with no bank transfer support at all.
export default function AdminSetupPage() {
  const { userProfile, practiceSettings, refreshPracticeSettings, signOut } = useAuth();
  const { status: encStatus, encryptPII } = useEncryption();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [businessName, setBusinessName] = useState(practiceSettings?.business_name ?? "");
  const [enableCodenames, setEnableCodenames] = useState(practiceSettings?.use_client_codenames ?? false);
  const [bankDetails, setBankDetails] = useState<Record<BankField, string>>({
    bank_name: "",
    bank_account_name: "",
    bank_sort_code: "",
    bank_account_number: "",
    bank_payment_reference: "",
  });
  const [packages, setPackages] = useState<SessionPackage[]>([]);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [newDuration, setNewDuration] = useState("50");
  const [addingPackage, setAddingPackage] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!userProfile?.id) return;
    supabase
      .from("session_packages")
      .select("id, name, price_pence, duration_minutes")
      .eq("admin_id", userProfile.id)
      .eq("archived", false)
      .order("sort_order")
      .then(({ data }) => {
        if (data) setPackages(data);
      });
  }, [userProfile?.id]);

  const handleAddPackage = async () => {
    if (!userProfile?.id || !newName.trim() || !newPrice) return;
    setAddingPackage(true);
    const { data, error: insertError } = await supabase
      .from("session_packages")
      .insert({
        admin_id: userProfile.id,
        name: newName.trim(),
        price_pence: Math.round(parseFloat(newPrice) * 100),
        duration_minutes: Number(newDuration) || 50,
        sort_order: packages.length,
      })
      .select("id, name, price_pence, duration_minutes")
      .single();
    if (insertError) {
      showToast("Failed to add session type.", "danger");
    } else {
      // Guard against the initial load (a separate, independent fetch) resolving
      // late and re-adding this same row on top of this optimistic update.
      setPackages((prev) => (prev.some((p) => p.id === data.id) ? prev : [...prev, data]));
      setNewName("");
      setNewPrice("");
      setNewDuration("50");
    }
    setAddingPackage(false);
  };

  const handleRemovePackage = async (id: string) => {
    const { error: deleteError } = await supabase.from("session_packages").update({ archived: true }).eq("id", id);
    if (deleteError) {
      showToast("Failed to remove session type.", "danger");
      return;
    }
    setPackages((prev) => prev.filter((p) => p.id !== id));
  };

  const handleContinue = () => {
    if (step === 1 && !businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    if (step === 2 && packages.length === 0) {
      setError("Add at least one session type with a price before continuing.");
      return;
    }
    setError("");
    setStep((s) => s + 1);
  };

  const handleBack = () => {
    setError("");
    setStep((s) => s - 1);
  };

  const handleSkip = () => {
    setError("");
    if (step === TOTAL_STEPS) {
      void handleFinish();
    } else {
      setStep((s) => s + 1);
    }
  };

  const handleFinish = async () => {
    if (!userProfile?.id) return;
    if (!businessName.trim()) {
      setError("Business name is required.");
      setStep(1);
      return;
    }
    if (packages.length === 0) {
      setError("Add at least one session type with a price before continuing.");
      setStep(2);
      return;
    }
    setError("");
    setFinishing(true);

    const encrypt = encStatus === "unlocked" ? encryptPII : (v: string) => Promise.resolve(v);
    const bankPayload: Record<BankField, string> = {
      bank_name: await encrypt(bankDetails.bank_name),
      bank_account_name: await encrypt(bankDetails.bank_account_name),
      bank_sort_code: await encrypt(bankDetails.bank_sort_code),
      bank_account_number: await encrypt(bankDetails.bank_account_number),
      bank_payment_reference: await encrypt(bankDetails.bank_payment_reference),
    };

    const { error: updateError } = await supabase
      .from("practice_settings")
      .update({
        business_name: businessName.trim(),
        onboarding_required: false,
        use_client_codenames: enableCodenames,
        ...bankPayload,
      })
      .eq("admin_id", userProfile.id);
    setFinishing(false);
    if (updateError) {
      showToast("Failed to save setup.", "danger");
      return;
    }
    await refreshPracticeSettings();
    navigate("/admin");
  };

  const firstName = userProfile?.first_name;

  return (
    <div className={styles.page}>
      <ImageBlurBlock
        imageUrl="/pexels-amirali-shaghaghi-18428647.jpg"
        photographer="Amirali Shaghaghi"
        sourceLabel="Pexels"
        creditUrl="https://www.pexels.com/@amirali-shaghaghi-479660570/"
      />
      <div className={styles.container}>
        <div className={styles.logoWrap}>
          <LeafLogoMark size={48} />
          <div className={styles.logoText}>
            <h1 className={styles.logoTitle}>Clarity</h1>
            <p className={styles.logoSub}>
              {firstName ? `Welcome, ${firstName} — let's get set up` : "Set up your practice"}
            </p>
          </div>
        </div>

        <Card className={styles.card}>
          <div className={styles.stepDots} aria-label={`Step ${step} of ${TOTAL_STEPS}`}>
            {STEP_TITLES.map((title, i) => (
              <div key={title} className={`${styles.stepDot} ${step >= i + 1 ? styles.stepDotActive : ""}`} />
            ))}
          </div>

          <h2 className={styles.stepHeading}>{STEP_TITLES[step - 1]}</h2>

          {step === 1 && (
            <div className={styles.section}>
              <p className={styles.sectionHint}>Shown on client-facing emails and payment receipts.</p>
              <div className={styles.field}>
                <label htmlFor="setup-business-name">Business name</label>
                <input
                  id="setup-business-name"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="e.g. Sarah Smith Therapy"
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className={styles.section}>
              <p className={styles.sectionHint}>
                At least one is required — this is what you'll pick from when booking a client's session.
              </p>
              {packages.length > 0 && (
                <ul className={styles.packageList}>
                  {packages.map((p) => (
                    <li key={p.id} className={styles.packageItem}>
                      <span>
                        {p.name}
                        <span className={styles.packageMeta}>
                          {" "}
                          — £{(p.price_pence / 100).toFixed(2)} · {p.duration_minutes} min
                        </span>
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => handleRemovePackage(p.id)}>
                        Remove
                      </Button>
                    </li>
                  ))}
                </ul>
              )}
              <div className={styles.packageRow}>
                <div className={styles.field}>
                  <label htmlFor="setup-pkg-name">Name</label>
                  <input
                    id="setup-pkg-name"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Standard session"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="setup-pkg-price">Price (£)</label>
                  <input
                    id="setup-pkg-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    placeholder="60.00"
                  />
                </div>
                <div className={styles.field}>
                  <label htmlFor="setup-pkg-duration">Duration (min)</label>
                  <input
                    id="setup-pkg-duration"
                    type="number"
                    min="5"
                    value={newDuration}
                    onChange={(e) => setNewDuration(e.target.value)}
                  />
                </div>
                <Button size="sm" onClick={handleAddPackage} disabled={!newName.trim() || !newPrice || addingPackage}>
                  {addingPackage ? "Adding…" : "+ Add"}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className={styles.section}>
              <p className={styles.sectionHint}>
                Optional — hides real client names in your admin UI in favour of codenames. You can turn this on or off
                anytime in Settings → Practice → Client codenames.
              </p>
              <label className={styles.toggleRow}>
                <span className={styles.toggleLabel}>
                  <strong>
                    Use codenames{" "}
                    <InfoTooltip text="Show codenames instead of real names in your admin UI. Set each client's codename from their profile page — if none is set, their real name is used as a fallback." />
                  </strong>
                </span>
                <span className={`${styles.toggleSwitch} ${enableCodenames ? styles.toggleSwitchOn : ""}`}>
                  <input
                    type="checkbox"
                    aria-label="Use codenames"
                    className={styles.toggleInput}
                    checked={enableCodenames}
                    onChange={(e) => setEnableCodenames(e.target.checked)}
                  />
                  <span className={styles.toggleThumb} />
                </span>
              </label>
            </div>
          )}

          {step === 4 && (
            <div className={styles.section}>
              <p className={styles.sectionHint}>
                Optional —{" "}
                <InfoTooltip
                  variant="rich"
                  title="What's a client onboarding form?"
                  text={
                    "An onboarding form is an optional consent or intake document new clients read and agree to before they can use the app — things like your confidentiality policy or terms of working together.\n\n" +
                    "Build one anytime under Forms → Onboarding, then turn it on for new clients in Settings → Practice → Client consent. Both stay available after setup — nothing here is required right now."
                  }
                />{" "}
                nothing to fill in on this screen.
              </p>
            </div>
          )}

          {step === 5 && (
            <div className={styles.section}>
              <p className={styles.sectionHint}>
                Optional — only needed if you want to offer bank transfer as a payment option. Skip this if you're using
                Stripe card payments only.
              </p>
              <div className={styles.bankGrid}>
                {BANK_FIELDS.map((f) => (
                  <div className={styles.field} key={f.key}>
                    <label htmlFor={`setup-${f.key}`}>{f.label}</label>
                    <input
                      id={`setup-${f.key}`}
                      value={bankDetails[f.key]}
                      onChange={(e) => setBankDetails((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      placeholder={f.placeholder}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.stepNav}>
            <div className={styles.stepNavLeft}>
              {SKIPPABLE_STEPS.has(step) && (
                <button type="button" className={styles.skipBtn} onClick={handleSkip}>
                  Skip
                </button>
              )}
            </div>
            <div className={styles.stepNavRight}>
              {step > 1 && (
                <button type="button" className={styles.backBtn} onClick={handleBack}>
                  Back
                </button>
              )}
              {step < TOTAL_STEPS ? (
                <Button onClick={handleContinue} className={styles.stepSubmitBtn}>
                  Continue
                </Button>
              ) : (
                <Button onClick={handleFinish} disabled={finishing} className={styles.stepSubmitBtn}>
                  {finishing ? "Saving…" : "Finish setup"}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <p className={styles.footer}>
          Wrong account?{" "}
          <button type="button" className={styles.signOutLink} onClick={() => signOut()}>
            Sign out
          </button>
        </p>
      </div>
    </div>
  );
}
