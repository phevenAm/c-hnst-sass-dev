export interface WalkthroughStep {
  id: string;
  title: string;
  body: string;
  target?: string; // CSS selector — element to spotlight
  order: number;
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
        title: "Welcome to your Dashboard",
        body: "This is your home screen. The greeting updates based on the time of day. Below it you'll find everything your counsellor has set up for you — sessions, check-in forms, your progress chart, and curated resources.",
        target: "#client-dash-header",
      },
      {
        id: "dashboard-stats",
        order: 2,
        title: "Your Wellbeing at a Glance",
        body: "These cards show your latest average score, how many check-ins you've completed, your overall change since you started, and how many forms are waiting. They update automatically every time you submit a check-in.",
        target: "#client-stats",
      },
      {
        id: "dashboard-chart",
        order: 3,
        title: "Your Progress Chart",
        body: "This chart plots your wellbeing scores over time from every check-in you've submitted. It updates each time you complete a form so you can track how you've been progressing across your sessions.",
        target: "#client-chart",
      },
      {
        id: "dashboard-checkins",
        order: 4,
        title: "Check-Ins Ready to Complete",
        body: "Any forms your counsellor has assigned that are due appear here. Click 'Start' next to a form to open it. Once you submit, the card disappears until it's due again based on its frequency.",
        target: "#client-checkins",
      },
    ],
  },

  "/check-in": {
    pageTitle: "Check-In Forms",
    steps: [
      {
        id: "forms-intro",
        order: 1,
        title: "Your Check-In Forms",
        body: "Your counsellor assigns forms to help track how you're feeling between sessions. This page shows all forms currently assigned to you — complete them at your own pace.",
        target: "#forms-header",
      },
      {
        id: "forms-tabs",
        order: 2,
        title: "Form Categories",
        body: "Forms are grouped into three types: Outcome Measures (regular wellbeing check-ins), Feedback (how your sessions are going), and Onboarding (a one-time setup form). Switch between them using these tabs.",
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
        title: "Your Session History",
        body: "Every session your counsellor has booked with you appears here — upcoming, completed, and cancelled. Your next upcoming session is always shown at the top for quick reference.",
        target: "#sessions-header",
      },
      {
        id: "sessions-view",
        order: 2,
        title: "List or Calendar View",
        body: "Use these buttons to switch between a calendar view (your sessions laid out on a weekly calendar, alongside your counsellor's available slots) and a list view (past and upcoming sessions sorted by date).",
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
        title: "Resources Shared By Your Counsellor",
        body: "This page shows everything your counsellor has chosen to share with you — articles, worksheets, videos, and links. New resources appear here automatically as your counsellor adds them.",
        target: "#resources-header",
      },
      {
        id: "resources-search",
        order: 2,
        title: "Search Resources",
        body: "Type a keyword here to search across all resource titles, summaries, and categories. Useful when you remember a topic but can't find the specific card.",
        target: "#resources-search",
      },
      {
        id: "resources-filter",
        order: 3,
        title: "Filter by Type",
        body: "Click a type button to narrow down to just articles, videos, or documents. 'All' shows everything. The filter and search work together — you can search within a filtered type.",
        target: "#resources-filter",
      },
    ],
  },

  // ── Settings (shared by both roles) ───────────────────────────

  "/settings": {
    pageTitle: "Settings",
    steps: [
      {
        id: "settings-intro",
        order: 1,
        title: "Settings Overview",
        body: "Manage your account, profile, and practice preferences here. Clients see a single profile form. Admins get four tabs across the top — each covering a different area of the app.",
        target: "#settings-header",
      },
      {
        id: "settings-profile-tab",
        order: 2,
        title: "Profile Tab",
        body: "Update your display name, change your profile photo, and manage your password. Clients also see a Focus Keywords section here — the keywords you pick shape the inspirational quotes on your dashboard.",
        target: "#settings-tabs button:nth-child(1)",
      },
      {
        id: "settings-practice-tab",
        order: 3,
        title: "Practice Tab",
        body: "Store your business name, contact details, bank account information, and client codenames. You can also connect a Stripe account for card payments and manage your subscription from here. Sensitive fields are encrypted at rest. Each section is collapsible — click its header to fold it away — and the search box at the top jumps straight to the one you need.",
        target: "#settings-tabs button:nth-child(2)",
      },
      {
        id: "settings-emails-tab",
        order: 4,
        title: "Emails Tab",
        body: "Control every automated email your clients receive: reminders, booking confirmations, cancellations, reschedules, and payment receipts. Toggle each one on or off, customise the content, and send a test to your inbox.",
        target: "#settings-tabs button:nth-child(3)",
      },
      {
        id: "settings-interface-tab",
        order: 5,
        title: "Interface Tab",
        body: "Personalise how the app looks and behaves — toggle widgets on the dashboard, adjust the sidebar button position, and reset page walkthroughs if you ever want to replay them. Like Practice, every section here collapses and can be filtered with the search box at the top.",
        target: "#settings-tabs button:nth-child(4)",
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
        title: "Practice Overview",
        body: "This is your practice at a glance: what's coming up, what needs your attention, and how things are trending — so you can start your day here instead of digging through every page individually.",
        target: "#dash-header",
      },
      {
        id: "admin-quick-actions",
        order: 2,
        title: "Quick Actions",
        body: "These icon buttons take you straight to creating a session, inviting a client, building a new form, or adjusting your availability — each one lands you on the right page with that action already open, so you're not hunting for it once you get there.",
        target: "#dash-quick-actions",
      },
      {
        id: "admin-alerts",
        order: 3,
        title: "Collapsible Sections",
        body: "Below that: upcoming sessions, anything needing your attention, outstanding payments, practice trends, and your to-do list. Click a section's header to collapse it — your collapsed state is saved between visits so the dashboard stays how you left it.",
      },
    ],
  },

  "/admin/clients": {
    pageTitle: "Clients",
    steps: [
      {
        id: "clients-directory",
        order: 1,
        title: "Your Client Directory",
        body: "All your clients — real accounts and offline records — are listed here. Click any row to open their full profile with sessions, notes, forms, and payments.",
        target: "#clients-header",
      },
      {
        id: "clients-actions",
        order: 2,
        title: "Invite a Client",
        body: "'Invite a client' emails them a one-time sign-up link directly — it's consumed automatically once they register. Its dropdown covers everything else: generate a token to share yourself instead of emailing it, manage outstanding tokens, bulk-import clients from a CSV, or create an offline client record.",
        target: "#clients-header",
      },
      {
        id: "clients-offline",
        order: 3,
        title: "Offline Clients",
        body: "Offline clients are private placeholder records for people you see who haven't created an account yet. You can log sessions, write notes, and track payments for them exactly like a real client account.",
      },
    ],
  },

  "/admin/clients/": {
    pageTitle: "Client Profile",
    steps: [
      {
        id: "client-detail-overview",
        order: 1,
        title: "Client Profile",
        body: "Everything for this client lives here, across six tabs: Client details, Session history, Check-in scores, Account summary, Form results, and Payments.",
        target: "#main-content h1",
      },
      {
        id: "client-detail-actions",
        order: 2,
        title: "Configure Client",
        body: "'Configure client' sets an optional codename to show instead of their real name across your admin, and has a shortcut to their Account summary. Its dropdown exports their record as a PDF, and mutes or unmutes your session reminders for them.",
      },
      {
        id: "client-detail-sessions",
        order: 3,
        title: "Session History & Notes",
        body: "Book a new session for this client directly from the '+ New session' button here — no need to go via the Scheduler. Open any session to add your encrypted notes; the first time you do, you'll be prompted to set up your personal encryption key.",
      },
      {
        id: "client-detail-scores",
        order: 4,
        title: "Check-In Scores vs. Form Results",
        body: "Check-in scores charts their wellbeing trend over time. Form results shows the individual answers behind each submission — use scores for the trend, results for the detail.",
      },
    ],
  },

  "/admin/clients/stub/": {
    pageTitle: "Offline Clients",
    steps: [
      {
        id: "stub-overview",
        order: 1,
        title: "Offline Client Record",
        body: "This is a private offline record for a client who isn't on the platform yet. You can create sessions, write encrypted notes, and record payments — all the same as a real client account.",
        target: "#main-content h1",
      },
      {
        id: "stub-actions",
        order: 2,
        title: "Edit or Invite This Client",
        body: "'Edit client' updates their stored details. When they're ready to join properly, open its dropdown and choose 'Invite to platform' to generate a personal sign-up link — once they register, their offline history carries over automatically.",
      },
      {
        id: "stub-sections",
        order: 3,
        title: "Sessions & Surveys",
        body: "'+ Add session' and '+ Assign survey' inside each section work exactly as they would for a real client — nothing here is limited by them not having an account yet.",
      },
    ],
  },

  "/admin/forms": {
    pageTitle: "Forms",
    steps: [
      {
        id: "admin-forms-intro",
        order: 1,
        title: "Building Check-In Forms",
        body: "Forms are the questionnaires your clients complete between sessions — built from scale sliders, free-text fields, and multiple choice questions.",
        target: "#main-content h1",
      },
      {
        id: "admin-forms-new",
        order: 2,
        title: "New Form & Tags",
        body: "'+ New form' starts one from scratch. Its dropdown also has 'Manage tags' — used to categorise and filter your forms as your list grows.",
      },
      {
        id: "admin-forms-cards",
        order: 3,
        title: "Pausing a Form",
        body: "Each form card has Assign, Edit, Pause, and Delete. Pause just flips it inactive — it stops being assignable to clients without touching any historical responses already collected, so it's a safe way to retire a form.",
      },
      {
        id: "admin-forms-assign",
        order: 4,
        title: "Assigning Forms to Clients",
        body: "Assign a form from the client's profile page (Clients → select client → Forms). Set how frequently they should complete it and the system tracks when it's due next.",
      },
    ],
  },

  "/admin/scheduler": {
    pageTitle: "Scheduler",
    steps: [
      {
        id: "scheduler-intro",
        order: 1,
        title: "Your Weekly Schedule",
        body: "The scheduler shows your full week as a calendar. Booked sessions appear as coloured blocks.",
        target: "#main-content h1",
      },
      {
        id: "scheduler-actions",
        order: 2,
        title: "Create New Session",
        body: "'Create new session' books a session — pick a client (or an offline one) first, then confirm the time and details. Its dropdown has two more shortcuts: 'Add private event' for blocking out time on the calendar, and 'Manage availability' to set your regular working hours and one-off exceptions like holidays.",
      },
      {
        id: "scheduler-booking",
        order: 3,
        title: "Viewing a Booked Session",
        body: "Click any coloured block on the calendar to open that session's details — reschedule, mark it paid, add notes, or cancel it, all from there.",
      },
    ],
  },

  "/admin/payments": {
    pageTitle: "Payments",
    steps: [
      {
        id: "payments-intro",
        order: 1,
        title: "Payment Tracking",
        body: "Every payment record across all your clients is listed here — paid, pending, and overdue. Click any column header to sort the table.",
        target: "#main-content h1",
      },
      {
        id: "payments-actions",
        order: 2,
        title: "Add Payment & Filter by Client",
        body: "'Add payment' manually records a bank transfer or cash payment — pick the linked session, enter the amount, and the session's status updates everywhere automatically. The dropdown beside it filters the table down to one client.",
      },
      {
        id: "payments-pending",
        order: 3,
        title: "Pending Bank Transfers",
        body: "When a client marks a manual bank transfer as sent, it appears here as its own card with Confirm / Decline buttons — nothing is marked paid until you action it.",
      },
    ],
  },

  "/admin/resources": {
    pageTitle: "Resources",
    steps: [
      {
        id: "admin-resources-intro",
        order: 1,
        title: "Sharing Resources with Clients",
        body: "Anything you add here becomes visible to clients on their own Resources page automatically.",
        target: "#main-content h1",
      },
      {
        id: "admin-resources-add",
        order: 2,
        title: "Add Resource",
        body: "'+ Add resource' uploads or links articles, PDFs, worksheets, or YouTube videos.",
      },
      {
        id: "admin-resources-visibility",
        order: 3,
        title: "Managing Who Sees What",
        body: "Each resource has a visibility setting. 'All clients' makes it available to everyone. To share something with just one person, go to their profile, open the Resources tab, and toggle the resource on for them.",
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
        title: "Your CPD Log",
        body: "Track your continuing professional development here — training, reading, conferences, and more — all categorised and dated, ready for export when you need to evidence hours to an accrediting body.",
        target: "#cpd-header",
      },
      {
        id: "cpd-add",
        order: 2,
        title: "Add Entry & Export",
        body: "'Add entry' logs a new CPD activity. Its dropdown's 'Export…' opens a picker for a CSV or PDF download of your full log.",
        target: "#cpd-header",
      },
      {
        id: "cpd-progress",
        order: 3,
        title: "Annual Hours Progress Bar",
        body: "This bar shows how many CPD hours you've logged this year against your personal annual target — click the number to edit it directly whenever your requirements change.",
        target: "#cpd-progress",
      },
      {
        id: "cpd-filters",
        order: 4,
        title: "Filtering by Activity Type",
        body: "Use these tabs to filter your log by category — Training, Reading, Conference, and so on. The hour count in each tab updates as you add entries.",
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
        title: "Supervision Log",
        body: "Track your professional supervision sessions separately from your general CPD — date, supervisor name, duration, and optional cost, for a clean audit trail.",
        target: "#supervision-header",
      },
      {
        id: "supervision-add",
        order: 2,
        title: "Add Session & Export",
        body: "'Add session' logs a new entry — date, supervisor, duration, and optional cost. Its dropdown exports the log as a PDF.",
        target: "#supervision-header",
      },
      {
        id: "supervision-stats",
        order: 3,
        title: "Year-to-Date Summary",
        body: "These cards show your total supervision sessions and hours for the current year, plus fees paid if you've recorded costs. They update in real time as you add or edit entries.",
        target: "#supervision-stats",
      },
      {
        id: "supervision-chart",
        order: 4,
        title: "Monthly Distribution Chart",
        body: "The bar chart breaks down your supervision hours month by month — useful for staying ahead of any minimum hour requirements.",
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
        title: "Your Practice Activity Log",
        body: "Every significant action in your practice is recorded here — clients added or removed, forms created, resources uploaded, session notes changed, and more. Each entry shows who did what and exactly when.",
        target: "#audit-header",
      },
      {
        id: "audit-refresh",
        order: 2,
        title: "Refresh",
        body: "This button pulls in the latest activity if you've been on the page for a while.",
        target: "#audit-header",
      },
      {
        id: "audit-filters",
        order: 3,
        title: "Filtering by Category",
        body: "Use these filter buttons to narrow the feed to a specific area: Clients, Check-ins, Resources, or Tags. Search activity above them to find a specific entry directly.",
        target: "#audit-filters",
      },
      {
        id: "audit-feed",
        order: 4,
        title: "Reading Activity Entries",
        body: "Each line describes what changed, who made the change, and the exact date and time.",
        target: "#audit-feed",
      },
    ],
  },
};
