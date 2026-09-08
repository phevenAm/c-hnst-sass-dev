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
        body: "Your sessions, forms, progress, and shared resources come together here.",
        target: "#client-dash-header",
      },
      {
        id: "dashboard-stats",
        order: 2,
        title: "Your wellbeing at a glance",
        body: "A quick view of your latest scores and anything waiting for you.",
        target: "#client-stats",
      },
      {
        id: "dashboard-chart",
        order: 3,
        title: "Your progress chart",
        body: "See how your check-in scores change over time.",
        target: "#client-chart",
      },
      {
        id: "dashboard-checkins",
        order: 4,
        title: "Check-ins to complete",
        body: "Forms your counsellor has asked you to complete appear here when they are due.",
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
        body: "Complete the forms your counsellor has shared between sessions.",
        target: "#forms-header",
      },
      {
        id: "forms-tabs",
        order: 2,
        title: "The three tabs",
        body: "Check-ins can repeat over time, outcome measures are usually one-off, and feedback forms let you share how sessions are going.",
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
        body: "Find your upcoming, completed, and cancelled sessions here.",
        target: "#sessions-header",
      },
      {
        id: "sessions-view",
        order: 2,
        title: "Calendar or list",
        body: "Switch between a weekly calendar and a simple list of sessions.",
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
        body: "Your counsellor's shared articles, worksheets, videos, and links live here.",
        target: "#resources-header",
      },
      {
        id: "resources-search",
        order: 2,
        title: "Search",
        body: "Search your resources by title, summary, or topic.",
        target: "#resources-search",
      },
      {
        id: "resources-filter",
        order: 3,
        title: "Filter by type",
        body: "Narrow the list by resource type. Search and filters work together.",
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
        body: "Manage your account and personal preferences here.",
        target: "#settings-header",
        role: "client",
      },
      {
        id: "settings-client-profile",
        order: 2,
        title: "Profile and keywords",
        body: "Update your profile, password, and dashboard preferences here.",
        role: "client",
      },
      // ── Counsellor view: tabbed, one per area of the app ──
      {
        id: "settings-intro",
        order: 1,
        title: "Settings",
        body: "Settings brings your profile, practice, schedule, billing, emails, and display preferences together.",
        target: "#settings-header",
        role: "admin",
      },
      {
        id: "settings-profile-tab",
        order: 2,
        title: "Profile",
        body: "Update your name, photo, and password.",
        target: "#settings-tabs button:nth-child(1)",
        role: "admin",
      },
      {
        id: "settings-practice-tab",
        order: 3,
        title: "Practice",
        body: "Manage your practice details, client privacy settings, resources, and consent agreement.",
        target: "#settings-tabs button:nth-child(2)",
        role: "admin",
      },
      {
        id: "settings-schedule-tab",
        order: 4,
        title: "Schedule & bookings",
        body: "Set your availability, booking rules, reminders, and other schedule preferences.",
        target: "#settings-tabs button:nth-child(3)",
        role: "admin",
      },
      {
        id: "settings-billing-tab",
        order: 5,
        title: "Billing",
        body: "Manage session prices, payment options, and your subscription.",
        target: "#settings-tabs button:nth-child(4)",
        role: "admin",
      },
      {
        id: "settings-session-types",
        order: 6,
        title: "Session types & prices",
        body: "Save common session prices and durations so booking takes less time.",
        target: "#settings-tabs button:nth-child(4)",
        role: "admin",
      },
      {
        id: "settings-emails-tab",
        order: 7,
        title: "Emails",
        body: "Choose which client emails are sent and adjust their wording.",
        target: "#settings-tabs button:nth-child(5)",
        role: "admin",
      },
      {
        id: "settings-interface-tab",
        order: 8,
        title: "Interface & accessibility",
        body: "Adjust display, accessibility, dashboard, and walkthrough preferences.",
        target: "#settings-tabs button:nth-child(6)",
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
        body: "A quick view of your upcoming work and anything that needs attention.",
        target: "#dash-header",
      },
      {
        id: "admin-quick-actions",
        order: 2,
        title: "Quick actions",
        body: "Start the tasks you use most: book a session, invite a client, create a form, or set availability.",
        target: "#dash-quick-actions",
        actions: [
          { label: "Book a session", to: "/admin/scheduler?newSession=1" },
          { label: "Invite a client", to: "/admin/clients?new=true" },
        ],
      },
      {
        id: "admin-alerts",
        order: 3,
        title: "Keep the dashboard focused",
        body: "The chevrons show which sections can be opened or collapsed. Close sections you do not need right now so the areas needing your attention stay easier to see.",
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
        body: "Your client list includes both portal users and offline records. Open a client to see their sessions, notes, forms, and payments.",
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
        body: "Invite someone to the portal, add an offline client, or bring in a client list from a spreadsheet.",
        target: "#clients-header",
      },
      {
        id: "clients-offline",
        order: 3,
        title: "Offline clients",
        body: "Keep a complete record for clients who are not using the portal. Invite them later without losing their history.",
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
        body: "This is the client's home for details, sessions, forms, notes, and payments.",
        target: "#main-content h1",
      },
      {
        id: "client-detail-actions",
        order: 2,
        title: "Configure client",
        body: "Use Configure client to control what is shown, set a codename, and manage reminders or exports.",
      },
      {
        id: "client-detail-sessions",
        order: 3,
        title: "Sessions and notes",
        body: "Book sessions, add notes, and use your saved session types. Recurring blocks can create several weekly sessions at once.",
      },
      {
        id: "client-detail-scores",
        order: 4,
        title: "Scores vs. results",
        body: "Scores show the trend; form results show the answers behind it.",
      },
      {
        id: "client-detail-danger-zone",
        order: 5,
        title: "Pause, deactivate, or delete",
        body: "Pause access temporarily, deactivate a client while keeping their record, or delete their data permanently.",
        target: "#danger-zone",
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
        body: "A full working record for a client who is not using the portal yet.",
        target: "#main-content h1",
      },
      {
        id: "stub-actions",
        order: 2,
        title: "Edit or invite them",
        body: "Update their details or invite them later. Their existing history moves with them when they join.",
      },
      {
        id: "stub-sections",
        order: 3,
        title: "Sessions and surveys",
        body: "Book sessions and assign forms just as you would for a portal client.",
      },
    ],
  },

  "/admin/forms": {
    pageTitle: "Forms",
    steps: [
      {
        id: "admin-forms-intro",
        order: 1,
        title: "Forms for your clients",
        body: "Create and manage check-ins, outcome measures, and feedback forms for your clients.",
        target: "#main-content h1",
      },
      {
        id: "admin-forms-new",
        order: 2,
        title: "New form and tags",
        body: "Create a form, choose its purpose, and add the questions your clients need.",
        actions: [{ label: "Create a form", to: "/admin/forms?new=true" }],
      },
      {
        id: "admin-forms-cards",
        order: 3,
        title: "Managing a form",
        body: "Keep forms tidy by editing, assigning, pausing, archiving, or deleting them.",
      },
      {
        id: "admin-forms-assign",
        order: 4,
        title: "Assigning a form",
        body: "Assign forms from a client's profile and choose how often a check-in repeats.",
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
        body: "See your week at a glance, with booked sessions laid out on the calendar.",
        target: "#main-content h1",
      },
      {
        id: "scheduler-actions",
        order: 2,
        title: "Booking a session",
        body: "Book sessions, block private time, and set the hours clients can request.",
        actions: [
          { label: "Book a session", to: "/admin/scheduler?newSession=1" },
          { label: "Set availability", to: "/admin/scheduler?availability=1" },
        ],
      },
      {
        id: "scheduler-booking",
        order: 3,
        title: "Opening a session",
        body: "Open a session to update its time, payment, notes, or status.",
      },
    ],
  },

  "/admin/finances": {
    pageTitle: "Finances",
    steps: [
      {
        id: "payments-intro",
        order: 1,
        title: "Income and expenses",
        body: "Review income, expenses, and the financial picture of your practice.",
        target: "#main-content h1",
      },
      {
        id: "payments-actions",
        order: 2,
        title: "Record payments and expenses",
        body: "Record payments and expenses as they happen.",
        actions: [{ label: "Record a payment", to: "/admin/finances?view=income&new=true" }],
      },
      {
        id: "payments-pending",
        order: 3,
        title: "Bank transfers to confirm",
        body: "Review pending bank transfers before marking them as paid.",
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
        body: "Share useful material with clients between sessions.",
        target: "#main-content h1",
      },
      {
        id: "admin-resources-add",
        order: 2,
        title: "Add resource",
        body: "Add an article, PDF, worksheet, video, or link.",
        actions: [{ label: "Add a resource", to: "/admin/resources?new=true" }],
      },
      {
        id: "admin-resources-visibility",
        order: 3,
        title: "Who sees what",
        body: "Choose whether a resource is available to everyone or one client.",
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
        body: "Keep your professional development record in one place.",
        target: "#cpd-header",
      },
      {
        id: "cpd-add",
        order: 2,
        title: "Add entry and export",
        body: "Add activities and export your record when you need it.",
        target: "#cpd-header",
        actions: [{ label: "Add an entry", to: "/admin/cpd?new=true" }],
      },
      {
        id: "cpd-progress",
        order: 3,
        title: "Hours this year",
        body: "Track this year's hours against your target.",
        target: "#cpd-progress",
      },
      {
        id: "cpd-filters",
        order: 4,
        title: "Filter by type",
        body: "Filter your record by activity type.",
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
        body: "Keep a separate record of supervision sessions and hours.",
        target: "#supervision-header",
      },
      {
        id: "supervision-add",
        order: 2,
        title: "Add session and export",
        body: "Add supervision sessions and export the record when needed.",
        target: "#supervision-header",
        actions: [{ label: "Log a session", to: "/admin/supervision?new=true" }],
      },
      {
        id: "supervision-stats",
        order: 3,
        title: "This year so far",
        body: "See your sessions, hours, and recorded fees for the year.",
        target: "#supervision-stats",
      },
      {
        id: "supervision-chart",
        order: 4,
        title: "Month by month",
        body: "See how your supervision hours are spread across the year.",
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
        body: "A record of important changes made in your practice.",
        target: "#audit-header",
      },
      {
        id: "audit-refresh",
        order: 2,
        title: "Refresh",
        body: "Refresh to see the latest activity.",
        target: "#audit-header",
      },
      {
        id: "audit-filters",
        order: 3,
        title: "Filter by area",
        body: "Filter by area or search for a specific change.",
        target: "#audit-filters",
      },
      {
        id: "audit-feed",
        order: 4,
        title: "Reading an entry",
        body: "Open an entry to see what changed, who changed it, and when.",
        target: "#audit-feed",
      },
    ],
  },

  // ── Messaging ────────────────────────────────────────────────

  "/messages": {
    pageTitle: "Messages",
    steps: [
      {
        id: "messages-client-intro",
        order: 1,
        title: "Messaging your counsellor",
        body: "A direct line to your counsellor for quick, practical things — running late, moving a session, a question between appointments.",
        target: "#messages-view",
      },
      {
        id: "messages-client-scope",
        order: 2,
        title: "Keep it light",
        body: "This is for logistics, not for anything you'd want kept as part of your clinical record — bring those to your sessions.",
      },
    ],
  },

  "/admin/messages": {
    pageTitle: "Messages",
    steps: [
      {
        id: "messages-admin-intro",
        order: 1,
        title: "Direct messages with clients",
        body: "A lightweight channel for practical back-and-forth with a client. Threads appear on the left; open one to read and reply.",
        target: "#messages-view",
      },
      {
        id: "messages-admin-new",
        order: 2,
        title: "Starting a conversation",
        body: "Use New message to pick a client and open a thread. They see it in their portal and get notified like any other update.",
      },
    ],
  },

  // ── Agency "manage mode" ──────────────────────────────────────

  "/agency": {
    pageTitle: "Agency Overview",
    steps: [
      {
        id: "agency-overview-intro",
        order: 1,
        title: "Manage mode",
        body: "This is your agency's home, separate from your own counselling practice. The sidebar here runs the agency; 'Counselling view' at the bottom takes you back to your own clients.",
        target: "#agency-overview-header",
      },
      {
        id: "agency-overview-tiles",
        order: 2,
        title: "The numbers that matter",
        body: "Active staff, clients, sessions and outstanding agency invoices. Each tile links straight to the page behind it.",
        target: "#agency-overview-tiles",
      },
      {
        id: "agency-overview-workload",
        order: 3,
        title: "Who's carrying what",
        body: "Counsellor workload shows how clients are spread across your staff, so you can see who has room before you assign the next intake.",
        target: "#agency-overview-workload",
      },
      {
        id: "agency-overview-attention",
        order: 4,
        title: "Needs attention",
        body: "Unassigned clients, declined assignments, overdue invoices and unsigned agreements surface here.",
        target: "#agency-overview-attention",
        actions: [{ label: "Go to clients", to: "/agency/clients?view=waiting" }],
      },
    ],
  },

  "/agency/clients": {
    pageTitle: "Agency Clients",
    steps: [
      {
        id: "agency-clients-intro",
        order: 1,
        title: "The intake pool",
        body: "Every client the agency has taken on lives here, before and after they're placed with a counsellor. Add one with the button top-right.",
        target: "#agency-clients-header",
      },
      {
        id: "agency-clients-views",
        order: 2,
        title: "Waiting list vs. active caseload",
        body: "The waiting list holds people you haven't placed yet — unassigned, awaiting a counsellor's response, or declined. 'Active caseload' is everyone currently with a counsellor.",
      },
      {
        id: "agency-clients-assign",
        order: 3,
        title: "Assigning a client",
        body: "Assign sends the client to a counsellor with a rate and an intake note. They accept or decline from their 'Clients to review' inbox, and the status updates here.",
      },
    ],
  },

  "/agency/sessions": {
    pageTitle: "Agency Sessions",
    steps: [
      {
        id: "agency-sessions-intro",
        order: 1,
        title: "Every session, every counsellor",
        body: "A read-only roll-up of sessions booked across the agency for the next 30 days, grouped by day. Counsellors still manage their own calendars in Counselling view.",
        target: "#agency-sessions-header",
      },
      {
        id: "agency-sessions-rows",
        order: 2,
        title: "What each row tells you",
        body: "Time, client (or 'Offline client'), which staff member it's with, and the session's status.",
      },
    ],
  },

  "/agency/members": {
    pageTitle: "Agency Staff",
    steps: [
      {
        id: "agency-members-intro",
        order: 1,
        title: "Your staff",
        body: "Invite counsellors, choose who's a manager, and control whether each person also has their own counselling side.",
        target: "#agency-members-header",
      },
      {
        id: "agency-members-roles",
        order: 2,
        title: "Roles and access",
        body: "Managers see this whole area. 'Make counsellor' / 'Make manager' changes that; 'Turn off counselling' leaves someone manage-only. The owner can't be changed or removed.",
      },
      {
        id: "agency-members-employment",
        order: 3,
        title: "Employee or freelance",
        body: "Employment type drives the settlement direction — whether a person pays the agency a cut, the agency pays them, or neither. Fine-tune it per person in Settings.",
      },
    ],
  },

  "/agency/invoices": {
    pageTitle: "Agency Invoices",
    steps: [
      {
        id: "agency-invoices-intro",
        order: 1,
        title: "Invoices between you and your staff",
        body: "Internal invoices only — seat fees, referral cuts, anything the agency bills a staff member for. Client invoices live in each counsellor's own practice.",
        target: "#agency-invoices-header",
      },
      {
        id: "agency-invoices-status",
        order: 2,
        title: "Moving an invoice along",
        body: "Use the split button to mark an invoice sent, due, overdue or paid. The tiles up top total what's outstanding, overdue, and paid this year.",
      },
    ],
  },

  "/agency/finance": {
    pageTitle: "Agency Finance",
    steps: [
      {
        id: "agency-finance-intro",
        order: 1,
        title: "The agency's bottom line",
        body: "Client payments taken across the agency, against what you record as outgoings — income, outgoings and net for the range you pick top-right.",
        target: "#agency-finance-header",
      },
      {
        id: "agency-finance-expenses",
        order: 2,
        title: "Recording outgoings",
        body: "Add agency-level costs with the form below — rent, software, anything — so the net figure reflects real spend. They're broken down by category in the chart.",
      },
    ],
  },

  "/agency/onboarding": {
    pageTitle: "Agency Onboarding",
    steps: [
      {
        id: "agency-onboarding-intro",
        order: 1,
        title: "Shared onboarding material",
        body: "Notes and links shown to new people when they join — one set for clients, one for counsellors. Switch between the two with the buttons below.",
        target: "#agency-onboarding-header",
      },
      {
        id: "agency-onboarding-items",
        order: 2,
        title: "Building a list",
        body: "Add a title, optional detail and an optional link. Everyone in that audience sees the same list in the order you add them.",
      },
    ],
  },

  "/agency/settings": {
    pageTitle: "Agency Settings",
    steps: [
      {
        id: "agency-settings-intro",
        order: 1,
        title: "Agency-wide rules",
        body: "Settings here apply to every member. Locking consent text, requiring note encryption or client codenames overrides each person's own practice settings.",
        target: "#agency-settings-header",
      },
      {
        id: "agency-settings-agreement",
        order: 2,
        title: "Staff working agreement",
        body: "Require staff to accept an agreement during onboarding. Editing the text or PDF bumps the version, so you can see who signed an older one.",
      },
      {
        id: "agency-settings-billing",
        order: 3,
        title: "Seats and settlement",
        body: "Your plan is based on active staff — paused or removed staff free a seat. The default settlement direction is the fallback for anyone left on 'Follow agency default'.",
      },
    ],
  },

  "/agency/activity": {
    pageTitle: "Agency Activity",
    steps: [
      {
        id: "agency-activity-intro",
        order: 1,
        title: "Agency activity log",
        body: "Every staff member's actions plus agency events — invites, agreements, client assignments, invoices — newest first, grouped by day.",
        target: "#agency-activity-header",
      },
      {
        id: "agency-activity-filters",
        order: 2,
        title: "Filter and export",
        body: "Narrow to one staff member or a date range, then export the filtered feed to CSV or PDF.",
        target: "#agency-activity-filters",
      },
    ],
  },

  "/agency/incoming": {
    pageTitle: "Clients to Review",
    steps: [
      {
        id: "agency-incoming-intro",
        order: 1,
        title: "Clients sent to you",
        body: "When a manager assigns you a client, they land here with the rate and an intake note. Nothing reaches your caseload until you accept.",
        target: "#agency-incoming-header",
      },
      {
        id: "agency-incoming-actions",
        order: 2,
        title: "Accept or decline",
        body: "Review opens the details. Accept and the client becomes a normal client in your Counselling view; decline and it goes back to the manager with your reason.",
      },
    ],
  },
};
