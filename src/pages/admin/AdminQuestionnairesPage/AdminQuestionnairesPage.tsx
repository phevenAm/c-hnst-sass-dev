import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import Modal from "@components/shared/Modal/Modal";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { ClientStub, Questionnaire, QuestionnaireFrequency, Tag, UserProfile } from "@models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchClientStubs, selectAllStubs } from "@store/slices/clientStubsSlice";
import {
  assignQuestionnaire,
  fetchAssignmentsByQuestionnaire,
  selectAssignmentsByQuestionnaire,
  unassignQuestionnaireByIds,
} from "@store/slices/questionnaireAssignmentsSlice";
import {
  createQuestionnaire,
  deleteQuestionnaire,
  fetchQuestionnaires,
  pauseQuestionnaire,
  selectAllQuestionnaires,
  updateQuestionnaire,
  updateQuestionTag,
} from "@store/slices/questionnairesSlice";
import { createTag, deleteTag, fetchTags, selectAllTags, selectTagsStatus, updateTag } from "@store/slices/tagsSlice";
import { fetchAllUsers, selectClientUsers } from "@store/slices/userDirectorySlice";

import { clientDisplayName, isPageStatusLoading } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase.js";

import styles from "./AdminQuestionnairesPage.module.scss";

type FormTab = "outcome_measure" | "feedback" | "onboarding";

const TABS: { id: FormTab; label: string }[] = [
  { id: "outcome_measure", label: "Outcome Measures" },
  { id: "feedback", label: "Feedback Forms" },
  { id: "onboarding", label: "Onboarding" },
];

type OptionDraft = { label: string; value: number };

type QuestionDraft = {
  id: string;
  text: string;
  type: string;
  min: number;
  max: number;
  minLabel: string;
  maxLabel: string;
  orderIndex: number;
  is_required: boolean;
  tag_id: string | null;
  options: OptionDraft[];
};

type QuestionnaireFormData = {
  title: string;
  description: string;
  frequency: QuestionnaireFrequency | null;
  form_type: string;
  pdf_url: string | null;
  questions: QuestionDraft[];
};

const QUESTION_TYPES = ["scale", "text", "multiple_choice"];

function makeBlankQuestion(index: number): QuestionDraft {
  return {
    id: `nq-${Date.now()}-${index}`,
    text: "",
    type: "scale",
    min: 1,
    max: 10,
    minLabel: "",
    maxLabel: "",
    orderIndex: index,
    is_required: true,
    tag_id: null,
    options: [],
  };
}

// ─── Question builder form (shared by create + edit) ───────

function QuestionnaireBuilder({
  initial,
  tags,
  defaultFormType,
  onSave,
  onClose,
}: {
  initial?: Questionnaire | null;
  tags: Tag[];
  defaultFormType?: FormTab;
  onSave: (data: QuestionnaireFormData) => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDesc] = useState(initial?.description ?? "");
  const [formType, setFormType] = useState<string>((initial as any)?.form_type ?? defaultFormType ?? "outcome_measure");
  const [frequency, setFrequency] = useState<QuestionnaireFrequency | null>(initial?.frequency ?? "weekly");
  const [pdfUrl, setPdfUrl] = useState((initial as any)?.pdf_url ?? "");
  const [questions, setQuestions] = useState<QuestionDraft[]>(
    initial?.questions?.map((q) => ({
      id: q.id,
      text: q.text,
      type: q.type,
      min: q.min_value ?? 1,
      max: q.max_value ?? 10,
      minLabel: q.min_label ?? "",
      maxLabel: q.max_label ?? "",
      orderIndex: q.order_index,
      is_required: q.is_required,
      tag_id: q.tag_id ?? null,
      options: (q as any).options ?? [],
    })) ?? [makeBlankQuestion(1)],
  );

  const [creatingTagFor, setCreatingTagFor] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");

  const addQuestion = () => setQuestions((qs) => [...qs, makeBlankQuestion(qs.length + 1)]);

  const removeQuestion = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const updateQuestion = (id: string, field: string, value: string | number | null) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, [field]: value } : q)));

  const addOption = (questionId: string) =>
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === questionId ? { ...q, options: [...q.options, { label: "", value: q.options.length }] } : q,
      ),
    );

  const updateOption = (questionId: string, idx: number, field: "label" | "value", val: string | number) =>
    setQuestions((qs) =>
      qs.map((q) =>
        q.id === questionId
          ? {
              ...q,
              options: q.options.map((o, i) => (i === idx ? { ...o, [field]: val } : o)),
            }
          : q,
      ),
    );

  const removeOption = (questionId: string, idx: number) =>
    setQuestions((qs) =>
      qs.map((q) => (q.id === questionId ? { ...q, options: q.options.filter((_, i) => i !== idx) } : q)),
    );

  const { isDemo, userProfile } = useAuth();
  const { showToast } = useToast();

  const handleCreateTag = async (questionId: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (!newTagName.trim()) return;
    const result = await dispatch(createTag({ name: newTagName.trim() }));
    if (createTag.fulfilled.match(result)) {
      updateQuestion(questionId, "tag_id", result.payload.id);
    }
    setCreatingTagFor(null);
    setNewTagName("");
  };

  const handleSave = () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      onClose();
      return;
    }
    if (!title.trim() || questions.some((q) => !q.text.trim())) {
      alert("Please fill in a title and all question texts");
      return;
    }
    onSave({
      title,
      description,
      frequency: frequency ?? null,
      form_type: formType,
      pdf_url: formType === "onboarding" ? pdfUrl.trim() || null : null,
      questions,
    });
    onClose();
  };

  const modalObj = {
    title: isEdit ? "Edit form" : "New form",
    actions: (
      <div className={styles.modalActions}>
        <Button onClick={handleSave}>{isEdit ? "Save changes" : "Save form"}</Button>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    ),
    onClose,
    size: "md" as const,
  };

  return (
    <Modal {...modalObj}>
      <div className={styles.metaGrid}>
        <div className={`${styles.formField} ${styles.fullCol}`}>
          <label htmlFor="q-title">Title *</label>
          <input
            id="q-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Weekly Wellbeing Check"
          />
        </div>
        <div className={`${styles.formField} ${styles.fullCol}`}>
          <label htmlFor="q-desc">Description</label>
          <input
            id="q-desc"
            value={description}
            onChange={(e) => setDesc(e.target.value)}
            placeholder="Brief description for your client"
          />
        </div>
        <div className={styles.formField}>
          <label htmlFor="q-type">Form type</label>
          <select id="q-type" value={formType} onChange={(e) => setFormType(e.target.value)} disabled={isEdit}>
            <option value="outcome_measure">Outcome Measure</option>
            <option value="feedback">Feedback Form</option>
            <option value="onboarding">Onboarding</option>
          </select>
        </div>
        {formType === "outcome_measure" && (
          <div className={styles.formField}>
            <label htmlFor="q-freq">Frequency</label>
            <select
              id="q-freq"
              value={frequency ?? ""}
              onChange={(e) => setFrequency((e.target.value || null) as QuestionnaireFrequency | null)}
            >
              <option value="">One-time (no repeat)</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="fortnightly">Fortnightly</option>
            </select>
          </div>
        )}
        {formType === "onboarding" && (
          <div className={`${styles.formField} ${styles.fullCol}`}>
            <label htmlFor="q-pdf">PDF link (optional)</label>
            <input
              id="q-pdf"
              type="url"
              value={pdfUrl}
              onChange={(e) => setPdfUrl(e.target.value)}
              placeholder="https://example.com/document.pdf"
            />
            <PdfUpload adminId={userProfile?.id ?? ""} value={pdfUrl} onChange={setPdfUrl} />
            <p className={styles.fieldHint}>
              A form linked as your client consent document (Settings → Practice) shows this alongside its title —
              useful for terms, an info sheet, or anything clients should read before agreeing.
            </p>
          </div>
        )}
      </div>

      <div className={styles.questionsSection}>
        <div className={styles.questionsSectionHeader}>
          <h3>Questions</h3>
          <Button variant="secondary" size="sm" onClick={addQuestion}>
            + Add question
          </Button>
        </div>
        {questions.map((q, i) => (
          <div key={q.id} className={styles.questionBlock}>
            <div className={styles.questionBlockHeader}>
              <span className={styles.questionNum}>Q{i + 1}</span>
              {questions.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeQuestion(q.id)}
                  aria-label={`Remove question ${i + 1}`}
                  className={styles.removeBtn}
                >
                  ×
                </button>
              )}
            </div>
            <input
              value={q.text}
              onChange={(e) => updateQuestion(q.id, "text", e.target.value)}
              placeholder="Question text…"
              className={styles.questionTextInput}
            />
            <div className={styles.questionInputs}>
              <select
                aria-label="Question type"
                value={q.type}
                onChange={(e) => updateQuestion(q.id, "type", e.target.value)}
              >
                {QUESTION_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t === "scale" ? "Scale (numeric)" : t === "text" ? "Free text" : "Multiple choice"}
                  </option>
                ))}
              </select>
              {q.type === "scale" && (
                <>
                  <input
                    value={q.minLabel}
                    onChange={(e) => updateQuestion(q.id, "minLabel", e.target.value)}
                    placeholder="Low label"
                  />
                  <input
                    value={q.maxLabel}
                    onChange={(e) => updateQuestion(q.id, "maxLabel", e.target.value)}
                    placeholder="High label"
                  />
                  <div className={styles.tagField}>
                    <span>Chart tag</span>
                    {creatingTagFor === q.id ? (
                      <div className={styles.newTagInline}>
                        <input
                          // biome-ignore lint/a11y/noAutofocus: intentional focus when user requests new tag
                          autoFocus
                          value={newTagName}
                          onChange={(e) => setNewTagName(e.target.value)}
                          placeholder="Tag name (e.g. Sleep)"
                          onKeyDown={(e) => e.key === "Enter" && handleCreateTag(q.id)}
                        />
                        <button type="button" onClick={() => handleCreateTag(q.id)}>
                          Add
                        </button>
                        <button type="button" onClick={() => setCreatingTagFor(null)}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <select
                        aria-label="Chart tag"
                        value={q.tag_id ?? ""}
                        onChange={(e) => {
                          if (e.target.value === "__new__") {
                            setCreatingTagFor(q.id);
                          } else {
                            updateQuestion(q.id, "tag_id", e.target.value || null);
                          }
                        }}
                      >
                        <option value="">No tag</option>
                        {tags.map((tag) => (
                          <option key={tag.id} value={tag.id}>
                            {tag.name}
                          </option>
                        ))}
                        <option value="__new__">+ Create new tag…</option>
                      </select>
                    )}
                  </div>
                </>
              )}
            </div>
            {q.type === "multiple_choice" && (
              <div className={styles.optionsEditor}>
                <div className={styles.optionsEditorHeader}>
                  <span>Options</span>
                  <button type="button" className={styles.addOptionBtn} onClick={() => addOption(q.id)}>
                    + Add option
                  </button>
                </div>
                {q.options.length === 0 && <p className={styles.optionsHint}>Add the choices a client will see.</p>}
                {q.options.map((opt, oi) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: options have no stable id
                  <div key={oi} className={styles.optionRow}>
                    <input
                      placeholder="Label (e.g. Not at all)"
                      value={opt.label}
                      onChange={(e) => updateOption(q.id, oi, "label", e.target.value)}
                    />
                    <input
                      type="number"
                      placeholder="Score"
                      value={opt.value}
                      onChange={(e) => updateOption(q.id, oi, "value", Number(e.target.value))}
                      className={styles.optionValueInput}
                    />
                    <button
                      type="button"
                      onClick={() => removeOption(q.id, oi)}
                      aria-label="Remove option"
                      className={styles.removeBtn}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </Modal>
  );
}

// ─── Assign modal ───────────────────────────────────────────

function AssignModal({
  questionnaire,
  clients,
  stubs,
  onClose,
}: {
  questionnaire: Questionnaire;
  clients: UserProfile[];
  stubs: ClientStub[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { isDemo, practiceSettings, userProfile } = useAuth();
  const useCodenames = practiceSettings?.use_client_codenames ?? false;
  const { showToast } = useToast();
  const assignments = useAppSelector(selectAssignmentsByQuestionnaire(questionnaire.id));
  const assignedIds = new Set(assignments.map((a) => a.user_id));

  const [stubAssignedIds, setStubAssignedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase
      .from("questionnaire_assignments")
      .select("stub_id")
      .eq("questionnaire_id", questionnaire.id)
      .not("stub_id", "is", null)
      .then(({ data }) => {
        if (data) setStubAssignedIds(new Set(data.map((r: { stub_id: string }) => r.stub_id)));
      });
  }, [questionnaire.id]);

  const toggle = (userId: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (assignedIds.has(userId)) {
      dispatch(unassignQuestionnaireByIds({ questionnaire_id: questionnaire.id, user_id: userId }));
    } else {
      dispatch(assignQuestionnaire({ questionnaire_id: questionnaire.id, user_id: userId }));
      supabase.functions.invoke("notify-questionnaire-assigned", {
        body: { user_id: userId, questionnaire_id: questionnaire.id },
      });
    }
  };

  const toggleStub = async (stubId: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (stubAssignedIds.has(stubId)) {
      await supabase
        .from("questionnaire_assignments")
        .delete()
        .eq("questionnaire_id", questionnaire.id)
        .eq("stub_id", stubId);
      setStubAssignedIds((prev) => {
        const s = new Set(prev);
        s.delete(stubId);
        return s;
      });
    } else {
      await supabase.from("questionnaire_assignments").insert({
        questionnaire_id: questionnaire.id,
        stub_id: stubId,
      });
      setStubAssignedIds((prev) => new Set([...prev, stubId]));
    }
  };

  const stubDisplayName = (s: ClientStub) =>
    useCodenames ? s.codename || `${s.first_name} ${s.last_name}` : `${s.first_name} ${s.last_name}`;

  return (
    <Modal title="Assign clients" onClose={onClose}>
      <p className={styles.assignSubtitle}>
        Select which clients should receive <strong>{questionnaire.title}</strong>.
      </p>

      {clients.length === 0 && stubs.length === 0 ? (
        <p className={styles.emptyText}>No clients found.</p>
      ) : (
        <>
          {clients.length > 0 && (
            <ul className={styles.clientList}>
              {clients.map((client) => {
                const assigned = assignedIds.has(client.id);
                return (
                  // biome-ignore lint/a11y/useKeyWithClickEvents: checkbox inside handles keyboard interaction
                  <li
                    key={client.id}
                    className={`${styles.clientRow} ${assigned ? styles.clientRowAssigned : ""}`}
                    onClick={() => toggle(client.id)}
                  >
                    <input
                      type="checkbox"
                      checked={assigned}
                      onChange={() => toggle(client.id)}
                      className={styles.clientCheckbox}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span className={styles.clientName}>{clientDisplayName(client, useCodenames)}</span>
                    {assigned && <span className={styles.assignedBadge}>Assigned</span>}
                  </li>
                );
              })}
            </ul>
          )}

          {stubs.length > 0 && (
            <>
              <p className={styles.sectionLabel}>Offline clients</p>
              <ul className={styles.clientList}>
                {stubs.map((stub) => {
                  const assigned = stubAssignedIds.has(stub.id);
                  return (
                    // biome-ignore lint/a11y/useKeyWithClickEvents: checkbox inside handles keyboard interaction
                    <li
                      key={stub.id}
                      className={`${styles.clientRow} ${assigned ? styles.clientRowAssigned : ""}`}
                      onClick={() => toggleStub(stub.id)}
                    >
                      <input
                        type="checkbox"
                        checked={assigned}
                        onChange={() => toggleStub(stub.id)}
                        className={styles.clientCheckbox}
                        onClick={(e) => e.stopPropagation()}
                      />
                      <span className={styles.clientName}>{stubDisplayName(stub)}</span>
                      {assigned && <span className={styles.assignedBadge}>Assigned</span>}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}

      <div className={styles.modalActions}>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

// ─── Tags modal ─────────────────────────────────────────────

function TagsModal({ tags, onClose }: { tags: Tag[]; onClose: () => void }) {
  const dispatch = useAppDispatch();
  const { isDemo } = useAuth();
  const { showToast } = useToast();
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const handleAdd = async () => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (!newName.trim()) return;
    await dispatch(createTag({ name: newName.trim() }));
    setNewName("");
  };

  const handleRename = async (tag: Tag) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (!editName.trim()) return;
    await dispatch(updateTag({ id: tag.id, name: editName.trim() }));
    setEditingId(null);
  };

  return (
    <Modal title="Manage tags" onClose={onClose}>
      <p className={styles.assignSubtitle}>
        Tags group scale questions on the progress chart — e.g. <strong>Sleep</strong>, <strong>Mood</strong>,{" "}
        <strong>Relationships</strong>.
      </p>

      {tags.length === 0 ? (
        <p className={styles.emptyText}>No tags yet. Add your first one below.</p>
      ) : (
        <ul className={styles.tagList}>
          {tags.map((tag) => (
            <li key={tag.id} className={styles.tagItem}>
              {editingId === tag.id ? (
                <>
                  <input
                    // biome-ignore lint/a11y/noAutofocus: intentional focus for inline rename
                    autoFocus
                    className={styles.tagEditInput}
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleRename(tag)}
                  />
                  <Button size="sm" onClick={() => handleRename(tag)}>
                    Save
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                    Cancel
                  </Button>
                </>
              ) : (
                <>
                  <span className={styles.tagItemName}>{tag.name}</span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setEditingId(tag.id);
                      setEditName(tag.name);
                    }}
                  >
                    Rename
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost-danger"
                    disabled={isDemo}
                    onClick={() => dispatch(deleteTag(tag.id))}
                  >
                    Delete
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className={styles.tagAddRow}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New tag (e.g. Mood)"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button onClick={handleAdd}>Add tag</Button>
      </div>

      <div className={styles.modalActions}>
        <Button onClick={onClose}>Done</Button>
      </div>
    </Modal>
  );
}

// ─── Page ───────────────────────────────────────────────────

export default function AdminQuestionnairesPage() {
  const dispatch = useAppDispatch();
  const { isDemo } = useAuth();
  const { showToast } = useToast();
  const questionnaires = useAppSelector(selectAllQuestionnaires);
  const clients = useAppSelector(selectClientUsers);
  const stubs = useAppSelector(selectAllStubs);
  const tags = useAppSelector(selectAllTags);

  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const tagsStatus = useAppSelector(selectTagsStatus);

  const [activeTab, setActiveTab] = useState<FormTab>("outcome_measure");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingQ, setEditingQ] = useState<Questionnaire | null>(null);
  const [isAssigningQ, setIsAssigningQ] = useState<Questionnaire | null>(null);
  const [showTagsModal, setShowTagsModal] = useState(false);
  const [resettingId, setResettingId] = useState<string | null>(null);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setShowBuilder(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useFetchOnIdle(
    (state: RootState) => state.questionnaires.status,
    () => fetchQuestionnaires(),
    "Failed to fetch questionnaires:",
  );

  useFetchOnIdle(
    (state: RootState) => state.userDirectory.status,
    () => fetchAllUsers(),
    "Failed to fetch users:",
  );

  useFetchOnIdle(
    (state: RootState) => state.tags.status,
    () => fetchTags(),
    "Failed to fetch tags:",
  );

  useFetchOnIdle(
    (state: RootState) => state.clientStubs.status,
    () => fetchClientStubs(),
    "Failed to fetch offline clients:",
  );

  useEffect(() => {
    if (isAssigningQ) {
      dispatch(fetchAssignmentsByQuestionnaire(isAssigningQ.id));
    }
  }, [isAssigningQ, dispatch]);

  const guard = isPageStatusLoading(questionnairesStatus, usersStatus, tagsStatus);
  if (guard) return guard;

  const tabQuestionnaires = questionnaires.filter(
    (q) => !q.is_system_default && ((q as any).form_type ?? "outcome_measure") === activeTab,
  );

  const handleCreate = (data: QuestionnaireFormData) => dispatch(createQuestionnaire(data as unknown as Questionnaire));

  const handleEdit = async ({ questions, ...fields }: QuestionnaireFormData) => {
    if (!editingQ) return;
    await dispatch(updateQuestionnaire({ id: editingQ.id, ...fields }));

    for (const q of questions) {
      if (q.id.startsWith("nq-")) continue;
      const original = editingQ.questions?.find((oq) => oq.id === q.id);
      if (original && original.tag_id !== q.tag_id) {
        const tagObj = q.tag_id ? (tags.find((t) => t.id === q.tag_id) ?? null) : null;
        dispatch(
          updateQuestionTag({
            questionId: q.id,
            questionnaireId: editingQ.id,
            tag_id: q.tag_id,
            tag: tagObj ? { id: tagObj.id, name: tagObj.name } : null,
          }),
        );
      }
    }
  };

  const handleResetToDefault = async (id: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (!window.confirm("Reset this form to the system default? Your customisations will be lost.")) return;
    setResettingId(id);
    const { error } = await supabase.rpc("reset_form_to_default", { p_questionnaire_id: id });
    setResettingId(null);
    if (error) {
      showToast(`Reset failed: ${error.message}`);
    } else {
      showToast("Form reset to default.");
      dispatch(fetchQuestionnaires());
    }
  };

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader}>
          <div>
            <h1>Forms</h1>
            <p>
              {tabQuestionnaires.length} form{tabQuestionnaires.length !== 1 ? "s" : ""} in this tab
            </p>
          </div>
          <SplitButton
            primaryLabel="+ New form"
            primaryAction={() => setShowBuilder(true)}
            options={[{ label: "Manage tags", onClick: () => setShowTagsModal(true) }]}
            secondaryLabel="More options"
          />
        </div>

        <div className={styles.tabs} role="tablist">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={activeTab === tab.id}
              className={`${styles.tab} ${activeTab === tab.id ? styles.tabActive : ""}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className={styles.list}>
          {tabQuestionnaires.map((q) => {
            const isDefault = !!(q as any).source_default_id;
            const formType = (q as any).form_type ?? "outcome_measure";
            // RCADS has fixed, clinically-validated content and its own
            // dedicated fill-in/scoring flow (src/Helpers/rcadsScoring.ts) —
            // there's nothing here to edit, and "reset to default" makes no
            // sense for something that was never customised.
            const isRcads = !!(q as any).is_rcads;
            return (
              <Card key={q.id}>
                <div className={styles.qCard}>
                  <div className={styles.qCardInner}>
                    <div className={styles.qInfo}>
                      <div className={styles.qTitleRow}>
                        <h2>{q.title}</h2>
                        <span className={`${styles.badge} ${q.is_active ? styles.active : styles.inactive}`}>
                          {q.is_active ? "Active" : "Paused"}
                        </span>
                        {isDefault && <span className={`${styles.badge} ${styles.default}`}>Default</span>}
                      </div>
                      <p className={styles.qDesc}>{q.description}</p>
                      <p className={styles.qMeta}>
                        {isRcads
                          ? "47 items · scored automatically"
                          : `${q.questions.length} question${q.questions.length !== 1 ? "s" : ""}`}
                        {formType === "outcome_measure" && q.frequency ? ` · ${q.frequency}` : ""}
                        {` · ${q.assignedTo?.length ?? 0} client${(q.assignedTo?.length ?? 0) !== 1 ? "s" : ""} assigned`}
                      </p>
                    </div>
                    <div className={styles.qActions}>
                      {/* Desktop: all buttons visible */}
                      <div className={styles.desktopActions}>
                        <Button variant="secondary" size="sm" onClick={() => setIsAssigningQ(q)}>
                          Assign
                        </Button>
                        {!isRcads && (
                          <Button variant="secondary" size="sm" onClick={() => setEditingQ(q)}>
                            Edit
                          </Button>
                        )}
                        {isDefault && !isRcads && (
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={resettingId === q.id || isDemo}
                            onClick={() => handleResetToDefault(q.id)}
                          >
                            {resettingId === q.id ? "Resetting…" : "Reset to default"}
                          </Button>
                        )}
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => {
                            if (isDemo) {
                              showToast("Demo mode — changes are not saved.");
                              return;
                            }
                            dispatch(pauseQuestionnaire({ id: q.id, is_active: !q.is_active }));
                          }}
                        >
                          {q.is_active ? "Pause" : "Activate"}
                        </Button>
                        <Button
                          variant="ghost-danger"
                          size="sm"
                          disabled={isDemo}
                          onClick={() => dispatch(deleteQuestionnaire(q.id))}
                        >
                          Delete
                        </Button>
                      </div>
                      {/* Mobile: SplitButton keeps everything in one compact control */}
                      <div className={styles.mobileActions}>
                        <SplitButton
                          variant="secondary"
                          size="sm"
                          primaryLabel="Assign"
                          primaryAction={() => setIsAssigningQ(q)}
                          options={[
                            ...(isRcads ? [] : [{ label: "Edit", onClick: () => setEditingQ(q) }]),
                            ...(isDefault && !isRcads
                              ? [
                                  {
                                    label: resettingId === q.id ? "Resetting…" : "Reset to default",
                                    onClick: () => handleResetToDefault(q.id),
                                  },
                                ]
                              : []),
                            {
                              label: q.is_active ? "Pause" : "Activate",
                              onClick: () => {
                                if (isDemo) {
                                  showToast("Demo mode — changes are not saved.");
                                  return;
                                }
                                dispatch(pauseQuestionnaire({ id: q.id, is_active: !q.is_active }));
                              },
                            },
                            {
                              label: "Delete",
                              onClick: () => {
                                if (!isDemo) dispatch(deleteQuestionnaire(q.id));
                              },
                            },
                          ]}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
          {tabQuestionnaires.length === 0 && (
            <p className={styles.empty}>No forms in this tab yet. Create one above.</p>
          )}
        </div>
      </div>

      {showBuilder && (
        <QuestionnaireBuilder
          tags={tags}
          defaultFormType={activeTab}
          onSave={handleCreate}
          onClose={() => setShowBuilder(false)}
        />
      )}

      {editingQ && (
        <QuestionnaireBuilder tags={tags} initial={editingQ} onSave={handleEdit} onClose={() => setEditingQ(null)} />
      )}

      {isAssigningQ && (
        <AssignModal
          questionnaire={isAssigningQ}
          clients={clients}
          stubs={stubs}
          onClose={() => setIsAssigningQ(null)}
        />
      )}

      {showTagsModal && <TagsModal tags={tags} onClose={() => setShowTagsModal(false)} />}
    </div>
  );
}
