import { useEffect, useState } from "react";

import Button from "@components/shared/Button/Button";
import InfoTooltip from "@components/shared/InfoTooltip/InfoTooltip";
import Modal from "@components/shared/Modal/Modal";
import PdfUpload from "@components/shared/PdfUpload/PdfUpload";
import { Resource } from "@models/globalTypes";

import styles from "./AdminResourcesPage.module.scss";

const CATEGORIES = ["Psychoeducation", "Coping Skills", "Breathwork", "Self-Compassion", "Relationships", "General"];

export function ResourceForm({
  adminId,
  onSave,
  onClose,
  resource,
}: {
  adminId: string;
  // biome-ignore lint/suspicious/noExplicitAny: resource form data shape varies based on resource type
  onSave: (data: any) => void;
  onClose: () => void;
  resource?: Resource | null;
}) {
  const [form, setForm] = useState({
    type: "article",
    title: "",
    summary: "",
    content: "",
    videoUrl: "",
    url: "",
    category: "General",
    is_sensitive: false,
  });

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  useEffect(() => {
    if (!resource) return;

    setForm({
      type: resource.type,
      title: resource.title,
      summary: resource.summary ?? "",
      content: resource.content || "",
      videoUrl: resource.videoUrl || "",
      url: resource.url || "",
      category: resource.category,
      is_sensitive: resource.is_sensitive ?? false,
    });
  }, [resource]);

  const handleSave = () => {
    if (!form.title.trim() || !form.summary.trim()) {
      alert("Title and summary are required");
      return;
    }

    if (form.type === "video" && !form.videoUrl.trim()) {
      alert("Video URL is required");
      return;
    }

    if ((form.type === "document" || form.type === "link") && !form.url.trim()) {
      alert("URL is required");
      return;
    }

    onSave(form);
    onClose();
  };

  const modalObj = {
    title: resource ? "Edit resource" : "New resource",
    onClose,
    size: "md" as const,
    actions: (
      <div className={styles.modalActions}>
        <Button variant="ghost" onClick={onClose}>
          Cancel
        </Button>

        <Button onClick={handleSave}>{resource ? "Update resource" : "Save resource"}</Button>
      </div>
    ),
  };

  return (
    <Modal {...modalObj}>
      <div className={styles.formGrid}>
        <div className={styles.formField}>
          <label htmlFor="r-type">Type</label>
          <select id="r-type" value={form.type} onChange={(e) => set("type", e.target.value)}>
            <option value="article">Article</option>
            <option value="video">Video</option>
            <option value="document">Document</option>
            <option value="link">Website</option>
          </select>
        </div>

        <div className={styles.formField}>
          <label htmlFor="r-cat">Category</label>
          <select id="r-cat" value={form.category} onChange={(e) => set("category", e.target.value)}>
            {CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </div>

        <div className={`${styles.formField} ${styles.fullCol}`}>
          <label htmlFor="r-title">Title *</label>
          <input
            id="r-title"
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Resource title"
          />
        </div>

        <div className={`${styles.formField} ${styles.fullCol}`}>
          <label htmlFor="r-summary">Summary *</label>
          <textarea
            id="r-summary"
            value={form.summary}
            onChange={(e) => set("summary", e.target.value)}
            placeholder="1–2 sentence summary"
            rows={2}
          />
        </div>

        {form.type === "article" && (
          <div className={`${styles.formField} ${styles.fullCol}`}>
            <label htmlFor="r-content">Content</label>
            <textarea
              id="r-content"
              value={form.content}
              onChange={(e) => set("content", e.target.value)}
              placeholder="Write the full article…"
              rows={8}
            />
          </div>
        )}

        {form.type === "video" && (
          <div className={`${styles.formField} ${styles.fullCol}`}>
            <label htmlFor="r-video">
              YouTube embed URL *
              <InfoTooltip
                variant="rich"
                title="Adding a YouTube video"
                text={
                  'On the YouTube video, click Share, then Embed. Copy just the URL inside the src="..." part of the code shown — it looks like https://www.youtube.com/embed/VIDEO_ID.\n\n' +
                  "A normal watch link (youtube.com/watch?v=...) or share link (youtu.be/...) won't play here — it has to be the /embed/ link from the Embed dialog."
                }
              />
            </label>
            <input
              id="r-video"
              value={form.videoUrl}
              onChange={(e) => set("videoUrl", e.target.value)}
              placeholder="https://www.youtube.com/embed/..."
            />
          </div>
        )}

        {(form.type === "document" || form.type === "link") && (
          <div className={`${styles.formField} ${styles.fullCol}`}>
            <label htmlFor="r-url">
              {form.type === "document" ? "Document URL — or upload a PDF below *" : "Website URL *"}
            </label>
            <input
              id="r-url"
              value={form.url}
              className={styles.pdfUrl}
              onChange={(e) => set("url", e.target.value)}
              placeholder={form.type === "document" ? "https://docs.google.com/document/..." : "https://example.com"}
            />
            {form.type === "document" && (
              <PdfUpload adminId={adminId} value={form.url} onChange={(url) => set("url", url)} />
            )}
          </div>
        )}
      </div>

      <label className={styles.sensitiveRow}>
        <input
          type="checkbox"
          checked={form.is_sensitive}
          onChange={(e) => setForm((current) => ({ ...current, is_sensitive: e.target.checked }))}
        />
        <span>
          <strong>Sensitive content</strong> — restrict to adult clients only
        </span>
      </label>
    </Modal>
  );

  // return (
  //   <div className={styles.overlay}>
  //     <Card className={styles.modal}>
  //       <h3 className={styles.modalTitle}>{resource ? "Edit resource" : "New resource"}</h3>

  //       <div className={styles.modalActions}>
  //         <Button variant="ghost" onClick={onClose}>
  //           Cancel
  //         </Button>

  //         <Button onClick={handleSave}>{resource ? "Update resource" : "Save resource"}</Button>
  //       </div>
  //     </Card>
  //   </div>
  // );
}
