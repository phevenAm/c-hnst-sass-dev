import { useEffect, useState } from "react";

import { KEYWORDS } from "@constants/constants";

import { isPageStatusLoading, pickColor } from "@Helpers/Helpers";
import Avatar from "@components/shared/Avatar/Avatar";
import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import UploadAndDisplayImage from "@components/shared/UploadAndDisplayImage/UploadAndDisplayImage";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";

import Spinner from "@/components/shared/Spinner/Spinner";
import { supabase } from "@/lib/supabase";
import DeleteUserModal from "./DeleteUserModal/DeleteUserModal";

import styles from "./SettingsPage.module.scss";

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
  { key: "bank_payment_reference", label: "Payment reference", placeholder: "e.g. WithMe — use your name as ref" },
] as const;

type BankField = (typeof BANK_FIELDS)[number]["key"];

const SettingsPage = () => {
  const { userProfile, updateProfile, isAdmin, isDemo, loading } = useAuth();
  const { showToast } = useToast();
  const [name, setName] = useState(userProfile?.display_name ?? "");
  const [imageUrl, setImageUrl] = useState(userProfile?.avatar_url ?? "");
  const [keywords, setKeywords] = useState<string[]>(userProfile?.focus_keywords ?? []);
  const [saving, setSaving] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

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
  const [stripeConnected, setStripeConnected] = useState(false);

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
      .then(({ data }) => {
        if (data) {
          setPracticeDetails(data as Record<BusinessField, string>);
          setLogoUrl(data.logo_url ?? "");
          setBankDetails({
            bank_name: data.bank_name ?? "",
            bank_account_name: data.bank_account_name ?? "",
            bank_sort_code: data.bank_sort_code ?? "",
            bank_account_number: data.bank_account_number ?? "",
            bank_payment_reference: data.bank_payment_reference ?? "",
          });
          setStripeConnected(data.stripe_connect_onboarded ?? false);
        }
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
    await supabase.from("practice_settings").update(bankDetails).eq("admin_id", userProfile.id);
    setSavingBank(false);
    showToast("Bank details updated.");
  };

  const handleUpdateBusiness = async () => {
    if (!userProfile?.id) return;
    setSavingBusiness(true);
    await supabase
      .from("practice_settings")
      .update({ ...practiceDetails, logo_url: logoUrl || null })
      .eq("admin_id", userProfile.id);
    setSavingBusiness(false);
    showToast("Business information updated.");
  };

  // const guard = isPageStatusLoading();
  // if (guard) return guard;
  if (loading || !userProfile)
    return (
      <div className="page">
        <Spinner />
      </div>
    );

  return (
    <div className="page">
      <div className={`inner ${styles.columns}`}>
        <div className={styles.pageHeader}>
          <h1>Settings</h1>
          <p>{isAdmin ? "Update your profile and business information" : "Update or remove your profile"}</p>
        </div>

        {/* ── Profile card ── */}
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
                  <UploadAndDisplayImage userId={userProfile?.id ?? ""} onUpload={(url) => setImageUrl(url)} />
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
            {!isAdmin && !isDemo && (
              <div className={styles.deleteAccountBlock}>
                <Button variant="ghost-danger" size="sm" onClick={() => setIsDeleteModalOpen(true)}>
                  Delete account
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* ── Business info card (admin only) ── */}
        {isAdmin && (
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
        )}

        {/* ── Bank details card (admin only) ── */}
        {isAdmin && (
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
        )}
      </div>

        {/* ── Stripe Connect card (admin only) ── */}
        {isAdmin && (
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
        )}
      </div>
  isDeleteModalOpen && <DeleteUserModal onClose={() => setIsDeleteModalOpen(false)} />;
  </div>
  )
};

export default SettingsPage;
