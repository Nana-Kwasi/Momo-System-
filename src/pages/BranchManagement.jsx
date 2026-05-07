import React, { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { branchService, agentBusinessService, activityLogService, bankService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select } from "../components/ui/select";
import { Plus, X, Lock, Unlock, Pause, Building2 } from "lucide-react";

export default function BranchManagement() {
  const { userData, selectedBusinessId } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [branches, setBranches] = useState([]);
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBranch, setEditingBranch] = useState(null);
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simModalBranch, setSimModalBranch] = useState(null);
  const [simModalSims, setSimModalSims] = useState([]);
  const [simModalNewSim, setSimModalNewSim] = useState({
    provider: "",
    simName: "",
    agentNumber: "",
  });
  const [simSummary, setSimSummary] = useState({});
  const [newSim, setNewSim] = useState({
    provider: "",
    simName: "",
    agentNumber: "",
  });
  const [merchantSims, setMerchantSims] = useState([]);
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

  const [banks, setBanks] = useState([]);
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankModalBranch, setBankModalBranch] = useState(null);
  const [bankModalEditingId, setBankModalEditingId] = useState(null);
  const [bankModalEditName, setBankModalEditName] = useState("");
  const [bankModalNewName, setBankModalNewName] = useState("");

  const defaultBankNames = ["Ecobank", "Fidelity", "First Bank", "GCB", "Others"];
  const bankOptions = banks.length > 0 ? banks : defaultBankNames.map((name) => ({ bankName: name }));

  useEffect(() => {
    loadBranches();
    if (userData?.role === "it_admin") {
      loadBusinesses();
    } else if ((userData?.role === "admin" || userData?.role === "branch_manager") && userData?.businessId) {
      agentBusinessService.getById(userData.businessId).then((b) => b && setBusinesses([b])).catch(() => {});
    }
  }, [userData]);

  useEffect(() => {
    const state = location.state;
    if (state?.openAddBranch) {
      const bid = state.businessId || selectedBusinessId || userData?.businessId;
      if (bid) {
        const business = businesses.find((b) => b.businessId === bid) || businesses[0];
        const abbrev = business?.businessAbbreviation || "BR";
        const code = `${String(abbrev).toUpperCase().slice(0, 4)}${Math.floor(1000 + Math.random() * 9000)}`;
        setFormData((prev) => ({ ...prev, businessId: bid, branchCode: code }));
        setShowModal(true);
      }
      navigate(location.pathname, { replace: true, state: {} });
    }
  }, [location.state?.openAddBranch, location.state?.businessId, selectedBusinessId, userData?.businessId, businesses]);

  useEffect(() => {
    const businessId = userData?.businessId;
    if (businessId) {
      bankService.getByBusinessId(businessId).then(setBanks).catch(() => setBanks([]));
    }
  }, [userData?.businessId]);

  const loadBranches = async () => {
    try {
      if (userData?.businessId) {
        const data = await branchService.getByBusinessId(userData.businessId);
        setBranches(data);
        const summary = {};
        for (const br of data) {
          if (!br.branchId) continue;
          const sims = await merchantSimService.getByBranch(br.branchId);
          const branchOnly = (sims || []).filter((s) => s.branchId === br.branchId);
          const counts = branchOnly.reduce(
            (acc, sim) => {
              const key = sim.provider || "Other";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            {}
          );
          summary[br.branchId] = counts;
        }
        setSimSummary(summary);
      } else if (userData?.role === "it_admin") {
        const allBranches = [];
        const businesses = await agentBusinessService.getAll();
        for (const business of businesses) {
          const branches = await branchService.getByBusinessId(business.businessId);
          allBranches.push(...branches);
        }
        setBranches(allBranches);
        const summary = {};
        for (const br of allBranches) {
          if (!br.branchId) continue;
          const sims = await merchantSimService.getByBranch(br.branchId);
          const branchOnly = (sims || []).filter((s) => s.branchId === br.branchId);
          const counts = branchOnly.reduce(
            (acc, sim) => {
              const key = sim.provider || "Other";
              acc[key] = (acc[key] || 0) + 1;
              return acc;
            },
            {}
          );
          summary[br.branchId] = counts;
        }
        setSimSummary(summary);
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
    setLoading(true);
    try {
      if (editingBranch && editingBranch.branchId) {
        await branchService.update(editingBranch.branchId, {
          ...formData,
        });

        try {
          await activityLogService.log({
            userId: userData?.userId || null,
            userName: userData?.name || userData?.email || "Unknown User",
            businessId: formData.businessId || userData?.businessId || null,
            branchId: editingBranch.branchId,
            actionType: "branch_updated",
            details: `Branch "${formData.branchName}" (${formData.branchCode}) details updated.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log branch update activity:", logError);
        }

        alert("Branch details updated successfully!");
        setEditingBranch(null);
        setShowModal(false);
        await loadBranches();
      } else {
        if (merchantSims.length === 0) {
          alert("Please add at least one Merchant SIM for this branch.");
          setLoading(false);
          return;
        }

        const branchId = await branchService.create({
          ...formData,
          createdBy: userData?.userId,
        });
        if (branchId && merchantSims.length > 0) {
          await Promise.all(
            merchantSims.map((sim) =>
              merchantSimService.create({
                branchId,
                businessId: formData.businessId || userData?.businessId,
                provider: sim.provider,
                simName: sim.simName,
                agentNumber: sim.agentNumber,
              })
            )
          );
        }
        alert("Branch created successfully!");

        try {
          await activityLogService.log({
            userId: userData?.userId || null,
            userName: userData?.name || userData?.email || "Unknown User",
            businessId: formData.businessId || userData?.businessId || null,
            branchId,
            actionType: "branch_created",
            details: `Branch "${formData.branchName}" (${formData.branchCode}) created with manager ${formData.branchManager}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log branch creation activity:", logError);
        }
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
        setMerchantSims([]);
        setNewSim({ provider: "", simName: "", agentNumber: "" });
        setShowModal(false);
        await loadBranches();
      }
    } catch (error) {
      alert("Error saving branch: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSim = () => {
    if (!newSim.provider || !newSim.simName) {
      alert("Please select provider and enter SIM name");
      return;
    }
    setMerchantSims((prev) => [...prev, newSim]);
    setNewSim({ provider: "", simName: "", agentNumber: "" });
  };

  const handleRemoveSim = (index) => {
    setMerchantSims((prev) => prev.filter((_, i) => i !== index));
  };

  const openBranchSimModal = async (branch) => {
    if (!branch?.branchId) {
      alert("Branch ID is missing for this record.");
      return;
    }
    try {
      setSimModalBranch(branch);
      const sims = await merchantSimService.getByBranch(branch.branchId);
      const branchOnly = (sims || []).filter((s) => s.branchId === branch.branchId);
      setSimModalSims(
        branchOnly.map((s) => ({
          merchantSimId: s.merchantSimId,
          provider: s.provider,
          simName: s.simName,
          originalSimName: s.simName,
          agentNumber: s.agentNumber || "",
          editComment: "",
        }))
      );
      setSimModalNewSim({ provider: "", simName: "", agentNumber: "" });
      setSimModalOpen(true);
    } catch (error) {
      console.error("Error loading branch merchant SIMs:", error);
      alert("Failed to load merchant SIMs for this branch.");
    }
  };

  const addSimInModal = () => {
    if (!simModalNewSim.provider || !simModalNewSim.simName) {
      alert("Please select provider and enter SIM name");
      return;
    }
    setSimModalSims((prev) => [...prev, { ...simModalNewSim }]);
    setSimModalNewSim({ provider: "", simName: "", agentNumber: "" });
  };

  const simsGroupedByProvider = React.useMemo(() => {
    const order = ["MTN", "AirtelTigo", "Telecel"];
    const map = {};
    simModalSims.forEach((sim, index) => {
      const p = sim.provider || "Other";
      if (!map[p]) map[p] = [];
      map[p].push({ sim, index });
    });
    const groups = [];
    for (const p of order) {
      if (map[p]?.length) groups.push({ provider: p, items: map[p] });
    }
    for (const p of Object.keys(map).sort()) {
      if (!order.includes(p)) groups.push({ provider: p, items: map[p] });
    }
    return groups;
  }, [simModalSims]);

  const saveBranchSims = async () => {
    if (!simModalBranch?.branchId) return;
    try {
      await merchantSimService.syncBranchSims(
        simModalBranch.branchId,
        simModalBranch.businessId,
        simModalSims
      );

      // Propagate name changes and log activity for edited SIMs
      const editedSims = simModalSims.filter(
        (s) => s.merchantSimId && s.originalSimName && s.simName !== s.originalSimName
      );
      for (const sim of editedSims) {
        await merchantSimService.updateNameEverywhere(sim.merchantSimId, sim.simName);
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId: simModalBranch.businessId || userData?.businessId || null,
          branchId: simModalBranch.branchId || userData?.branchId || null,
          actionType: "merchant_sim_rename",
          details: `Renamed merchant SIM from "${sim.originalSimName}" to "${sim.simName}" for provider ${sim.provider} at branch ${simModalBranch.branchName || simModalBranch.branchCode || ""}. Reason: ${
            sim.editComment || "No reason provided"
          }`,
          status: "success",
        });
      }
      // Refresh summary for this branch
      const sims = await merchantSimService.getByBranch(simModalBranch.branchId);
      const branchOnly = (sims || []).filter((s) => s.branchId === simModalBranch.branchId);
      const counts = branchOnly.reduce(
        (acc, sim) => {
          const key = sim.provider || "Other";
          acc[key] = (acc[key] || 0) + 1;
          return acc;
        },
        {}
      );
      setSimSummary((prev) => ({
        ...prev,
        [simModalBranch.branchId]: counts,
      }));
      alert("Merchant SIMs updated successfully.");
      setSimModalOpen(false);
    } catch (error) {
      console.error("Error saving branch merchant SIMs:", error);
      alert("Failed to save merchant SIMs: " + error.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Branch Management</h1>
          <p className="page-description">Manage business branches</p>
        </div>
        <Button
          onClick={() => {
            setEditingBranch(null);
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
            setMerchantSims([]);
            setNewSim({ provider: "", simName: "", agentNumber: "" });
            setShowModal(true);
          }}
        >
          Create New Branch
        </Button>
      </div>

      {showModal && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-4xl rounded-xl bg-background shadow-2xl border border-border max-h-[90vh] overflow-y-auto">
            <Card className="border-0 shadow-none bg-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="text-xl">Create New Branch</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure branch details, merchant SIMs and bank agent numbers.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setShowModal(false)}
                >
                  Close
                </Button>
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

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-lg font-semibold">Merchant SIMs for this Branch</h3>
              <p className="text-sm text-muted-foreground">
                Add all merchant SIMs used at this branch. These will sync automatically with
                Transactions, Reconciliation and Float screens.
              </p>
              <div className="grid gap-4 md:grid-cols-[1.2fr,1.2fr,1fr,auto] items-end">
                <div className="space-y-2">
                  <Label>Provider</Label>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={newSim.provider}
                    onChange={(e) => setNewSim({ ...newSim, provider: e.target.value })}
                  >
                    <option value="">Select provider</option>
                    <option value="MTN">MTN</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label>Merchant SIM Name</Label>
                  <Input
                    placeholder="e.g. MTN33, MTN34"
                    value={newSim.simName}
                    onChange={(e) => setNewSim({ ...newSim, simName: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Agent Number</Label>
                  <Input
                    placeholder="Merchant number"
                    value={newSim.agentNumber}
                    onChange={(e) => setNewSim({ ...newSim, agentNumber: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label className="invisible">Add</Label>
                  <Button type="button" className="w-full" variant="outline" onClick={handleAddSim}>
                    + Add
                  </Button>
                </div>
              </div>
              {merchantSims.length > 0 && (
                <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Added Merchant SIMs
                  </div>
                  <div className="space-y-2">
                      {merchantSims.map((sim, index) => (
                      <div
                        key={`${sim.provider}-${sim.simName}-${index}`}
                        className="flex items-center justify-between gap-3 rounded-md bg-background px-3 py-2 border border-border"
                      >
                        <div className="flex flex-col text-sm">
                          <span className="font-medium">
                            {sim.provider} — {sim.simName}
                          </span>
                          {sim.agentNumber && (
                            <span className="text-xs text-muted-foreground">
                              Agent Number: {sim.agentNumber}
                            </span>
                          )}
                        </div>
                          {!sim.merchantSimId && (
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleRemoveSim(index)}
                            >
                              Remove
                            </Button>
                          )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
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
                        {bankOptions.map((b) => (
                          <option key={b.bankId || b.bankName || b} value={b.bankName || b}>
                            {b.bankName || b}
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
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (editingBranch ? "Saving..." : "Creating...") : editingBranch ? "Save Changes" : "Create Branch"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
          </div>
        </div>
      )}

      <Card className="border border-border/70 shadow-sm">
        <CardHeader className="flex flex-row items-center justify-between">
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
                <TableHead>Merchant SIMs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {branches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={userData?.role === "it_admin" ? 7 : 6} className="text-center">
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
                      <div className="flex flex-col gap-2">
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                            const summary = simSummary[branch.branchId] || {};
                            const parts = Object.entries(summary).map(
                              ([provider, count]) => `${provider}: ${count}`
                            );
                            return parts.length > 0 ? parts.join(" • ") : "No merchant SIMs";
                          })()}
                        </div>
                        <div className="flex flex-wrap gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => openBranchSimModal(branch)}
                            disabled={branch.status === "suspended" || branch.status === "locked"}
                          >
                            Manage SIMs
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-xs"
                            onClick={() => {
                              setBankModalBranch(branch);
                              setBankModalOpen(true);
                              setBankModalEditingId(null);
                              setBankModalEditName("");
                              setBankModalNewName("");
                              const bid = branch.businessId || userData?.businessId;
                              if (bid) bankService.getByBusinessId(bid).then(setBanks).catch(() => setBanks([]));
                              else setBanks([]);
                            }}
                          >
                            Manage Banks
                          </Button>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          branch.status === "active"
                            ? "default"
                            : branch.status === "suspended" || branch.status === "locked"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {branch.status || "active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {(userData?.role === "it_admin" ||
                          userData?.role === "admin" ||
                          (userData?.role === "branch_manager" && userData?.branchId === branch.branchId)) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              setEditingBranch(branch);
                              setFormData({
                                businessId: branch.businessId || userData?.businessId || "",
                                branchName: branch.branchName || "",
                                branchCode: branch.branchCode || "",
                                branchManager: branch.branchManager || "",
                                branchPhone: branch.branchPhone || "",
                                branchEmail: branch.branchEmail || "",
                                physicalAddress: branch.physicalAddress || "",
                                region: branch.region || "",
                                city: branch.city || "",
                                landmark: branch.landmark || "",
                                operatingHours: branch.operatingHours || "",
                                floatLimit: branch.floatLimit || "",
                                mtnAgentNumber: branch.mtnAgentNumber || "",
                                vodafoneAgentNumber: branch.vodafoneAgentNumber || "",
                                airtelTigoAgentNumber: branch.airtelTigoAgentNumber || "",
                                telecelAgentNumber: branch.telecelAgentNumber || "",
                                bankAgentNumbers: branch.bankAgentNumbers || [],
                                status: branch.status || "active",
                              });
                              setShowModal(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {userData?.role === "it_admin" && (
                          <>
                            {branch.status === "active" && (
                              <>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8 text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                                  onClick={async () => {
                                    if (!window.confirm(`Suspend branch "${branch.branchName}"?`)) return;
                                    try {
                                      await branchService.suspend(branch.branchId);
                                      await loadBranches();
                                    } catch (e) {
                                      alert(e.message);
                                    }
                                  }}
                                >
                                  <Pause className="h-3.5 w-3.5 mr-1" />
                                  Suspend
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="h-8"
                                  onClick={async () => {
                                    if (!window.confirm(`Lock branch "${branch.branchName}"?`)) return;
                                    try {
                                      await branchService.lock(branch.branchId);
                                      await loadBranches();
                                    } catch (e) {
                                      alert(e.message);
                                    }
                                  }}
                                >
                                  <Lock className="h-3.5 w-3.5 mr-1" />
                                  Lock
                                </Button>
                              </>
                            )}
                            {(branch.status === "suspended" || branch.status === "locked") && (
                              <Button
                                type="button"
                                size="sm"
                                variant="default"
                                className="h-8"
                                onClick={async () => {
                                  try {
                                    await branchService.activate(branch.branchId);
                                    await loadBranches();
                                  } catch (e) {
                                    alert(e.message);
                                  }
                                }}
                              >
                                <Unlock className="h-3.5 w-3.5 mr-1" />
                                Activate
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {simModalOpen && simModalBranch && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-3xl rounded-xl bg-background shadow-2xl border border-border max-h-[80vh] overflow-y-auto">
            <Card className="border-0 shadow-none bg-transparent">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
                <div>
                  <CardTitle className="text-lg">
                    Manage Merchant SIMs — {simModalBranch.branchName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Configure merchant SIMs for this specific branch.
                  </p>
                </div>
                <Button type="button" variant="ghost" onClick={() => setSimModalOpen(false)}>
                  Close
                </Button>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="rounded-lg border border-border bg-muted/20 p-4">
                  <Label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3 block">Add new SIM</Label>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr,1fr,1fr,auto] items-end">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Provider</Label>
                      <Select
                        className="w-full h-10"
                        value={simModalNewSim.provider}
                        onChange={(e) =>
                          setSimModalNewSim({ ...simModalNewSim, provider: e.target.value })
                        }
                      >
                        <option value="">Select provider</option>
                        <option value="MTN">MTN</option>
                        <option value="AirtelTigo">AirtelTigo</option>
                        <option value="Telecel">Telecel</option>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Merchant SIM Name</Label>
                      <Input
                        placeholder="e.g. MTN33, MTN34"
                        value={simModalNewSim.simName}
                        onChange={(e) =>
                          setSimModalNewSim({ ...simModalNewSim, simName: e.target.value })
                        }
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Agent Number</Label>
                      <Input
                        placeholder="Merchant number"
                        value={simModalNewSim.agentNumber}
                        onChange={(e) =>
                          setSimModalNewSim({ ...simModalNewSim, agentNumber: e.target.value })
                        }
                      />
                    </div>
                    <Button type="button" size="sm" className="h-10" onClick={addSimInModal}>
                      <Plus className="h-4 w-4 mr-1" />
                      Add
                    </Button>
                  </div>
                </div>

                {simModalSims.length > 0 ? (
                  <div className="space-y-4">
                    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Merchant SIMs by provider
                    </div>
                    {simsGroupedByProvider.map((group) => (
                      <div key={group.provider} className="rounded-lg border border-border bg-muted/10 overflow-hidden">
                        <div className="px-3 py-2 bg-muted/40 border-b border-border font-medium text-sm">
                          {group.provider}
                        </div>
                        <div className="divide-y divide-border">
                          {group.items.map(({ sim, index }) => (
                            <div
                              key={`${sim.merchantSimId || "new"}-${index}`}
                              className="px-3 py-3 flex flex-wrap items-start gap-3"
                            >
                              <div className="grid gap-2 flex-1 min-w-0 sm:grid-cols-2 lg:grid-cols-3">
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">SIM Name</Label>
                                  <Input
                                    className="h-9"
                                    value={sim.simName}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setSimModalSims((prev) => {
                                        const u = [...prev];
                                        u[index] = { ...u[index], simName: value };
                                        return u;
                                      });
                                    }}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs text-muted-foreground">Agent Number</Label>
                                  <Input
                                    className="h-9"
                                    value={sim.agentNumber || ""}
                                    onChange={(e) => {
                                      const value = e.target.value;
                                      setSimModalSims((prev) => {
                                        const u = [...prev];
                                        u[index] = { ...u[index], agentNumber: value };
                                        return u;
                                      });
                                    }}
                                  />
                                </div>
                                {sim.merchantSimId && sim.simName !== sim.originalSimName && (
                                  <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                                    <Label className="text-xs text-muted-foreground">Rename reason</Label>
                                    <Input
                                      className="h-9"
                                      placeholder="Reason for rename"
                                      value={sim.editComment || ""}
                                      onChange={(e) => {
                                        setSimModalSims((prev) => {
                                          const u = [...prev];
                                          u[index] = { ...u[index], editComment: e.target.value };
                                          return u;
                                        });
                                      }}
                                    />
                                  </div>
                                )}
                              </div>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-9 text-destructive border-destructive hover:bg-destructive/10 shrink-0"
                                onClick={() => setSimModalSims((prev) => prev.filter((_, i) => i !== index))}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No merchant SIMs yet. Add one above; they will appear grouped by provider.
                  </p>
                )}

                <div className="flex justify-end gap-2 pt-2 border-t border-border">
                  <Button type="button" variant="outline" onClick={() => setSimModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="button" onClick={saveBranchSims}>
                    Save Changes
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {bankModalOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true">
          <div className="w-full max-w-lg rounded-xl bg-background shadow-2xl border border-border p-6">
            <div className="flex justify-between items-center mb-4">
              <div>
                <h3 className="text-lg font-semibold">Manage Banks</h3>
                {bankModalBranch && (
                  <p className="text-sm text-muted-foreground">
                    Business: {businesses.find((b) => b.businessId === bankModalBranch.businessId)?.businessName || bankModalBranch.businessId}
                    {bankModalBranch.branchName && ` · Branch: ${bankModalBranch.branchName}`}
                  </p>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => { setBankModalOpen(false); setBankModalBranch(null); }}>Close</Button>
            </div>
            {(bankModalBranch?.businessId || userData?.businessId) && (
              <>
                <div className="flex gap-2 mb-4">
                  <Input
                    placeholder="New bank name"
                    value={bankModalNewName}
                    onChange={(e) => setBankModalNewName(e.target.value)}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    size="sm"
                    onClick={async () => {
                      const businessId = bankModalBranch?.businessId || userData?.businessId;
                      if (!bankModalNewName.trim() || !businessId) return;
                      try {
                        await bankService.create({ businessId, bankName: bankModalNewName.trim() });
                        const list = await bankService.getByBusinessId(businessId);
                        setBanks(list);
                        setBankModalNewName("");
                      } catch (err) {
                        alert("Error adding bank: " + err.message);
                      }
                    }}
                  >
                    Add
                  </Button>
                </div>
                <div className="space-y-2 max-h-64 overflow-y-auto rounded-md border border-border bg-muted/20 p-2">
                  {banks.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">No banks yet. Add one above.</p>
                  ) : (
                    banks.map((b) => (
                      <div key={b.bankId || b.id} className="flex items-center gap-2 rounded-md bg-background border border-border px-3 py-2">
                        {bankModalEditingId === (b.bankId || b.id) ? (
                          <>
                            <Input
                              className="flex-1 h-9"
                              value={bankModalEditName}
                              onChange={(e) => setBankModalEditName(e.target.value)}
                            />
                            <Button size="sm" className="h-8" onClick={async () => {
                              try {
                                await bankService.update(b.bankId, { bankName: bankModalEditName.trim() });
                                const businessId = bankModalBranch?.businessId || userData?.businessId;
                                const list = await bankService.getByBusinessId(businessId);
                                setBanks(list);
                                setBankModalEditingId(null);
                              } catch (err) {
                                alert("Error updating: " + err.message);
                              }
                            }}>Save</Button>
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setBankModalEditingId(null)}>Cancel</Button>
                          </>
                        ) : (
                          <>
                            <span className="flex-1 font-medium text-sm">{b.bankName}</span>
                            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => { setBankModalEditingId(b.bankId || b.id); setBankModalEditName(b.bankName || ""); }}>Edit</Button>
                            <Button size="sm" variant="outline" className="h-8 text-xs text-destructive border-destructive hover:bg-destructive/10" onClick={async () => {
                              if (!window.confirm("Delete this bank?")) return;
                              try {
                                await bankService.delete(b.bankId);
                                const businessId = bankModalBranch?.businessId || userData?.businessId;
                                const list = await bankService.getByBusinessId(businessId);
                                setBanks(list);
                              } catch (err) {
                                alert("Error deleting: " + err.message);
                              }
                            }}>Delete</Button>
                          </>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </>
            )}
            {!bankModalBranch?.businessId && !userData?.businessId && (
              <p className="text-sm text-muted-foreground">Select a branch to manage its business banks.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

