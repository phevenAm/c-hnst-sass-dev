import React, { lazy, Suspense, useEffect, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import ConsentModal from "../components/Consent/ConsentModal";
import OnboardingModal from "../components/Onboarding/OnboardingModal";
import AdminSidebar from "../components/shared/AdminSidebar/AdminSidebar";
import AdminTopbar from "../components/shared/AdminTopbar/AdminTopbar";
import DemoBanner from "../components/shared/DemoBanner/DemoBanner";
import Navbar from "../components/shared/Navbar/Navbar";
import ProtectedRoute from "../components/shared/ProtectedRoute/ProtectedRoute";
import SkipToMain from "../components/shared/SkipToMain/SkipToMain";
import Spinner from "../components/shared/Spinner/Spinner";
import WalkthroughOverlay from "../components/shared/Walkthrough/WalkthroughOverlay";
import { useAuth } from "../context/AuthContext";
import { WalkthroughProvider } from "../context/WalkthroughContext";
import { useFocusOnNavigate } from "../Hooks/useFocusOnNavigate";
import { useSessionsRealtime } from "../Hooks/useSessionsRealtime";
import { supabase } from "../lib/supabase";
// Left un-lazy on purpose, as an exercise — convert these two the same way as
// everything below (`lazy(() => import("path/to/Page"))`) once the pattern
// below makes sense. Nothing else needs to change: React.lazy + the single
// <Suspense> around <Routes> already covers any route added here.
import AdminAuditLogsPage from "../pages/admin/AdminAuditLogsPage/AdminAuditLogsPage";
import AdminSupervisionPage from "../pages/admin/AdminSupervisionPage/AdminSupervisionPage";
import LoginPage from "../pages/client/LoginPage/LoginPage";
import NotFoundPage from "../pages/common/NotFoundPage/NotFoundPage";
import { useAppSelector } from "../store/hooks";
import { selectThemeMode } from "../store/slices/themeSlice";

// Everything else route-level is lazy: each import() becomes its own chunk that
// only downloads when a user actually navigates there, instead of all being
// bundled into the one multi-MB file every visitor pays for on first load
// (that's what the "chunks larger than 500kB" build warning was about).
const AdminClientScheduler = lazy(() => import("../pages/admin/AdminClientScheduler/AdminClientScheduler"));
const AdminClientsPage = lazy(() => import("../pages/admin/AdminClientsPage/AdminClientsPage"));
const AdminClientsPageDetailed = lazy(() => import("../pages/admin/AdminClientsPageDetailed/AdminClientsPageDetailed"));
const AdminCpdPage = lazy(() => import("../pages/admin/AdminCpdPage/AdminCpdPage"));
const AdminDashboard = lazy(() => import("../pages/admin/AdminDashboard/AdminDashboard"));
const AdminPaymentsPage = lazy(() => import("../pages/admin/AdminPaymentsPage/AdminPaymentsPage"));
const AdminQuestionnairesPage = lazy(() => import("../pages/admin/AdminQuestionnairesPage/AdminQuestionnairesPage"));
const AdminResourcesPage = lazy(() => import("../pages/admin/AdminResourcesPage/AdminResourcesPage"));
const AdminScheduler = lazy(() => import("../pages/admin/AdminScheduler/AdminScheduler"));
const AdminStubDetailPage = lazy(() => import("../pages/admin/AdminStubDetailPage/AdminStubDetailPage"));
const CheckInPage = lazy(() => import("../pages/client/CheckInPage/CheckInPage"));
const ClientDashboard = lazy(() => import("../pages/client/ClientDashboard/ClientDashboard"));
const ClientSchedule = lazy(() => import("../pages/client/ClientSchedule//ClientSchedule"));
const ResourcesPage = lazy(() => import("../pages/client/ResourcesPage/ResourcesPage"));
const CounsellorSignupPage = lazy(() => import("../pages/common/CounsellorSignupPage/CounsellorSignupPage"));
const DemoPage = lazy(() => import("../pages/common/DemoPage/DemoPage"));
const GoogleCalendarCallbackPage = lazy(
  () => import("../pages/common/GoogleCalendarCallbackPage/GoogleCalendarCallbackPage"),
);
const SettingsPage = lazy(() => import("../pages/common/SettingsPage/SettingsPage"));
const SignUpPage = lazy(() => import("../pages/common/SignUpPage/SignUpPage"));
const StripeCallbackPage = lazy(() => import("../pages/common/StripeCallbackPage/StripeCallbackPage"));
const SubscribePage = lazy(() => import("../pages/common/SubscribePage/SubscribePage"));
const TermsPage = lazy(() => import("../pages/common/TermsPage/TermsPage"));
const UnsubscribePage = lazy(() => import("../pages/common/UnsubscribePage/UnsubscribePage"));
const SuperAdminPage = lazy(() => import("../pages/superadmin/SuperAdminPage/SuperAdminPage"));

function ThemeWrapper({ children }: { children: React.ReactNode }) {
  const mode = useAppSelector(selectThemeMode);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", mode === "dark");
  }, [mode]);
  return <>{children}</>;
}

function RootRedirect() {
  const { isAuthenticated, isAdmin, isSuperAdmin, loading } = useAuth();
  if (loading) return null;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (isSuperAdmin) return <Navigate to="/superadmin" replace />;
  return <Navigate to={isAdmin ? "/admin" : "/dashboard"} replace />;
}

function AppLayout() {
  const topRef = useFocusOnNavigate();

  return (
    <>
      <div ref={topRef} tabIndex={-1} aria-hidden="true" />
      <Navbar />
      <DemoBanner />
      <main id="main-content" tabIndex={-1}>
        <div className="page-content">
          <Outlet />
        </div>
      </main>
    </>
  );
}

function AdminLayout() {
  const topRef = useFocusOnNavigate();
  const { pathname } = useLocation();
  useSessionsRealtime();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("adminSidebarCollapsed") === "true",
  );
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

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
          <main id="main-content" tabIndex={-1}>
            <div className="page-content">
              <Outlet />
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
  if (loading) return <Spinner />;
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
  }, []);

  if (loading || verifying) return <Spinner />;

  if (
    isAdmin &&
    !isDemo &&
    practiceSettings &&
    practiceSettings.subscription_status !== "active" &&
    practiceSettings.subscription_status !== "trialing"
  ) {
    return <Navigate to="/subscribe" replace />;
  }
  return <>{children}</>;
}

type ConsentSettings = {
  consent_title: string;
  consent_body: string;
  consent_pdf_url: string | null;
  consent_counsellor_cta: string;
};

function ConsentGate() {
  const { userProfile, isAdmin, isDemo, loading } = useAuth();
  const [settings, setSettings] = useState<ConsentSettings | null>(null);

  useEffect(() => {
    if (loading || isAdmin || isDemo || !userProfile || userProfile.has_consented) return;
    supabase.rpc("get_my_admin_consent_settings").then(({ data }) => {
      const row = data?.[0];
      if (row?.consent_enabled) setSettings(row);
    });
  }, [loading, isAdmin, isDemo, userProfile]);

  if (!settings) return null;
  return <ConsentModal settings={settings} onComplete={() => setSettings(null)} />;
}

function OnboardingGate() {
  const { userProfile, isDemo, isAuthenticated, loading } = useAuth();
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!loading && isAuthenticated && !!userProfile && !userProfile.onboarding_completed);
  }, [loading, isAuthenticated, userProfile]);

  if (!show || isDemo) return null;
  return <OnboardingModal onComplete={() => setShow(false)} />;
}

export default function AppRoutes() {
  return (
    <ThemeWrapper>
      <BrowserRouter>
        <WalkthroughProvider>
          <ConsentGate />
          <OnboardingGate />
          <WalkthroughOverlay />
          <Suspense fallback={<Spinner />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/demo" element={<DemoPage />} />
              <Route path="/signup" element={<SignUpPage />} />
              <Route path="/register" element={<CounsellorSignupPage />} />
              <Route path="/terms" element={<TermsPage />} />
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
              </Route>

              <Route
                element={
                  <ProtectedRoute requiredRole="admin">
                    <SubscriptionGate>
                      <AdminLayout />
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
                <Route path="/admin/payments" element={<AdminPaymentsPage />} />
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

              <Route path="/" element={<RootRedirect />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </WalkthroughProvider>
      </BrowserRouter>
    </ThemeWrapper>
  );
}
