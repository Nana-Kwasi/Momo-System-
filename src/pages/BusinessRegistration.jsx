import React, { useState, useEffect, useRef } from "react";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { storage } from "../lib/firebase";
import { agentBusinessService, branchService, activityLogService, businessScreenAccessService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { X, Shield, Loader2 } from "lucide-react";
import { SCREEN_OPTIONS } from "../constants/screens";

export default function BusinessRegistration() {
  const { userData } = useAuth();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [editingBusiness, setEditingBusiness] = useState(null);
  const [loadingBusinessId, setLoadingBusinessId] = useState(null);
  const [businessAction, setBusinessAction] = useState(null); // 'manageSims' | 'screens' | 'lock' | 'unlock' | 'delete'
  const [simModalOpen, setSimModalOpen] = useState(false);
  const [simModalBusiness, setSimModalBusiness] = useState(null);
  const [simModalBranchGroups, setSimModalBranchGroups] = useState([]);
  const [simSummary, setSimSummary] = useState({});
  const [newSim, setNewSim] = useState({
    provider: "",
    simName: "",
    agentNumber: "",
  });
  const [merchantSims, setMerchantSims] = useState([]);
  const [logoModalBusiness, setLogoModalBusiness] = useState(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const logoFileRef = useRef(null);
  const [formData, setFormData] = useState({
    businessName: "",
    businessAbbreviation: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    ghanaCardNumber: "",
    businessRegistrationNumber: "",
    physicalAddress: "",
    region: "",
    city: "",
    digitalAddress: "",
    // Kept for backward compatibility but no longer used as primary source of merchant SIMs
    agentCodes: {
      mtnAgentCode: "",
      vodafoneAgentCode: "",
      airtelTigoAgentCode: "",
      telecelAgentCode: "",
    },
    bankAgentCodes: {
      ecobankAgentCode: "",
      fidelityAgentCode: "",
      firstBankAgentCode: "",
      gcbAgentCode: "",
    },
    status: "active",
  });
  const [businessScreens, setBusinessScreens] = useState([]);
  const [screenAccessModalBusiness, setScreenAccessModalBusiness] = useState(null);
  const [editBusinessScreens, setEditBusinessScreens] = useState([]);
  const [savingScreens, setSavingScreens] = useState(false);

  useEffect(() => {
    loadBusinesses();
  }, [userData?.role, userData?.businessId]);

  const loadBusinesses = async () => {
    try {
      let data;
      if ((userData?.role === "admin" || userData?.role === "branch_manager") && userData?.businessId) {
        const b = await agentBusinessService.getById(userData.businessId);
        data = b ? [b] : [];
      } else {
        data = await agentBusinessService.getAll();
      }
      setBusinesses(data);
      // Load SIM summaries for each business (unassigned, business-level SIMs)
      const summary = {};
      for (const b of data) {
        if (!b.businessId) continue;
        const sims = await merchantSimService.getUnassignedByBusiness(b.businessId);
        const counts = sims.reduce(
          (acc, sim) => {
            const key = sim.provider || "Other";
            acc[key] = (acc[key] || 0) + 1;
            return acc;
          },
          {}
        );
        summary[b.businessId] = counts;
      }
      setSimSummary(summary);
    } catch (error) {
      console.error("Error loading businesses:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (editingBusiness && editingBusiness.businessId) {
        await agentBusinessService.update(editingBusiness.businessId, {
          ...formData,
          businessAbbreviation: formData.businessAbbreviation?.toUpperCase().slice(0, 4),
        });

        try {
          await activityLogService.log({
            userId: userData?.userId || null,
            userName: userData?.name || userData?.email || "Unknown User",
            businessId: editingBusiness.businessId,
            branchId: null,
            actionType: "business_updated",
            details: `Business "${formData.businessName}" (${formData.businessAbbreviation}) details updated.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log business update activity:", logError);
        }

        alert("Business details updated successfully!");
        setEditingBusiness(null);
        setShowModal(false);
        await loadBusinesses();
      } else {
        if (merchantSims.length === 0) {
          if (!window.confirm("No merchant SIMs have been added. Continue registering the business anyway?")) {
            setLoading(false);
            return;
          }
        }
        const businessId = await agentBusinessService.create({
          ...formData,
          createdBy: userData?.userId,
        });
        if (businessId && businessScreens.length > 0) {
          await businessScreenAccessService.set(businessId, businessScreens);
        }
        if (businessId && merchantSims.length > 0) {
          await Promise.all(
            merchantSims.map((sim) =>
              merchantSimService.create({
                businessId,
                provider: sim.provider,
                simName: sim.simName,
                agentNumber: sim.agentNumber,
              })
            )
          );
        }

        try {
          await activityLogService.log({
            userId: userData?.userId || null,
            userName: userData?.name || userData?.email || "Unknown User",
            businessId,
            branchId: null,
            actionType: "business_registered",
            details: `Business "${formData.businessName}" (${formData.businessAbbreviation}) registered for owner ${formData.ownerName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log business registration activity:", logError);
        }

        alert("Business registered successfully!");
        setFormData({
          businessName: "",
          businessAbbreviation: "",
          ownerName: "",
          ownerPhone: "",
          ownerEmail: "",
          ghanaCardNumber: "",
          businessRegistrationNumber: "",
          physicalAddress: "",
          region: "",
          city: "",
          digitalAddress: "",
          agentCodes: {
            mtnAgentCode: "",
            vodafoneAgentCode: "",
            airtelTigoAgentCode: "",
            telecelAgentCode: "",
          },
          bankAgentCodes: {
            ecobankAgentCode: "",
            fidelityAgentCode: "",
            firstBankAgentCode: "",
            gcbAgentCode: "",
          },
          status: "active",
        });
        setMerchantSims([]);
        setNewSim({ provider: "", simName: "", agentNumber: "" });
        setBusinessScreens([]);
        setShowModal(false);
        await loadBusinesses();
      }
    } catch (error) {
      alert("Error saving business: " + error.message);
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

  const openBusinessSimModal = async (business) => {
    if (!business?.businessId) {
      alert("Business ID is missing for this record.");
      return;
    }
    try {
      setLoadingBusinessId(business.businessId);
      setBusinessAction("manageSims");
      setSimModalBusiness(business);
      const branches = await branchService.getByBusinessId(business.businessId);
      const groups = [];

      for (const br of branches) {
        if (!br.branchId) continue;
        const sims = await merchantSimService.getByBranch(br.branchId, business.businessId);
        const branchSims = (sims || []).filter((s) => s.branchId === br.branchId);
        groups.push({
          branchId: br.branchId,
          branchName: br.branchName || br.branchCode || "Unnamed Branch",
          sims: branchSims,
        });
      }

      // Optionally include unassigned business-level SIMs as a separate group
      const unassigned = await merchantSimService.getUnassignedByBusiness(business.businessId);
      if (unassigned && unassigned.length > 0) {
        groups.push({
          branchId: "unassigned",
          branchName: "Unassigned to Branch",
          sims: unassigned,
        });
      }

      setSimModalBranchGroups(groups);
      setSimModalOpen(true);
    } catch (error) {
      console.error("Error loading business merchant SIMs:", error);
      alert("Failed to load merchant SIMs for this business.");
    } finally {
      setLoadingBusinessId(null);
      setBusinessAction(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Agent Business Registration</h1>
          <p className="text-muted-foreground">Register and manage agent businesses</p>
        </div>
        {userData?.role === "it_admin" && (
          <Button
            onClick={() => {
              setEditingBusiness(null);
              setFormData({
                businessName: "",
                businessAbbreviation: "",
                ownerName: "",
                ownerPhone: "",
                ownerEmail: "",
                ghanaCardNumber: "",
                businessRegistrationNumber: "",
                physicalAddress: "",
                region: "",
                city: "",
                digitalAddress: "",
                agentCodes: {
                  mtnAgentCode: "",
                  vodafoneAgentCode: "",
                  airtelTigoAgentCode: "",
                  telecelAgentCode: "",
                },
                bankAgentCodes: {
                  ecobankAgentCode: "",
                  fidelityAgentCode: "",
                  firstBankAgentCode: "",
                  gcbAgentCode: "",
                },
                status: "active",
              });
              setBusinessScreens([]);
              setMerchantSims([]);
              setShowModal(true);
            }}
          >
            Register New Business
          </Button>
        )}
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
                  <CardTitle className="text-xl">
                    {editingBusiness ? "Edit Business Details" : "Register New Business"}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {editingBusiness
                      ? "Update business profile information. Status and screen access controls remain under IT admin."
                      : "Capture business details and configure merchant SIMs by provider."}
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
                <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessAbbreviation">Business Abbreviation * (Max 4 chars)</Label>
                <Input
                  id="businessAbbreviation"
                  value={formData.businessAbbreviation}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      businessAbbreviation: e.target.value.toUpperCase().slice(0, 4),
                    })
                  }
                  maxLength={4}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner Full Name *</Label>
                <Input
                  id="ownerName"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ghanaCardNumber">Ghana Card Number *</Label>
                <Input
                  id="ghanaCardNumber"
                  value={formData.ghanaCardNumber}
                  onChange={(e) => setFormData({ ...formData, ghanaCardNumber: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Owner Phone *</Label>
                <Input
                  id="ownerPhone"
                  type="tel"
                  value={formData.ownerPhone}
                  onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner Email *</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessRegistrationNumber">Business Registration Number</Label>
              <Input
                id="businessRegistrationNumber"
                value={formData.businessRegistrationNumber}
                onChange={(e) =>
                  setFormData({ ...formData, businessRegistrationNumber: e.target.value })
                }
              />
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
                <Label htmlFor="digitalAddress">Digital Address (GPS)</Label>
                <Input
                  id="digitalAddress"
                  value={formData.digitalAddress}
                  onChange={(e) => setFormData({ ...formData, digitalAddress: e.target.value })}
                />
              </div>
            </div>

            {!editingBusiness && (
            <>
            <div className="border-t pt-4 space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Shield className="h-5 w-5" />
                Screen Access
              </h3>
              <p className="text-sm text-muted-foreground">
                Tick screens this business can access; untick to remove. You can change this later in Settings → Screen Access.
              </p>
              <div className="flex flex-wrap gap-3">
                {SCREEN_OPTIONS.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={businessScreens.includes(opt.id)}
                      onChange={() =>
                        setBusinessScreens((prev) =>
                          prev.includes(opt.id) ? prev.filter((s) => s !== opt.id) : [...prev, opt.id]
                        )
                      }
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="border-t pt-4 space-y-4">
              <h3 className="text-lg font-semibold">Merchant SIMs by Provider</h3>
              <p className="text-sm text-muted-foreground">
                Add one or more merchant SIMs for each provider. These will be available across
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
                  <Label>Agent Number (optional)</Label>
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
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveSim(index)}
                        >
                          Remove
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            </>
            )}

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Bank Agent Codes</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ecobankAgentCode">Ecobank Agent Code</Label>
                  <Input
                    id="ecobankAgentCode"
                    value={formData.bankAgentCodes.ecobankAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          ecobankAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fidelityAgentCode">Fidelity Agent Code</Label>
                  <Input
                    id="fidelityAgentCode"
                    value={formData.bankAgentCodes.fidelityAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          fidelityAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstBankAgentCode">First Bank Agent Code</Label>
                  <Input
                    id="firstBankAgentCode"
                    value={formData.bankAgentCodes.firstBankAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          firstBankAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcbAgentCode">GCB Agent Code</Label>
                  <Input
                    id="gcbAgentCode"
                    value={formData.bankAgentCodes.gcbAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          gcbAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setShowModal(false)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {editingBusiness ? "Saving..." : "Registering..."}
                  </>
                ) : (
                  editingBusiness ? "Save Changes" : "Register Business"
                )}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
          </div>
        </div>
      )}

      <Card className="border border-border/70 shadow-sm">
        <CardHeader>
          <CardTitle>All Businesses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Abbreviation</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Merchant SIMs</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center">
                    No businesses registered
                  </TableCell>
                </TableRow>
              ) : (
                businesses.map((business) => (
                  <TableRow key={business.id}>
                    <TableCell className="font-medium">{business.businessName}</TableCell>
                    <TableCell>{business.businessAbbreviation}</TableCell>
                    <TableCell>{business.ownerName}</TableCell>
                    <TableCell>{business.ownerPhone}</TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <div className="text-xs text-muted-foreground">
                          {(() => {
                            const summary = simSummary[business.businessId] || {};
                            const parts = Object.entries(summary).map(
                              ([provider, count]) => `${provider}: ${count}`
                            );
                            return parts.length > 0 ? parts.join(" • ") : "No merchant SIMs";
                          })()}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-8 text-xs"
                          onClick={() => openBusinessSimModal(business)}
                          disabled={business.status === "deleted" || (loadingBusinessId === business.businessId && businessAction === "manageSims")}
                        >
                          {loadingBusinessId === business.businessId && businessAction === "manageSims" ? (
                            <>
                              <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                              Loading…
                            </>
                          ) : (
                            "Manage SIMs"
                          )}
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          business.status === "active"
                            ? "default"
                            : business.status === "locked"
                            ? "destructive"
                            : business.status === "deleted"
                            ? "secondary"
                            : "secondary"
                        }
                      >
                        {business.status || "active"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2 flex-wrap">
                        {(userData?.role === "it_admin" ||
                          (userData?.role === "admin" && userData?.businessId === business.businessId)) && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => {
                              setEditingBusiness(business);
                              setFormData({
                                businessName: business.businessName || "",
                                businessAbbreviation: business.businessAbbreviation || "",
                                ownerName: business.ownerName || "",
                                ownerPhone: business.ownerPhone || "",
                                ownerEmail: business.ownerEmail || "",
                                ghanaCardNumber: business.ghanaCardNumber || "",
                                businessRegistrationNumber: business.businessRegistrationNumber || "",
                                physicalAddress: business.physicalAddress || "",
                                region: business.region || "",
                                city: business.city || "",
                                digitalAddress: business.digitalAddress || "",
                                agentCodes: business.agentCodes || {
                                  mtnAgentCode: "",
                                  vodafoneAgentCode: "",
                                  airtelTigoAgentCode: "",
                                  telecelAgentCode: "",
                                },
                                bankAgentCodes: business.bankAgentCodes || {
                                  ecobankAgentCode: "",
                                  fidelityAgentCode: "",
                                  firstBankAgentCode: "",
                                  gcbAgentCode: "",
                                },
                                status: business.status || "active",
                              });
                              setShowModal(true);
                            }}
                          >
                            Edit
                          </Button>
                        )}
                        {userData?.role === "it_admin" && business.status !== "deleted" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={async () => {
                              setLoadingBusinessId(business.businessId);
                              setBusinessAction("screens");
                              try {
                                setScreenAccessModalBusiness(business);
                                const screens = await businessScreenAccessService.get(business.businessId);
                                setEditBusinessScreens(screens || []);
                              } catch (e) {
                                alert(e.message || "Failed to load screens");
                              } finally {
                                setLoadingBusinessId(null);
                                setBusinessAction(null);
                              }
                            }}
                            disabled={loadingBusinessId === business.businessId && businessAction === "screens"}
                          >
                            {loadingBusinessId === business.businessId && businessAction === "screens" ? (
                              <>
                                <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                                Loading…
                              </>
                            ) : (
                              "Screens"
                            )}
                          </Button>
                        )}
                        {userData?.role === "it_admin" && business.status === "active" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={async () => {
                              if (!window.confirm(`Lock business "${business.businessName}"? Users will not be able to log in.`)) return;
                              try {
                                await agentBusinessService.lock(business.businessId);
                                await loadBusinesses();
                              } catch (e) {
                                alert(e.message);
                              }
                            }}
                          >
                            Lock
                          </Button>
                        )}
                        {userData?.role === "it_admin" && business.status === "locked" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="default"
                            className="h-8"
                            onClick={async () => {
                              try {
                                await agentBusinessService.unlock(business.businessId);
                                await loadBusinesses();
                              } catch (e) {
                                alert(e.message);
                              }
                            }}
                          >
                            Unlock
                          </Button>
                        )}
                        {userData?.role === "it_admin" && business.status !== "deleted" && (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8 text-destructive border-destructive hover:bg-destructive/10 hover:text-destructive"
                            onClick={async () => {
                              if (!window.confirm(`Delete business "${business.businessName}"? This will mark the account as deleted.`)) return;
                              try {
                                await agentBusinessService.delete(business.businessId);
                                await loadBusinesses();
                              } catch (e) {
                                alert(e.message);
                              }
                            }}
                          >
                            Delete
                          </Button>
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

      {simModalOpen && simModalBusiness && (
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
                    Merchant SIMs by Branch — {simModalBusiness.businessName}
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    View how merchant SIMs are distributed across branches for this business.
                  </p>
                </div>
                <Button type="button" variant="ghost" onClick={() => setSimModalOpen(false)}>
                  Close
                </Button>
              </CardHeader>
              <CardContent className="space-y-4">
                {simModalBranchGroups.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No branches or merchant SIMs found for this business yet.
                  </p>
                ) : (
                  <div className="space-y-4">
                    {simModalBranchGroups.map((group) => {
                      const providerOrder = ["MTN", "AirtelTigo", "Telecel"];
                      const byProvider = {};
                      (group.sims || []).forEach((sim) => {
                        const p = sim.provider || "Other";
                        if (!byProvider[p]) byProvider[p] = [];
                        byProvider[p].push(sim);
                      });
                      const providerGroups = [...providerOrder.filter((p) => byProvider[p]?.length), ...Object.keys(byProvider).filter((p) => !providerOrder.includes(p)).sort()];
                      return (
                        <div
                          key={group.branchId}
                          className="rounded-lg border border-border bg-muted/20 overflow-hidden"
                        >
                          <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border">
                            <span className="font-semibold text-sm">{group.branchName}</span>
                            <span className="text-xs text-muted-foreground">
                              {group.sims?.length || 0} SIM(s)
                            </span>
                          </div>
                          {group.sims && group.sims.length > 0 ? (
                            <div className="divide-y divide-border">
                              {providerGroups.map((provider) => (
                                <div key={provider} className="p-3">
                                  <div className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{provider}</div>
                                  <div className="flex flex-wrap gap-2">
                                    {byProvider[provider].map((sim) => (
                                      <div
                                        key={sim.merchantSimId}
                                        className="inline-flex items-center gap-2 rounded-md bg-background px-3 py-2 border border-border text-sm"
                                      >
                                        <span className="font-medium">{sim.simName}</span>
                                        {sim.agentNumber && (
                                          <span className="text-xs text-muted-foreground">
                                            {sim.agentNumber}
                                          </span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground px-3 py-3">
                              No merchant SIMs for this branch yet.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                <div className="flex justify-end pt-2">
                  <Button type="button" variant="outline" onClick={() => setSimModalOpen(false)}>
                    Close
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {logoModalBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-lg">Business logo</CardTitle>
              <Button variant="ghost" size="icon" onClick={() => { setLogoModalBusiness(null); logoFileRef.current = null; }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {logoModalBusiness.logoUrl && (
                <div className="flex justify-center">
                  <img src={logoModalBusiness.logoUrl} alt="" className="h-16 w-auto object-contain border rounded" />
                </div>
              )}
              <div>
                <Label>Upload new logo (image)</Label>
                <input
                  type="file"
                  accept="image/*"
                  ref={logoFileRef}
                  className="mt-1 flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm file:border-0 file:bg-transparent file:text-sm file:font-medium"
                />
              </div>
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={() => { setLogoModalBusiness(null); logoFileRef.current = null; }}>
                  Cancel
                </Button>
                <Button
                  disabled={logoUploading}
                  onClick={async () => {
                    const file = logoFileRef.current?.files?.[0];
                    if (!file) {
                      alert("Select an image file first.");
                      return;
                    }
                    setLogoUploading(true);
                    try {
                      const path = `businesses/${logoModalBusiness.businessId}/logo`;
                      const storageRef = ref(storage, path);
                      const snapshot = await uploadBytes(storageRef, file);
                      const logoUrl = await getDownloadURL(snapshot.ref);
                      await agentBusinessService.update(logoModalBusiness.businessId, { logoUrl });
                      await loadBusinesses();
                      setLogoModalBusiness((b) => b ? { ...b, logoUrl } : null);
                      logoFileRef.current.value = "";
                    } catch (e) {
                      alert("Upload failed: " + (e.message || String(e)));
                    } finally {
                      setLogoUploading(false);
                    }
                  }}
                >
                  {logoUploading ? "Uploading…" : "Upload"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {screenAccessModalBusiness && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  Screen Access — {screenAccessModalBusiness.businessName}
                </CardTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  Tick to grant access, untick to remove. These screens apply to the whole business.
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => { setScreenAccessModalBusiness(null); setEditBusinessScreens([]); }}>
                <X className="h-4 w-4" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-3">
                {SCREEN_OPTIONS.map((opt) => (
                  <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editBusinessScreens.includes(opt.id)}
                      onChange={() =>
                        setEditBusinessScreens((prev) =>
                          prev.includes(opt.id) ? prev.filter((s) => s !== opt.id) : [...prev, opt.id]
                        )
                      }
                    />
                    <span className="text-sm">{opt.label}</span>
                  </label>
                ))}
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button variant="outline" onClick={() => { setScreenAccessModalBusiness(null); setEditBusinessScreens([]); }}>
                  Cancel
                </Button>
                <Button
                  disabled={savingScreens}
                  onClick={async () => {
                    setSavingScreens(true);
                    try {
                      await businessScreenAccessService.set(screenAccessModalBusiness.businessId, editBusinessScreens);
                      setScreenAccessModalBusiness(null);
                      setEditBusinessScreens([]);
                    } catch (e) {
                      alert("Failed to save: " + (e.message || String(e)));
                    } finally {
                      setSavingScreens(false);
                    }
                  }}
                >
                  {savingScreens ? "Saving…" : "Save screen access"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

