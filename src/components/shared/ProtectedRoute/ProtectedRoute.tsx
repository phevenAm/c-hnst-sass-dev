import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import AuthLoadingState from "@components/shared/AuthLoadingState/AuthLoadingState";
import Button from "@components/shared/Button/Button";
import { useAuth } from "@context/AuthContext";
import { Role } from "@models/globalTypes";

import Spinner from "../Spinner/Spinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, loading, isFinishingSignup, userProfile, profileError, retryProfile, signOut } =
    useAuth();
  const location = useLocation();

  // Wait for session check to finish
  if (loading) return <AuthLoadingState variant="plain" />;

  // Not logged in → send to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // profileError means the fetch already finished and failed — that's not
  // "still loading," it's a dead end. Without this, a failed profile fetch
  // left userProfile null forever with nothing else ever retrying it, so the
  // page below just spun indefinitely with no network activity at all.
  if (!userProfile && profileError) {
    return (
      <div className="page">
        <p>{profileError}</p>
        <div style={{ display: "flex", gap: "var(--sp-3)" }}>
          <Button variant="secondary" onClick={retryProfile}>
            Try again
          </Button>
          <Button variant="ghost" onClick={() => signOut()}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  // Wait for profile to load before making role decisions
  // (profile loads async after auth, so isAdmin may briefly be false for admins)
  if (!userProfile) return <Spinner />;

  // Wait for token consumption + stub merge to complete before rendering the
  // dashboard — prevents a race where sessions are fetched before they're imported
  if (isFinishingSignup) return <Spinner />;

  // Wrong role redirects
  if (requiredRole === "admin" && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }
  if (requiredRole === "client" && isAdmin) {
    return <Navigate to="/admin" replace />;
  }

  return children;
}
