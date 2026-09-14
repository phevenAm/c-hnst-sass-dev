/**
 * Canonical app origin for links that leave the browser (emails, referral
 * links, OAuth redirect_uri) or that must exactly match an allowlisted
 * Supabase Auth / Google / Microsoft redirect URL.
 *
 * `window.location.origin` is wrong for these: a stray Vercel preview
 * domain (or the legacy honest-portal.vercel.app) leaks into the link and
 * either breaks it for the recipient or gets rejected as an unrecognised
 * redirect. Set VITE_APP_URL per environment (prod, staging, ...); falls
 * back to the current origin only when unset (local dev).
 */
export const APP_URL = (import.meta.env.VITE_APP_URL || window.location.origin).replace(/\/+$/, "");
