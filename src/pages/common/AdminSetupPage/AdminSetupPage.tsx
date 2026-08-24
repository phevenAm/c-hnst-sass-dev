import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { ClarityLogoMark } from "@components/shared/Icons/Icons";
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

// First-run gate for admins who signed up after onboarding_required shipped
// (20260824000003) — existing admins are grandfathered and never see this.
// Blocks the rest of the app until business info + at least one session
// package exist, then flips practice_settings.onboarding_required to false.
// Bank details are offered here too (same encrypted-at-rest fields Settings
// uses) since a client can't be shown "how to pay" details for a payment
// method that was never filled in — but they're optional, since Stripe
// Connect alone is a valid setup with no bank transfer support at all.
export default function AdminSetupPage() {
  const { userProfile, practiceSettings, refreshPracticeSettings, signOut } = useAuth();
  const { status: encStatus, encryptPII } = useEncryption();
  const { showToast } = useToast();
  const navigate = useNavigate();

  const [businessName, setBusinessName] = useState(practiceSettings?.business_name ?? "");
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

  const handleFinish = async () => {
    if (!userProfile?.id) return;
    if (!businessName.trim()) {
      setError("Business name is required.");
      return;
    }
    if (packages.length === 0) {
      setError("Add at least one session type with a price before continuing.");
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
      .update({ business_name: businessName.trim(), onboarding_required: false, ...bankPayload })
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
    <div className={styles.wrap}>
      <header className={styles.header}>
        <span className={styles.brand}>
          <ClarityLogoMark size={28} />
          Clarity
        </span>
        <button type="button" className={styles.signOutLink} onClick={() => signOut()}>
          Sign out
        </button>
      </header>

      <div className={styles.content}>
        <Card className={styles.card}>
          <h1 className={styles.title}>
            {firstName ? `Welcome, ${firstName} — let's get set up` : "Set up your practice"}
          </h1>
          <p className={styles.intro}>
            Three quick things before you're in: your practice name (clients see this on receipts and emails), at least
            one session type with a price (so you can actually book a session), and — if you plan to take bank transfers
            — your account details. Everything here can be changed later in Settings.
          </p>

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Business information</h2>
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

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Session types & prices</h2>
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

          <div className={styles.section}>
            <h2 className={styles.sectionTitle}>Bank details</h2>
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

          {error && <p className={styles.error}>{error}</p>}

          <div className={styles.actions}>
            <Button onClick={handleFinish} disabled={finishing}>
              {finishing ? "Saving…" : "Finish setup"}
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
