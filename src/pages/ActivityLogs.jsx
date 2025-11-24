import React, { useState, useEffect } from "react";
import { activityLogService, userService } from "../services/firestoreService";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { Download, Search, X } from "lucide-react";

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
      if (filters.userId) filterParams.userId = filters.userId;
      if (filters.actionType) filterParams.actionType = filters.actionType;
      if (userData?.branchId) filterParams.branchId = userData.branchId;

      const data = await activityLogService.getAll(filterParams);
      
      let filtered = data;
      if (filters.status) {
        filtered = data.filter(a => a.status === filters.status);
      }

      setActivities(filtered);
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
    const csv = [
      ["Timestamp", "User", "Action", "Details", "Status", "Branch"].join(","),
      ...activities.map(a => [
        new Date(a.timestamp?.toDate?.() || a.timestamp).toLocaleString(),
        a.userName || a.userId || "Unknown",
        a.actionType || a.action || "Unknown",
        a.details || a.description || "",
        a.status || "success",
        a.branchName || "N/A",
      ].join(","))
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `activity_logs_${new Date().toISOString().split("T")[0]}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Activity Logs</h1>
        <p className="text-muted-foreground">Track all system activities and user actions</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Filters</CardTitle>
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
              Export CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Activity Log ({activities.length} entries)</CardTitle>
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
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>User</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Details</TableHead>
                  <TableHead>Branch</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center">
                      No activities found
                    </TableCell>
                  </TableRow>
                ) : (
                  activities.map((activity) => (
                    <TableRow key={activity.id}>
                      <TableCell>
                        {new Date(activity.timestamp?.toDate?.() || activity.timestamp).toLocaleString()}
                      </TableCell>
                      <TableCell>{activity.userName || activity.userId || "System"}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{activity.actionType || activity.action || "Unknown"}</Badge>
                      </TableCell>
                      <TableCell className="max-w-md truncate">
                        {activity.details || activity.description || activity.message || "N/A"}
                      </TableCell>
                      <TableCell>{activity.branchName || "N/A"}</TableCell>
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
