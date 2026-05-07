import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Layout from "./components/layout/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import BusinessRegistration from "./pages/BusinessRegistration";
import UserManagement from "./pages/UserManagement";
import BranchManagement from "./pages/BranchManagement";
import FloatManagement from "./pages/FloatManagement";
import Reconciliation from "./pages/Reconciliation";
import Transactions from "./pages/Transactions";
import Reports from "./pages/Reports";
import ActivityLogs from "./pages/ActivityLogs";
import SeedAdmin from "./pages/SeedAdmin";
import AboutUs from "./pages/AboutUs";
import Contact from "./pages/Contact";
import Disbursement from "./pages/Disbursement";
import ReconciliationApprovals from "./pages/ReconciliationApprovals";
import CommissionSettings from "./pages/CommissionSettings";
import Settings from "./pages/Settings";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/seed-admin" element={<SeedAdmin />} />
            <Route path="/about" element={<AboutUs />} />
            <Route path="/contact" element={<Contact />} />
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<Navigate to="/dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route
                path="businesses"
                element={
                  <ProtectedRoute allowedRoles={["it_admin", "admin"]}>
                    <BusinessRegistration />
                  </ProtectedRoute>
                }
              />
              <Route
                path="users"
                element={
                  <ProtectedRoute allowedRoles={["it_admin", "admin", "branch_manager"]}>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route
                path="branches"
                element={
                  <ProtectedRoute allowedRoles={["it_admin", "admin", "branch_manager"]}>
                    <BranchManagement />
                  </ProtectedRoute>
                }
              />
              <Route path="float" element={<FloatManagement />} />
              <Route path="reconciliation" element={<Reconciliation />} />
              <Route
                path="reconciliation-approvals"
                element={
                  <ProtectedRoute allowedRoles={["branch_manager"]}>
                    <ReconciliationApprovals />
                  </ProtectedRoute>
                }
              />
              <Route path="transactions" element={<Transactions />} />
              <Route
                path="commission-settings"
                element={
                  <ProtectedRoute allowedRoles={["it_admin", "admin", "branch_manager"]}>
                    <CommissionSettings />
                  </ProtectedRoute>
                }
              />
              <Route
                path="disbursement"
                element={
                  <ProtectedRoute allowedRoles={["it_admin", "admin", "branch_manager"]}>
                    <Disbursement />
                  </ProtectedRoute>
                }
              />
              <Route path="reports" element={<Reports />} />
              <Route
                path="activity-logs"
                element={
                  <ProtectedRoute allowedRoles={["it_admin"]}>
                    <ActivityLogs />
                  </ProtectedRoute>
                }
              />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </Router>
      </AuthProvider>
    </QueryClientProvider>
  );
}

export default App;
