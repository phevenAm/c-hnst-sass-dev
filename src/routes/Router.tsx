import React, { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import AgencyReviewBanner from "../components/agency/AgencyReviewBanner/AgencyReviewBanner";
import ConsentModal from "../components/Consent/ConsentModal";
import OnboardingModal from "../components/Onboarding/OnboardingModal";
import AdminSidebar from "../components/shared/AdminSidebar/AdminSidebar";
import AdminTopbar from "../components/shared/AdminTopbar/AdminTopbar";
import AuthLoadingState from "../components/shared/AuthLoadingState/AuthLoadingState";
import DemoBanner from "../components/shared/DemoBanner/DemoBanner";
import Footer from "../components/shared/Footer/Footer";
import Navbar from "../components/shared/Navbar/Navbar";
import PastDueBanner from "../components/shared/PastDueBanner/PastDueBanner";
import PausedBanner from "../components/shared/PausedBanner/PausedBanner";
import ProtectedRoute from "../components/shared/ProtectedRoute/ProtectedRoute";
import SkipToMain from "../components/shared/SkipToMain/SkipToMain";
import UpdateBanner from "../components/shared/UpdateBanner/UpdateBanner";
import ViewportWarningBanner from "../components/shared/ViewportWarningBanner/ViewportWarningBanner";
import WalkthroughOverlay from "../components/shared/Walkthrough/WalkthroughOverlay";
import { useAuth } from "../context/AuthContext";
import { WalkthroughProvider } from "../context/WalkthroughContext";
import { useAgencyBootstrap } from "../Hooks/useAgencyBootstrap";
import { useAssignmentsRealtime } from "../Hooks/useAssignmentsRealtime";
import { useConsentPending } from "../Hooks/useConsentPending";
import { useFocusOnNavigate } from "../Hooks/useFocusOnNavigate";
import { usePracticeSettingsRealtime } from "../Hooks/usePracticeSettingsRealtime";
import { useSessionsRealtime } from "../Hooks/useSessionsRealtime";
import LoginPage from "../pages/client/LoginPage/LoginPage";
import NotFoundPage from "../pages/common/NotFoundPage/NotFoundPage";
import { useAppSelector } from "../store/hooks";
import { selectAgencyBootstrapStatus, selectAgencyMembership } from "../store/slices/agencySlice";
import { selectThemeMode } from "../store/slices/themeSlice";

// Every routed page is lazy-loaded so it ships as its own chunk — the initial
// bundle carries only the shell plus whichever page you land on. LoginPage and
// NotFoundPage stay eager: one is the cold-start destination for logged-out
// users, the other is the tiny wildcard fallback.
const AdminAuditLogsPage = lazy(() => import("../pages/admin/AdminAuditLogsPage/AdminAuditLogsPage"));
const AdminClientScheduler = lazy(() => import("../pages/admin/AdminClientScheduler/AdminClientScheduler"));
const AdminClientsPage = lazy(() => import("../pages/admin/AdminClientsPage/AdminClientsPage"));
const AdminClientsPageDetailed = lazy(() => import("../pages/admin/AdminClientsPageDetailed/AdminClientsPageDetailed"));
const AdminCpdPage = lazy(() => import("../pages/admin/AdminCpdPage/AdminCpdPage"));
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard/AdminDashboard"));
const AdminFinancesPage = lazy(() => import("../pages/admin/AdminFinancesPage/AdminFinancesPage"));
const AdminQuestionnairesPage = lazy(() => import("../pages/admin/AdminQuestionnairesPage/AdminQuestionnairesPage"));
const AdminResourcesPage = lazy(() => import("../pages/admin/AdminResourcesPage/AdminResourcesPage"));
const AdminScheduler = lazy(() => import("../pages/admin/AdminScheduler/AdminScheduler"));
const AdminStubDetailPage = lazy(() => import("../pages/admin/AdminStubDetailPage/AdminStubDetailPage"));
const AdminSupervisionPage = lazy(() => import("../pages/admin/AdminSupervisionPage/AdminSupervisionPage"));
const CheckInPage = lazy(() => import("../pages/client/CheckInPage/CheckInPage"));
const ClientDashboard = lazy(() => import("../pages/client/ClientDashboard/ClientDashboard"));
const ClientSchedule = lazy(() => import("../pages/client/ClientSchedule/ClientSchedule"));
const RcadsAssessmentPage = lazy(() => import("../pages/client/RcadsAssessmentPage/RcadsAssessmentPage"));
const ResourcesPage = lazy(() => import("../pages/client/ResourcesPage/ResourcesPage"));
const AdminSetupPage = lazy(() => import("../pages/common/AdminSetupPage/AdminSetupPage"));
const CounsellorSignupPage = lazy(() => import("../pages/common/CounsellorSignupPage/CounsellorSignupPage"));
const DemoPage = lazy(() => import("../pages/common/DemoPage/DemoPage"));
const GoogleCalendarCallbackPage = lazy(
  () => import("../pages/common/GoogleCalendarCallbackPage/GoogleCalendarCallbackPage"),
);
const MicrosoftCalendarCallbackPage = lazy(
  () => import("../pages/common/MicrosoftCalendarCallbackPage/MicrosoftCalendarCallbackPage"),
);
const PrivacyPage = lazy(() => import("../pages/common/PrivacyPage/PrivacyPage"));
const SecurityPage = lazy(() => import("../pages/common/SecurityPage/SecurityPage"));
const SettingsPage = lazy(() => import("../pages/common/SettingsPage/SettingsPage"));
const SignUpPage = lazy(() => import("../pages/common/SignUpPage/SignUpPage"));
const StripeCallbackPage = lazy(() => import("../pages/common/StripeCallbackPage/StripeCallbackPage"));
const SubprocessorsPage = lazy(() => import("../pages/common/SubprocessorsPage/SubprocessorsPage"));
const SubscribePage = lazy(() => import("../pages/common/SubscribePage/SubscribePage"));
const TermsPage = lazy(() => import("../pages/common/TermsPage/TermsPage"));
const UnsubscribePage = lazy(() => import("../pages/common/UnsubscribePage/UnsubscribePage"));
const SuperAdminPage = lazy(() => import("../pages/superadmin/SuperAdminPage/SuperAdminPage"));

const AgencyLayout = lazy(() => import("../components/agency/AgencyLayout/AgencyLayout"));
const CreateAgencyPage = lazy(() => import("../pages/agency/CreateAgencyPage/CreateAgencyPage"));
const AgencyOverviewPage = lazy(() => import("../pages/agency/AgencyOverviewPage/AgencyOverviewPage"));
const AgencyMembersPage = lazy(() => import("../pages/agency/AgencyMembersPage/AgencyMembersPage"));
const AgencyClientsPage = lazy(() => import("../pages/agency/AgencyClientsPage/AgencyClientsPage"));
const AgencyIncomingPage = lazy(() => import("../pages/agency/AgencyIncomingPage/AgencyIncomingPage"));
const AgencyFinancePage = lazy(() => import("../pages/agency/AgencyFinancePage/AgencyFinancePage"));
const AgencyOnboardingPage = lazy(() => import("../pages/agency/AgencyOnboardingPage/AgencyOnboardingPage"));
const AgencySettingsPage = lazy(() => import("../pages/agency/AgencySettingsPage/AgencySettingsPage"));

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const mode = useAppSelector(selectThemeMode);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);
  return <>{children}</>;
}

function RootRedirect() {
  const { isAuthenticated, isAdmin, isSuperAdmin, loading } = useAuth();
  if (loading) return <AuthLoadingState variant="splash" />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isSuperAdmin) return <Navigate to="/superadmin" replace />;
  return <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />;
}

// /login is a common entry point (marketing site link, bookmarks). Without
// this gate LoginPage paints its form immediately and only redirects an
// already-signed-in user via a post-render useEffect — a visible flash of the
// login screen. Guard on `loading` first, same as RootRedirect.
function LoginRoute() {
  const { isAuthenticated, isAdmin, isSuperAdmin, loading } = useAuth();
  if (loading) return <AuthLoadingState variant="splash" />;
  if (isAuthenticated) {
    if (isSuperAdmin) return <Navigate to="/superadmin" replace />;
    return <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />;
  }
  return <LoginPage />;
}

function AppLayout() {
  const topRef = useFocusOnNavigate();
  useSessionsRealtime();
  useAssignmentsRealtime();
  usePracticeSettingsRealtime();

  return (
    <>
      <div ref={topRef} tabIndex={-1} aria-hidden="true" />
      <Navbar />
      <DemoBanner />
      <PausedBanner />
      <main id="main-content" tabIndex={-1}>
        <div className="page-content">
          <Suspense fallback={null}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <Footer />
    </>
  );
}

function AdminLayout() {
  const topRef = useFocusOnNavigate();
  const { pathname } = useLocation();
  useSessionsRealtime();
  usePracticeSettingsRealtime();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("adminSidebarCollapsed") === "true",
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // biome-ignore lint/correctness/useExhaustiveDependencies: pathname isn't read in the body — it's here purely to re-run this on every navigation and close the mobile sidebar
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  const toggleSidebar = () => {
    if (window.innerWidth < 768) {
      setMobileSidebarOpen((o) => !o);
    } else {
      setSidebarCollapsed((c) => {
        const next = !c;
        localStorage.setItem("adminSidebarCollapsed", String(next));
        return next;
      });
    }
  };

  return (
    <>
      <div ref={topRef} tabIndex={-1} aria-hidden="true" />
      <SkipToMain />
      <div className="adminShell">
        <AdminSidebar
          collapsed={sidebarCollapsed}
          onToggle={toggleSidebar}
          isOpen={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
        />
        <div className={`adminBody${sidebarCollapsed ? " adminBodyCollapsed" : ""}`}>
          <AdminTopbar />
          <DemoBanner />
          <PausedBanner />
          <PastDueBanner />
          <AgencyReviewBanner />
          <main id="main-content" tabIndex={-1}>
            <div className="page-content">
              <Suspense fallback={null}>
                <Outlet />
              </Suspense>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}

function RoleAwareLayout() {
  const { isAdmin } = useAuth();
  if (isAdmin) return <AdminLayout />;
  return <AppLayout />;
}

function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading } = useAuth();
  if (loading) return <AuthLoadingState />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, isDemo, practiceSettings, loading, refreshPracticeSettings } = useAuth();
  const [searchParams] = useSearchParams();
  const justSubscribed = searchParams.get("subscribed") === "true";
  const [verifying, setVerifying] = useState(justSubscribed);

  useEffect(() => {
    if (!justSubscribed) return;
    // Give the Stripe webhook a moment to update the DB, then re-check
    const timer = setTimeout(async () => {
      await refreshPracticeSettings();
      setVerifying(false);
    }, 3000);
    return () => clearTimeout(timer);
  }, [refreshPracticeSettings, justSubscribed]);

  if (loading || verifying) return <AuthLoadingState variant="splash" />;

  // past_due is deliberately let through, not redirected to /subscribe —
  // that starts a brand-new checkout instead of fixing the existing
  // subscription. PastDueBanner (rendered in AdminLayout) nags the admin
  // to update their payment method via the billing portal instead; only a
  // subscription that's actually lapsed (canceled, unpaid, etc.) blocks
  // access and sends them to /subscribe.
  if (
    isAdmin &&
    !isDemo &&
    practiceSettings &&
    practiceSettings.subscription_status !== "active" &&
    practiceSettings.subscription_status !== "trialing" &&
    practiceSettings.subscription_status !== "past_due"
  ) {
    return <Navigate to="/subscribe" replace />;
  }
  return <>{children}</>;
}

function AdminSetupGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, practiceSettings, loading } = useAuth();
  if (loading) return <AuthLoadingState variant="splash" />;
  if (isAdmin && practiceSettings?.onboarding_required) {
    return <Navigate to="/admin/setup" replace />;
  }
  return <>{children}</>;
}

function ConsentGate() {
  const { settings, dismiss } = useConsentPending();
  if (!settings) return null;
  return <ConsentModal settings={settings} onComplete={dismiss} />;
}

function OnboardingGate() {
  const { userProfile, isAuthenticated, loading, isAdmin, isDemo, practiceSettings } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    const eligible = !loading && isAuthenticated && !!userProfile && !userProfile.onboarding_completed;
    if (!eligible) {
      setShow(false);
      return;
    }
    // Demo admin skips the subscribed/setup-done requirement below — it's a
    // canned account with no real subscription or practice-setup flow to
    // finish, so gating on those would just mean the modal can never show.
    if (!isAdmin || isDemo) {
      setShow(true);
      return;
    }
    // Real admins only see the "personalize your profile" modal once they've
    // actually subscribed and finished practice setup — showing it right
    // after signup, before they've paid or configured anything, put a
    // client-facing first-impression step ahead of the business-critical
    // ones (2026-08-25).
    const subscribed =
      practiceSettings?.subscription_status === "active" || practiceSettings?.subscription_status === "trialing";
    const setupDone = !!practiceSettings && !practiceSettings.onboarding_required;
    setShow(subscribed && setupDone);
  }, [loading, isAuthenticated, userProfile, isAdmin, isDemo, practiceSettings]);

  if (!show) return null;
  return <OnboardingModal onComplete={() => setShow(false)} />;
}

// Loads the current user's agency membership into Redux once per session
// (and consumes any pending invite token from the sign-up flow).
function AgencyBootstrapper() {
  useAgencyBootstrap();
  return null;
}

// A counsellor whose agency has switched off their counselling side has no
// business on the /admin tree — send them to manage mode. Waits for the
// membership fetch so it doesn't bounce during the initial load.
function AgencyGate({ children }: { children: React.ReactNode }) {
  const status = useAppSelector(selectAgencyBootstrapStatus);
  const membership = useAppSelector(selectAgencyMembership);
  if (status !== "succeeded") return <>{children}</>;
  if (membership && membership.status === "active" && !membership.counselling_enabled) {
    return <Navigate to="/agency" replace />;
  }
  return <>{children}</>;
}

export default function AppRoutes() {
  return (
    <ThemeWrapper>
      <BrowserRouter>
        <WalkthroughProvider>
          <UpdateBanner />
          <ViewportWarningBanner />
          <ConsentGate />
          <OnboardingGate />
          <AgencyBootstrapper />
          <WalkthroughOverlay />
          <Suspense fallback={<AuthLoadingState variant="splash" />}>
            <Routes>
              <Route path="/login" element={<LoginRoute />} />
              <Route path="/demo" element={<DemoPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/register" element={<CounsellorSignupPage />} />
              <Route path="/terms" element={<TermsPage />} />
              <Route path="/privacy" element={<PrivacyPage />} />
              <Route path="/security" element={<SecurityPage />} />
              <Route path="/legal/subprocessors" element={<SubprocessorsPage />} />
              <Route path="/unsubscribe" element={<UnsubscribePage />} />

              {/* Standalone — no navbar, own minimal header */}
              <Route
                path="/subscribe"
                element={
                  <ProtectedRoute>
                    <SubscribePage />
                  </ProtectedRoute>
                }
              />

              <Route
                element={
                  <ProtectedRoute>
                    <RoleAwareLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/stripe-callback" element={<StripeCallbackPage />} />
                <Route path="/settings/google-callback" element={<GoogleCalendarCallbackPage />} />
                <Route path="/settings/microsoft-callback" element={<MicrosoftCalendarCallbackPage />} />
              </Route>

              <Route
                element={
                  <ProtectedRoute requiredRole="client">
                    <AppLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/dashboard" element={<ClientDashboard />} />
                <Route path="/check-in" element={<CheckInPage />} />
                <Route path="/my-sessions" element={<ClientSchedule />} />
                <Route path="/resources" element={<ResourcesPage />} />
                <Route path="/rcads" element={<RcadsAssessmentPage />} />
              </Route>

              {/* Standalone — no navbar, forced first-run setup for new admins */}
              <Route
                path="/admin/setup"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AdminSetupPage />
                  </ProtectedRoute>
                }
              />

              <Route
                element={
                  <ProtectedRoute requiredRole="admin">
                    <SubscriptionGate>
                      <AdminSetupGate>
                        <AgencyGate>
                          <AdminLayout />
                        </AgencyGate>
                      </AdminSetupGate>
                    </SubscriptionGate>
                  </ProtectedRoute>
                }
              >
                <Route path="/admin" element={<AdminDashboard />} />
                <Route path="/admin/clients" element={<AdminClientsPage />} />
                <Route path="/admin/clients/:clientId" element={<AdminClientsPageDetailed />} />
                <Route path="/admin/clients/stub/:stubId" element={<AdminStubDetailPage />} />
                <Route path="/admin/forms" element={<AdminQuestionnairesPage />} />
                <Route path="/admin/resources" element={<AdminResourcesPage />} />
                <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
                <Route path="/admin/scheduler" element={<AdminScheduler />} />
                <Route path="/admin/scheduler/:clientId" element={<AdminClientScheduler />} />
                <Route path="/admin/finances" element={<AdminFinancesPage />} />
                <Route path="/admin/payments" element={<Navigate to="/admin/finances?view=income" replace />} />
                <Route path="/admin/invoices" element={<Navigate to="/admin/finances?view=invoices" replace />} />
                <Route path="/admin/expenses" element={<Navigate to="/admin/finances?view=expenses" replace />} />
                <Route path="/admin/cpd" element={<AdminCpdPage />} />
                <Route path="/admin/supervision" element={<AdminSupervisionPage />} />
                {/* //! make admin/schedule/userSchedule route */}
              </Route>

              <Route
                path="/superadmin"
                element={
                  <ProtectedRoute>
                    <SuperAdminGate>
                      <SuperAdminPage />
                    </SuperAdminGate>
                  </ProtectedRoute>
                }
              />

              {/* Agency "manage mode" — standalone shell, gated to agency members */}
              <Route
                path="/register/agency"
                element={
                  <ProtectedRoute requiredRole="admin">
                    <CreateAgencyPage />
                  </ProtectedRoute>
                }
              />
              <Route
                element={
                  <ProtectedRoute requiredRole="admin">
                    <AgencyLayout />
                  </ProtectedRoute>
                }
              >
                <Route path="/agency" element={<AgencyOverviewPage />} />
                <Route path="/agency/members" element={<AgencyMembersPage />} />
                <Route path="/agency/clients" element={<AgencyClientsPage />} />
                <Route path="/agency/incoming" element={<AgencyIncomingPage />} />
                <Route path="/agency/finance" element={<AgencyFinancePage />} />
                <Route path="/agency/onboarding" element={<AgencyOnboardingPage />} />
                <Route path="/agency/settings" element={<AgencySettingsPage />} />
              </Route>

              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </WalkthroughProvider>
      </BrowserRouter>
    </ThemeWrapper>
  );
}
