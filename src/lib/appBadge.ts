// Reflects an unread count onto the browser tab and, for an installed PWA, the
// OS app icon. Three channels, each best-effort and independent:
//   1. document.title  — "(3) Clarity …"  (works everywhere)
//   2. favicon         — a red dot with the number, drawn over /icon.svg
//   3. navigator.setAppBadge — real icon badge, PWA-only, Chrome/Edge/Android
//
// Everything is wrapped so a failure in one channel never breaks the others or
// the app. Call setUnreadBadge(0) to clear all three.

let baseTitle: string | null = null;
let originalFaviconHref: string | null = null;
let faviconImg: HTMLImageElement | null = null;

const TITLE_RE = /^\(\d+\+?\)\s+/;

function getBaseTitle(): string {
  if (baseTitle == null) baseTitle = document.title.replace(TITLE_RE, "");
  return baseTitle;
}

function faviconLink(): HTMLLinkElement | null {
  return document.querySelector<HTMLLinkElement>('link[rel="icon"]');
}

function updateTitle(count: number) {
  const base = getBaseTitle();
  document.title = count > 0 ? `(${count > 99 ? "99+" : count}) ${base}` : base;
}

function updateFavicon(count: number) {
  const link = faviconLink();
  if (!link) return;
  if (originalFaviconHref == null) originalFaviconHref = link.href;

  if (count <= 0) {
    if (originalFaviconHref) link.href = originalFaviconHref;
    return;
  }

  const paint = (img: HTMLImageElement | null) => {
    const size = 64;
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    if (img) {
      try {
        ctx.drawImage(img, 0, 0, size, size);
      } catch {
        /* tainted / not ready — badge on a blank ground is still useful */
      }
    }

    // Badge: bottom-right disc + count.
    const r = size * 0.36;
    const cx = size - r - 2;
    const cy = size - r - 2;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#d64545";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `bold ${count > 9 ? size * 0.34 : size * 0.44}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(count > 9 ? "9+" : String(count), cx, cy + 1);

    try {
      link.type = "image/png";
      link.href = canvas.toDataURL("image/png");
    } catch {
      /* ignore */
    }
  };

  if (faviconImg?.complete) {
    paint(faviconImg);
    return;
  }
  const img = new Image();
  faviconImg = img;
  img.onload = () => paint(img);
  img.onerror = () => paint(null);
  img.src = originalFaviconHref || "/icon.svg";
}

function updateAppBadge(count: number) {
  const nav = navigator as Navigator & {
    setAppBadge?: (n?: number) => Promise<void>;
    clearAppBadge?: () => Promise<void>;
  };
  try {
    if (count > 0) nav.setAppBadge?.(count)?.catch(() => {});
    else nav.clearAppBadge?.()?.catch(() => {});
  } catch {
    /* ignore */
  }
}

/** Reflect `count` (clamped at 0) onto tab title, favicon and PWA app icon. */
export function setUnreadBadge(count: number): void {
  const n = Math.max(0, Math.floor(count || 0));
  try {
    updateTitle(n);
  } catch {
    /* ignore */
  }
  try {
    updateFavicon(n);
  } catch {
    /* ignore */
  }
  updateAppBadge(n);
}
