export interface WalkthroughStepAction {
  label: string;
  to: string; // internal route — clicking ends this page's tour and navigates
}

export interface WalkthroughStep {
  id: string;
  title: string;
  body: string;
  target?: string; // CSS selector — element to spotlight
  order: number;
  actions?: WalkthroughStepAction[]; // up to 2 CTA buttons shown in the step card
  // Limits a step to one role. Omitted = shown to everyone. Used on shared
  // routes like /settings, where clients and counsellors see different UIs.
  role?: "admin" | "client";
}

export interface WalkthroughPage {
  pageTitle: string;
  steps: WalkthroughStep[];
}

// Keys are exact route paths or prefix patterns (ending with "/" for dynamic segments).
// The context matches the current pathname against these keys.
export const walkthroughSteps: Record<string, WalkthroughPage> = {
  // ── Client routes ──────────────────────────────────────────────

  "/dashboard": {
    pageTitle: "Your Dashboard",
    steps: [
      {
        id: "dashboard-welcome",
        order: 1,
        title: "Welcome to your dashboard",
        body: "This is your home screen. Everything your counsellor sets up for you shows up here — your sessions, check-in forms, your progress chart, and resources they've shared. The greeting at the top changes with the time of day.",
        target: "#client-dash-header",
      },
      {
        id: "dashboard-stats",
        order: 2,
        title: "Your wellbeing at a glance",
        body: "These cards show your most recent average score, how many check-ins you've done, how much has changed since you started, and how many forms are waiting. They refresh every time you finish a check-in.",
        target: "#client-stats",
      },
      {
        id: "dashboard-chart",
        order: 3,
        title: "Your progress chart",
        body: "This chart plots your check-in scores over time. Every time you complete a form, a new point is added, so you can see how things have been going across your sessions.",
        target: "#client-chart",
      },
      {
        id: "dashboard-checkins",
        order: 4,
        title: "Check-ins to complete",
        body: "Any forms your counsellor has asked you to fill in appear here when they're due. Press 'Start' to open one. Once you send it back, it disappears until it's due again.",
        target: "#client-checkins",
        actions: [{ label: "Go to my check-ins", to: "/check-in" }],
      },
    ],
  },

  "/check-in": {
    pageTitle: "Check-In Forms",
    steps: [
      {
        id: "forms-intro",
        order: 1,
        title: "Your check-in forms",
        body: "Your counsellor uses these forms to keep track of how you're doing between sessions. This page lists every form they've assigned to you — fill them in whenever suits you.",
        target: "#forms-header",
      },
      {
        id: "forms-tabs",
        order: 2,
        title: "The three tabs",
        body: "Forms are split into three groups: regular wellbeing check-ins, feedback on how your sessions are going, and a one-time welcome form. Use these tabs to move between them.",
        target: "#forms-tabs",
      },
    ],
  },

  "/my-sessions": {
    pageTitle: "Your Sessions",
    steps: [
      {
        id: "sessions-overview",
        order: 1,
        title: "Your sessions",
        body: "Sessions your counsellor books with you show up here — upcoming, done, and cancelled. If you have one coming up, it's pinned to the top.",
        target: "#sessions-header",
      },
      {
        id: "sessions-view",
        order: 2,
        title: "Calendar or list",
        body: "These buttons switch between a calendar view — your sessions laid out over the week next to your counsellor's free slots — and a simple list sorted by date.",
        target: "#sessions-view-toggle",
      },
    ],
  },

  "/resources": {
    pageTitle: "Resources",
    steps: [
      {
        id: "resources-client-intro",
        order: 1,
        title: "Resources from your counsellor",
        body: "Everything your counsellor shares with you lands here — articles, worksheets, videos, and links. New items appear on their own as they're added.",
        target: "#resources-header",
      },
      {
        id: "resources-search",
        order: 2,
        title: "Search",
        body: "Type a word or two to look through every resource by title, summary, or topic. Handy when you remember the subject but not where the card is.",
        target: "#resources-search",
      },
      {
        id: "resources-filter",
        order: 3,
        title: "Filter by type",
        body: "Tap a button to show just articles, just videos, or just documents. 'All' brings everything back. Search still works while a filter is on.",
        target: "#resources-filter",
      },
    ],
  },

  // ── Settings (shared by both roles) ───────────────────────────

  "/settings": {
    pageTitle: "Settings",
    steps: [
      // ── Client view: a single profile form, no tabs ──
      {
        id: "settings-client-intro",
        order: 1,
        title: "Your settings",
        body: "This is where you manage your own account — nothing here is shared with anyone else.",
        target: "#settings-header",
        role: "client",
      },
      {
        id: "settings-client-profile",
        order: 2,
        title: "Profile and keywords",
        body: "Change your display name, photo, and password here. Further down, 'Focus keywords' lets you pick a few words that shape the daily quotes shown on your dashboard.",
        role: "client",
      },
      // ── Counsellor view: tabbed, one per area of the app ──
      {
        id: "settings-intro",
        order: 1,
        title: "Settings",
        body: "This is where you manage your profile, your practice, and your account. The tabs across the top split it into one area each.",
        target: "#settings-header",
        role: "admin",
      },
      {
        id: "settings-profile-tab",
        order: 2,
        title: "Profile",
        body: "Change your display name, photo, and password here.",
        target: "#settings-tabs button:nth-child(1)",
        role: "admin",
      },
      {
        id: "settings-practice-tab",
        order: 3,
        title: "Practice",
        body: "Your business name, contact details, bank details, and client codenames live here, along with card-payment setup and your subscription. Contact and bank fields are kept encrypted. Click a section's title to fold it away, or use the search box to jump to the one you need.",
        target: "#settings-tabs button:nth-child(2)",
        role: "admin",
      },
      {
        id: "settings-emails-tab",
        order: 4,
        title: "Emails",
        body: "Turn each automatic client email on or off — reminders, booking confirmations, cancellations, reschedules, and receipts. You can edit the wording and send yourself a test.",
        target: "#settings-tabs button:nth-child(3)",
        role: "admin",
      },
      {
        id: "settings-interface-tab",
        order: 5,
        title: "Interface",
        body: "Make the app your own — show or hide dashboard widgets, move the sidebar button, adjust zoom and motion, and replay any page tour. Sections fold away, and the search box finds them fast.",
        target: "#settings-tabs button:nth-child(4)",
        role: "admin",
      },
    ],
  },

  // ── Admin routes ───────────────────────────────────────────────

  "/admin": {
    pageTitle: "Practice Dashboard",
    steps: [
      {
        id: "admin-welcome",
        order: 1,
        title: "Your practice at a glance",
        body: "Start your day here. This page pulls together what's coming up, what needs a look, and how things are trending — so you don't have to open every page to get the picture.",
        target: "#dash-header",
      },
      {
        id: "admin-quick-actions",
        order: 2,
        title: "Quick actions",
        body: "These buttons jump straight to booking a session, inviting a client, building a form, or setting your availability — each one opens on the right page with that task ready to go.",
        target: "#dash-quick-actions",
        actions: [
          { label: "Book a session", to: "/admin/scheduler?newSession=1" },
          { label: "Invite a client", to: "/admin/clients?new=true" },
        ],
      },
      {
        id: "admin-alerts",
        order: 3,
        title: "Sections you can fold away",
        body: "Below are your upcoming sessions, anything that needs attention, unpaid invoices, practice trends, and your to-do list. Click a section's title to fold it — the app remembers which ones you closed.",
      },
    ],
  },

  "/admin/clients": {
    pageTitle: "Clients",
    steps: [
      {
        id: "clients-directory",
        order: 1,
        title: "Your client list",
        body: "This page holds all your clients — full accounts and offline records alike. Each row opens that client's full profile: sessions, notes, forms, and payments. Nothing here yet? Add your first client below.",
        target: "#clients-header",
        actions: [
          { label: "Invite a client", to: "/admin/clients?new=true" },
          { label: "Add offline client", to: "/admin/clients?newStub=true" },
        ],
      },
      {
        id: "clients-actions",
        order: 2,
        title: "Inviting a client",
        body: "'Invite a client' emails someone a personal sign-up link that only works once. The dropdown next to it does the rest: create a link to share yourself, see links you've already sent, import a list of clients from a spreadsheet, or add an offline client.",
        target: "#clients-header",
      },
      {
        id: "clients-offline",
        order: 3,
        title: "Offline clients",
        body: "An offline client is a private record for someone you see who hasn't signed up yet. You can book sessions, write notes, and track payments for them just like a full account.",
      },
    ],
  },

  "/admin/clients/": {
    pageTitle: "Client Profile",
    steps: [
      {
        id: "client-detail-overview",
        order: 1,
        title: "The client's profile",
        body: "Everything about this client sits here, across six tabs: their details, session history, check-in scores, account summary, form results, and payments.",
        target: "#main-content h1",
      },
      {
        id: "client-detail-actions",
        order: 2,
        title: "Configure client",
        body: "'Configure client' lets you set a codename to show instead of their real name, and links to their account summary. The dropdown exports their record as a PDF and turns your session reminders for them on or off.",
      },
      {
        id: "client-detail-sessions",
        order: 3,
        title: "Sessions and notes",
        body: "Book a session for this client straight from '+ New session' here — no need to open the scheduler. Open any session to add notes; these are encrypted, so the first time you'll be asked to set up your personal key.",
      },
      {
        id: "client-detail-scores",
        order: 4,
        title: "Scores vs. results",
        body: "'Check-in scores' shows their wellbeing trend as a chart. 'Form results' shows the actual answers from each form. Use scores for the big picture, results for the detail.",
      },
    ],
  },

  "/admin/clients/stub/": {
    pageTitle: "Offline Clients",
    steps: [
      {
        id: "stub-overview",
        order: 1,
        title: "An offline client record",
        body: "This is a private record for a client who isn't on the platform yet. You can book sessions, write encrypted notes, and record payments — all just like a full account.",
        target: "#main-content h1",
      },
      {
        id: "stub-actions",
        order: 2,
        title: "Edit or invite them",
        body: "'Edit client' updates their details. When they're ready to join, open the dropdown and pick 'Invite to platform' for a personal sign-up link — once they register, everything you've logged moves across with them.",
      },
      {
        id: "stub-sections",
        order: 3,
        title: "Sessions and surveys",
        body: "'+ Add session' and '+ Assign survey' in each section work exactly as they do for a full account. Nothing here is held back because they haven't signed up.",
      },
    ],
  },

  "/admin/forms": {
    pageTitle: "Forms",
    steps: [
      {
        id: "admin-forms-intro",
        order: 1,
        title: "Building check-in forms",
        body: "Forms are the questionnaires clients fill in between sessions. Build them from sliders, text boxes, and multiple-choice questions.",
        target: "#main-content h1",
      },
      {
        id: "admin-forms-new",
        order: 2,
        title: "New form and tags",
        body: "'+ New form' starts one from scratch. The dropdown also has 'Manage tags', which help you group and filter forms once you have a few.",
        actions: [{ label: "Create a form", to: "/admin/forms?new=true" }],
      },
      {
        id: "admin-forms-cards",
        order: 3,
        title: "Pausing a form",
        body: "Each form has Assign, Edit, Pause, and Delete. Pause makes it inactive — you can't assign it any more, but every answer already collected stays put. It's a safe way to retire a form.",
      },
      {
        id: "admin-forms-assign",
        order: 4,
        title: "Assigning a form",
        body: "Assign a form from a client's profile (Clients → pick a client → Forms). Choose how often they should fill it in, and the app tracks when it's next due.",
      },
    ],
  },

  "/admin/scheduler": {
    pageTitle: "Scheduler",
    steps: [
      {
        id: "scheduler-intro",
        order: 1,
        title: "Your week",
        body: "The scheduler lays out your whole week as a calendar. Booked sessions show up as coloured blocks.",
        target: "#main-content h1",
      },
      {
        id: "scheduler-actions",
        order: 2,
        title: "Booking a session",
        body: "'Create new session' books one — pick a client (offline clients included), then set the time and details. The dropdown adds two shortcuts: 'Add private event' to block out time, and 'Manage availability' to set your regular hours and one-off changes like holidays.",
        actions: [
          { label: "Book a session", to: "/admin/scheduler?newSession=1" },
          { label: "Set availability", to: "/admin/scheduler?availability=1" },
        ],
      },
      {
        id: "scheduler-booking",
        order: 3,
        title: "Opening a session",
        body: "Click any coloured block to open that session. From there you can reschedule it, mark it paid, add notes, or cancel it.",
      },
    ],
  },

  "/admin/payments": {
    pageTitle: "Payments",
    steps: [
      {
        id: "payments-intro",
        order: 1,
        title: "Tracking payments",
        body: "Every payment you record shows up here — paid, pending, and overdue — and it fills up as you book and get paid for sessions. Click a column title to sort.",
        target: "#main-content h1",
      },
      {
        id: "payments-actions",
        order: 2,
        title: "Add payment and filter",
        body: "'Add payment' records a cash or bank transfer by hand — choose the session, enter the amount, and its status updates everywhere. The dropdown next to it narrows the list to one client.",
        actions: [{ label: "Add a payment", to: "/admin/payments?new=true" }],
      },
      {
        id: "payments-pending",
        order: 3,
        title: "Bank transfers to confirm",
        body: "When a client says they've sent a bank transfer, it shows up here with Confirm and Decline buttons. Nothing counts as paid until you confirm it.",
      },
    ],
  },

  "/admin/resources": {
    pageTitle: "Resources",
    steps: [
      {
        id: "admin-resources-intro",
        order: 1,
        title: "Sharing resources",
        body: "Anything you add here shows up on your clients' own Resources page automatically.",
        target: "#main-content h1",
      },
      {
        id: "admin-resources-add",
        order: 2,
        title: "Add resource",
        body: "'+ Add resource' lets you upload or link an article, PDF, worksheet, or YouTube video.",
        actions: [{ label: "Add a resource", to: "/admin/resources?new=true" }],
      },
      {
        id: "admin-resources-visibility",
        order: 3,
        title: "Who sees what",
        body: "Each resource has a visibility setting. 'All clients' shares it with everyone. To share with one person only, open their profile, go to the Resources tab, and switch it on for them.",
      },
    ],
  },

  // ── CPD log ────────────────────────────────────────────────────

  "/admin/cpd": {
    pageTitle: "CPD Log",
    steps: [
      {
        id: "cpd-intro",
        order: 1,
        title: "Your CPD log",
        body: "Keep a record of your professional development here — training, reading, conferences, and so on — each one dated and categorised, ready to export when you need to show your hours.",
        target: "#cpd-header",
      },
      {
        id: "cpd-add",
        order: 2,
        title: "Add entry and export",
        body: "'Add entry' logs a new activity. The dropdown's 'Export…' lets you download your full log as a spreadsheet or PDF.",
        target: "#cpd-header",
        actions: [{ label: "Add an entry", to: "/admin/cpd?new=true" }],
      },
      {
        id: "cpd-progress",
        order: 3,
        title: "Hours this year",
        body: "This bar shows the CPD hours you've logged this year against your yearly target. Click the number to change the target whenever it needs updating.",
        target: "#cpd-progress",
      },
      {
        id: "cpd-filters",
        order: 4,
        title: "Filter by type",
        body: "These tabs filter your log by category — Training, Reading, Conference, and the rest. The hours shown on each tab update as you add entries.",
        target: "#cpd-filters",
      },
    ],
  },

  // ── Supervision ────────────────────────────────────────────────

  "/admin/supervision": {
    pageTitle: "Supervision",
    steps: [
      {
        id: "supervision-intro",
        order: 1,
        title: "Supervision log",
        body: "Keep your supervision sessions separate from your general CPD — date, supervisor, length, and cost if you want to record it.",
        target: "#supervision-header",
      },
      {
        id: "supervision-add",
        order: 2,
        title: "Add session and export",
        body: "'Add session' logs an entry — date, supervisor, length, and optional cost. The dropdown exports the log as a PDF.",
        target: "#supervision-header",
        actions: [{ label: "Log a session", to: "/admin/supervision?new=true" }],
      },
      {
        id: "supervision-stats",
        order: 3,
        title: "This year so far",
        body: "These cards show your supervision sessions and hours for this year, plus any fees you've recorded. They update as you add or edit entries.",
        target: "#supervision-stats",
      },
      {
        id: "supervision-chart",
        order: 4,
        title: "Month by month",
        body: "The bar chart shows your supervision hours for each month — handy for keeping ahead of any minimum you need to hit.",
        target: "#supervision-chart",
      },
    ],
  },

  // ── Audit logs ────────────────────────────────────────────────

  "/admin/audit-logs": {
    pageTitle: "Activity Log",
    steps: [
      {
        id: "audit-intro",
        order: 1,
        title: "Your activity log",
        body: "As you work, important actions get recorded here — clients added or removed, forms created, resources uploaded, notes changed, and more. Each line shows who did it and when.",
        target: "#audit-header",
      },
      {
        id: "audit-refresh",
        order: 2,
        title: "Refresh",
        body: "Press this to pull in the latest activity if you've had the page open for a while.",
        target: "#audit-header",
      },
      {
        id: "audit-filters",
        order: 3,
        title: "Filter by area",
        body: "These buttons narrow the list to one area: Clients, Check-ins, Resources, or Tags. The search box above finds a specific entry.",
        target: "#audit-filters",
      },
      {
        id: "audit-feed",
        order: 4,
        title: "Reading an entry",
        body: "Each line says what changed, who changed it, and the exact date and time.",
        target: "#audit-feed",
      },
    ],
  },
};
