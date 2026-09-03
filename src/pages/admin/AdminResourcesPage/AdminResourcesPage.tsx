import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";

import Button from "@components/shared/Button/Button";
import Card from "@components/shared/Card/Card";
import { ArticleIcon, DocumentIcon, LinkIcon, VideoIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { useToast } from "@context/ToastContext";
import type { Resource } from "@models/globalTypes";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import {
  createResource,
  deleteResource,
  fetchResources,
  selectAllResources,
  togglePinned,
  togglePublished,
  updateResource,
} from "@store/slices/resourcesSlice";

import { isPageStatusLoading } from "@/Helpers/Helpers";
import { ResourceModal } from "@/pages/client/ResourcesPage/ResourcesPage";
import { ResourceForm } from "./AdminResourcesPageForm";

import styles from "./AdminResourcesPage.module.scss";

const RESOURCE_TYPES = ["all", "article", "video", "document", "link"] as const;

export const getResourceTypeLabel = (type: string) => {
  if (type === "all") return "All";
  if (type === "article") return "Articles";
  if (type === "video") return "Videos";
  if (type === "document") return "Documents";
  if (type === "link") return "Websites";

  return type;
};

const getResourceIcon = (type: Resource["type"]) => {
  if (type === "video") return <VideoIcon />;
  if (type === "document")
    return (
      <span aria-hidden="true">
        <DocumentIcon />
      </span>
    );
  if (type === "link")
    return (
      <span aria-hidden="true">
        <LinkIcon />
      </span>
    );

  return <ArticleIcon />;
};

export default function AdminResourcesPage() {
  const dispatch = useAppDispatch();
  const { isDemo, userProfile } = useAuth();
  const { showToast } = useToast();
  const resources: Resource[] = useAppSelector(selectAllResources);

  const [showForm, setShowForm] = useState(false);
  const [editingResource, setEditingResource] = useState<Resource | null>(null);
  const [previewResource, setPreviewResource] = useState<Resource | null>(null);
  const [typeFilter, setTypeFilter] = useState<(typeof RESOURCE_TYPES)[number]>("all");

  const resourcesStatus = useAppSelector((state: RootState) => state.resources.status);

  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    if (searchParams.get("new") === "true") {
      setShowForm(true);
      setSearchParams({});
    }
  }, [searchParams, setSearchParams]);

  useFetchOnIdle(
    (state: RootState) => state.resources.status,
    () => fetchResources(),
    "Failed to fetch resources:",
  );

  const guard = isPageStatusLoading(resourcesStatus);
  if (guard) return guard;

  const filtered = (typeFilter === "all" ? resources : resources.filter((resource) => resource.type === typeFilter))
    .slice()
    // Pinned resources first, then keep the existing order.
    .sort((a, b) => Number(!!b.is_pinned) - Number(!!a.is_pinned));

  const publishedCount = resources.filter((resource) => resource.is_published).length;
  const draftCount = resources.filter((resource) => !resource.is_published).length;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.pageHeader}>
          <div>
            <h1>Resources</h1>
            <p>
              {publishedCount} published · {draftCount} drafts
            </p>
          </div>

          <Button
            onClick={() => {
              if (isDemo) {
                showToast("Demo mode — changes are not saved.");
                return;
              }
              setShowForm(true);
            }}
          >
            + Add resource
          </Button>
        </div>

        <div className={styles.filterRow}>
          {RESOURCE_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setTypeFilter(type)}
              className={typeFilter === type ? styles.filterBtnActive : styles.filterBtn}
            >
              {getResourceTypeLabel(type)}
            </button>
          ))}
        </div>

        <div className={styles.list}>
          {filtered.map((resource) => (
            <Card key={resource.id}>
              <div className={styles.resourceRow}>
                <div className={styles.resourceIcon}>{getResourceIcon(resource.type)}</div>

                <div className={styles.resourceInfo}>
                  <div className={styles.resourceTitleRow}>
                    <p className={styles.resourceTitle}>{resource.title}</p>
                    <div className={styles.resourceBadges}>
                      {resource.is_pinned && <span className={`${styles.badge} ${styles.pinned}`}>Pinned</span>}
                      {resource.is_sensitive && (
                        <span className={`${styles.badge} ${styles.sensitive}`}>Sensitive</span>
                      )}
                      <span className={`${styles.badge} ${resource.is_published ? styles.published : styles.draft}`}>
                        {resource.is_published ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>

                  <p className={styles.resourceMeta}>
                    {getResourceTypeLabel(resource.type).replace(/s$/, "")} · {resource.category} · Last edited:{" "}
                    {resource.updated_at ? new Date(resource.updated_at).toLocaleDateString() : "Unknown"}
                  </p>
                </div>

                <div className={styles.resourceActions}>
                  <Button variant="ghost" size="sm" onClick={() => setPreviewResource(resource)}>
                    Preview
                  </Button>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      if (isDemo) {
                        showToast("Demo mode — changes are not saved.");
                        return;
                      }
                      dispatch(togglePublished({ id: resource.id, is_published: !resource.is_published }));
                    }}
                  >
                    {resource.is_published ? "Unpublish" : "Publish"}
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      if (isDemo) {
                        showToast("Demo mode — changes are not saved.");
                        return;
                      }
                      dispatch(togglePinned({ id: resource.id, is_pinned: !resource.is_pinned }));
                    }}
                  >
                    {resource.is_pinned ? "Unpin" : "Pin"}
                  </Button>

                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      if (isDemo) {
                        showToast("Demo mode — changes are not saved.");
                        return;
                      }
                      setEditingResource(resource);
                    }}
                  >
                    Edit
                  </Button>

                  <Button
                    variant="ghost-danger"
                    size="sm"
                    disabled={isDemo}
                    onClick={() => dispatch(deleteResource(resource.id))}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}

          {filtered.length === 0 && (
            <p className={styles.empty}>No {getResourceTypeLabel(typeFilter).toLowerCase()} resources yet.</p>
          )}
        </div>
      </div>

      {showForm && (
        <ResourceForm
          adminId={userProfile?.id ?? ""}
          onSave={async (data) => {
            await dispatch(createResource(data)).unwrap();
            showToast("Resource created", "success");
          }}
          onClose={() => setShowForm(false)}
        />
      )}

      {editingResource && (
        <ResourceForm
          adminId={userProfile?.id ?? ""}
          resource={editingResource}
          onSave={async (data) => {
            await dispatch(updateResource({ id: editingResource.id, ...data })).unwrap();
            showToast("Resource updated", "success");
          }}
          onClose={() => setEditingResource(null)}
        />
      )}

      {previewResource && <ResourceModal resource={previewResource} onClose={() => setPreviewResource(null)} />}
    </div>
  );
}
