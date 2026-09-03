import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { isAdultFromDob, isPageStatusLoading } from "@Helpers/Helpers";
import AgreementView from "@components/Consent/AgreementView";
import Card from "@components/shared/Card/Card";
import { ArticleIcon, PinIconFilled, StarIconFilled, StarIconOutline, VideoIcon } from "@components/shared/Icons/Icons";
import PdfViewer from "@components/shared/PdfViewer/PdfViewer";
import { useAuth } from "@context/AuthContext";
import type { Resource } from "@models/globalTypes";
import { getResourceTypeLabel } from "@pages/admin/AdminResourcesPage/AdminResourcesPage";
import { useAppDispatch, useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchMyFavourites, selectFavouriteIds, toggleFavourite } from "@store/slices/resourceFavouritesSlice";
import { fetchPublishedResources, selectPublishedResources } from "@store/slices/resourcesSlice";

import styles from "./ResourcesPage.module.scss";

function getTabLabel(type: string): string {
  if (type === "agreement") return "Your agreement";
  if (type === "favourites") return "Favourites";
  return getResourceTypeLabel(type);
}

function getResourceButtonLabel(type: string): string {
  if (type === "video") return "Watch";
  if (type === "document") return "Open document";
  if (type === "link") return "Visit site";
  return "Read";
}

// Exported so the admin Resources page can reuse it for a client's-eye
// "Preview" of a resource before it's published.
export function ResourceModal({ resource, onClose }: { resource: Resource; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // Portalled to <body> so the fixed overlay is measured against the viewport,
  // not the admin content column — otherwise the always-on 60px mobile sidebar
  // (z-index 200) sits over the modal's left edge and clips the text.
  return createPortal(
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

        {resource.type === "document" && resource.url?.toLowerCase().endsWith(".pdf") && (
          <PdfViewer url={resource.url} title={resource.title} />
        )}

        {resource.type === "document" && resource.url && !resource.url.toLowerCase().endsWith(".pdf") && (
          <div className={styles.externalWrap}>
            <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.externalBtn}>
              Open document
            </a>
          </div>
        )}

        {resource.type === "link" && resource.url && (
          <div className={styles.externalWrap}>
            <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.externalBtn}>
              Visit website
            </a>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

function ResourceCard({
  resource,
  onOpen,
  isFavourite,
  onToggleFavourite,
}: {
  resource: Resource;
  onOpen: (resource: Resource) => void;
  isFavourite: boolean;
  onToggleFavourite: (resource: Resource) => void;
}) {
  const handleClick = () => {
    if (resource.type === "link" && resource.url) {
      window.open(resource.url, "_blank");
    } else {
      onOpen(resource);
    }
  };
  return (
    <Card>
      <div className={styles.cardBody}>
        <button
          type="button"
          className={isFavourite ? styles.favBtnActive : styles.favBtn}
          aria-label={isFavourite ? "Remove from favourites" : "Add to favourites"}
          aria-pressed={isFavourite}
          onClick={() => onToggleFavourite(resource)}
        >
          {isFavourite ? <StarIconFilled /> : <StarIconOutline />}
        </button>

        <span className={styles.categoryBadge}>
          {resource.type === "video" ? <VideoIcon /> : <ArticleIcon />}
          {resource.category}
          {resource.is_pinned && (
            <span className={styles.pinnedTag} title="Pinned by your practitioner">
              <PinIconFilled />
            </span>
          )}
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

// Pinned resources float to the top of whatever tab they're in.
const pinnedFirst = (a: Resource, b: Resource) => Number(!!b.is_pinned) - Number(!!a.is_pinned);

function emptyMessage(filter: string, term: string, search: string): string {
  if (filter === "favourites") return "No favourites yet — tap the star on any resource to save it here.";
  if (term) return `No resources match "${search}".`;
  return "No resources available yet.";
}

export default function ResourcesPage() {
  const dispatch = useAppDispatch();
  const resources = useAppSelector(selectPublishedResources);
  const favouriteIds = useAppSelector(selectFavouriteIds);
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

  useEffect(() => {
    dispatch(fetchMyFavourites());
  }, [dispatch]);

  const resourcesStatus = useAppSelector((State) => State.resources.status);

  const contentToRender = isAdultFromDob(userProfile?.dob ?? "") ? resources : nonSensitiveResources;
  const types = [
    "all",
    ...new Set(contentToRender.map((r) => r.type)),
    "favourites",
    ...(userProfile?.has_consented ? ["agreement"] : []),
  ];

  const isSynthetic = filter === "agreement";

  let byType: Resource[];
  if (filter === "all") byType = contentToRender;
  else if (filter === "favourites") byType = contentToRender.filter((r) => favouriteIds.includes(r.id));
  else byType = contentToRender.filter((r) => r.type === filter);

  const term = search.toLowerCase().trim();
  const filtered = (
    term
      ? byType.filter(
          (r) =>
            (r.title ?? "").toLowerCase().includes(term) ||
            (r.summary ?? "").toLowerCase().includes(term) ||
            (r.category ?? "").toLowerCase().includes(term),
        )
      : byType
  )
    .slice()
    .sort(pinnedFirst);

  const guard = isPageStatusLoading(resourcesStatus);
  if (guard) return guard;

  return (
    <div className="page">
      <div className="inner">
        <div className={styles.header} id="resources-header">
          <h1>Resources</h1>
          <p>Curated by your practitioner — take your time with these.</p>
        </div>

        <div className={styles.searchWrap} id="resources-search" style={isSynthetic ? { display: "none" } : undefined}>
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
              {getTabLabel(type)}
            </button>
          ))}
        </div>

        {filter === "agreement" ? (
          <AgreementView
            signedName={userProfile?.consent_signed_name ?? null}
            signedAt={userProfile?.consented_at ?? null}
          />
        ) : (
          <>
            <div className={styles.grid}>
              {filtered.map((resource) => (
                <ResourceCard
                  key={resource.id}
                  resource={resource}
                  onOpen={setSelectedResource}
                  isFavourite={favouriteIds.includes(resource.id)}
                  onToggleFavourite={(r) => {
                    if (!userProfile?.id) return;
                    dispatch(
                      toggleFavourite({
                        resourceId: r.id,
                        userId: userProfile.id,
                        on: !favouriteIds.includes(r.id),
                      }),
                    );
                  }}
                />
              ))}
            </div>

            {filtered.length === 0 && <p className={styles.empty}>{emptyMessage(filter, term, search)}</p>}
          </>
        )}
      </div>

      {selectedResource && <ResourceModal resource={selectedResource} onClose={() => setSelectedResource(null)} />}
    </div>
  );
}
