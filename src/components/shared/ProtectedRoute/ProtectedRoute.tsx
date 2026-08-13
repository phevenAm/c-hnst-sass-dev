import React from "react";
import { Navigate, useLocation } from "react-router-dom";

import { useAuth } from "@context/AuthContext";
import { Role } from "@models/globalTypes";

import Spinner from "../Spinner/Spinner";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: Role;
}

export default function ProtectedRoute({ children, requiredRole }: ProtectedRouteProps) {
  const { isAuthenticated, isAdmin, loading, isFinishingSignup, userProfile } = useAuth();
  const location = useLocation();

  // Wait for session check to finish
  if (loading) return <Spinner />;

  // Not logged in → send to login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
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
