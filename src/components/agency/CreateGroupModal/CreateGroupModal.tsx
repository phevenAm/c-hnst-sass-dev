import { type FormEvent, useState } from "react";

import Button from "@components/shared/Button/Button";
import Modal from "@components/shared/Modal/Modal";
import { useToast } from "@context/ToastContext";
import form from "@pages/agency/agency.module.scss";
import { useAppDispatch } from "@store/hooks";
import { createGroup } from "@store/slices/groupsSlice";

import { getErrorMessage } from "@/Helpers/Helpers";

export default function CreateGroupModal({ agencyId, onClose }: { agencyId: string; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { showToast } = useToast();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setError("");
    setBusy(true);
    try {
      await dispatch(
        createGroup({ agency_id: agencyId, name: name.trim(), description: description.trim() || null }),
      ).unwrap();
      showToast("Group created.", "success");
      onClose();
    } catch (err) {
      setError(getErrorMessage(err, "Couldn't create the group"));
      setBusy(false);
    }
  };

  return (
    <Modal
      title="New group"
      onClose={onClose}
      actions={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || !name.trim()}>
            {busy ? "Creating…" : "Create group"}
          </Button>
        </>
      }
    >
      <form className={form.formGrid} onSubmit={submit}>
        {error && <div className={form.error}>{error}</div>}

        <div className={form.field}>
          <label className={form.label} htmlFor="cg-name">
            Group name
          </label>
          <input
            id="cg-name"
            className={form.input}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Tuesday evening anxiety group"
            required
          />
        </div>

        <div className={form.field}>
          <label className={form.label} htmlFor="cg-description">
            Description (optional)
          </label>
          <textarea
            id="cg-description"
            className={form.textarea}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Who it's for, what it covers, anything staff should know."
          />
        </div>
      </form>
    </Modal>
  );
}
