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
        body: "Use these buttons to switch between a calendar view (see your sessions laid out on a weekly calendar) and a list view (past and upcoming sessions sorted by date). The calendar also shows your counsellor's available slots.",
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
        title: "Resources Your counsellor Has Shared",
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
        body: "Store your business name, contact details, and bank account information. You can also connect a Stripe account for card payments and manage your subscription from here. Sensitive fields are encrypted at rest.",
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
        body: "Personalise how the app looks and behaves — toggle widgets on the dashboard, switch client codenames on or off, adjust the sidebar button position, and reset page walkthroughs if you ever want to replay them.",
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
        body: "The dashboard is your command centre. The header shows a greeting and your practice name so you can always tell which account you're in at a glance.",
        target: "#dash-header",
      },
      {
        id: "admin-quick-actions",
        order: 2,
        title: "Quick Actions",
        body: "These icon buttons let you jump straight to creating a session, adjusting your availability, building a new form, or generating a client sign-up token — all without navigating away from the dashboard.",
        target: "#dash-quick-actions",
      },
      {
        id: "admin-alerts",
        order: 3,
        title: "Collapsible Sections",
        body: "Below the header you'll see upcoming sessions, practice trends, and your to-do list. Each section can be collapsed by clicking its header — your collapsed state is saved between visits so the dashboard stays how you left it.",
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
        id: "clients-shadow",
        order: 2,
        title: "Offline Clients",
        body: "Offline clients are private placeholder records for people you see who haven't created an account yet. You can log sessions, write notes, and track payments for them exactly like a real client account.",
      },
      {
        id: "clients-tokens",
        order: 3,
        title: "Generating Sign-Up Tokens",
        body: "Click 'Create access token' to generate a unique, one-time sign-up link. Share the link with your client — once they use it to register, the token is consumed automatically and can't be reused.",
        target: "#clients-header",
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
        body: "Everything for this client lives here. Tabs across the top let you switch between their session history, check-in form responses, your encrypted private notes, and their payment record.",
        target: "#main-content h1",
      },
      {
        id: "client-detail-notes",
        order: 2,
        title: "Encrypted Session Notes",
        body: "Your session notes are encrypted on your device before they're saved — only you can ever read them. The first time you open the notes tab you'll be prompted to set up your personal encryption key.",
      },
      {
        id: "client-detail-forms",
        order: 3,
        title: "Reviewing Form Responses",
        body: "The Forms tab shows every check-in this client has submitted, charted over time. You can see individual question scores and spot trends to track progress across sessions.",
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
        id: "stub-invite",
        order: 2,
        title: "Inviting Them to Join",
        body: "When your client is ready, click 'Invite' to generate a personal sign-up link. Once they register with it, their offline record links to their new account and all history carries over automatically.",
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
        body: "Forms are the questionnaires your clients complete between sessions. Click 'New form' to create one from scratch. You can add scale sliders, free-text fields, and multiple choice questions.",
        target: "#main-content h1",
      },
      {
        id: "admin-forms-assign",
        order: 2,
        title: "Assigning Forms to Clients",
        body: "Once a form is created, assign it from the client's profile page (Clients → select client → Forms tab). Set how frequently they should complete it and the system tracks when it's due next.",
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
        body: "The scheduler shows your full week as a calendar. Booked sessions appear as coloured blocks. Use the arrows to navigate between weeks, or click 'Today' to return to the current week.",
        target: "#main-content h1",
      },
      {
        id: "scheduler-availability",
        order: 2,
        title: "Setting Your Availability",
        body: "Click 'Manage availability' to define your regular working hours and add one-off exceptions like bank holidays or leave. Clients can only see and book slots within your available windows.",
      },
      {
        id: "scheduler-booking",
        order: 3,
        title: "Creating a Session",
        body: "Click any free slot on the calendar to open the session booking form. Select a client, confirm the time, and save. The session is instantly visible to the client on their dashboard.",
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
        body: "Every payment record across all your clients is listed here — paid, pending, and overdue. Click any column header to sort the table. The total row at the bottom updates with your current filter.",
        target: "#main-content h1",
      },
      {
        id: "payments-log",
        order: 2,
        title: "Recording a Payment",
        body: "Click 'Log payment' to manually record a bank transfer or cash payment. Select the linked session, enter the amount, and save. The session's payment status updates across the whole app automatically.",
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
        body: "Upload or link any material you want to share — articles, PDFs, worksheets, YouTube videos. Once added, resources are visible to clients on their Resources page.",
        target: "#main-content h1",
      },
      {
        id: "admin-resources-visibility",
        order: 2,
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
        body: "Track your continuing professional development here. Log supervision, training, reading, conferences, and more — all categorised and dated, ready for export when you need to evidence hours to an accrediting body.",
        target: "#cpd-header",
      },
      {
        id: "cpd-progress",
        order: 2,
        title: "Annual Hours Progress Bar",
        body: "This bar shows how many CPD hours you've logged this year against your personal annual target. Click the target number on the right to edit it whenever your requirements change.",
        target: "#cpd-progress",
      },
      {
        id: "cpd-filters",
        order: 3,
        title: "Filtering by Activity Type",
        body: "Use these tabs to filter your log by category — Supervision, Training, Reading, Conference, and so on. 'All' shows the complete log in date order. The hour count in each tab updates as you add entries.",
        target: "#cpd-filters",
      },
      {
        id: "cpd-export",
        order: 4,
        title: "Adding Entries & Exporting",
        body: "Click 'Add entry' to log a new CPD activity. When you need a record for accreditation, use the export dropdown to download your full log as a CSV or PDF.",
        target: "#cpd-header",
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
        body: "Track your professional supervision sessions separately from your general CPD. Each entry records the date, supervisor name, duration, and optional cost — giving you a clean audit trail for accreditation.",
        target: "#supervision-header",
      },
      {
        id: "supervision-stats",
        order: 2,
        title: "Year-to-Date Summary",
        body: "These cards show your total supervision sessions and hours for the current year, plus fees paid if you've recorded costs. They update in real time as you add or edit entries.",
        target: "#supervision-stats",
      },
      {
        id: "supervision-chart",
        order: 3,
        title: "Monthly Distribution Chart",
        body: "The bar chart breaks down your supervision hours month by month. A quick glance tells you if you're keeping up a regular cadence — useful for staying ahead of any minimum hour requirements.",
        target: "#supervision-chart",
      },
      {
        id: "supervision-add",
        order: 4,
        title: "Logging a Session",
        body: "Click 'Add session' to record a new supervision entry. Flag it as 'Count as CPD' and it will also appear in your CPD log automatically — no need to enter it twice.",
        target: "#supervision-header",
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
        id: "audit-filters",
        order: 2,
        title: "Filtering by Category",
        body: "Use these filter buttons to narrow the feed to a specific area: Clients, Check-ins, Resources, or Tags. The entry count above the feed updates to reflect the current filter.",
        target: "#audit-filters",
      },
      {
        id: "audit-feed",
        order: 3,
        title: "Reading Activity Entries",
        body: "Each line describes what changed, who made the change, and the exact date and time. Use the Refresh button in the top-right to pull in the latest activity if you've been on this page for a while.",
        target: "#audit-feed",
      },
    ],
  },
};
