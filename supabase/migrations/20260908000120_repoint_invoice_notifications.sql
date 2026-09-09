-- The client-facing invoice view moved from a standalone `/invoices` page to a
-- card on the dashboard, and that route was removed. In-app notifications
-- created by `send-invoice-email` before the change still carry `url =
-- '/invoices'`, so clicking one now lands on the app's 404 route.
--
-- Repoint every past invoice notification at the dashboard card. New ones are
-- written with this URL by the edge function.

update public.notifications
set url = '/dashboard#invoices'
where type = 'invoice'
  and (url is null or url = '' or url like '/invoices%');
