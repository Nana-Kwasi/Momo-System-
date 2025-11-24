import React from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function ProtectedRoute({ children, allowedRoles = [] }) {
  const { currentUser, userData, loading, selectedBusinessId, selectedBranchId } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles.length > 0 && !allowedRoles.includes(userData?.role)) {
    return <Navigate to="/dashboard" replace />;
  }

  const role = userData?.role;

  if (role === "it_admin") {
    if (!selectedBusinessId || !selectedBranchId) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Business and Branch Selection Required</p>
            <p className="text-muted-foreground mt-2">
              Please select a business and branch to continue
            </p>
          </div>
        </div>
      );
    }
  } else if (role === "branch_manager" || role === "admin") {
    if (!selectedBranchId) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Branch Selection Required</p>
            <p className="text-muted-foreground mt-2">
              Please select a branch to continue
            </p>
          </div>
        </div>
      );
    }
  } else if (role === "agent_user" || role === "normal_user") {
    if (!selectedBusinessId || !selectedBranchId) {
      return (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <p className="text-lg font-semibold">Session Error</p>
            <p className="text-muted-foreground mt-2">
              Please log out and log in again
            </p>
          </div>
        </div>
      );
    }
  }

  return children;
}
