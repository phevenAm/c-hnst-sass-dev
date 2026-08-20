-- pg_net was never actually enabled on this project, even though
-- auto_cancel_unpaid_sessions() (20260817000007_auto_cancel_email.sql) calls
-- net.http_post() every hour via pg_cron. Every single hourly run since that
-- migration has been failing with "schema net does not exist" — and because
-- that call sits inside a plain FOR loop with no exception handling, the
-- error aborts the whole function call, rolling back the session-cancelling
-- UPDATE too. Auto-cancel has not cancelled a single real session — it just
-- fails silently, once an hour, for every practice that has it enabled.
create extension if not exists pg_net;
