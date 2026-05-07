import React, { useState, useEffect } from "react";
import { activityLogService, userService, branchService } from "../services/firestoreService";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Download, Search, X } from "lucide-react";

// Map raw actionType strings to high-level categories used in filters
const getActionCategory = (actionType) => {
  if (!actionType) return "";
  if (actionType.startsWith("float_")) return "float";
  if (
    actionType === "momo_transaction_created" ||
    actionType === "bank_transaction_created" ||
    actionType === "airtime_sale_created" ||
    actionType === "expense_recorded"
  ) {
    return "transaction";
  }
  if (
    actionType === "reconciliation_submitted" ||
    actionType === "reconciliation_approved"
  ) {
    return "reconciliation";
  }
  if (actionType === "user_created" || actionType === "user_updated") {
    return "user_management";
  }
  if (actionType === "branch_created" || actionType === "merchant_sim_rename") {
    return "branch_management";
  }
  if (
    actionType === "business_registered" ||
    actionType === "petty_cash_disbursement" ||
    actionType === "custom_disbursement"
  ) {
    return "system_change";
  }
  if (actionType === "login" || actionType === "logout") return actionType;
  return "system_change";
};

// Human-readable label for the action badge
const getActionLabel = (actionType) => {
  switch (actionType) {
    case "float_opening_created":
      return "Float / Opening";
    case "float_closing_recorded":
      return "Float / Closing";
    case "float_variance_approved":
      return "Float / Variance Approved";
    case "momo_transaction_created":
      return "Transaction / MoMo";
    case "bank_transaction_created":
      return "Transaction / Bank";
    case "airtime_sale_created":
      return "Transaction / Airtime";
    case "expense_recorded":
      return "Transaction / Expense";
    case "reconciliation_submitted":
      return "Reconciliation / Submitted";
    case "reconciliation_approved":
      return "Reconciliation / Approved";
    case "user_created":
      return "User / Created";
    case "user_updated":
      return "User / Updated";
    case "branch_created":
      return "Branch / Created";
    case "merchant_sim_rename":
      return "Branch / SIM Renamed";
    case "business_registered":
      return "Business / Registered";
    case "petty_cash_disbursement":
      return "Disbursement / Petty Cash";
    case "custom_disbursement":
      return "Disbursement / Custom";
    case "login":
      return "Login";
    case "logout":
      return "Logout";
    default:
      return actionType || "Unknown";
  }
};

export default function ActivityLogs() {
  const { userData } = useAuth();
  const [activities, setActivities] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    dateFrom: "",
    dateTo: "",
    userId: "",
    actionType: "",
    status: "",
  });

  useEffect(() => {
    loadActivities();
    if (userData?.role === "it_admin") {
      loadUsers();
    }
  }, [userData]);

  useEffect(() => {
    loadActivities();
  }, [filters]);

  const loadUsers = async () => {
    try {
      const data = await userService.getAll();
      setUsers(data);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const loadActivities = async () => {
    setLoading(true);
    try {
      const filterParams = {};
      if (filters.dateFrom) filterParams.dateFrom = filters.dateFrom;
      if (filters.dateTo) filterParams.dateTo = filters.dateTo;
      // IT Admin can filter by any user; others should only see their own activity
      if (userData?.role === "it_admin") {
        if (filters.userId) filterParams.userId = filters.userId;
      } else if (userData?.userId) {
        filterParams.userId = userData.userId;
      }
      // We intentionally do NOT send actionType to Firestore so we can group by category in-memory
      if (userData?.branchId) filterParams.branchId = userData.branchId;

      const data = await activityLogService.getAll(filterParams);
      
      let filtered = data;
      if (filters.status) {
        filtered = filtered.filter((a) => a.status === filters.status);
      }
      if (filters.actionType) {
        filtered = filtered.filter(
          (a) => getActionCategory(a.actionType) === filters.actionType
        );
      }

      // Resolve branch names from branchId where missing
      const branchIdSet = new Set(
        filtered
          .map((a) => a.branchId)
          .filter((id) => id && typeof id === "string")
      );
      const branchIdToName = {};
      for (const id of branchIdSet) {
        try {
          const branch = await branchService.getById(id);
          if (branch) {
            branchIdToName[id] = branch.branchName || branch.branchCode || "Unnamed Branch";
          }
        } catch (err) {
          console.error("Failed to resolve branch name for activity logs:", err);
        }
      }

      const enriched = filtered.map((a) => ({
        ...a,
        branchName: a.branchName || branchIdToName[a.branchId] || "N/A",
      }));

      setActivities(enriched);
    } catch (error) {
      console.error("Error loading activities:", error);
    } finally {
      setLoading(false);
    }
  };

  const clearFilters = () => {
    setFilters({
      dateFrom: "",
      dateTo: "",
      userId: "",
      actionType: "",
      status: "",
    });
  };

  const exportLogs = () => {
    if (!activities.length) {
      alert("No activities to export");
      return;
    }

    // Build simple HTML table and use browser print-to-PDF
    const rows = [
      ["Timestamp", "User", "Action", "Details", "Status", "Branch"],
      ...activities.map((a) => [
        new Date(a.timestamp?.toDate?.() || a.timestamp).toLocaleString(),
        a.userName || a.userId || "Unknown",
        getActionLabel(a.actionType || a.action || "Unknown"),
        a.details || a.description || a.message || "",
        a.status || "success",
        a.branchName || "N/A",
      ]),
    ];

    const tableHtml = `
      <table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px;">
        ${rows
          .map(
            (r, idx) =>
              `<tr style="${
                idx === 0 ? "font-weight:bold;background:#f3f4f6;" : ""
              }">${r.map((c) => `<td>${c}</td>`).join("")}</tr>`
          )
          .join("")}
      </table>
    `;

    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      alert("Popup blocked. Please allow popups to export as PDF.");
      return;
    }

    win.document.write(`
      <html>
        <head>
          <title>Activity Logs</title>
        </head>
        <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:16px;">
          <h2>Activity Logs</h2>
          ${tableHtml}
        </body>
      </html>
    `);
    win.document.close();
    win.focus();
    win.print();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Activity Logs</h1>
        <p className="text-muted-foreground">Track all system activities and user actions</p>
      </div>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-foreground">Filters</CardTitle>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X className="h-4 w-4 mr-2" />
              Clear
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
            <div className="space-y-2">
              <Label htmlFor="dateFrom">From Date</Label>
              <Input
                id="dateFrom"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="dateTo">To Date</Label>
              <Input
                id="dateTo"
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
              />
            </div>
            {userData?.role === "it_admin" && (
              <div className="space-y-2">
                <Label htmlFor="userId">User</Label>
                <Select
                  id="userId"
                  value={filters.userId}
                  onChange={(e) => setFilters({ ...filters, userId: e.target.value })}
                >
                  <option value="">All Users</option>
                  {users.map((u) => (
                    <option key={u.userId} value={u.userId}>
                      {u.name}
                    </option>
                  ))}
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="actionType">Action Type</Label>
              <Select
                id="actionType"
                value={filters.actionType}
                onChange={(e) => setFilters({ ...filters, actionType: e.target.value })}
              >
                <option value="">All Actions</option>
                <option value="login">Login</option>
                <option value="logout">Logout</option>
                <option value="transaction">Transaction</option>
                <option value="float">Float</option>
                <option value="reconciliation">Reconciliation</option>
                <option value="user_management">User Management</option>
                <option value="branch_management">Branch Management</option>
                <option value="system_change">System Change</option>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                id="status"
                value={filters.status}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              >
                <option value="">All Status</option>
                <option value="success">Success</option>
                <option value="failed">Failed</option>
                <option value="warning">Warning</option>
              </Select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button onClick={loadActivities}>
              <Search className="h-4 w-4 mr-2" />
              Search
            </Button>
            <Button variant="outline" onClick={exportLogs}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border shadow-sm">
        <CardHeader>
          <CardTitle className="text-foreground">Activity Log ({activities.length} entries)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading activities...</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-foreground">Timestamp</TableHead>
                  <TableHead className="text-foreground">User</TableHead>
                  <TableHead className="text-foreground">Action</TableHead>
                  <TableHead className="text-foreground">Details</TableHead>
                  <TableHead className="text-foreground">Branch</TableHead>
                  <TableHead className="text-foreground">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground">
                      No activities found
                    </TableCell>
                  </TableRow>
                ) : (
                  activities.map((activity) => (
                    <TableRow key={activity.id} className="border-border hover:bg-muted/30">
                      <TableCell className="text-foreground">
                        {new Date(activity.timestamp?.toDate?.() || activity.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell className="text-foreground">{activity.userName || activity.userId || "System"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-foreground border-border">
                          {getActionLabel(activity.actionType || activity.action)}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate text-foreground">
                        {activity.details || activity.description || activity.message || "N/A"}
                      </TableCell>
                      <TableCell className="text-foreground">{activity.branchName || "N/A"}</TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            activity.status === "success"
                              ? "default"
                              : activity.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                        >
                          {activity.status || "success"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
