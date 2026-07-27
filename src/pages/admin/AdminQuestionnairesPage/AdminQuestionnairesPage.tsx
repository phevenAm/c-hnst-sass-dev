import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import Modal from "@components/shared/Modal/Modal";
import SplitButton from "@components/shared/SplitButton/SplitButton";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { Questionnaire, QuestionnaireFrequency, Tag, UserProfile } from "@models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
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

import { isPageStatusLoading } from "@/Helpers/Helpers";
import { supabase } from "@/lib/supabase.js";

import styles from "./AdminQuestionnairesPage.module.scss";

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
};

type QuestionnaireFormData = {
  title: string;
  description: string;
  frequency: QuestionnaireFrequency;
  questions: QuestionDraft[];
};

const QUESTION_TYPES = ["scale", "text"];

// ─── Question builder form (shared by create + edit) ───────

function QuestionnaireBuilder({
  initial,
  tags,
  onSave,
  onClose,
}: {
  initial?: Questionnaire | null;
  tags: Tag[];
  onSave: (data: QuestionnaireFormData) => void;
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const isEdit = !!initial;

  const [title, setTitle] = useState(initial?.title ?? "");
  const [description, setDesc] = useState(initial?.description ?? "");
  const [frequency, setFrequency] = useState(initial?.frequency ?? "weekly");
  const [questions, setQuestions] = useState(
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
    })) ?? [
      {
        id: `nq-${Date.now()}`,
        text: "",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "",
        maxLabel: "",
        orderIndex: 1,
        is_required: true,
        tag_id: null,
      },
    ],
  );

  const [creatingTagFor, setCreatingTagFor] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState("");

  const addQuestion = () =>
    setQuestions((qs) => [
      ...qs,
      {
        id: `nq-${Date.now()}`,
        text: "",
        type: "scale",
        min: 1,
        max: 10,
        minLabel: "",
        maxLabel: "",
        orderIndex: qs.length + 1,
        is_required: true,
        tag_id: null,
      },
    ]);

  const removeQuestion = (id: string) => setQuestions((qs) => qs.filter((q) => q.id !== id));

  const updateQuestion = (id: string, field: string, value: string | null) =>
    setQuestions((qs) => qs.map((q) => (q.id === id ? { ...q, [field]: value } : q)));

  const { isDemo } = useAuth();
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
    onSave({ title, description, frequency, questions });
    onClose();
  };

  const modalObj = {
    title: isEdit ? "Edit check-in" : "New check-in",
    actions: (
      <div className={styles.modalActions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={handleSave}>{isEdit ? "Save changes" : "Save check-in"}</Button>
      </div>
    ),
    onClose,
    size: "md",
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
            placeholder="e.g. Weekly Wellbeing Check-in"
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
          <label htmlFor="q-freq">Frequency</label>
          <select id="q-freq" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="fortnightly">Fortnightly</option>
          </select>
        </div>
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
                    {t === "scale" ? "Scale (1–10)" : "Free text"}
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
  onClose,
}: {
  questionnaire: Questionnaire;
  clients: UserProfile[];
  onClose: () => void;
}) {
  const dispatch = useAppDispatch();
  const { isDemo } = useAuth();
  const { showToast } = useToast();
  const assignments = useAppSelector(selectAssignmentsByQuestionnaire(questionnaire.id));
  const assignedIds = new Set(assignments.map((a) => a.user_id));

  const toggle = (userId: string) => {
    if (isDemo) {
      showToast("Demo mode — changes are not saved.");
      return;
    }
    if (assignedIds.has(userId)) {
      dispatch(
        unassignQuestionnaireByIds({
          questionnaire_id: questionnaire.id,
          user_id: userId,
        }),
      );
    } else {
      dispatch(
        assignQuestionnaire({
          questionnaire_id: questionnaire.id,
          user_id: userId,
        }),
      );
      supabase.functions.invoke("notify-questionnaire-assigned", {
        body: { user_id: userId, questionnaire_id: questionnaire.id },
      });
    }
  };

  return (
    <Modal title="Assign clients" onClose={onClose}>
      <p className={styles.assignSubtitle}>
        Select which clients should receive <strong>{questionnaire.title}</strong>.
      </p>

      {clients.length === 0 ? (
        <p className={styles.emptyText}>No clients found.</p>
      ) : (
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
                <span className={styles.clientName}>
                  {client.first_name} {client.last_name}
                </span>
                {assigned && <span className={styles.assignedBadge}>Assigned</span>}
              </li>
            );
          })}
        </ul>
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
                  <Button size="sm" variant="danger" disabled={isDemo} onClick={() => dispatch(deleteTag(tag.id))}>
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
  const tags = useAppSelector(selectAllTags);

  const questionnairesStatus = useAppSelector((state: RootState) => state.questionnaires.status);
  const usersStatus = useAppSelector((state: RootState) => state.userDirectory.status);
  const tagsStatus = useAppSelector(selectTagsStatus);

  const [showBuilder, setShowBuilder] = useState(false);
  const [editingQ, setEditingQ] = useState<Questionnaire | null>(null);
  const [isAssigningQ, setIsAssigningQ] = useState<Questionnaire | null>(null);
  const [showTagsModal, setShowTagsModal] = useState(false);

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

  // When assign modal opens, fetch latest assignments for that questionnaire
  useEffect(() => {
    if (isAssigningQ) {
      dispatch(fetchAssignmentsByQuestionnaire(isAssigningQ.id));
    }
  }, [isAssigningQ, dispatch]);

  const guard = isPageStatusLoading(questionnairesStatus, usersStatus, tagsStatus);
  if (guard) return guard;

  const handleCreate = (data: QuestionnaireFormData) => dispatch(createQuestionnaire(data as unknown as Questionnaire));

  const handleEdit = async ({ questions, ...fields }: QuestionnaireFormData) => {
    if (!editingQ) return;
    await dispatch(updateQuestionnaire({ id: editingQ.id, ...fields }));

    for (const q of questions) {
      if (q.id.startsWith("nq-")) continue; // not yet saved to DB
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

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader}>
          <div>
            <h1>Check-ins</h1>
            <p>
              {questionnaires.length} check-in{questionnaires.length !== 1 ? "s" : ""} configured
            </p>
          </div>
          <SplitButton
            primaryLabel="+ New check-in"
            primaryAction={() => setShowBuilder(true)}
            options={[{ label: "Manage tags", onClick: () => setShowTagsModal(true) }]}
            secondaryLabel="More options"
          />
        </div>

        <div className={styles.list}>
          {questionnaires.map((q) => (
            <Card key={q.id}>
              <div className={styles.qCard}>
                <div className={styles.qCardInner}>
                  <div className={styles.qInfo}>
                    <div className={styles.qTitleRow}>
                      <h2>{q.title}</h2>
                      <span className={`${styles.badge} ${q.is_active ? styles.active : styles.inactive}`}>
                        {q.is_active ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className={styles.qDesc}>{q.description}</p>
                    <p className={styles.qMeta}>
                      {q.questions.length} questions · {q.frequency} · {q.assignedTo?.length ?? 0} clients assigned
                    </p>
                  </div>
                  <div className={styles.qActions}>
                    <Button variant="secondary" size="sm" onClick={() => setIsAssigningQ(q)}>
                      Assign
                    </Button>
                    <Button variant="secondary" size="sm" onClick={() => setEditingQ(q)}>
                      Edit
                    </Button>
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
                      variant="danger"
                      size="sm"
                      disabled={isDemo}
                      onClick={() => dispatch(deleteQuestionnaire(q.id))}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          ))}
          {questionnaires.length === 0 && (
            <p className={styles.empty}>No questionnaires yet. Create your first one above.</p>
          )}
        </div>
      </div>

      {showBuilder && <QuestionnaireBuilder tags={tags} onSave={handleCreate} onClose={() => setShowBuilder(false)} />}

      {editingQ && (
        <QuestionnaireBuilder tags={tags} initial={editingQ} onSave={handleEdit} onClose={() => setEditingQ(null)} />
      )}

      {isAssigningQ && (
        <AssignModal questionnaire={isAssigningQ} clients={clients} onClose={() => setIsAssigningQ(null)} />
      )}

      {showTagsModal && <TagsModal tags={tags} onClose={() => setShowTagsModal(false)} />}
    </div>
  );
}
