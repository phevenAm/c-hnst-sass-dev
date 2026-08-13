import { useState } from "react";

import { isAdultFromDob, isPageStatusLoading } from "@Helpers/Helpers";
import Card from "@components/shared/Card/Card";
import { ArticleIcon, VideoIcon } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import type { Resource } from "@models/globalTypes";
import { getResourceTypeLabel } from "@pages/admin/AdminResourcesPage/AdminResourcesPage";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchPublishedResources, selectPublishedResources } from "@store/slices/resourcesSlice";

import styles from "./ResourcesPage.module.scss";

function getResourceButtonLabel(type: string): string {
  if (type === "video") return "Watch";
  if (type === "document") return "Open document";
  if (type === "link") return "Visit site";
  return "Read";
}

//TODO: could do with a search to find things by words and even have a favourites. (add a star icon to the card to favourite it, and then have a filter for favourites)

function ResourceModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop dismiss — close button provides keyboard path
    <div className={styles.modalOverlay} onClick={onClose} role="presentation">
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-labelledby="resource-title"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button type="button" className={styles.modalClose} onClick={onClose}>
          ×
        </button>

        <span className={styles.categoryBadge}>
          {resource.type === "video" ? <VideoIcon /> : <ArticleIcon />}
          {resource.category}
        </span>

        <h2 id="resource-title" className={styles.modalTitle}>
          {resource.title}
        </h2>

        <p className={styles.modalSummary}>{resource.summary}</p>

        {resource.type === "article" && resource.content && (
          <div className={styles.modalContent}>{resource.content}</div>
        )}

        {resource.type === "video" && (
          <div className={styles.videoWrap}>
            <iframe
              src={resource.videoUrl}
              title={resource.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        {(resource.type === "document" || resource.type === "link") && (
          <div className={styles.externalWrap}>
            <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.externalBtn}>
              {resource.type === "document" ? "Open document" : "Visit website"}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCard({ resource, onOpen }: { resource: Resource; onOpen: (resource: Resource) => void }) {
  const handleClick = () => {
    if (resource.type === "document" || resource.type === "link") {
      window.open(resource.url, "_blank");
    } else {
      onOpen(resource);
    }
  };
  return (
    <Card>
      <div className={styles.cardBody}>
        <span className={styles.categoryBadge}>
          {resource.type === "video" ? <VideoIcon /> : <ArticleIcon />}
          {resource.category}
        </span>

        <h2 className={styles.cardTitle}>{resource.title}</h2>

        <p className={styles.excerpt}>{resource.summary}</p>

        <div className={styles.cardFooter}>
          <button type="button" onClick={handleClick} className={styles.readMoreBtn}>
            {getResourceButtonLabel(resource.type)}
          </button>
        </div>
      </div>
    </Card>
  );
}

export default function ResourcesPage() {
  const resources = useAppSelector(selectPublishedResources);
  const { userProfile } = useAuth();
  const [filter, setFilter] = useState<string>("all");
  const [selectedResource, setSelectedResource] = useState<Resource | null>(null);
  const nonSensitiveResources = resources.filter((item) => !item.is_sensitive);
  const [search, setSearch] = useState<string>("");

  useFetchOnIdle(
    (state: RootState) => state.resources.status,
    () => fetchPublishedResources(),
    "Failed to fetch resources:",
  );

  const resourcesStatus = useAppSelector((State) => State.resources.status);

  const contentToRender = isAdultFromDob(userProfile?.dob ?? "") ? resources : nonSensitiveResources;
  const types = ["all", ...new Set(contentToRender.map((r) => r.type))];

  const byType = filter === "all" ? contentToRender : contentToRender.filter((r) => r.type === filter);
  const term = search.toLowerCase().trim();
  const filtered = term
    ? byType.filter(
        (r) =>
          r.title.toLowerCase().includes(term) ||
          (r.summary ?? "").toLowerCase().includes(term) ||
          r.category.toLowerCase().includes(term),
      )
    : byType;

  const guard = isPageStatusLoading(resourcesStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header} id="resources-header">
          <h1>Resources</h1>
          <p>Curated by your practitioner — take your time with these.</p>
        </div>

        <div className={styles.searchWrap} id="resources-search">
          <input
            placeholder="Search for resource..."
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="Search for a resource"
            className={styles.searchInput}
          />
        </div>

        <div role="tablist" aria-label="Filter resources by type" className={styles.filterRow} id="resources-filter">
          {types.map((type: string) => (
            <button
              key={type}
              type="button"
              role="tab"
              aria-selected={filter === type}
              onClick={() => setFilter(type)}
              className={filter === type ? styles.filterBtnActive : styles.filterBtn}
            >
              {getResourceTypeLabel(type)}
            </button>
          ))}
        </div>

        <div className={styles.grid}>
          {filtered.map((resource) => (
            <ResourceCard key={resource.id} resource={resource} onOpen={setSelectedResource} />
          ))}
        </div>

        {filtered.length === 0 && (
          <p className={styles.empty}>{term ? `No resources match "${search}".` : "No resources available yet."}</p>
        )}
      </div>

      {selectedResource && <ResourceModal resource={selectedResource} onClose={() => setSelectedResource(null)} />}
    </div>
  );
}
