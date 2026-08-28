-- Re-enable the "personalize your profile" onboarding modal for the demo
-- accounts (Router.tsx OnboardingGate no longer skips isDemo users). Reset
-- the flag in case an earlier run left it true — demo profile updates never
-- persist to the DB (AuthContext.updateProfile short-circuits for is_demo),
-- so this only needs to happen once; it won't get re-set by demo visitors.
update public.users u
set onboarding_completed = false
from auth.users au
where u.id = au.id
  and au.email in ('demo-admin@honest.com', 'demo-client@honest.com');
