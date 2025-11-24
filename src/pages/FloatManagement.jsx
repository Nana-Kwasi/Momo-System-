import React, { useState, useEffect, useRef } from "react";
import { dailyFloatService, transactionService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Timestamp } from "firebase/firestore";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { AlertCircle, CheckCircle, XCircle, Plus } from "lucide-react";

export default function FloatManagement() {
  const { userData, selectedBusinessId, selectedBranchId } = useAuth();
  const [floatHistory, setFloatHistory] = useState([]);
  const [todayFloat, setTodayFloat] = useState(null);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState("opening");
  const isCreatingFloat = useRef(false);
  const hasFloatInState = useRef(false);
  const [expectedBalances, setExpectedBalances] = useState({
    physicalCash: 0,
    mtnEcash: 0,
    vodafoneEcash: 0,
    airtelTigoEcash: 0,
    telecelEcash: 0,
    merchantSimEcash: {}, // Track balances per merchant SIM
  });
  const [merchantSims, setMerchantSims] = useState([]);
  const [showAddMerchantSim, setShowAddMerchantSim] = useState({ provider: "", visible: false });
  const [newMerchantSim, setNewMerchantSim] = useState({ provider: "", simName: "", agentNumber: "" });
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
    openingPhysicalCash: "",
    openingMtnEcash: "",
    openingVodafoneEcash: "",
    openingAirtelTigoEcash: "",
    openingTelecelEcash: "",
    // Store e-cash per merchant SIM as object: { merchantSimId: value }
    openingMerchantSimEcash: {},
    floatReceivedFromHQ: "",
    floatReceivedFromBank: "",
    receivedBy: "",
    receiptNumber: "",
    closingPhysicalCash: "",
    closingMtnEcash: "",
    closingVodafoneEcash: "",
    closingAirtelTigoEcash: "",
    closingTelecelEcash: "",
    closingMerchantSimEcash: {},
    variance: "",
    varianceReason: "",
    cashBanked: "",
    bankName: "",
    tellerName: "",
    depositSlipNumber: "",
    bankingTime: "",
    ecashSentToHQ: "",
    ecashSentToBranch: "",
    ecashRecipient: "",
    ecashReference: "",
    managerComments: "",
    status: "pending",
  });

  const branchId = selectedBranchId || userData?.branchId;
  const businessId = selectedBusinessId || userData?.businessId;

  useEffect(() => {
    if (branchId) {
      loadMerchantSims();
      loadTodayFloat();
      loadFloatHistory();
      calculateExpectedBalances();
    }
  }, [branchId]);

  const loadMerchantSims = async () => {
    try {
      const sims = await merchantSimService.getByBranch(branchId);
      setMerchantSims(sims);
    } catch (error) {
      console.error("Error loading merchant SIMs:", error);
    }
  };

  const handleAddMerchantSim = async () => {
    if (!newMerchantSim.provider || !newMerchantSim.simName) {
      alert("Please provide provider and SIM name");
      return;
    }
    try {
      await merchantSimService.create({
        branchId: branchId,
        provider: newMerchantSim.provider,
        simName: newMerchantSim.simName,
        agentNumber: newMerchantSim.agentNumber,
      });
      await loadMerchantSims();
      setNewMerchantSim({ provider: "", simName: "", agentNumber: "" });
      setShowAddMerchantSim({ provider: "", visible: false });
      alert("Merchant SIM added successfully!");
    } catch (error) {
      alert("Error adding merchant SIM: " + error.message);
    }
  };

  // Update mode when todayFloat changes
  useEffect(() => {
    if (todayFloat) {
      hasFloatInState.current = true;
      // Set mode based on whether float is closed
      const shouldBeClosing = !todayFloat.closingPhysicalCash || todayFloat.closingPhysicalCash === "";
      const targetMode = shouldBeClosing ? "closing" : "view";
      setMode((currentMode) => {
        // Update if mode needs to change (allow changing from "opening" when float is loaded)
        if (currentMode !== targetMode) {
          return targetMode;
        }
        return currentMode;
      });
    }
  }, [todayFloat]);

  const calculateExpectedBalances = async () => {
    try {
      if (!branchId) return;
      const today = new Date();
      const transactions = await transactionService.getTodayTransactions(branchId, userData?.userId, userData?.role);
      
      // Initialize merchant SIM balances from opening float
      const merchantSimBalances = {};
      if (todayFloat?.openingMerchantSimEcash && typeof todayFloat.openingMerchantSimEcash === 'object') {
        Object.keys(todayFloat.openingMerchantSimEcash).forEach(simId => {
          merchantSimBalances[simId] = parseFloat(todayFloat.openingMerchantSimEcash[simId] || 0);
        });
      }
      
      if (!transactions || (!transactions.momo && !transactions.bank)) {
        setExpectedBalances({
          physicalCash: parseFloat(todayFloat?.openingPhysicalCash || 0),
          mtnEcash: parseFloat(todayFloat?.openingMtnEcash || 0),
          vodafoneEcash: parseFloat(todayFloat?.openingVodafoneEcash || 0),
          airtelTigoEcash: parseFloat(todayFloat?.openingAirtelTigoEcash || 0),
          telecelEcash: parseFloat(todayFloat?.openingTelecelEcash || 0),
          merchantSimEcash: merchantSimBalances,
        });
        return;
      }
      
      let physicalCash = parseFloat(todayFloat?.openingPhysicalCash || 0);
      let mtnEcash = parseFloat(todayFloat?.openingMtnEcash || 0);
      let vodafoneEcash = parseFloat(todayFloat?.openingVodafoneEcash || 0);
      let airtelTigoEcash = parseFloat(todayFloat?.openingAirtelTigoEcash || 0);
      let telecelEcash = parseFloat(todayFloat?.openingTelecelEcash || 0);

      if (transactions.momo && Array.isArray(transactions.momo)) {
        transactions.momo.forEach((t) => {
          const amount = parseFloat(t.amount || 0);
          // Cash In: Customer gives physical cash → Agent credits customer E-Cash
          // Physical Cash increases, E-Cash decreases
          if (t.transactionType === "cash_in") {
            physicalCash += amount; // Agent receives physical cash
            // If transaction has merchant SIM, update that specific SIM balance
            if (t.merchantSimId && merchantSimBalances.hasOwnProperty(t.merchantSimId)) {
              merchantSimBalances[t.merchantSimId] -= amount;
            } else {
              // Fallback to provider-level tracking
              if (t.provider === "MTN") mtnEcash -= amount;
              else if (t.provider === "Vodafone") vodafoneEcash -= amount;
              else if (t.provider === "AirtelTigo") airtelTigoEcash -= amount;
              else if (t.provider === "Telecel") telecelEcash -= amount;
            }
          } 
          // Cash Out: Customer receives physical cash → Customer credits agent E-Cash
          // Physical Cash decreases, E-Cash increases
          else if (t.transactionType === "cash_out") {
            physicalCash -= amount; // Agent gives physical cash
            // If transaction has merchant SIM, update that specific SIM balance
            if (t.merchantSimId && merchantSimBalances.hasOwnProperty(t.merchantSimId)) {
              merchantSimBalances[t.merchantSimId] += amount;
            } else {
              // Fallback to provider-level tracking
              if (t.provider === "MTN") mtnEcash += amount;
              else if (t.provider === "Vodafone") vodafoneEcash += amount;
              else if (t.provider === "AirtelTigo") airtelTigoEcash += amount;
              else if (t.provider === "Telecel") telecelEcash += amount;
            }
          }
        });
      }

      setExpectedBalances({
        physicalCash,
        mtnEcash,
        vodafoneEcash,
        airtelTigoEcash,
        telecelEcash,
        merchantSimEcash: merchantSimBalances,
      });
    } catch (error) {
      console.error("Error calculating expected balances:", error);
      setExpectedBalances({
        physicalCash: parseFloat(todayFloat?.openingPhysicalCash || 0),
        mtnEcash: parseFloat(todayFloat?.openingMtnEcash || 0),
        vodafoneEcash: parseFloat(todayFloat?.openingVodafoneEcash || 0),
        airtelTigoEcash: parseFloat(todayFloat?.openingAirtelTigoEcash || 0),
        telecelEcash: parseFloat(todayFloat?.openingTelecelEcash || 0),
      });
    }
  };

  const loadTodayFloat = async (skipModeReset = false) => {
    try {
      if (!branchId) return;
      if (isCreatingFloat.current) return;
      const today = new Date();
      const float = await dailyFloatService.getByBranchAndDate(branchId, today);
      if (float) {
        hasFloatInState.current = true;
        setTodayFloat(float);
        setFormData((prev) => ({
          ...prev,
          ...float,
          date: float.date?.toDate?.()?.toISOString().split("T")[0] || 
                (typeof float.date === 'string' ? float.date : prev.date),
        }));
        // Set mode based on whether float is closed
        if (!float.closingPhysicalCash || float.closingPhysicalCash === "") {
          setMode("closing");
        } else {
          setMode("view");
        }
      } else {
        // Query succeeded but no float found - reset the flag
        hasFloatInState.current = false;
        // Don't reset mode if we're skipping reset OR if we already have a float in state
        // Check both the ref and the state to handle remounts
        if (!skipModeReset && !isCreatingFloat.current) {
          setTodayFloat((currentFloat) => {
            // Only reset to opening if there's no float in state
            if (!currentFloat) {
              setMode("opening");
            }
            return currentFloat;
          });
        }
      }
    } catch (error) {
      console.error("Error loading today's float:", error);
      // Don't reset mode on error if we have a float set or are skipping reset
      if (!skipModeReset && !isCreatingFloat.current) {
        setTodayFloat((currentFloat) => {
          // Only reset to opening if there's no float in state
          if (!currentFloat) {
            setMode("opening");
          }
          return currentFloat;
        });
      }
    }
  };

  const loadFloatHistory = async () => {
    try {
      if (!branchId) return;
      const history = await dailyFloatService.getByBranch(branchId, 30);
      setFloatHistory(history);
    } catch (error) {
      console.error("Error loading float history:", error);
    }
  };

  const calculateVariance = () => {
    if (!todayFloat) return { physicalCash: 0, mtn: 0, vodafone: 0, airtelTigo: 0, telecel: 0 };
    
    const closingPhysical = parseFloat(formData.closingPhysicalCash || 0);
    const expectedPhysical = expectedBalances.physicalCash;
    const physicalVariance = closingPhysical - expectedPhysical;

    const mtnVariance = parseFloat(formData.closingMtnEcash || 0) - expectedBalances.mtnEcash;
    const vodafoneVariance = parseFloat(formData.closingVodafoneEcash || 0) - expectedBalances.vodafoneEcash;
    const airtelTigoVariance = parseFloat(formData.closingAirtelTigoEcash || 0) - expectedBalances.airtelTigoEcash;
    const telecelVariance = parseFloat(formData.closingTelecelEcash || 0) - expectedBalances.telecelEcash;

    return {
      physicalCash: physicalVariance,
      mtn: mtnVariance,
      vodafone: vodafoneVariance,
      airtelTigo: airtelTigoVariance,
      telecel: telecelVariance,
    };
  };

  const handleOpeningSubmit = async (e) => {
    e.preventDefault();
    if (!businessId || !branchId) {
      alert("Please select a business and branch first!");
      return;
    }
    setLoading(true);
    isCreatingFloat.current = true;
    try {
      const floatId = await dailyFloatService.create({
        businessId: businessId,
        branchId: branchId,
        ...formData,
        recordedBy: userData.userId,
        recordedByName: userData.name || userData.email,
      });
      
      setMode("closing");
      
      const newFloat = {
        floatId,
        businessId,
        branchId,
        ...formData,
        date: Timestamp.fromDate(new Date(formData.date)),
        recordedBy: userData.userId,
        status: "pending",
      };
      
      hasFloatInState.current = true;
      setTodayFloat(newFloat);
      setFormData((prev) => ({
        ...prev,
        ...newFloat,
        date: formData.date,
      }));
      
      alert("Opening float recorded successfully! You can now start day operations.");
      
      // Keep isCreatingFloat true until load completes
      setTimeout(async () => {
        await loadTodayFloat(true); // Skip mode reset
        isCreatingFloat.current = false;
        await loadFloatHistory();
        // Try loading again after a bit more time for index to be ready
        setTimeout(async () => {
          await loadTodayFloat(true);
        }, 2000);
      }, 1500);
    } catch (error) {
      isCreatingFloat.current = false;
      alert("Error recording float: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveVariance = async () => {
    if (!todayFloat) return;
    
    // Check if user has permission to approve (IT Admin cannot approve)
    const canApprove = (userData?.role === "branch_manager" || userData?.role === "admin") &&
                       userData?.branchId === branchId; // Only branch admin/manager for this branch
    
    if (!canApprove) {
      alert("You don't have permission to approve variances. Only branch admin or manager can approve.");
      return;
    }

    if (!window.confirm("Are you sure you want to approve this variance?")) {
      return;
    }

    setLoading(true);
    try {
      await dailyFloatService.update(todayFloat.floatId, {
        status: "approved",
        managerComments: formData.managerComments || todayFloat.managerComments || "",
        approvedBy: userData.name || userData.email,
        approvedAt: Timestamp.now(),
      });

      alert("Variance approved successfully!");
      
      // Reload the float to show updated status
      await loadTodayFloat();
      await loadFloatHistory();
    } catch (error) {
      alert("Error approving variance: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveVarianceFromHistory = async (float) => {
    // Check if user has permission to approve (IT Admin cannot approve)
    const canApprove = (userData?.role === "branch_manager" || userData?.role === "admin") &&
                       userData?.branchId === float.branchId; // Only branch admin/manager for this branch
    
    if (!canApprove) {
      alert("You don't have permission to approve variances. Only branch admin or manager can approve.");
      return;
    }

    if (!window.confirm(`Are you sure you want to approve the variance for ${float.date?.toDate?.()?.toLocaleDateString() || (typeof float.date === 'string' ? new Date(float.date).toLocaleDateString() : 'this float')}?`)) {
      return;
    }

    setLoading(true);
    try {
      await dailyFloatService.update(float.floatId, {
        status: "approved",
        approvedBy: userData.name || userData.email,
        approvedAt: Timestamp.now(),
      });

      alert("Variance approved successfully!");
      
      // Reload float history to show updated status
      await loadFloatHistory();
      
      // If this is today's float, reload it too
      if (todayFloat && todayFloat.floatId === float.floatId) {
        await loadTodayFloat();
      }
    } catch (error) {
      alert("Error approving variance: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleClosingSubmit = async (e) => {
    e.preventDefault();
    if (!todayFloat) {
      alert("Please record opening float first!");
      return;
    }
    setLoading(true);
    try {
      const variances = calculateVariance();
      const totalVariance = Math.abs(variances.physicalCash);
      const variancePercentage = todayFloat.openingPhysicalCash 
        ? (totalVariance / parseFloat(todayFloat.openingPhysicalCash)) * 100 
        : 0;

      // Allow approval of any variance amount - all variances can be flagged for review
      const status = Math.abs(variancePercentage) > 0 ? "flagged" : "pending";

      await dailyFloatService.update(todayFloat.floatId, {
        ...formData,
        variance: variances.physicalCash,
        variancePercentage,
        variances,
        businessId: businessId,
        branchId: branchId,
        recordedBy: userData.userId,
        recordedByName: userData.name || userData.email,
        status,
      });
      
      alert("Closing float recorded successfully! You can now start a new day.");
      
      // Clear today's float and reset to opening mode for new day
      hasFloatInState.current = false;
      setTodayFloat(null);
      setMode("opening");
      
      // Reset form data for new day
      setFormData({
        date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString(),
        openingPhysicalCash: "",
        openingMtnEcash: "",
        openingVodafoneEcash: "",
        openingAirtelTigoEcash: "",
        openingTelecelEcash: "",
        floatReceivedFromHQ: "",
        floatReceivedFromBank: "",
        receivedBy: "",
        receiptNumber: "",
        closingPhysicalCash: "",
        closingMtnEcash: "",
        closingVodafoneEcash: "",
        closingAirtelTigoEcash: "",
        closingTelecelEcash: "",
        variance: "",
        varianceReason: "",
        cashBanked: "",
        bankName: "",
        tellerName: "",
        depositSlipNumber: "",
        bankingTime: "",
        ecashSentToHQ: "",
        ecashSentToBranch: "",
        ecashRecipient: "",
        ecashReference: "",
        managerComments: "",
        status: "pending",
      });
      
      // Reload float history to show the closed float
      await loadFloatHistory();
      setExpectedBalances({
        physicalCash: 0,
        mtnEcash: 0,
        vodafoneEcash: 0,
        airtelTigoEcash: 0,
        telecelEcash: 0,
      });
    } catch (error) {
      alert("Error recording closing float: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const variances = calculateVariance();
  const totalVariance = Math.abs(variances.physicalCash);
  const variancePercentage = todayFloat?.openingPhysicalCash 
    ? (totalVariance / parseFloat(todayFloat.openingPhysicalCash)) * 100 
    : 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Daily Float Management</h1>
        <p className="text-muted-foreground">Record opening and closing float balances</p>
      </div>

      <div className="flex gap-4">
        <Button
          variant={mode === "opening" ? "default" : "outline"}
          onClick={() => setMode("opening")}
          disabled={!!todayFloat}
        >
          Opening Float
        </Button>
        <Button
          variant={mode === "closing" ? "default" : "outline"}
          onClick={() => setMode("closing")}
          disabled={!todayFloat}
        >
          Closing Float
        </Button>
      </div>

      {mode === "opening" && (
        <Card>
          <CardHeader>
            <CardTitle>Morning Float Opening</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleOpeningSubmit} className="space-y-6">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={formData.date}
                    onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={formData.time}
                    onChange={(e) => setFormData({ ...formData, time: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Opening Balances</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="openingPhysicalCash">Opening Physical Cash (GHS) *</Label>
                    <Input
                      id="openingPhysicalCash"
                      type="number"
                      step="0.01"
                      value={formData.openingPhysicalCash}
                      onChange={(e) =>
                        setFormData({ ...formData, openingPhysicalCash: e.target.value })
                      }
                      required
                    />
                  </div>
                  {/* Merchant SIM E-Cash sections per provider */}
                  {["MTN", "Vodafone", "AirtelTigo", "Telecel"].map((provider) => {
                    const providerSims = merchantSims.filter(sim => sim.provider === provider);
                    return (
                      <div key={provider} className="col-span-2 border rounded-md p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{provider} E-Cash</h4>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNewMerchantSim({ provider, simName: "", agentNumber: "" });
                              setShowAddMerchantSim({ provider, visible: true });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Add {provider} SIM
                          </Button>
                        </div>
                        {providerSims.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No {provider} merchant SIMs added yet. Click "+" to add.</p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {providerSims.map((sim) => {
                              const fieldKey = `opening_${sim.merchantSimId}`;
                              const value = formData.openingMerchantSimEcash?.[sim.merchantSimId] || "";
                              return (
                                <div key={sim.merchantSimId} className="space-y-2">
                                  <Label htmlFor={fieldKey}>{sim.simName} E-Cash (GHS) *</Label>
                                  <Input
                                    id={fieldKey}
                                    type="text"
                                    inputMode="decimal"
                                    value={value}
                                    onChange={(e) => {
                                      const updated = {
                                        ...formData.openingMerchantSimEcash,
                                        [sim.merchantSimId]: e.target.value,
                                      };
                                      setFormData({ ...formData, openingMerchantSimEcash: updated });
                                    }}
                                    onBlur={(e) => {
                                      const num = parseFloat(e.target.value);
                                      if (!isNaN(num)) {
                                        const updated = {
                                          ...formData.openingMerchantSimEcash,
                                          [sim.merchantSimId]: num.toFixed(2),
                                        };
                                        setFormData({ ...formData, openingMerchantSimEcash: updated });
                                      }
                                    }}
                                    required
                                  />
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {showAddMerchantSim.visible && showAddMerchantSim.provider === provider && (
                          <div className="p-3 border rounded-md bg-muted space-y-2">
                            <Input
                              placeholder={`${provider} SIM Name (e.g., ${provider}33)`}
                              value={newMerchantSim.simName}
                              onChange={(e) => setNewMerchantSim({ ...newMerchantSim, simName: e.target.value })}
                            />
                            <Input
                              placeholder="Agent Number (optional)"
                              value={newMerchantSim.agentNumber}
                              onChange={(e) => setNewMerchantSim({ ...newMerchantSim, agentNumber: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={handleAddMerchantSim}>
                                Add
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowAddMerchantSim({ provider: "", visible: false });
                                  setNewMerchantSim({ provider: "", simName: "", agentNumber: "" });
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Float Received (if any)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="floatReceivedFromHQ">Cash from HQ (GHS)</Label>
                    <Input
                      id="floatReceivedFromHQ"
                      type="number"
                      step="0.01"
                      value={formData.floatReceivedFromHQ}
                      onChange={(e) =>
                        setFormData({ ...formData, floatReceivedFromHQ: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="floatReceivedFromBank">Cash from Bank (GHS)</Label>
                    <Input
                      id="floatReceivedFromBank"
                      type="number"
                      step="0.01"
                      value={formData.floatReceivedFromBank}
                      onChange={(e) =>
                        setFormData({ ...formData, floatReceivedFromBank: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receivedBy">Received By</Label>
                    <Input
                      id="receivedBy"
                      value={formData.receivedBy}
                      onChange={(e) =>
                        setFormData({ ...formData, receivedBy: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="receiptNumber">Receipt/Reference Number</Label>
                    <Input
                      id="receiptNumber"
                      value={formData.receiptNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, receiptNumber: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setMode("closing")}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Start Day Operations"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {mode === "closing" && todayFloat && (
        <Card>
          <CardHeader>
            <CardTitle>Evening Float Closing</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleClosingSubmit} className="space-y-6">
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Closing Balances</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="closingPhysicalCash">Physical Cash in Hand (GHS) *</Label>
                    <Input
                      id="closingPhysicalCash"
                      type="number"
                      step="0.01"
                      value={formData.closingPhysicalCash}
                      onChange={(e) =>
                        setFormData({ ...formData, closingPhysicalCash: e.target.value })
                      }
                      required
                    />
                    {expectedBalances.physicalCash > 0 && (
                      <p className="text-sm text-muted-foreground">
                        Expected: GHS {expectedBalances.physicalCash.toFixed(2)}
                      </p>
                    )}
                  </div>
                  {/* Merchant SIM E-Cash sections per provider for closing */}
                  {["MTN", "Vodafone", "AirtelTigo", "Telecel"].map((provider) => {
                    const providerSims = merchantSims.filter(sim => sim.provider === provider);
                    return (
                      <div key={provider} className="col-span-2 border rounded-md p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{provider} E-Cash</h4>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setNewMerchantSim({ provider, simName: "", agentNumber: "" });
                              setShowAddMerchantSim({ provider, visible: true });
                            }}
                          >
                            <Plus className="h-4 w-4 mr-1" /> Add {provider} SIM
                          </Button>
                        </div>
                        {providerSims.length === 0 ? (
                          <p className="text-sm text-muted-foreground">No {provider} merchant SIMs added yet. Click "+" to add.</p>
                        ) : (
                          <div className="grid gap-3 md:grid-cols-2">
                            {providerSims.map((sim) => {
                              const fieldKey = `closing_${sim.merchantSimId}`;
                              const value = formData.closingMerchantSimEcash?.[sim.merchantSimId] || "";
                              const expectedKey = `expected_${sim.merchantSimId}`;
                              const expectedValue = expectedBalances.merchantSimEcash?.[sim.merchantSimId] || 0;
                              return (
                                <div key={sim.merchantSimId} className="space-y-2">
                                  <Label htmlFor={fieldKey}>{sim.simName} E-Cash Balance (GHS) *</Label>
                                  <Input
                                    id={fieldKey}
                                    type="text"
                                    inputMode="decimal"
                                    value={value}
                                    onChange={(e) => {
                                      const updated = {
                                        ...formData.closingMerchantSimEcash,
                                        [sim.merchantSimId]: e.target.value,
                                      };
                                      setFormData({ ...formData, closingMerchantSimEcash: updated });
                                    }}
                                    onBlur={(e) => {
                                      const num = parseFloat(e.target.value);
                                      if (!isNaN(num)) {
                                        const updated = {
                                          ...formData.closingMerchantSimEcash,
                                          [sim.merchantSimId]: num.toFixed(2),
                                        };
                                        setFormData({ ...formData, closingMerchantSimEcash: updated });
                                      }
                                    }}
                                    required
                                  />
                                  {expectedValue > 0 && (
                                    <p className="text-sm text-muted-foreground">
                                      Expected: GHS {expectedValue.toFixed(2)}
                                    </p>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {showAddMerchantSim.visible && showAddMerchantSim.provider === provider && (
                          <div className="p-3 border rounded-md bg-muted space-y-2">
                            <Input
                              placeholder={`${provider} SIM Name (e.g., ${provider}33)`}
                              value={newMerchantSim.simName}
                              onChange={(e) => setNewMerchantSim({ ...newMerchantSim, simName: e.target.value })}
                            />
                            <Input
                              placeholder="Agent Number (optional)"
                              value={newMerchantSim.agentNumber}
                              onChange={(e) => setNewMerchantSim({ ...newMerchantSim, agentNumber: e.target.value })}
                            />
                            <div className="flex gap-2">
                              <Button type="button" size="sm" onClick={handleAddMerchantSim}>
                                Add
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  setShowAddMerchantSim({ provider: "", visible: false });
                                  setNewMerchantSim({ provider: "", simName: "", agentNumber: "" });
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {totalVariance > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Variance Analysis</h3>
                  <div className="space-y-2 p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <div className="flex items-center gap-2">
                      {variancePercentage > 2 ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : variancePercentage > 0 ? (
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      ) : (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      )}
                      <span className="font-semibold">
                        Physical Cash Variance: GHS {variances.physicalCash.toFixed(2)} (
                        {variancePercentage.toFixed(2)}%)
                      </span>
                    </div>
                    {variancePercentage > 2 && (
                      <p className="text-sm text-red-600 font-semibold">
                        ⚠️ Major variance detected! Manager approval required.
                      </p>
                    )}
                    <div className="space-y-1 text-sm">
                      <p>MTN Variance: GHS {variances.mtn.toFixed(2)}</p>
                      <p>Vodafone Variance: GHS {variances.vodafone.toFixed(2)}</p>
                      <p>AirtelTigo Variance: GHS {variances.airtelTigo.toFixed(2)}</p>
                      <p>Telecel Variance: GHS {variances.telecel.toFixed(2)}</p>
                    </div>
                  </div>
                  <div className="mt-4 space-y-2">
                    <Label htmlFor="varianceReason">Variance Reason *</Label>
                    <Input
                      id="varianceReason"
                      value={formData.varianceReason}
                      onChange={(e) =>
                        setFormData({ ...formData, varianceReason: e.target.value })
                      }
                      required={totalVariance > 0}
                      placeholder="Explain the reason for variance"
                    />
                  </div>
                </div>
              )}

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Cash Banking</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="cashBanked">Amount Banked (GHS)</Label>
                    <Input
                      id="cashBanked"
                      type="number"
                      step="0.01"
                      value={formData.cashBanked}
                      onChange={(e) => setFormData({ ...formData, cashBanked: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankName">Bank Name</Label>
                    <Input
                      id="bankName"
                      value={formData.bankName}
                      onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="tellerName">Teller Name</Label>
                    <Input
                      id="tellerName"
                      value={formData.tellerName}
                      onChange={(e) => setFormData({ ...formData, tellerName: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="depositSlipNumber">Deposit Slip Number</Label>
                    <Input
                      id="depositSlipNumber"
                      value={formData.depositSlipNumber}
                      onChange={(e) =>
                        setFormData({ ...formData, depositSlipNumber: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="bankingTime">Time of Banking</Label>
                    <Input
                      id="bankingTime"
                      type="time"
                      value={formData.bankingTime}
                      onChange={(e) => setFormData({ ...formData, bankingTime: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">E-Cash Transfers (if any)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ecashSentToHQ">Amount Sent to HQ (GHS)</Label>
                    <Input
                      id="ecashSentToHQ"
                      type="number"
                      step="0.01"
                      value={formData.ecashSentToHQ}
                      onChange={(e) =>
                        setFormData({ ...formData, ecashSentToHQ: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ecashSentToBranch">Amount Sent to Other Branch (GHS)</Label>
                    <Input
                      id="ecashSentToBranch"
                      type="number"
                      step="0.01"
                      value={formData.ecashSentToBranch}
                      onChange={(e) =>
                        setFormData({ ...formData, ecashSentToBranch: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ecashRecipient">Recipient</Label>
                    <Input
                      id="ecashRecipient"
                      value={formData.ecashRecipient}
                      onChange={(e) =>
                        setFormData({ ...formData, ecashRecipient: e.target.value })
                      }
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ecashReference">Reference Number</Label>
                    <Input
                      id="ecashReference"
                      value={formData.ecashReference}
                      onChange={(e) =>
                        setFormData({ ...formData, ecashReference: e.target.value })
                      }
                    />
                  </div>
                </div>
              </div>

              {variancePercentage > 2 && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Manager Approval</h3>
                  <div className="space-y-2">
                    <Label htmlFor="managerComments">Manager's Comments *</Label>
                    <Input
                      id="managerComments"
                      value={formData.managerComments}
                      onChange={(e) =>
                        setFormData({ ...formData, managerComments: e.target.value })
                      }
                      required
                      placeholder="Manager must provide comments for major variances"
                    />
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline">
                  Save Draft
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Close Day"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {mode === "view" && todayFloat && (
        <Card>
          <CardHeader>
            <CardTitle>Float Details - {todayFloat.date?.toDate?.()?.toLocaleDateString() || (typeof todayFloat.date === 'string' ? new Date(todayFloat.date).toLocaleDateString() : 'N/A')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <Label className="text-sm font-semibold">Opening Physical Cash</Label>
                <p className="text-lg">GHS {parseFloat(todayFloat.openingPhysicalCash || 0).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Closing Physical Cash</Label>
                <p className="text-lg">GHS {parseFloat(todayFloat.closingPhysicalCash || 0).toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Variance</Label>
                <p className={`text-lg ${parseFloat(todayFloat.variance || 0) > 0 ? 'text-green-600' : parseFloat(todayFloat.variance || 0) < 0 ? 'text-red-600' : ''}`}>
                  GHS {parseFloat(todayFloat.variance || 0).toLocaleString()}
                </p>
              </div>
              <div>
                <Label className="text-sm font-semibold">Status</Label>
                <Badge
                  variant={
                    todayFloat.status === "approved"
                      ? "default"
                      : todayFloat.status === "flagged"
                      ? "destructive"
                      : "secondary"
                  }
                >
                  {todayFloat.status}
                </Badge>
              </div>
            </div>

            {todayFloat.varianceReason && (
              <div>
                <Label className="text-sm font-semibold">Variance Reason</Label>
                <p className="text-sm text-muted-foreground">{todayFloat.varianceReason}</p>
              </div>
            )}

            {todayFloat.managerComments && (
              <div>
                <Label className="text-sm font-semibold">Manager Comments</Label>
                <p className="text-sm text-muted-foreground">{todayFloat.managerComments}</p>
              </div>
            )}

            {/* Approval Section - Only show for branch admin/manager and flagged floats */}
            {todayFloat.status === "flagged" && 
             (userData?.role === "branch_manager" || userData?.role === "admin") &&
             userData?.branchId === branchId && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Variance Approval</h3>
                <div className="space-y-4">
                  <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                    <p className="text-sm font-semibold text-yellow-800 mb-2">
                      ⚠️ This float has been flagged due to major variance ({parseFloat(todayFloat.variancePercentage || 0).toFixed(2)}%)
                    </p>
                    <p className="text-sm text-yellow-700">
                      Variance: GHS {parseFloat(todayFloat.variance || 0).toLocaleString()}
                    </p>
                  </div>
                  
                  <div className="space-y-2">
                    <Label htmlFor="approvalComments">Approval Comments (Optional)</Label>
                    <Input
                      id="approvalComments"
                      value={formData.managerComments || ""}
                      onChange={(e) =>
                        setFormData({ ...formData, managerComments: e.target.value })
                      }
                      placeholder="Add any additional comments about this variance"
                    />
                  </div>

                  <div className="flex gap-4">
                    <Button
                      type="button"
                      onClick={handleApproveVariance}
                      disabled={loading}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {loading ? "Approving..." : "Approve Variance"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMode("opening")}
                    >
                      Back
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {todayFloat.status === "approved" && (
              <div className="border-t pt-4">
                <div className="p-4 bg-green-50 border border-green-200 rounded-md">
                  <p className="text-sm font-semibold text-green-800 flex items-center gap-2">
                    <CheckCircle className="h-5 w-5" />
                    This variance has been approved
                  </p>
                  {todayFloat.approvedBy && (
                    <p className="text-xs text-green-700 mt-1">
                      Approved by: {todayFloat.approvedBy}
                    </p>
                  )}
                  {todayFloat.approvedAt && (
                    <p className="text-xs text-green-700">
                      Approved on: {todayFloat.approvedAt?.toDate?.()?.toLocaleString() || 'N/A'}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Float History</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Opening Cash</TableHead>
                <TableHead>Closing Cash</TableHead>
                <TableHead>Variance</TableHead>
                <TableHead>Status</TableHead>
                {(userData?.role === "branch_manager" || userData?.role === "admin") &&
                 userData?.branchId === branchId && (
                  <TableHead>Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {floatHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={((userData?.role === "branch_manager" || userData?.role === "admin") && userData?.branchId === branchId) ? 6 : 5} className="text-center">
                    No float records found
                  </TableCell>
                </TableRow>
              ) : (
                floatHistory.map((float) => {
                  // Format date - handle both Timestamp and string formats
                  let formattedDate = "N/A";
                  if (float.date) {
                    if (float.date.toDate) {
                      // Timestamp format
                      formattedDate = float.date.toDate().toLocaleDateString();
                    } else if (typeof float.date === 'string') {
                      // String format (e.g., '2025-11-19')
                      try {
                        formattedDate = new Date(float.date).toLocaleDateString();
                      } catch (e) {
                        formattedDate = float.date; // Use string as-is if parsing fails
                      }
                    }
                  }
                  
                  return (
                  <TableRow key={float.id}>
                    <TableCell>
                      {formattedDate}
                    </TableCell>
                    <TableCell>
                      GHS {parseFloat(float.openingPhysicalCash || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      GHS {parseFloat(float.closingPhysicalCash || 0).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <span
                        className={
                          parseFloat(float.variance || 0) > 0
                            ? "text-green-600"
                            : parseFloat(float.variance || 0) < 0
                            ? "text-red-600"
                            : ""
                        }
                      >
                        GHS {parseFloat(float.variance || 0).toLocaleString()}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          float.status === "approved"
                            ? "default"
                            : float.status === "flagged"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {float.status}
                      </Badge>
                    </TableCell>
                    {(userData?.role === "branch_manager" || userData?.role === "admin") &&
                     userData?.branchId === branchId && (
                      <TableCell>
                        {float.status === "flagged" ? (
                          <Button
                            size="sm"
                            onClick={() => handleApproveVarianceFromHistory(float)}
                            disabled={loading}
                            className="bg-green-600 hover:bg-green-700"
                          >
                            Approve
                          </Button>
                        ) : float.status === "approved" ? (
                          <span className="text-sm text-green-600">✓ Approved</span>
                        ) : (
                          <span className="text-sm text-muted-foreground">-</span>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
