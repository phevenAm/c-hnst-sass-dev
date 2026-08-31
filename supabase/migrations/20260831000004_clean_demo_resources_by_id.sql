-- Remove the specific junk rows from the demo practice's resource library
-- (identified by id via the demo client's own view — the earlier title/email
-- scoped attempt in 20260831000002 matched nothing because these rows aren't
-- flagged is_demo and belong to the demo counsellor account, not the
-- 'demo-admin@honest.com' login).
--
--   31b2333c… "asdasdasd"                    — keyboard-mash test row
--   118c96a8… "Test anime"                   — keyboard-mash test row
--   8cb34b7e… "Every Mind Matters — NHS"     — duplicate (keeps c61becb5…, 6s older)

delete from public.resource_favourites
where resource_id in (
  '31b2333c-90c8-4db0-b220-de925ac73570',
  '118c96a8-c8b0-482b-bdbe-6af43181a57f',
  '8cb34b7e-e45c-45a9-8363-cf9d06e110f4'
);

delete from public.resources
where id in (
  '31b2333c-90c8-4db0-b220-de925ac73570',
  '118c96a8-c8b0-482b-bdbe-6af43181a57f',
  '8cb34b7e-e45c-45a9-8363-cf9d06e110f4'
);
