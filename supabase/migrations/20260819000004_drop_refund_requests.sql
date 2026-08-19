-- ─────────────────────────────────────────────────────────────────────────────
-- refund_requests (added earlier today, 20260819000001) is obsolete: client
-- cancellations now go through cancellation_requests instead of calling
-- cancel-session directly, so the admin decides the refund at approval time
-- via the existing CancelSessionModal. Nothing writes to refund_requests
-- anymore — drop it and its now-orphaned edge function (respond-refund-request,
-- removed alongside this migration).
-- ─────────────────────────────────────────────────────────────────────────────

drop table if exists public.refund_requests;
