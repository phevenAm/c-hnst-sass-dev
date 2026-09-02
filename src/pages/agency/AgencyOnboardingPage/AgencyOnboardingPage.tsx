import { type FormEvent, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import type { OnboardingAudience } from "@models/agency";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  deleteOnboardingItem,
  fetchOnboardingItems,
  saveOnboardingItem,
  selectAgency,
  selectIsAgencyManager,
  selectOnboardingItems,
} from "@store/slices/agencySlice";

import styles from "../agency.module.scss";

export default function AgencyOnboardingPage() {
  const dispatch = useAppDispatch();
  const isManager = useAppSelector(selectIsAgencyManager);
  const agency = useAppSelector(selectAgency);
  const items = useAppSelector(selectOnboardingItems);

  const [audience, setAudience] = useState<OnboardingAudience>("client");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    dispatch(fetchOnboardingItems());
  }, [dispatch]);

  if (!isManager) return <Navigate to="/agency/incoming" replace />;

  const visible = items.filter((i) => i.audience === audience);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!agency || !title.trim()) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        saveOnboardingItem({
          agency_id: agency.id,
          audience,
          title: title.trim(),
          body: body.trim() || null,
          url: url.trim() || null,
          sort_order: visible.length,
        }),
      ).unwrap();
      setTitle("");
      setBody("");
      setUrl("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't save the item");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Onboarding material</h1>
          <p className={styles.subtitle}>
            Notes and links shown to new people at your agency — one set for clients, one for counsellors.
          </p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <Button variant={audience === "client" ? "primary" : "ghost"} size="sm" onClick={() => setAudience("client")}>
          For clients
        </Button>
        <Button variant={audience === "admin" ? "primary" : "ghost"} size="sm" onClick={() => setAudience("admin")}>
          For counsellors
        </Button>
      </div>

      <form className={styles.formGrid} onSubmit={add} style={{ marginBottom: "var(--sp-6)" }}>
        {error && <div className={styles.error}>{error}</div>}
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ob-title">
            Title
          </label>
          <input
            id="ob-title"
            className={styles.input}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ob-body">
            Details
          </label>
          <textarea id="ob-body" className={styles.textarea} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>
        <div className={styles.field}>
          <label className={styles.label} htmlFor="ob-url">
            Link (optional)
          </label>
          <input id="ob-url" type="url" className={styles.input} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div>
          <Button type="submit" disabled={busy || !title.trim()}>
            Add item
          </Button>
        </div>
      </form>

      {visible.length === 0 ? (
        <p className={styles.empty}>Nothing here yet.</p>
      ) : (
        <div className={styles.list}>
          {visible.map((i) => (
            <div key={i.id} className={styles.row}>
              <div className={styles.rowMain}>
                <span className={styles.rowName}>{i.title}</span>
                {i.body && <span className={styles.rowMeta}>{i.body}</span>}
                {i.url && (
                  <a className={styles.rowMeta} href={i.url} target="_blank" rel="noreferrer">
                    {i.url}
                  </a>
                )}
              </div>
              <div className={styles.rowActions}>
                <Button size="sm" variant="ghost-danger" onClick={() => dispatch(deleteOnboardingItem(i.id))}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
