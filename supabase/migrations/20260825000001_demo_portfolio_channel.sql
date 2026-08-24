-- Seed a "portfolio" channel token for the marketing landing page's demo CTA
-- and screenshot/GIF capture pipeline, alongside the existing "linkedin"
-- channel from 20260819000000_demo_requests.sql.
insert into public.demo_requests (for_value, kind)
values ('portfolio', 'channel')
on conflict (for_value) do nothing;
