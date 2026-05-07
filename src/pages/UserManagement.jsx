import React, { useState, useEffect } from "react";
import { userService, branchService, agentBusinessService, activityLogService, dailyFloatService } from "../services/firestoreService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../lib/firebase";
import { Edit, UserX, UserCheck, RotateCcw, Lock, Unlock, DollarSign, KeyRound } from "lucide-react";

export default function UserManagement() {
  const { userData, login } = useAuth();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [filterBusinessId, setFilterBusinessId] = useState("");
  const [filterBranchId, setFilterBranchId] = useState("");
  const [filterBranches, setFilterBranches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFloatToday, setUserFloatToday] = useState(null);
  const [unlockingFloat, setUnlockingFloat] = useState(false);
  const { selectedBusinessId } = useAuth();
  
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    telephone: "",
    alternatePhone: "",
    role: userData?.role === "it_admin" ? "normal_user" : "normal_user",
    businessId: selectedBusinessId || userData?.businessId || "",
    branchId: "",
    password: "AFB12345",
    employmentType: "full_time",
    emergencyContactName: "",
    emergencyContactPhone: "",
    emergencyContactRelationship: "",
  });

  useEffect(() => {
    if (userData?.role === "it_admin") {
      loadBusinesses();
    }
    if (selectedBusinessId || userData?.businessId) {
      loadBranches();
    }
  }, [userData, selectedBusinessId]);

  useEffect(() => {
    loadUsers();
  }, [userData, selectedBusinessId, filterBusinessId, filterBranchId]);

  useEffect(() => {
    if (userData?.role === "it_admin" && filterBusinessId) {
      branchService.getByBusinessId(filterBusinessId).then(setFilterBranches).catch(() => setFilterBranches([]));
    } else {
      setFilterBranches([]);
      if (!filterBusinessId) setFilterBranchId("");
    }
  }, [userData?.role, filterBusinessId]);

  const loadUsers = async () => {
    try {
      let data;
      if (userData?.role === "it_admin") {
        data = await userService.getAll(
          filterBusinessId || null,
          filterBranchId || null
        );
      } else if (userData?.role === "branch_manager") {
        data = await userService.getAll(userData.businessId, userData.branchId);
      } else if (userData?.role === "admin") {
        data = await userService.getAll(userData.businessId || null, null);
      } else {
        data = [];
      }
      setUsers(data);
    } catch (error) {
      console.error("Error loading users:", error);
    }
  };

  const loadBranches = async () => {
    try {
      const businessId = selectedBusinessId || userData?.businessId;
      if (businessId) {
        const data = await branchService.getByBusinessId(businessId);
        setBranches(data);
        if (!formData.branchId && data.length > 0) {
          setFormData(prev => ({ ...prev, businessId }));
        }
      }
    } catch (error) {
      console.error("Error loading branches:", error);
    }
  };

  const loadBusinesses = async () => {
    try {
      const data = await agentBusinessService.getAll();
      setBusinesses(data);
    } catch (error) {
      console.error("Error loading businesses:", error);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      email: "",
      telephone: "",
      alternatePhone: "",
      role: userData?.role === "it_admin" ? "normal_user" : "normal_user",
      businessId: selectedBusinessId || userData?.businessId || "",
      branchId: "",
      password: "AFB12345",
      employmentType: "full_time",
      emergencyContactName: "",
      emergencyContactPhone: "",
      emergencyContactRelationship: "",
    });
    setEditingUser(null);
    setUserFloatToday(null);
    setShowForm(false);
    loadBranches();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUser) {
        await userService.update(editingUser.userId, formData);
        alert("User updated successfully!");
        // Log user update (best-effort)
        try {
          await activityLogService.log({
            userId: userData?.userId || null,
            userName: userData?.name || userData?.email || "Unknown User",
            businessId: formData.businessId || userData?.businessId || null,
            branchId: formData.branchId || null,
            actionType: "user_updated",
            details: `User "${formData.name}" (${formData.email}) updated by ${userData?.name || userData?.email}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log user update activity:", logError);
        }
      } else {
        // Store current admin user's email before creating new user
        const currentUser = auth.currentUser;
        const adminEmail = currentUser?.email;
        
        // Create the new user (this will automatically sign them in, switching the auth state)
        const userCredential = await createUserWithEmailAndPassword(
          auth,
          formData.email,
          formData.password
        );

        // Create user document in Firestore
        await userService.create({
          ...formData,
          userId: userCredential.user.uid,
          defaultPassword: true,
          createdBy: userData?.userId,
        });

        // Log user creation (best-effort)
        try {
          await activityLogService.log({
            userId: userData?.userId || null,
            userName: userData?.name || userData?.email || "Unknown User",
            businessId: formData.businessId || userData?.businessId || null,
            branchId: formData.branchId || null,
            actionType: "user_created",
            details: `User "${formData.name}" (${formData.email}) created with role ${formData.role}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log user creation activity:", logError);
        }

        // Sign out the newly created user immediately
        await signOut(auth);
        
        // Show message and redirect to login
        alert(`User created successfully!\n\nYou have been signed out. Please sign back in with your admin account:\n${adminEmail}`);
        
        // Redirect to login page
        window.location.href = '/login';
        
        return; // Exit early since we're redirecting
      }
      resetForm();
      loadUsers();
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadUserFloatToday = async (user) => {
    if (!user?.branchId || !user?.userId) {
      setUserFloatToday(null);
      return;
    }
    try {
      const today = new Date();
      const float = await dailyFloatService.getByBranchDateAndUser(user.branchId, today, user.userId);
      setUserFloatToday(float ? { ...float, isClosed: !!(float.closingPhysicalCash && float.closingPhysicalCash !== "") } : null);
    } catch {
      setUserFloatToday(null);
    }
  };

  const handleEdit = (user) => {
    setEditingUser(user);
    setFormData({
      name: user.name || "",
      email: user.email || "",
      telephone: user.telephone || "",
      alternatePhone: user.alternatePhone || "",
      role: user.role || "normal_user",
      businessId: user.businessId || userData?.businessId || "",
      branchId: user.branchId || "",
      password: "",
      employmentType: user.employmentType || "full_time",
      emergencyContactName: user.emergencyContactName || "",
      emergencyContactPhone: user.emergencyContactPhone || "",
      emergencyContactRelationship: user.emergencyContactRelationship || "",
    });
    setUserFloatToday(null);
    setShowForm(true);
    if (userData?.role === "it_admin") {
      if (user?.branchId && user?.userId) loadUserFloatToday(user);
      if (user?.businessId) {
        branchService.getByBusinessId(user.businessId).then(setBranches).catch(() => {});
      }
    }
  };

  const handleSuspend = async (user) => {
    if (window.confirm(`Are you sure you want to ${user.status === "active" ? "suspend" : "reactivate"} this user?`)) {
      try {
        await userService.update(user.userId, {
          status: user.status === "active" ? "suspended" : "active",
        });
        loadUsers();
      } catch (error) {
        alert("Error: " + error.message);
      }
    }
  };

  const handleLock = async (user) => {
    if (!window.confirm(`Lock user "${user.name}"? They will not be able to sign in.`)) return;
    try {
      await userService.lock(user.userId);
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleUnlock = async (user) => {
    try {
      await userService.unlock(user.userId);
      loadUsers();
    } catch (e) {
      alert(e.message);
    }
  };

  const handleResetPassword = async (user) => {
    if (window.confirm("Reset password to default (AFB12345)?")) {
      try {
        // Note: This requires Firebase Admin SDK or a cloud function
        alert("Password reset functionality requires backend implementation");
      } catch (error) {
        alert("Error: " + error.message);
      }
    }
  };

  const handleUnlockUserFloat = async () => {
    if (!editingUser || !userFloatToday?.floatId || userFloatToday?.unlockedByItAdmin) return;
    setUnlockingFloat(true);
    try {
      await dailyFloatService.update(userFloatToday.floatId, { unlockedByItAdmin: true });
      await loadUserFloatToday(editingUser);
    } catch (e) {
      alert("Failed to unlock float: " + e.message);
    } finally {
      setUnlockingFloat(false);
    }
  };

  const handleUnlockAllBranchFloatsToday = async () => {
    if (!editingUser?.branchId || userData?.role !== "it_admin") return;
    if (!window.confirm("Unlock today's float for all users in this branch? They will be able to continue transactions.")) return;
    setUnlockingFloat(true);
    try {
      const floats = await dailyFloatService.getFloatsByBranchAndDate(editingUser.branchId, new Date());
      const closed = floats.filter((f) => f.closingPhysicalCash && f.closingPhysicalCash !== "" && !f.unlockedByItAdmin);
      for (const f of closed) {
        await dailyFloatService.update(f.floatId, { unlockedByItAdmin: true });
      }
      if (closed.length) await loadUserFloatToday(editingUser);
      alert(closed.length ? `Unlocked ${closed.length} float(s).` : "No closed floats to unlock.");
    } catch (e) {
      alert("Failed: " + e.message);
    } finally {
      setUnlockingFloat(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">User Management</h1>
          <p className="page-description">Manage system users</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)} className="shrink-0">Create New User</Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle className="text-xl">{editingUser ? "Edit User" : "Create New User"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="name">Full Name *</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email *</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    required
                    disabled={!!editingUser}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="telephone">Primary Phone *</Label>
                  <Input
                    id="telephone"
                    type="tel"
                    value={formData.telephone}
                    onChange={(e) => setFormData({ ...formData, telephone: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="alternatePhone">Alternate Phone</Label>
                  <Input
                    id="alternatePhone"
                    type="tel"
                    value={formData.alternatePhone}
                    onChange={(e) => setFormData({ ...formData, alternatePhone: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="role">Role *</Label>
                <Select
                  id="role"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  required
                  disabled={userData?.role === "admin"}
                >
                  {userData?.role === "it_admin" ? (
                    <>
                      <option value="normal_user">Normal User</option>
                      <option value="admin">Admin</option>
                      <option value="branch_manager">Branch Manager</option>
                    </>
                  ) : (
                    <option value="normal_user">Normal User</option>
                  )}
                </Select>
                {userData?.role === "admin" && (
                  <p className="text-xs text-muted-foreground">Admins can only create normal users</p>
                )}
              </div>

              {userData?.role === "it_admin" && (
                <div className="space-y-2">
                  <Label htmlFor="businessId">Business *</Label>
                  <Select
                    id="businessId"
                    value={formData.businessId}
                    onChange={(e) => {
                      setFormData({ ...formData, businessId: e.target.value, branchId: "" });
                      loadBranches();
                    }}
                    required
                  >
                    <option value="">Select Business</option>
                    {businesses.map((b) => (
                      <option key={b.businessId} value={b.businessId}>
                        {b.businessName}
                      </option>
                    ))}
                  </Select>
                  <p className="text-xs text-muted-foreground">
                    Business auto-populated from current session: {selectedBusinessId ? "Yes" : "No"}
                  </p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="branchId">Branch *</Label>
                <Select
                  id="branchId"
                  value={formData.branchId}
                  onChange={(e) => setFormData({ ...formData, branchId: e.target.value })}
                  required
                >
                  <option value="">Select Branch</option>
                  {branches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.branchName}
                    </option>
                  ))}
                </Select>
                {(userData?.role === "it_admin" || userData?.role === "branch_manager") && (
                  <p className="text-xs text-muted-foreground">
                    Or create a new branch from the Branches page
                  </p>
                )}
              </div>

              {!editingUser && (
                <div className="space-y-2">
                  <Label htmlFor="password">Default Password</Label>
                  <Input
                    id="password"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    required
                  />
                  <p className="text-sm text-muted-foreground">Default: AFB12345</p>
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Emergency Contact</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactName">Emergency Contact Name *</Label>
                    <Input
                      id="emergencyContactName"
                      value={formData.emergencyContactName}
                      onChange={(e) =>
                        setFormData({ ...formData, emergencyContactName: e.target.value })
                      }
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="emergencyContactPhone">Emergency Contact Phone *</Label>
                    <Input
                      id="emergencyContactPhone"
                      type="tel"
                      value={formData.emergencyContactPhone}
                      onChange={(e) =>
                        setFormData({ ...formData, emergencyContactPhone: e.target.value })
                      }
                      required
                    />
                  </div>
                </div>
                <div className="mt-4">
                  <Label htmlFor="emergencyContactRelationship">Relationship *</Label>
                  <Input
                    id="emergencyContactRelationship"
                    value={formData.emergencyContactRelationship}
                    onChange={(e) =>
                      setFormData({ ...formData, emergencyContactRelationship: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              {userData?.role === "it_admin" && editingUser && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <DollarSign className="h-5 w-5" />
                    Float (today)
                  </h3>
                  {!editingUser.branchId ? (
                    <p className="text-sm text-muted-foreground">User has no branch assigned.</p>
                  ) : userFloatToday === null ? (
                    <p className="text-sm text-muted-foreground">Loading…</p>
                  ) : !userFloatToday.floatId ? (
                    <p className="text-sm text-muted-foreground">No float opened for today by this user.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-sm">
                        Status:{" "}
                        <Badge variant={userFloatToday.isClosed ? "secondary" : "default"}>
                          {userFloatToday.isClosed ? "Closed" : "Open"}
                        </Badge>
                        {userFloatToday.isClosed && userFloatToday.unlockedByItAdmin && (
                          <Badge variant="outline" className="ml-1">Unlocked by IT Admin</Badge>
                        )}
                      </span>
                      {userFloatToday.isClosed && !userFloatToday.unlockedByItAdmin && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={unlockingFloat}
                          onClick={handleUnlockUserFloat}
                        >
                          {unlockingFloat ? "Unlocking…" : "Unlock this user's float"}
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={unlockingFloat}
                        onClick={handleUnlockAllBranchFloatsToday}
                        title="Unlock today's float for all users in this branch"
                      >
                        {unlockingFloat ? "Unlocking…" : "Unlock all branch floats today"}
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {userData?.role === "it_admin" && editingUser && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
                    <KeyRound className="h-5 w-5" />
                    Quick actions
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleLock(editingUser)}
                      disabled={editingUser.status === "locked"}
                    >
                      <Lock className="h-3.5 w-3.5 mr-1" />
                      Lock user
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnlock(editingUser)}
                      disabled={editingUser.status !== "locked"}
                    >
                      <Unlock className="h-3.5 w-3.5 mr-1" />
                      Unlock user
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => handleSuspend(editingUser)}
                    >
                      {editingUser.status === "active" ? (
                        <><UserX className="h-3.5 w-3.5 mr-1" /> Suspend</>
                      ) : (
                        <><UserCheck className="h-3.5 w-3.5 mr-1" /> Reactivate</>
                      )}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => handleResetPassword(editingUser)}>
                      <RotateCcw className="h-3.5 w-3.5 mr-1" />
                      Reset password
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={resetForm}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Saving..." : editingUser ? "Update User" : "Create User"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="border-b border-border">
          <CardTitle className="text-xl">All Users</CardTitle>
        </CardHeader>
        <CardContent>
          {userData?.role === "it_admin" && (
            <div className="flex flex-wrap gap-4 mb-4">
              <div className="space-y-1">
                <Label className="text-xs">Filter by Business</Label>
                <Select
                  value={filterBusinessId}
                  onChange={(e) => {
                    setFilterBusinessId(e.target.value);
                    setFilterBranchId("");
                  }}
                >
                  <option value="">All businesses</option>
                  {businesses.map((b) => (
                    <option key={b.businessId} value={b.businessId}>
                      {b.businessName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Filter by Branch</Label>
                <Select
                  value={filterBranchId}
                  onChange={(e) => setFilterBranchId(e.target.value)}
                  disabled={!filterBusinessId}
                >
                  <option value="">All branches</option>
                  {filterBranches.map((b) => (
                    <option key={b.branchId} value={b.branchId}>
                      {b.branchName}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last Login</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No users found
                  </TableCell>
                </TableRow>
              ) : (
                users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.name}</TableCell>
                    <TableCell>{user.email}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{user.role}</Badge>
                    </TableCell>
                    <TableCell>{user.telephone}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          user.status === "active"
                            ? "default"
                            : user.status === "locked" || user.status === "suspended"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {user.status || "active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLogin
                        ? new Date(user.lastLogin.toDate ? user.lastLogin.toDate() : user.lastLogin).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap items-center">
                        <Button variant="outline" size="sm" className="h-8" onClick={() => handleEdit(user)} title="Edit">
                          <Edit className="h-3.5 w-3.5 mr-1" />
                          Edit
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-8"
                          onClick={() => handleSuspend(user)}
                          title={user.status === "active" ? "Suspend" : "Reactivate"}
                        >
                          {user.status === "active" ? (
                            <UserX className="h-3.5 w-3.5 mr-1" />
                          ) : (
                            <UserCheck className="h-3.5 w-3.5 mr-1" />
                          )}
                          {user.status === "active" ? "Suspend" : "Reactivate"}
                        </Button>
                        {(userData?.role === "it_admin" || userData?.role === "branch_manager") &&
                          (user.status === "locked" ? (
                            <Button variant="default" size="sm" className="h-8" onClick={() => handleUnlock(user)} title="Unlock">
                              <Unlock className="h-3.5 w-3.5 mr-1" />
                              Unlock
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-8 text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                              onClick={() => handleLock(user)}
                              title="Lock"
                            >
                              <Lock className="h-3.5 w-3.5 mr-1" />
                              Lock
                            </Button>
                          ))}
                        <Button variant="outline" size="sm" className="h-8" onClick={() => handleResetPassword(user)} title="Reset Password">
                          <RotateCcw className="h-3.5 w-3.5 mr-1" />
                          Reset
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
