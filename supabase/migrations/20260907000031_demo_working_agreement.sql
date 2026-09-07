-- ─────────────────────────────────────────────────────────────────────────────
-- Demo — a proper counselling working agreement for the client consent gate.
--
-- 20260831000001 turned consent_enabled on for the demo practice with a single
-- placeholder paragraph. The demo now runs the real sign-up flow, so a demo
-- client hits this modal on first sign-in — give them a realistic working
-- agreement to read and sign.
--
-- ConsentModal renders consent_body as plain text: blank lines become spacing,
-- every other line becomes its own paragraph. Kept prose-plain (no markdown).
--
-- Safe to leave on permanently: ConsentModal's save goes through updateProfile,
-- which short-circuits to local state for is_demo users (AuthContext) — a demo
-- visitor can never write has_consented back to the shared demo row.
-- ─────────────────────────────────────────────────────────────────────────────

update public.practice_settings ps
set consent_enabled          = true,
    consent_title            = 'Our counselling working agreement',
    consent_counsellor_cta   = 'Your counsellor is happy to talk any part of this through before you sign — just ask at the start of a session.',
    consent_body             = $agreement$
This agreement sets out how we will work together. Please read it carefully. Signing it means you understand and agree to it. It is not a legal contract and you can end counselling at any time.

1. THE SESSIONS

Sessions are 50 minutes and normally take place at the same time each week. We will agree the number of sessions together and review how things are going roughly every six sessions.

If you arrive late, the session will still end at the scheduled time. If your counsellor is ever unavoidably late, the missing time will be made up or the session rearranged.

2. CONFIDENTIALITY

What you say in sessions is confidential. Your counsellor keeps brief written notes, which are stored securely and kept separate from your name wherever possible.

Confidentiality is not absolute. Your counsellor may need to break it, ideally after talking with you first, if:

There is a serious and immediate risk to your life or to someone else's.

There is a risk of harm to a child or vulnerable adult.

A court orders the disclosure of records, or the law requires it (for example, certain terrorism or money-laundering legislation).

Your counsellor discusses their work regularly with a professional supervisor to keep it safe and effective. Your identity is protected in those discussions.

3. CANCELLATIONS AND MISSED SESSIONS

Please give at least 48 hours' notice if you need to cancel or move a session. Sessions cancelled with less notice, or not attended, are charged in full.

If you miss three sessions without contact, your counsellor will assume you no longer wish to continue and the slot may be offered to someone else.

4. FEES AND PAYMENT

The fee is agreed before counselling begins and is payable for each session, including late cancellations and missed sessions. Any change to the fee will be discussed with you and given at least four weeks' notice.

5. CONTACT BETWEEN SESSIONS

This is a space for arranging or changing appointments, not for counselling by message. Your counsellor will reply during working hours and cannot offer a crisis or out-of-hours service.

If you are in crisis or need urgent help, contact your GP, call NHS 111, call the Samaritans free on 116 123, or go to your nearest A&E.

6. YOUR INFORMATION

Your records are held in line with UK data protection law. You can ask to see what is held about you, ask for corrections, and ask for your records to be deleted when counselling has ended, subject to any professional or legal requirement to retain them for a set period.

7. ENDING

You can stop counselling whenever you wish. Wherever possible, it helps to have a final session to close things well. Your counsellor may also suggest ending or referring you elsewhere if counselling no longer seems to be the right support for you.

8. AGREEMENT

By signing below you confirm that you have read this agreement, have had the chance to ask questions about it, and agree to work within it.
$agreement$
from auth.users au
where ps.admin_id = au.id
  and au.email = 'demo-admin@honest.com';

-- Re-arm the gate so the next demo-client sign-in shows the new agreement.
update public.users u
set has_consented = false,
    consented_at = null,
    consent_signed_name = null
from auth.users au
where u.id = au.id
  and au.email = 'demo-client@honest.com';

notify pgrst, 'reload schema';
