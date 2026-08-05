import React, { useEffect, useRef, useState } from "react";
import { BrowserRouter, Navigate, Outlet, Route, Routes, useLocation, useSearchParams } from "react-router-dom";

import OnboardingModal from "../components/Onboarding/OnboardingModal";
import AdminSidebar from "../components/shared/AdminSidebar/AdminSidebar";
import AdminTopbar from "../components/shared/AdminTopbar/AdminTopbar";
import DemoBanner from "../components/shared/DemoBanner/DemoBanner";
import Footer from "../components/shared/Footer/Footer";
import Navbar from "../components/shared/Navbar/Navbar";
import ProtectedRoute from "../components/shared/ProtectedRoute/ProtectedRoute";
import Spinner from "../components/shared/Spinner/Spinner";
import { useAuth } from "../context/AuthContext";
import { useVersionCheck } from "../Hooks/useVersionCheck";
import AdminAuditLogsPage from "../pages/admin/AdminAuditLogsPage/AdminAuditLogsPage";
import AdminClientScheduler from "../pages/admin/AdminClientScheduler/AdminClientScheduler";
import AdminClientsPage from "../pages/admin/AdminClientsPage/AdminClientsPage";
import AdminClientsPageDetailed from "../pages/admin/AdminClientsPageDetailed/AdminClientsPageDetailed";
import AdminCpdPage from "../pages/admin/AdminCpdPage/AdminCpdPage";
import AdminDashboard from "../pages/admin/AdminDashboard/AdminDashboard";
import AdminPaymentsPage from "../pages/admin/AdminPaymentsPage/AdminPaymentsPage";
import AdminQuestionnairesPage from "../pages/admin/AdminQuestionnairesPage/AdminQuestionnairesPage";
import AdminResourcesPage from "../pages/admin/AdminResourcesPage/AdminResourcesPage";
import AdminScheduler from "../pages/admin/AdminScheduler/AdminScheduler";
import CheckInPage from "../pages/client/CheckInPage/CheckInPage";
import ClientDashboard from "../pages/client/ClientDashboard/ClientDashboard";
import ClientSchedule from "../pages/client/ClientSchedule//ClientSchedule";
import LoginPage from "../pages/client/LoginPage/LoginPage";
import ResourcesPage from "../pages/client/ResourcesPage/ResourcesPage";
import CounsellorSignupPage from "../pages/common/CounsellorSignupPage/CounsellorSignupPage";
import SettingsPage from "../pages/common/SettingsPage/SettingsPage";
import SignUpPage from "../pages/common/SignUpPage/SignUpPage";
import StripeCallbackPage from "../pages/common/StripeCallbackPage/StripeCallbackPage";
import SubscribePage from "../pages/common/SubscribePage/SubscribePage";
import TermsPage from "../pages/common/TermsPage/TermsPage";
import SuperAdminPage from "../pages/superadmin/SuperAdminPage/SuperAdminPage";
import { useAppSelector } from "../store/hooks";
import { selectThemeMode } from "../store/slices/themeSlice";

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
  const location = useLocation();
  const topRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: location is the navigation trigger; not referenced in callback body by design
  useEffect(() => {
    topRef.current?.focus({ preventScroll: true });
  }, [location]);

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
      <Footer />
    </>
  );
}

function UpdateBanner() {
  const isOutdated = useVersionCheck();
  if (!isOutdated) return null;
  return (
    <div
      style={{
        background: "var(--accent-light)",
        borderBottom: "1px solid var(--accent)",
        padding: "8px 20px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontSize: "0.85rem",
        color: "var(--text-primary)",
      }}
    >
      <span>A new version of the app is available.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          background: "var(--accent)",
          color: "var(--text-inverse)",
          border: "none",
          borderRadius: "var(--r-full)",
          padding: "4px 14px",
          cursor: "pointer",
          fontFamily: "var(--font-sans)",
          fontSize: "0.8rem",
        }}
      >
        Reload now
      </button>
    </div>
  );
}

function AdminLayout() {
  const location = useLocation();
  const topRef = useRef<HTMLDivElement>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () => localStorage.getItem("adminSidebarCollapsed") === "true",
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: location is the navigation trigger; not referenced in callback body by design
  useEffect(() => {
    topRef.current?.focus({ preventScroll: true });
  }, [location]);

  const toggleSidebar = () => {
    setSidebarCollapsed((c) => {
      const next = !c;
      localStorage.setItem("adminSidebarCollapsed", String(next));
      return next;
    });
  };

  return (
    <>
      <div ref={topRef} tabIndex={-1} aria-hidden="true" />
      <div className="adminShell">
        <AdminSidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />
        <div className={`adminBody${sidebarCollapsed ? " adminBodyCollapsed" : ""}`}>
          <AdminTopbar />
          <DemoBanner />
          <UpdateBanner />
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

function SuperAdminGate({ children }: { children: React.ReactNode }) {
  const { isSuperAdmin, loading } = useAuth();
  if (loading) return <Spinner />;
  if (!isSuperAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const { isAdmin, practiceSettings, loading, refreshPracticeSettings } = useAuth();
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
    practiceSettings &&
    practiceSettings.subscription_status !== "active" &&
    practiceSettings.subscription_status !== "trialing"
  ) {
    return <Navigate to="/subscribe" replace />;
  }
  return <>{children}</>;
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
        <OnboardingGate />
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/signup" element={<SignUpPage />} />
          <Route path="/register" element={<CounsellorSignupPage />} />
          <Route path="/terms" element={<TermsPage />} />

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
                <AppLayout />
              </ProtectedRoute>
            }
          >
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/stripe-callback" element={<StripeCallbackPage />} />
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
            <Route path="/admin/questionnaires" element={<AdminQuestionnairesPage />} />
            <Route path="/admin/resources" element={<AdminResourcesPage />} />
            <Route path="/admin/audit-logs" element={<AdminAuditLogsPage />} />
            <Route path="/admin/scheduler" element={<AdminScheduler />} />
            <Route path="/admin/scheduler/:clientId" element={<AdminClientScheduler />} />
            <Route path="/admin/payments" element={<AdminPaymentsPage />} />
            <Route path="/admin/cpd" element={<AdminCpdPage />} />
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
          <Route path="*" element={<div>CAUGHT: {window.location.pathname}</div>} />
          {/* // ! create action page not do page. todo} */}
        </Routes>
      </BrowserRouter>
    </ThemeWrapper>
  );
}
