import React, { useState, useEffect } from "react";
import { branchService, agentBusinessService } from "../services/firestoreService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select } from "../components/ui/select";
import { Plus, X } from "lucide-react";

export default function BranchManagement() {
  const { userData } = useAuth();
  const [branches, setBranches] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    businessId: userData?.businessId || "",
    branchName: "",
    branchCode: "",
    branchManager: "",
    branchPhone: "",
    branchEmail: "",
    physicalAddress: "",
    region: "",
    city: "",
    landmark: "",
    operatingHours: "",
    floatLimit: "",
    mtnAgentNumber: "",
    vodafoneAgentNumber: "",
    airtelTigoAgentNumber: "",
    telecelAgentNumber: "",
    bankAgentNumbers: [],
    status: "active",
  });

  const availableBanks = ["Ecobank", "Fidelity", "First Bank", "GCB", "Others"];

  useEffect(() => {
    loadBranches();
    if (userData?.role === "it_admin") {
      loadBusinesses();
    }
  }, [userData]);

  const loadBranches = async () => {
    try {
      if (userData?.businessId) {
        const data = await branchService.getByBusinessId(userData.businessId);
        setBranches(data);
      } else if (userData?.role === "it_admin") {
        const allBranches = [];
        const businesses = await agentBusinessService.getAll();
        for (const business of businesses) {
          const branches = await branchService.getByBusinessId(business.businessId);
          allBranches.push(...branches);
        }
        setBranches(allBranches);
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

  const generateBranchCode = (businessAbbrev) => {
    const random = Math.floor(1000 + Math.random() * 9000);
    return `${businessAbbrev}${random}`;
  };

  const handleBusinessChange = async (businessId) => {
    setFormData({ ...formData, businessId });
    if (businessId) {
      const business = businesses.find((b) => b.businessId === businessId);
      if (business) {
        const code = generateBranchCode(business.businessAbbreviation);
        setFormData((prev) => ({ ...prev, branchCode: code }));
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    const hasAtLeastOneMoMo = formData.mtnAgentNumber || formData.vodafoneAgentNumber || 
                              formData.airtelTigoAgentNumber || formData.telecelAgentNumber;
    
    if (!hasAtLeastOneMoMo) {
      alert("Please fill at least one Mobile Money Agent Number");
      return;
    }
    
    setLoading(true);
    try {
      await branchService.create({
        ...formData,
        createdBy: userData?.userId,
      });
      alert("Branch created successfully!");
      setFormData({
        businessId: userData?.businessId || "",
        branchName: "",
        branchCode: "",
        branchManager: "",
        branchPhone: "",
        branchEmail: "",
        physicalAddress: "",
        region: "",
        city: "",
        landmark: "",
        operatingHours: "",
        floatLimit: "",
        mtnAgentNumber: "",
        vodafoneAgentNumber: "",
        airtelTigoAgentNumber: "",
        telecelAgentNumber: "",
        bankAgentNumbers: [],
        status: "active",
      });
      loadBranches();
    } catch (error) {
      alert("Error creating branch: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Branch Management</h1>
        <p className="text-muted-foreground">Manage business branches</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Create New Branch</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {userData?.role === "it_admin" && (
              <div className="space-y-2">
                <Label htmlFor="businessId">Business *</Label>
                <select
                  id="businessId"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.businessId}
                  onChange={(e) => handleBusinessChange(e.target.value)}
                  required
                >
                  <option value="">Select Business</option>
                  {businesses.map((b) => (
                    <option key={b.businessId} value={b.businessId}>
                      {b.businessName}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branchName">Branch Name *</Label>
                <Input
                  id="branchName"
                  value={formData.branchName}
                  onChange={(e) => setFormData({ ...formData, branchName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchCode">Branch Code *</Label>
                <Input
                  id="branchCode"
                  value={formData.branchCode}
                  onChange={(e) => setFormData({ ...formData, branchCode: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branchManager">Branch Manager Name *</Label>
                <Input
                  id="branchManager"
                  value={formData.branchManager}
                  onChange={(e) => setFormData({ ...formData, branchManager: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="branchPhone">Branch Phone *</Label>
                <Input
                  id="branchPhone"
                  type="tel"
                  value={formData.branchPhone}
                  onChange={(e) => setFormData({ ...formData, branchPhone: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="branchEmail">Branch Email</Label>
                <Input
                  id="branchEmail"
                  type="email"
                  value={formData.branchEmail}
                  onChange={(e) => setFormData({ ...formData, branchEmail: e.target.value })}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="physicalAddress">Physical Address *</Label>
              <Input
                id="physicalAddress"
                value={formData.physicalAddress}
                onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="region">Region *</Label>
                <Input
                  id="region"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="landmark">Landmark</Label>
                <Input
                  id="landmark"
                  value={formData.landmark}
                  onChange={(e) => setFormData({ ...formData, landmark: e.target.value })}
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="operatingHours">Operating Hours * (e.g., 8:00 AM - 6:00 PM)</Label>
                <Input
                  id="operatingHours"
                  value={formData.operatingHours}
                  onChange={(e) => setFormData({ ...formData, operatingHours: e.target.value })}
                  placeholder="8:00 AM - 6:00 PM"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="floatLimit">Maximum Float Limit (GHS) *</Label>
                <Input
                  id="floatLimit"
                  type="number"
                  value={formData.floatLimit}
                  onChange={(e) => setFormData({ ...formData, floatLimit: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Mobile Money Agent Numbers (At least one required)</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mtnAgentNumber">MTN Agent Number</Label>
                  <Input
                    id="mtnAgentNumber"
                    value={formData.mtnAgentNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, mtnAgentNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vodafoneAgentNumber">Vodafone Agent Number</Label>
                  <Input
                    id="vodafoneAgentNumber"
                    value={formData.vodafoneAgentNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, vodafoneAgentNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtelTigoAgentNumber">AirtelTigo Agent Number</Label>
                  <Input
                    id="airtelTigoAgentNumber"
                    value={formData.airtelTigoAgentNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, airtelTigoAgentNumber: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telecelAgentNumber">Telecel Agent Number</Label>
                  <Input
                    id="telecelAgentNumber"
                    value={formData.telecelAgentNumber}
                    onChange={(e) =>
                      setFormData({ ...formData, telecelAgentNumber: e.target.value })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold">Bank Agent Numbers (Optional)</h3>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFormData({
                      ...formData,
                      bankAgentNumbers: [...formData.bankAgentNumbers, { bankName: "", agentNumber: "" }],
                    });
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Add Bank
                </Button>
              </div>
              <div className="space-y-4">
                {formData.bankAgentNumbers.map((bank, index) => (
                  <div key={index} className="grid gap-4 md:grid-cols-3 items-end">
                    <div className="space-y-2">
                      <Label>Bank Name</Label>
                      <Select
                        value={bank.bankName}
                        onChange={(e) => {
                          const updated = [...formData.bankAgentNumbers];
                          updated[index].bankName = e.target.value;
                          setFormData({ ...formData, bankAgentNumbers: updated });
                        }}
                      >
                        <option value="">Select Bank</option>
                        {availableBanks.map((b) => (
                          <option key={b} value={b}>
                            {b}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Agent Number</Label>
                      <Input
                        value={bank.agentNumber}
                        onChange={(e) => {
                          const updated = [...formData.bankAgentNumbers];
                          updated[index].agentNumber = e.target.value;
                          setFormData({ ...formData, bankAgentNumbers: updated });
                        }}
                        placeholder="Enter agent number"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        const updated = formData.bankAgentNumbers.filter((_, i) => i !== index);
                        setFormData({ ...formData, bankAgentNumbers: updated });
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {formData.bankAgentNumbers.length === 0 && (
                  <p className="text-sm text-muted-foreground">No bank agent numbers added. Click "Add Bank" to add one.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline">
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Creating..." : "Create Branch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Branches</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Branch Name</TableHead>
                <TableHead>Branch Code</TableHead>
                <TableHead>Manager</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No branches found
                  </TableCell>
                </TableRow>
              ) : (
                branches.map((branch) => (
                  <TableRow key={branch.id}>
                    <TableCell className="font-medium">{branch.branchName}</TableCell>
                    <TableCell>{branch.branchCode}</TableCell>
                    <TableCell>{branch.branchManager}</TableCell>
                    <TableCell>{branch.branchPhone}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          branch.status === "active"
                            ? "default"
                            : branch.status === "suspended"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {branch.status}
                      </Badge>
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

