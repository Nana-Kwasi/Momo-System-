import React, { useState, useEffect, useRef } from "react";
import { reconciliationService, transactionService, dailyFloatService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { AlertCircle, CheckCircle, XCircle, Plus } from "lucide-react";

export default function Reconciliation() {
  const { userData } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingBalances, setLoadingBalances] = useState(true);
  const loadTimestampRef = useRef(0); // Track when load was initiated to prevent stale updates
  const [merchantSims, setMerchantSims] = useState([]);
  const [showAddMerchantSim, setShowAddMerchantSim] = useState({ provider: "", visible: false });
  const [newMerchantSim, setNewMerchantSim] = useState({ provider: "", simName: "", agentNumber: "" });
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0], // Always current date, cannot be changed
    systemPhysicalCash: "",
    actualPhysicalCash: "",
    systemMtnEcash: "",
    actualMtnEcash: "",
    systemVodafoneEcash: "",
    actualVodafoneEcash: "",
    systemAirtelTigoEcash: "",
    actualAirtelTigoEcash: "",
    systemTelecelEcash: "",
    actualTelecelEcash: "",
    // Store merchant SIM balances
    systemMerchantSimEcash: {},
    actualMerchantSimEcash: {},
    varianceExplanation: "",
    physicalCashVarianceReason: "",
    mtnVarianceReason: "",
    vodafoneVarianceReason: "",
    airtelTigoVarianceReason: "",
    telecelVarianceReason: "",
    merchantSimVarianceReason: {},
    actionTaken: "",
    resolutionNotes: "",
    managerComments: "",
    status: "pending",
  });

  useEffect(() => {
    if (userData?.branchId) {
      loadMerchantSims();
      setLoadingBalances(true);
      loadSystemBalances();
      // Auto-refresh every 1 minute to get latest transactions
      const interval = setInterval(() => {
        loadSystemBalances();
      }, 60000); // 60 seconds (1 minute)
      return () => clearInterval(interval);
    }
  }, [userData?.branchId]);

  const loadMerchantSims = async () => {
    try {
      const sims = await merchantSimService.getByBranch(userData.branchId);
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
        branchId: userData.branchId,
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
  
  // Prevent date changes - always use current date
  useEffect(() => {
    const today = new Date().toISOString().split("T")[0];
    if (formData.date !== today) {
      setFormData(prev => ({ ...prev, date: today }));
    }
  }, []);

  const loadSystemBalances = async () => {
    const loadTimestamp = Date.now();
    loadTimestampRef.current = loadTimestamp;
    
    try {
      setLoadingBalances(true);
      const today = new Date().toISOString().split("T")[0]; // Always use today's date
      const todayDate = new Date(today);
      
      // Add timeout to prevent hanging
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Request timeout")), 15000)
      );
      
      const floatPromise = dailyFloatService.getByBranchAndDate(userData.branchId, todayDate);
      const float = await Promise.race([floatPromise, timeoutPromise]);
      
      if (!float) {
        // No float for today, clear system balances
        setFormData((prev) => ({
          ...prev,
          date: today,
          systemPhysicalCash: "",
          systemMtnEcash: "",
          systemVodafoneEcash: "",
          systemAirtelTigoEcash: "",
          systemTelecelEcash: "",
        }));
        setLoadingBalances(false);
        return;
      }

      // For reconciliation, admins need to see ALL branch transactions for today
      // Normal users should only see their own transactions for reconciliation
      const isAdmin = userData?.role === "admin" || userData?.role === "branch_manager" || userData?.role === "it_admin";
      
      // Get all transactions for today using getTodayTransactions
      // For admins, pass null userId to get all transactions
      // For normal users, pass their userId to get only their transactions
      const transactionsPromise = transactionService.getTodayTransactions(
        userData.branchId,
        isAdmin ? null : userData.userId,
        isAdmin ? "admin" : userData.role
      );
      
      // Separate timeout for transactions (10 seconds)
      const transactionsTimeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("Transaction query timeout")), 10000)
      );
      
      let transactions;
      try {
        transactions = await Promise.race([transactionsPromise, transactionsTimeout]);
        console.log("Reconciliation: Loaded transactions successfully:", transactions?.momo?.length || 0, "MoMo,", transactions?.bank?.length || 0, "Bank");
      } catch (transError) {
        console.warn("Transaction query failed or timed out:", transError);
        // If transaction query fails, use empty array and show opening balances only
        transactions = { momo: [], bank: [] };
        console.warn("Reconciliation: Using empty transactions array due to error");
      }
      
      // Validate we got transaction data
      if (!transactions || (!transactions.momo && !transactions.bank)) {
        console.warn("Reconciliation: No transaction data received, using empty arrays");
        transactions = { momo: [], bank: [] };
      }
      
      // Start with opening float balances
      let physicalCash = parseFloat(float.openingPhysicalCash || 0);
      
      // Initialize merchant SIM balances from opening float
      const merchantSimBalances = {};
      if (float.openingMerchantSimEcash && typeof float.openingMerchantSimEcash === 'object') {
        Object.keys(float.openingMerchantSimEcash).forEach(simId => {
          merchantSimBalances[simId] = parseFloat(float.openingMerchantSimEcash[simId] || 0);
        });
      }
      
      // Fallback to provider-level balances if merchant SIM data not available
      let mtnEcash = parseFloat(float.openingMtnEcash || 0);
      let vodafoneEcash = parseFloat(float.openingVodafoneEcash || 0);
      let airtelTigoEcash = parseFloat(float.openingAirtelTigoEcash || 0);
      let telecelEcash = parseFloat(float.openingTelecelEcash || 0);

      // Apply all transactions to calculate current balances
      console.log("Reconciliation: Found transactions:", transactions?.momo?.length || 0, "MoMo transactions");
      console.log("Reconciliation: Opening balances - Physical:", physicalCash);
      
      if (transactions?.momo && Array.isArray(transactions.momo)) {
        transactions.momo.forEach((t) => {
          const amount = parseFloat(t.amount || 0);
          if (isNaN(amount) || amount <= 0) {
            console.warn("Skipping invalid transaction:", t);
            return;
          }
          
          console.log(`Processing transaction: ${t.transactionType} ${t.provider} ${t.merchantSimName || ''} GHS ${amount} | Date: ${t.date}`);
          
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
      
      console.log("Reconciliation: Final calculated balances - Physical:", physicalCash, "Merchant SIMs:", merchantSimBalances);

      // Round to 2 decimal places to avoid floating point issues
      const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

      // Format merchant SIM balances
      const formattedMerchantSimBalances = {};
      Object.keys(merchantSimBalances).forEach(simId => {
        formattedMerchantSimBalances[simId] = roundTo2(merchantSimBalances[simId]).toFixed(2);
      });

      // Use functional update to ensure we're updating with latest calculated values
      // Don't preserve old values - completely replace system balances
      const newSystemBalances = {
        systemPhysicalCash: roundTo2(physicalCash).toFixed(2),
        systemMtnEcash: roundTo2(mtnEcash).toFixed(2),
        systemVodafoneEcash: roundTo2(vodafoneEcash).toFixed(2),
        systemAirtelTigoEcash: roundTo2(airtelTigoEcash).toFixed(2),
        systemTelecelEcash: roundTo2(telecelEcash).toFixed(2),
        systemMerchantSimEcash: formattedMerchantSimBalances,
      };
      
      console.log("Reconciliation: Setting new balances:", newSystemBalances);
      
      // Only update if this is still the latest load (prevent stale updates)
      if (loadTimestampRef.current === loadTimestamp) {
        setFormData((prev) => ({
          ...prev,
          date: today, // Ensure date is always today
          ...newSystemBalances, // Completely replace system balances
        }));
      } else {
        console.warn("Reconciliation: Skipping stale update, newer load in progress");
      }
    } catch (error) {
      console.error("Error loading system balances:", error);
      
      // If transaction query fails, at least show opening float balances
      try {
        const today = new Date().toISOString().split("T")[0];
        const todayDate = new Date(today);
        const float = await dailyFloatService.getByBranchAndDate(userData.branchId, todayDate);
        if (float) {
          const merchantSimBalances = {};
          if (float.openingMerchantSimEcash && typeof float.openingMerchantSimEcash === 'object') {
            Object.keys(float.openingMerchantSimEcash).forEach(simId => {
              merchantSimBalances[simId] = parseFloat(float.openingMerchantSimEcash[simId] || 0).toFixed(2);
            });
          }
          setFormData((prev) => ({
            ...prev,
            date: today,
            systemPhysicalCash: parseFloat(float.openingPhysicalCash || 0).toFixed(2),
            systemMtnEcash: parseFloat(float.openingMtnEcash || 0).toFixed(2),
            systemVodafoneEcash: parseFloat(float.openingVodafoneEcash || 0).toFixed(2),
            systemAirtelTigoEcash: parseFloat(float.openingAirtelTigoEcash || 0).toFixed(2),
            systemTelecelEcash: parseFloat(float.openingTelecelEcash || 0).toFixed(2),
            systemMerchantSimEcash: merchantSimBalances,
          }));
          console.warn("Showing opening balances only. Transaction query failed - check Firestore indexes.");
        }
      } catch (fallbackError) {
        console.error("Fallback error:", fallbackError);
      }
    } finally {
      setLoadingBalances(false);
    }
  };

  const calculateVariance = (system, actual) => {
    return parseFloat(system || 0) - parseFloat(actual || 0);
  };

  // Check if all actual values are entered (including merchant SIMs)
  const allMerchantSimsEntered = merchantSims.every(sim => {
    const actualValue = formData.actualMerchantSimEcash?.[sim.merchantSimId];
    return actualValue && actualValue !== "";
  });
  
  const allActualValuesEntered = 
    formData.actualPhysicalCash && 
    allMerchantSimsEntered;

  // Calculate total variance including merchant SIMs
  const calculateTotalVariance = () => {
    if (!allActualValuesEntered) return 0;
    
    let total = calculateVariance(formData.systemPhysicalCash, formData.actualPhysicalCash);
    
    // Add merchant SIM variances
    if (formData.systemMerchantSimEcash && formData.actualMerchantSimEcash) {
      Object.keys(formData.systemMerchantSimEcash).forEach(simId => {
        const systemValue = formData.systemMerchantSimEcash[simId] || 0;
        const actualValue = formData.actualMerchantSimEcash[simId] || 0;
        total += calculateVariance(systemValue, actualValue);
      });
    }
    
    // Fallback to provider-level if merchant SIM data not available
    if (!formData.systemMerchantSimEcash || Object.keys(formData.systemMerchantSimEcash).length === 0) {
      total += calculateVariance(formData.systemMtnEcash, formData.actualMtnEcash);
      total += calculateVariance(formData.systemVodafoneEcash, formData.actualVodafoneEcash);
      total += calculateVariance(formData.systemAirtelTigoEcash, formData.actualAirtelTigoEcash);
      total += calculateVariance(formData.systemTelecelEcash, formData.actualTelecelEcash);
    }
    
    return total;
  };

  const totalVariance = calculateTotalVariance();

  // Check if there's any variance (difference exists)
  const hasVariance = allActualValuesEntered && Math.abs(totalVariance) > 0;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (Math.abs(totalVariance) > 0.02 && !formData.varianceExplanation) {
      alert("Variance explanation is required when variance exceeds 2%");
      return;
    }
    setLoading(true);
    try {
      const status = Math.abs(totalVariance) > 0.02 ? "escalated" : "pending";
      await reconciliationService.create({
        businessId: userData.businessId,
        branchId: userData.branchId,
        ...formData,
        totalVariance,
        reconciledBy: userData.userId,
        reconciledByName: userData.name || userData.email,
        status,
      });
      alert("Reconciliation recorded successfully!");
      setFormData({
        date: new Date().toISOString().split("T")[0],
        systemPhysicalCash: "",
        actualPhysicalCash: "",
        systemMtnEcash: "",
        actualMtnEcash: "",
        systemVodafoneEcash: "",
        actualVodafoneEcash: "",
        systemAirtelTigoEcash: "",
        actualAirtelTigoEcash: "",
        systemTelecelEcash: "",
        actualTelecelEcash: "",
        varianceExplanation: "",
        status: "pending",
      });
    } catch (error) {
      alert("Error recording reconciliation: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  // Check if date is today - only allow reconciliation for today
  const today = new Date().toISOString().split("T")[0];
  const isToday = formData.date === today;

  return (
    <div className="space-y-6 relative">
      {/* Loading Overlay */}
      {loadingBalances && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg p-6 shadow-lg">
            <div className="flex flex-col items-center gap-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
              <p className="text-lg font-semibold">Loading System Balances...</p>
              <p className="text-sm text-muted-foreground">Updating from all transactions</p>
            </div>
          </div>
        </div>
      )}

      <div>
        <h1 className="text-3xl font-bold">Daily Reconciliation</h1>
        <p className="text-muted-foreground">Reconcile system balances with actual counts</p>
        {!isToday && (
          <div className="mt-2 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
            <p className="text-sm text-yellow-800">
              ⚠️ Only today's reconciliation is allowed. Date has been reset to today.
            </p>
          </div>
        )}
      </div>

      <Card className={loadingBalances ? "opacity-50 pointer-events-none" : ""}>
        <CardHeader>
          <CardTitle>Daily Reconciliation Form</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="date">Date *</Label>
              <Input
                id="date"
                type="date"
                value={formData.date}
                readOnly
                disabled
                className="bg-muted cursor-not-allowed"
                required
              />
              <p className="text-xs text-muted-foreground">
                Only today's reconciliation is allowed. Date cannot be changed.
              </p>
              </div>
              <div className="space-y-2">
                <Label>Refresh System Balances</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={loadSystemBalances}
                  className="w-full"
                >
                  🔄 Refresh from Transactions
                </Button>
                <p className="text-xs text-muted-foreground">
                  System balances auto-update every 1 minute. Click to refresh manually.
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Physical Cash Reconciliation</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="systemPhysicalCash">System Calculated (GHS) *</Label>
                  <Input
                    id="systemPhysicalCash"
                    type="number"
                    step="0.01"
                    value={formData.systemPhysicalCash}
                    readOnly
                    className="bg-muted"
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-calculated from opening float + all transactions
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actualPhysicalCash">Actual Count (GHS) *</Label>
                  <Input
                    id="actualPhysicalCash"
                    type="text"
                    inputMode="decimal"
                    value={formData.actualPhysicalCash}
                    onChange={(e) => {
                      // Allow only numbers and decimal point
                      const value = e.target.value.replace(/[^0-9.]/g, '');
                      // Ensure only one decimal point
                      const parts = value.split('.');
                      const formatted = parts.length > 2 
                        ? parts[0] + '.' + parts.slice(1).join('')
                        : value;
                      setFormData({ ...formData, actualPhysicalCash: formatted });
                    }}
                    onBlur={(e) => {
                      // Round to 2 decimal places on blur
                      const num = parseFloat(e.target.value);
                      if (!isNaN(num)) {
                        setFormData({ ...formData, actualPhysicalCash: num.toFixed(2) });
                      }
                    }}
                    required
                  />
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm">
                  Difference:{" "}
                  <span
                    className={
                      Math.abs(calculateVariance(formData.systemPhysicalCash, formData.actualPhysicalCash)) > 0.02
                        ? "text-red-600 font-bold"
                        : "text-green-600"
                    }
                  >
                    GHS{" "}
                    {calculateVariance(
                      formData.systemPhysicalCash,
                      formData.actualPhysicalCash
                    ).toLocaleString()}
                  </span>
                </p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">E-Cash Reconciliation</h3>
              {["MTN", "Vodafone", "AirtelTigo", "Telecel"].map((provider) => {
                const providerSims = merchantSims.filter(sim => sim.provider === provider);
                return (
                  <div key={provider} className="mb-6 border rounded-md p-4">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="font-semibold text-lg">{provider}</h4>
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
                      <div className="space-y-4">
                        {providerSims.map((sim) => {
                          const systemKey = `system_${sim.merchantSimId}`;
                          const actualKey = `actual_${sim.merchantSimId}`;
                          const systemValue = formData.systemMerchantSimEcash?.[sim.merchantSimId] || "";
                          const actualValue = formData.actualMerchantSimEcash?.[sim.merchantSimId] || "";
                          const variance = calculateVariance(systemValue, actualValue);
                          return (
                            <div key={sim.merchantSimId} className="border rounded-md p-3">
                              <h5 className="font-medium mb-2">{sim.simName}</h5>
                              <div className="grid gap-4 md:grid-cols-2">
                                <div className="space-y-2">
                                  <Label>System Balance (GHS) *</Label>
                                  <Input
                                    type="text"
                                    value={systemValue}
                                    readOnly
                                    className="bg-muted"
                                    required
                                  />
                                  <p className="text-xs text-muted-foreground">
                                    Auto-calculated from opening balance + all {sim.simName} transactions
                                  </p>
                                </div>
                                <div className="space-y-2">
                                  <Label>Actual Balance (GHS) *</Label>
                                  <Input
                                    type="text"
                                    inputMode="decimal"
                                    value={actualValue}
                                    onChange={(e) => {
                                      const value = e.target.value.replace(/[^0-9.]/g, '');
                                      const parts = value.split('.');
                                      const formatted = parts.length > 2 
                                        ? parts[0] + '.' + parts.slice(1).join('')
                                        : value;
                                      const updated = {
                                        ...formData.actualMerchantSimEcash,
                                        [sim.merchantSimId]: formatted,
                                      };
                                      setFormData({ ...formData, actualMerchantSimEcash: updated });
                                    }}
                                    onBlur={(e) => {
                                      const num = parseFloat(e.target.value);
                                      if (!isNaN(num)) {
                                        const updated = {
                                          ...formData.actualMerchantSimEcash,
                                          [sim.merchantSimId]: num.toFixed(2),
                                        };
                                        setFormData({ ...formData, actualMerchantSimEcash: updated });
                                      }
                                    }}
                                    required
                                  />
                                </div>
                              </div>
                              <div className="mt-2">
                                <div className="flex items-center gap-2">
                                  {Math.abs(variance) > 0.02 ? (
                                    <XCircle className="h-4 w-4 text-red-600" />
                                  ) : Math.abs(variance) > 0 ? (
                                    <AlertCircle className="h-4 w-4 text-yellow-600" />
                                  ) : (
                                    <CheckCircle className="h-4 w-4 text-green-600" />
                                  )}
                                  <p className="text-sm">
                                    Difference:{" "}
                                    <span className={Math.abs(variance) > 0.02 ? "text-red-600 font-bold" : "text-green-600"}>
                                      GHS {variance.toLocaleString()}
                                    </span>
                                  </p>
                                </div>
                                {actualValue && Math.abs(variance) > 0 && (
                                  <div className="mt-2">
                                    <Label htmlFor={`variance_${sim.merchantSimId}`}>
                                      {sim.simName} Variance Reason *
                                    </Label>
                                    <Input
                                      id={`variance_${sim.merchantSimId}`}
                                      value={formData.merchantSimVarianceReason?.[sim.merchantSimId] || ""}
                                      onChange={(e) => {
                                        const updated = {
                                          ...formData.merchantSimVarianceReason,
                                          [sim.merchantSimId]: e.target.value,
                                        };
                                        setFormData({ ...formData, merchantSimVarianceReason: updated });
                                      }}
                                      required
                                    />
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {showAddMerchantSim.visible && showAddMerchantSim.provider === provider && (
                      <div className="mt-4 p-3 border rounded-md bg-muted space-y-2">
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

            {/* Only show variance section if all values are entered and there's a difference */}
            {hasVariance && (
            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Variance Analysis</h3>
              <div className="mb-4 p-4 bg-muted rounded-md">
                <div className="flex items-center gap-2 mb-2">
                  {Math.abs(totalVariance) > 0.02 ? (
                    <XCircle className="h-5 w-5 text-red-600" />
                  ) : Math.abs(totalVariance) > 0 ? (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  ) : (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  )}
                <p className="font-semibold">
                  Total Variance:{" "}
                  <span
                    className={
                      Math.abs(totalVariance) > 0.02 ? "text-red-600" : "text-green-600"
                    }
                  >
                    GHS {totalVariance.toLocaleString()}
                  </span>
                </p>
                </div>
                {Math.abs(totalVariance) > 0.02 && (
                  <Badge variant="destructive" className="mt-2">
                    🚨 Major Variance - Manager Approval Required
                  </Badge>
                )}
                {Math.abs(totalVariance) > 0 && Math.abs(totalVariance) <= 0.02 && (
                  <Badge variant="outline" className="mt-2">
                    ⚠️ Minor Variance
                  </Badge>
                )}
                {Math.abs(totalVariance) === 0 && (
                  <Badge variant="default" className="mt-2">
                    ✅ Balanced
                  </Badge>
                )}
              </div>
              <div className="space-y-4">
              <div className="space-y-2">
                  <Label htmlFor="physicalCashVarianceReason">
                    Physical Cash Variance Reason *
                </Label>
                <Input
                    id="physicalCashVarianceReason"
                    value={formData.physicalCashVarianceReason}
                    onChange={(e) =>
                      setFormData({ ...formData, physicalCashVarianceReason: e.target.value })
                    }
                    required={
                      Math.abs(
                        calculateVariance(
                          formData.systemPhysicalCash,
                          formData.actualPhysicalCash
                        )
                      ) > 0
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="actionTaken">Action Taken to Resolve *</Label>
                  <Input
                    id="actionTaken"
                    value={formData.actionTaken}
                    onChange={(e) =>
                      setFormData({ ...formData, actionTaken: e.target.value })
                    }
                    required={Math.abs(totalVariance) > 0}
                    placeholder="Describe actions taken to resolve variances"
                  />
                </div>
                {/* Only show manager comments for managers/admins, not normal users */}
                {Math.abs(totalVariance) > 0.02 && (userData?.role === "admin" || userData?.role === "branch_manager") && (
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
                )}
                <div className="space-y-2">
                  <Label htmlFor="resolutionNotes">Resolution Notes</Label>
                  <Input
                    id="resolutionNotes"
                    value={formData.resolutionNotes}
                  onChange={(e) =>
                      setFormData({ ...formData, resolutionNotes: e.target.value })
                  }
                    placeholder="Additional notes about resolution"
                />
                </div>
              </div>
            </div>
            )}

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline">
                Save Draft
              </Button>
              {Math.abs(totalVariance) > 0.02 && (
                <Button
                  type="button"
                  variant="destructive"
                  onClick={() => {
                    if (window.confirm("Escalate to IT Admin?")) {
                      // Handle escalation
                      alert("Reconciliation escalated to IT Admin");
                    }
                  }}
                >
                  Escalate to IT Admin
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? "Submitting..." : "Submit for Approval"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

