-- Two changes so demo visitors see the full admin setup wizard and the
-- client consent gate, matching the real onboarding experience:
--
-- 1. onboarding_required = true on the demo admin's practice_settings row —
--    Router.tsx's AdminSetupGate/OnboardingGate no longer skip isDemo, and
--    AdminSetupPage.tsx now makes every write in that wizard a no-op for
--    is_demo admins (updatePracticeSettingsLocal, local-only fake session
--    packages), so this is safe to leave permanently true: no demo visitor
--    can ever flip it back to false in the DB, only in their own session's
--    local state. Every fresh visitor gets the wizard again.
--
-- 2. consent_enabled = true (+ copy) on the same row — ConsentModal's save
--    path already goes through updateProfile(), which is_demo short-circuits
--    to local state only (AuthContext.tsx), so this is equally safe to leave
--    on permanently. has_consented is reset to false below so it actually
--    triggers on the next demo-client sign-in.
update public.practice_settings ps
set onboarding_required = true,
    consent_enabled = true,
    consent_title = 'Before you continue',
    consent_body = 'Welcome to Clarity. Before we get started, please confirm you understand how your information is used: session notes and check-in responses are visible only to your counsellor, data is stored securely, and you can request a copy or deletion of your records at any time. Continuing confirms you agree to work together under these terms.',
    consent_counsellor_cta = 'If you have any questions, speak to your counsellor.'
from auth.users au
where ps.admin_id = au.id
  and au.email = 'demo-admin@honest.com';

update public.users u
set has_consented = false
from auth.users au
where u.id = au.id
  and au.email = 'demo-client@honest.com';
