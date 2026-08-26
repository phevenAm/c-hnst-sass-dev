import { useEffect, useState } from "react";

import dayjs from "dayjs";

import { isAdultFromDob, isPageStatusLoading } from "@Helpers/Helpers";
import Card from "@components/shared/Card/Card";
import { ArticleIcon, VideoIcon } from "@components/shared/Icons/Icons";
import PdfViewer from "@components/shared/PdfViewer/PdfViewer";
import Spinner from "@components/shared/Spinner/Spinner";
import { useAuth } from "@context/AuthContext";
import type { Resource } from "@models/globalTypes";
import { getResourceTypeLabel } from "@pages/admin/AdminResourcesPage/AdminResourcesPage";
import { useAppSelector, useFetchOnIdle } from "@store/hooks";
import type { RootState } from "@store/index";
import { fetchPublishedResources, selectPublishedResources } from "@store/slices/resourcesSlice";

import { supabase } from "@/lib/supabase";

import styles from "./ResourcesPage.module.scss";

type ConsentSettings = {
  consent_title: string;
  consent_body: string;
  consent_pdf_url: string | null;
};

// Unlike useConsentPending, this doesn't gate on has_consented being false —
// the whole point is showing an already-signed agreement back to the client
// who signed it, any time after the fact.
function AgreementView({ signedName, signedAt }: { signedName: string | null; signedAt: string | null }) {
  const [settings, setSettings] = useState<ConsentSettings | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    supabase.rpc("get_my_admin_consent_settings").then(({ data }) => {
      setSettings(data?.[0] ?? null);
      setLoaded(true);
    });
  }, []);

  if (!loaded) return <Spinner />;

  if (!settings) {
    return <p className={styles.empty}>Your agreement details aren't available right now.</p>;
  }

  return (
    <Card>
      <div className={styles.agreementBody}>
        <h2 className={styles.agreementTitle}>{settings.consent_title}</h2>

        {settings.consent_body && (
          <div className={styles.agreementText}>
            {settings.consent_body.split("\n").map((line, i) =>
              line.trim() === "" ? (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text split by line, never reordered
                <br key={i} />
              ) : (
                // biome-ignore lint/suspicious/noArrayIndexKey: static text split by line, never reordered
                <p key={i}>{line}</p>
              ),
            )}
          </div>
        )}

        {settings.consent_pdf_url && <PdfViewer url={settings.consent_pdf_url} title={settings.consent_title} />}

        <p className={styles.agreementSigned}>
          {signedName ? `Signed by ${signedName}` : "Signed"}
          {signedAt ? ` on ${dayjs(signedAt).format("D MMM YYYY")}` : ""}
        </p>
      </div>
    </Card>
  );
}

function getTabLabel(type: string): string {
  if (type === "onboarding") return "Onboarding";
  return getResourceTypeLabel(type);
}

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

        {resource.type === "document" && resource.url.toLowerCase().endsWith(".pdf") && (
          <PdfViewer url={resource.url} title={resource.title} />
        )}

        {resource.type === "document" && !resource.url.toLowerCase().endsWith(".pdf") && (
          <div className={styles.externalWrap}>
            <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.externalBtn}>
              Open document
            </a>
          </div>
        )}

        {resource.type === "link" && (
          <div className={styles.externalWrap}>
            <a href={resource.url} target="_blank" rel="noopener noreferrer" className={styles.externalBtn}>
              Visit website
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ResourceCard({ resource, onOpen }: { resource: Resource; onOpen: (resource: Resource) => void }) {
  const handleClick = () => {
    if (resource.type === "link") {
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
  const types = [
    "all",
    ...new Set(contentToRender.map((r) => r.type)),
    ...(userProfile?.has_consented ? ["onboarding"] : []),
  ];

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

        <div
          className={styles.searchWrap}
          id="resources-search"
          style={filter === "onboarding" ? { display: "none" } : undefined}
        >
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

        {filter === "onboarding" ? (
          <AgreementView
            signedName={userProfile?.consent_signed_name ?? null}
            signedAt={userProfile?.consented_at ?? null}
          />
        ) : (
          <>
            <div className={styles.grid}>
              {filtered.map((resource) => (
                <ResourceCard key={resource.id} resource={resource} onOpen={setSelectedResource} />
              ))}
            </div>

            {filtered.length === 0 && (
              <p className={styles.empty}>{term ? `No resources match "${search}".` : "No resources available yet."}</p>
            )}
          </>
        )}
      </div>

      {selectedResource && <ResourceModal resource={selectedResource} onClose={() => setSelectedResource(null)} />}
    </div>
  );
}
