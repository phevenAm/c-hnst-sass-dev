import { useCallback, useEffect, useState } from "react";

import dayjs from "dayjs";

import Button from "@components/shared/Button/Button";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { DocumentSignatureSummaryRow } from "@models/globalTypes";
import { useAppDispatch, useAppSelector } from "@store/hooks";
import {
  createPracticeDocument,
  deletePracticeDocument,
  fetchPracticeDocuments,
  reorderPracticeDocuments,
  selectPracticeDocuments,
  setSignatureDocument,
  updatePracticeDocument,
} from "@store/slices/practiceDocumentsSlice";

import { supabase } from "@/lib/supabase";

import styles from "./OnboardingDocumentsManager.module.scss";

// Settings → Practice → "Onboarding documents". Admins upload the PDF
// housekeeping material clients see under Resources → Onboarding, and mark
// at most one as the document that needs signing (which drives the client
// consent gate — see practiceDocumentsSlice.setSignatureDocument).
export default function OnboardingDocumentsManager() {
  const dispatch = useAppDispatch();
  const { userProfile, isDemo } = useAuth();
  const { showToast } = useToast();
  const documents = useAppSelector(selectPracticeDocuments);
  const adminId = userProfile?.id ?? "";

  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newPdfUrl, setNewPdfUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [editPdfUrl, setEditPdfUrl] = useState("");

  const [summary, setSummary] = useState<DocumentSignatureSummaryRow[] | null>(null);
  const [showSigners, setShowSigners] = useState(false);

  const signatureDoc = documents.find((d) => d.requires_signature);

  useEffect(() => {
    dispatch(fetchPracticeDocuments());
  }, [dispatch]);

  const loadSummary = useCallback(async () => {
    const { data } = await supabase.rpc("get_document_signature_summary");
    setSummary((data as DocumentSignatureSummaryRow[]) ?? []);
  }, []);

  useEffect(() => {
    if (signatureDoc) loadSummary();
    else setSummary(null);
  }, [signatureDoc, loadSummary]);

  const guardDemo = () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return true;
    }
    return false;
  };

  const handleAdd = async () => {
    if (guardDemo()) return;
    if (!newTitle.trim()) {
      showToast("Give the document a title.", "danger");
      return;
    }
    setAdding(true);
    const res = await dispatch(
      createPracticeDocument({
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        pdf_url: newPdfUrl.trim() || null,
        sort_order: documents.length,
      }),
    );
    setAdding(false);
    if (createPracticeDocument.fulfilled.match(res)) {
      setNewTitle("");
      setNewDesc("");
      setNewPdfUrl("");
      showToast("Document added.");
    } else {
      showToast("Couldn't add the document.", "danger");
    }
  };

  const startEdit = (id: string) => {
    const d = documents.find((doc) => doc.id === id);
    if (!d) return;
    setEditingId(id);
    setEditTitle(d.title);
    setEditDesc(d.description ?? "");
    setEditPdfUrl(d.pdf_url ?? "");
  };

  const handleSaveEdit = async () => {
    if (guardDemo() || !editingId) return;
    if (!editTitle.trim()) {
      showToast("Give the document a title.", "danger");
      return;
    }
    const res = await dispatch(
      updatePracticeDocument({
        id: editingId,
        title: editTitle.trim(),
        description: editDesc.trim() || null,
        pdf_url: editPdfUrl.trim() || null,
      }),
    );
    if (updatePracticeDocument.fulfilled.match(res)) {
      setEditingId(null);
      showToast("Saved.");
    } else {
      showToast("Couldn't save changes.", "danger");
    }
  };

  const handleDelete = async (id: string) => {
    if (guardDemo()) return;
    if (!window.confirm("Delete this document? Clients will no longer see it.")) return;
    const res = await dispatch(deletePracticeDocument(id));
    if (deletePracticeDocument.fulfilled.match(res)) showToast("Document deleted.");
    else showToast("Couldn't delete the document.", "danger");
  };

  const handleMove = (id: string, dir: -1 | 1) => {
    if (guardDemo()) return;
    const ids = documents.map((d) => d.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    dispatch(reorderPracticeDocuments(ids));
  };

  const handleSetSignature = async (id: string | null) => {
    if (guardDemo() || !adminId) return;
    const res = await dispatch(setSignatureDocument({ documentId: id, adminId }));
    if (setSignatureDocument.fulfilled.match(res)) {
      showToast(id ? "Signature document set." : "No document requires a signature now.");
    } else {
      showToast("Couldn't update the signature document.", "danger");
    }
  };

  const signedCount = summary?.filter((r) => r.signed_at).length ?? 0;
  const clientCount = summary?.length ?? 0;

  return (
    <section className={styles.wrap}>
      <p className={styles.intro}>
        PDF housekeeping material your clients can read any time under <strong>Resources → Onboarding</strong> — working
        agreements, house rules, an info sheet. All are reference-only unless you mark one as needing a signature, which
        then becomes the document new clients must sign before they can use the app.
      </p>

      {documents.length > 0 && (
        <ul className={styles.list}>
          {documents.map((doc, idx) => (
            <li key={doc.id} className={styles.item}>
              {editingId === doc.id ? (
                <div className={styles.editForm}>
                  <label>
                    Title
                    <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                  </label>
                  <label>
                    Description <small>(optional)</small>
                    <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)} />
                  </label>
                  <PdfUpload adminId={adminId} value={editPdfUrl} onChange={setEditPdfUrl} />
                  <div className={styles.rowActions}>
                    <Button size="sm" onClick={handleSaveEdit}>
                      Save
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={styles.itemMain}>
                    <div className={styles.reorder}>
                      <button
                        type="button"
                        aria-label="Move up"
                        disabled={idx === 0}
                        onClick={() => handleMove(doc.id, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label="Move down"
                        disabled={idx === documents.length - 1}
                        onClick={() => handleMove(doc.id, 1)}
                      >
                        ↓
                      </button>
                    </div>
                    <div className={styles.itemText}>
                      <span className={styles.itemTitle}>{doc.title}</span>
                      {doc.description && <span className={styles.itemDesc}>{doc.description}</span>}
                      {!doc.pdf_url && <span className={styles.noPdf}>No PDF attached</span>}
                    </div>
                    <label className={styles.sigToggle}>
                      <input
                        type="radio"
                        name="signature-document"
                        checked={doc.requires_signature}
                        onChange={() => handleSetSignature(doc.id)}
                      />
                      Requires signature
                    </label>
                  </div>
                  <div className={styles.rowActions}>
                    {doc.pdf_url && (
                      <a href={doc.pdf_url} target="_blank" rel="noopener noreferrer" className={styles.linkBtn}>
                        View PDF
                      </a>
                    )}
                    <button type="button" className={styles.linkBtn} onClick={() => startEdit(doc.id)}>
                      Edit
                    </button>
                    <button type="button" className={styles.dangerBtn} onClick={() => handleDelete(doc.id)}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {signatureDoc && (
        <div className={styles.tally}>
          <button type="button" className={styles.linkBtn} onClick={() => setShowSigners((s) => !s)}>
            {signedCount} of {clientCount} client{clientCount === 1 ? "" : "s"} have signed “{signatureDoc.title}”
          </button>
          {showSigners && summary && (
            <ul className={styles.signerList}>
              {summary.map((r) => (
                <li key={r.user_id}>
                  <span>{r.client_name}</span>
                  <span>
                    {r.signed_at
                      ? `${r.signed_name ?? "Signed"} · ${dayjs(r.signed_at).format("D MMM YYYY")}`
                      : "Not signed yet"}
                  </span>
                </li>
              ))}
              {summary.length === 0 && <li>No active clients yet.</li>}
            </ul>
          )}
        </div>
      )}

      {documents.some((d) => d.requires_signature) && (
        <button type="button" className={styles.clearSig} onClick={() => handleSetSignature(null)}>
          Nobody needs to sign — clear the signature document
        </button>
      )}

      <div className={styles.addForm}>
        <h4>Add a document</h4>
        <label>
          Title
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="e.g. Working agreement" />
        </label>
        <label>
          Description <small>(optional — shown under the title)</small>
          <input value={newDesc} onChange={(e) => setNewDesc(e.target.value)} />
        </label>
        <PdfUpload adminId={adminId} value={newPdfUrl} onChange={setNewPdfUrl} />
        <Button size="sm" onClick={handleAdd} disabled={adding}>
          {adding ? "Adding…" : "Add document"}
        </Button>
      </div>
    </section>
  );
}
