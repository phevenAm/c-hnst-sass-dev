import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useAuth } from "@context/AuthContext";
import { supabase } from "@lib/supabase";
import type { Database } from "@models/database.types";

import styles from "../../AdminClientsPage.module.scss";

const TOKEN_TABLE_NAME = "platform_access_token";

type AccessToken = Database["public"]["Tables"][TOKEN_TABLE_NAME]["Row"];

export default function ManageTokensModal({ onClose }: { onClose: () => void }) {
  const { isDemo } = useAuth();
  const [allTokens, setAllTokens] = useState<AccessToken[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    const fetchTokens = async () => {
      const { data, error } = await supabase
        .from(TOKEN_TABLE_NAME)
        .select("id, token, is_used, created_at, expires_at, used_at")
        .order("created_at", { ascending: false });

      if (error) {
        setError(error.message);
      } else {
        setAllTokens(data ?? []);
      }
      setLoading(false);
    };

    fetchTokens();
  }, []);

  const handleDeleteToken = async (id: number) => {
    if (isDemo) {
      setError("Demo mode — changes are not saved.");
      return;
    }
    setDeletingId(id);
    const { error } = await supabase.from(TOKEN_TABLE_NAME).delete().eq("id", id);

    if (error) {
      setError(error.message);
    } else {
      setAllTokens((prev) => prev.filter((item) => item.id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
    setDeletingId(null);
  };

  const handleUpdateToken = async (id: number) => {
    if (isDemo) {
      setError("Demo mode — changes are not saved.");
      return;
    }
    setUpdatingId(id);
    const { error } = await supabase.from(TOKEN_TABLE_NAME).update({ is_used: false }).eq("id", id);

    if (error) {
      setError(error.message);
    } else {
      setAllTokens((prev) => prev.map((token) => (token.id === id ? { ...token, is_used: false } : token)));
    }
    setUpdatingId(null);
  };

  const handleBatchDelete = async () => {
    if (isDemo) {
      setError("Demo mode — changes are not saved.");
      return;
    }
    const ids = Array.from(selectedIds);
    const { error } = await supabase.from(TOKEN_TABLE_NAME).delete().in("id", ids);

    if (error) {
      setError(error.message);
      return;
    }

    setAllTokens((prev) => prev.filter((token) => !selectedIds.has(token.id)));
    setSelectedIds(new Set());
  };

  let modalBody = null;

  if (loading) {
    modalBody = <p className={styles.empty}>Loading...</p>;
  } else if (allTokens.length === 0) {
    modalBody = <p className={styles.empty}>No tokens yet.</p>;
  } else {
    modalBody = (
      <div className={styles.tokenTableWrap}>
        <div className={styles.tokenTableHeader}>
          <label className={styles.checkboxLabel} htmlFor="selectAll">
            <input
              type="checkbox"
              id="selectAll"
              checked={selectedIds.size === allTokens.length}
              onChange={() => {
                if (selectedIds.size === allTokens.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(allTokens.map((t) => t.id)));
              }}
            />
            <span>{selectedIds.size === allTokens.length ? "Deselect all" : "Select all"}</span>
          </label>

          {selectedIds.size > 0 && (
            <div className={styles.bulkActions}>
              <Button variant="ghost" size="sm">
                Renew selected
              </Button>
              <Button variant="ghost-danger" size="sm" onClick={handleBatchDelete}>
                Delete selected
              </Button>
            </div>
          )}
        </div>

        <ul className={styles.tokenList}>
          {allTokens.map((t) => (
            <li key={t.id} className={styles.tokenRow}>
              <input
                type="checkbox"
                className={styles.tokenCheckbox}
                checked={selectedIds.has(t.id)}
                onChange={() => {
                  setSelectedIds((prev) => {
                    const next = new Set(prev);
                    if (next.has(t.id)) next.delete(t.id);
                    else next.add(t.id);
                    return next;
                  });
                }}
              />
              <div className={styles.tokenMeta}>
                <span className={styles.tokenValue}>{t.token}</span>
                <span className={t.is_used ? styles.badgeUsed : styles.badgeAvailable}>
                  {t.is_used ? "Used" : "Available"}
                </span>
              </div>
              <div className={styles.tokenRowActions}>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleUpdateToken(t.id)}
                  disabled={updatingId === t.id || !t.is_used}
                >
                  {updatingId === t.id ? "..." : "Renew"}
                </Button>
                <Button
                  variant="ghost-danger"
                  size="sm"
                  onClick={() => handleDeleteToken(t.id)}
                  disabled={deletingId === t.id}
                >
                  {deletingId === t.id ? "..." : "Delete"}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <Modal title="Manage Access Tokens" onClose={onClose} size="lg">
      {error && <p className={styles.modalError}>{error}</p>}
      {modalBody}
    </Modal>
  );
}
