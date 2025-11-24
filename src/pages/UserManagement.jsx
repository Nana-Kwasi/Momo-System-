import React, { useState, useEffect } from "react";
import { userService, branchService, agentBusinessService } from "../services/firestoreService";
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
import { Edit, UserX, UserCheck, RotateCcw } from "lucide-react";

export default function UserManagement() {
  const { userData, login } = useAuth();
  const [users, setUsers] = useState([]);
  const [branches, setBranches] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
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
    loadUsers();
    if (userData?.role === "it_admin") {
      loadBusinesses();
    }
    if (selectedBusinessId || userData?.businessId) {
      loadBranches();
    }
  }, [userData, selectedBusinessId]);

  const loadUsers = async () => {
    try {
      let data;
      if (userData?.role === "it_admin") {
        data = await userService.getAll();
      } else if (userData?.role === "branch_manager") {
        data = await userService.getAll(userData.businessId, userData.branchId);
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
    setShowForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingUser) {
        await userService.update(editingUser.userId, formData);
        alert("User updated successfully!");
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
    setShowForm(true);
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

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">User Management</h1>
          <p className="text-muted-foreground">Manage system users</p>
        </div>
        {!showForm && (
          <Button onClick={() => setShowForm(true)}>Create New User</Button>
        )}
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingUser ? "Edit User" : "Create New User"}</CardTitle>
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
        <CardHeader>
          <CardTitle>All Users</CardTitle>
        </CardHeader>
        <CardContent>
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
                            : user.status === "suspended"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {user.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {user.lastLogin
                        ? new Date(user.lastLogin.toDate()).toLocaleDateString()
                        : "Never"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleEdit(user)}
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleSuspend(user)}
                          title={user.status === "active" ? "Suspend" : "Reactivate"}
                        >
                          {user.status === "active" ? (
                            <UserX className="h-4 w-4" />
                          ) : (
                            <UserCheck className="h-4 w-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleResetPassword(user)}
                          title="Reset Password"
                        >
                          <RotateCcw className="h-4 w-4" />
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
