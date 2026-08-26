import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import AuthLoadingState from "@components/shared/AuthLoadingState/AuthLoadingState";
import Button from "@components/shared/Button/Button";
import { LeafLogoMark } from "@components/shared/Icons/Icons";
import { useAuth } from "@context/AuthContext";
import { Role } from "@models/globalTypes";

import Spinner from "../Spinner/Spinner";

import styles from "./ProtectedRoute.module.scss";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, loading, isFinishingSignup, userProfile, profileError, retryProfile, signOut } =
    useAuth();
  const location = useLocation();

  // Wait for session check to finish
  if (loading) return <AuthLoadingState variant="splash" />;

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
      <div className={styles.wrapper}>
        <div className={styles.card}>
          <div className={styles.logo}>
            <LeafLogoMark size={40} color="var(--accent)" />
          </div>
          <h1 className={styles.heading}>{profileError}</h1>
          <p className={styles.message}>Try refreshing, or sign in again to reset your session.</p>
          <div className={styles.actions}>
            <Button variant="secondary" onClick={retryProfile}>
              Try again
            </Button>
            {/* Signs out under the hood, but from here that just lands the
                user back on the sign-in screen — describe that outcome,
                not the mechanism. */}
            <Button variant="ghost" onClick={() => signOut()}>
              Sign in
            </Button>
          </div>
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
