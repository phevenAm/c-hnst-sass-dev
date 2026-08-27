import { useEffect, useState } from "react";

import dayjs from "dayjs";

import Card from "@components/shared/Card/Card";
import PdfViewer from "@components/shared/PdfViewer/PdfViewer";
import Spinner from "@components/shared/Spinner/Spinner";

import { supabase } from "@/lib/supabase";

import styles from "./AgreementView.module.scss";

type ConsentSettings = {
  consent_title: string;
  consent_body: string;
  consent_pdf_url: string | null;
};

interface Props {
  signedName: string | null;
  signedAt: string | null;
}

// Shows an already-signed consent / onboarding agreement back to the client
// who signed it — any time after the fact. Unlike useConsentPending this does
// NOT gate on has_consented; the caller decides when to render it (client
// Resources → Onboarding, and Check-in → Onboarding once nothing's pending).
export default function AgreementView({ signedName, signedAt }: Props) {
  const [settings, setSettings] = useState<ConsentSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.rpc("get_my_admin_consent_settings").then(({ data }) => {
      setSettings(data?.[0] ?? null);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <Spinner />;

  if (!settings) {
    return <p className={styles.empty}>Your agreement details aren't available right now.</p>;
  }

  return (
    <Card>
      <div className={styles.agreementBody}>
        <h2 className={styles.agreementTitle}>{settings.consent_title}</h2>

        {settings.consent_body && (
          <div className={styles.agreementText}>
            {settings.consent_body.split("\n").map((line, i) =>
              line.trim() === "" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text split by line, never reordered
                <br key={i} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text split by line, never reordered
                <p key={i}>{line}</p>
              ),
            )}
          </div>
        )}

        {settings.consent_pdf_url && <PdfViewer url={settings.consent_pdf_url} title={settings.consent_title} />}

        <p className={styles.agreementSigned}>
          {signedName ? `Signed by ${signedName}` : "Signed"}
          {signedAt ? ` on ${dayjs(signedAt).format("D MMM YYYY")}` : ""}
        </p>
      </div>
    </Card>
  );
}
