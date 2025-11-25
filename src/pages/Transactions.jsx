import React, { useState, useEffect } from "react";
import { transactionService, commissionService, expenseService, simSaleService, generalDailyCommissionService, branchService, dailyFloatService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Plus } from "lucide-react";

export default function Transactions() {
  const { userData, selectedBranchId, selectedBusinessId } = useAuth();
  const [activeForm, setActiveForm] = useState(null);
  const [loading, setLoading] = useState(false);
  const [branchData, setBranchData] = useState(null);
  const [merchantSims, setMerchantSims] = useState([]); // All merchant SIMs for this branch
  const [showAddMerchantSim, setShowAddMerchantSim] = useState(false);
  const [newMerchantSim, setNewMerchantSim] = useState({ provider: "", simName: "", agentNumber: "" });
  const [currentBalances, setCurrentBalances] = useState({
    physicalCash: 0,
    mtnEcash: 0,
    vodafoneEcash: 0,
    airtelTigoEcash: 0,
    telecelEcash: 0,
    merchantSimEcash: {}, // Store balances per merchant SIM ID
  });

  useEffect(() => {
    const branchId = selectedBranchId || userData?.branchId;
    if (branchId) {
      loadBranchData();
      loadMerchantSims();
      loadCurrentBalances();
    }
  }, [userData?.branchId, selectedBranchId]);

  // Helper function to get businessId and branchId with fallbacks
  const getBusinessAndBranchIds = () => {
    const businessId = selectedBusinessId || userData?.businessId;
    const branchId = selectedBranchId || userData?.branchId;
    return { businessId, branchId };
  };

  const loadBranchData = async () => {
    try {
      const { branchId } = getBusinessAndBranchIds();
      if (!branchId) return;
      const branch = await branchService.getById(branchId);
      setBranchData(branch);
    } catch (error) {
      console.error("Error loading branch:", error);
    }
  };

  const loadMerchantSims = async () => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) {
        console.warn("No branchId available to load merchant SIMs");
        return;
      }
      const sims = await merchantSimService.getByBranch(branchId);
      console.log("Loaded merchant SIMs:", sims);
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
    
    const branchId = selectedBranchId || userData?.branchId;
    if (!branchId) {
      alert("Error: Branch ID is not available. Please ensure you're assigned to a branch.");
      return;
    }
    
    try {
      await merchantSimService.create({
        branchId: branchId,
        provider: newMerchantSim.provider,
        simName: newMerchantSim.simName,
        agentNumber: newMerchantSim.agentNumber || "",
      });
      await loadMerchantSims();
      setNewMerchantSim({ provider: "", simName: "", agentNumber: "" });
      setShowAddMerchantSim(false);
      alert("Merchant SIM added successfully!");
    } catch (error) {
      console.error("Error adding merchant SIM:", error);
      alert("Error adding merchant SIM: " + error.message);
    }
  };

  const loadCurrentBalances = async () => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) return;
      
      const today = new Date();
      const float = await dailyFloatService.getByBranchAndDate(branchId, today);
      if (float) {
        const transactions = await transactionService.getTodayTransactions(branchId, userData.userId, userData.role);
        
        // Start with opening physical cash
        let physicalCash = parseFloat(float.openingPhysicalCash || 0);
        console.log("Transactions: Opening physical cash from float:", float.openingPhysicalCash, "Parsed:", physicalCash);
        
        // Initialize merchant SIM balances from opening float
        const merchantSimBalances = {};
        if (float.openingMerchantSimEcash && typeof float.openingMerchantSimEcash === 'object') {
          Object.keys(float.openingMerchantSimEcash).forEach(simId => {
            merchantSimBalances[simId] = parseFloat(float.openingMerchantSimEcash[simId] || 0);
          });
          console.log("Transactions: Loaded merchant SIM balances:", merchantSimBalances);
        } else {
          console.warn("Transactions: No openingMerchantSimEcash found in float");
        }
        
        // Fallback to provider-level balances if merchant SIM data not available
        let mtnEcash = parseFloat(float.openingMtnEcash || 0);
        let vodafoneEcash = parseFloat(float.openingVodafoneEcash || 0);
        let airtelTigoEcash = parseFloat(float.openingAirtelTigoEcash || 0);
        let telecelEcash = parseFloat(float.openingTelecelEcash || 0);

        // Apply all transactions to calculate current balances
        if (transactions?.momo && Array.isArray(transactions.momo)) {
          transactions.momo.forEach((t) => {
            const amount = parseFloat(t.amount || 0);
            if (isNaN(amount) || amount <= 0) return;
            
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

        console.log("Transactions: Setting current balances - Physical:", physicalCash, "Merchant SIMs:", merchantSimBalances);
        setCurrentBalances({
          physicalCash,
          mtnEcash,
          vodafoneEcash,
          airtelTigoEcash,
          telecelEcash,
          merchantSimEcash: merchantSimBalances,
        });
      } else {
        console.warn("Transactions: No float found for today");
      }
    } catch (error) {
      console.error("Error loading balances:", error);
    }
  };

  const getAgentNumber = (provider) => {
    if (!branchData) return "";
    const providerMap = {
      MTN: branchData.mtnAgentNumber,
      Vodafone: branchData.vodafoneAgentNumber,
      AirtelTigo: branchData.airtelTigoAgentNumber,
      Telecel: branchData.telecelAgentNumber,
    };
    return providerMap[provider] || "";
  };

  const getEcashBalance = (provider, merchantSimId = null) => {
    // If merchant SIM is selected, return its balance from openingMerchantSimEcash
    if (merchantSimId && currentBalances.merchantSimEcash && currentBalances.merchantSimEcash[merchantSimId] !== undefined) {
      return currentBalances.merchantSimEcash[merchantSimId];
    }
    
    // Fallback to provider-level balances
    const providerMap = {
      MTN: currentBalances.mtnEcash,
      Vodafone: currentBalances.vodafoneEcash,
      AirtelTigo: currentBalances.airtelTigoEcash,
      Telecel: currentBalances.telecelEcash,
    };
    return providerMap[provider] || 0;
  };

  // Calculate cash out charges based on amount
  // 0-3000: free
  // 3500-7000: 10 cedis
  // 7000-11000: 20 cedis
  // Above 15000: 50 cedis
  const calculateCashOutCharges = (amount) => {
    const amt = parseFloat(amount || 0);
    if (amt <= 3000) return 0;
    if (amt >= 3500 && amt < 7000) return 10;
    if (amt >= 7000 && amt <= 11000) return 20;
    if (amt >= 15000) return 50;
    return 0; // For amounts between 3000-3500 and 11000-15000, default to 0
  };

  // Calculate cash in commission (1% of amount)
  const calculateCashInCommission = (amount) => {
    const amt = parseFloat(amount || 0);
    return Math.round((amt * 0.01 + Number.EPSILON) * 100) / 100; // 1% rounded to 2 decimals
  };

  // Generate 4-digit random number
  const generateFourDigits = () => {
    return Math.floor(1000 + Math.random() * 9000).toString();
  };

  // Generate receipt number: merchant sim type + 4 digits
  const generateReceiptNumber = (merchantSimName) => {
    if (!merchantSimName) return "";
    const simType = merchantSimName.replace(/\s+/g, "").toUpperCase(); // Remove spaces and uppercase
    return `${simType}${generateFourDigits()}`;
  };

  // Generate transaction reference: merchant sim type + 4 digits (for MoMo) or bank name + 4 digits (for bank)
  const generateTransactionReference = (merchantSimName, bankName = null) => {
    if (bankName) {
      const bank = bankName.replace(/\s+/g, "").toUpperCase();
      return `${bank}${generateFourDigits()}`;
    }
    if (!merchantSimName) return "";
    const simType = merchantSimName.replace(/\s+/g, "").toUpperCase();
    return `${simType}${generateFourDigits()}`;
  };

  const [momoForm, setMomoForm] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
    transactionType: "cash_in",
    provider: "MTN",
    merchantSimId: "",
    merchantSimName: "",
    customerName: "",
    customerNumber: "",
    customerGhanaCard: "",
    amount: "",
    charges: "",
    commissionEarned: "",
    agentNumber: "",
    physicalCashBefore: "",
    physicalCashAfter: "",
    ecashBefore: "",
    ecashAfter: "",
    transactionReference: "",
    receiptNumber: "",
    remarks: "",
  });

  // Initialize bank form with auto-generated transaction reference
  const [bankForm, setBankForm] = useState(() => ({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
    bankName: "Ecobank",
    bankBranch: "",
    transactionType: "deposit",
    customerName: "",
    customerNumber: "",
    accountNumber: "",
    accountName: "",
    amount: "",
    transactionReference: generateTransactionReference(null, "Ecobank"),
    physicalCashBefore: "",
    physicalCashAfter: "",
    remarks: "",
  }));

  const handleMoMoSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Round to 2 decimal places to avoid floating point precision issues
      const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
      
      const amount = roundTo2(parseFloat(momoForm.amount || 0));
      const physicalBefore = roundTo2(parseFloat(momoForm.physicalCashBefore || currentBalances.physicalCash));
      // Use merchant SIM balance if merchant SIM is selected, otherwise use provider balance
      const ecashBefore = roundTo2(parseFloat(momoForm.ecashBefore || getEcashBalance(momoForm.provider, momoForm.merchantSimId)));
      
      let physicalAfter = physicalBefore;
      let ecashAfter = ecashBefore;
      
      // Cash In: Customer gives physical cash → Agent credits customer E-Cash account
      // So: Physical Cash increases, E-Cash decreases
      if (momoForm.transactionType === "cash_in") {
        physicalAfter = roundTo2(physicalBefore + amount); // Agent receives physical cash
        ecashAfter = roundTo2(ecashBefore - amount); // Agent's E-Cash decreases (crediting customer)
      } 
      // Cash Out: Customer receives physical cash → Customer credits agent E-Cash account
      // So: Physical Cash decreases, E-Cash increases
      else if (momoForm.transactionType === "cash_out") {
        physicalAfter = roundTo2(physicalBefore - amount); // Agent gives physical cash
        ecashAfter = roundTo2(ecashBefore + amount); // Agent's E-Cash increases (customer credits agent)
      }

      const { businessId, branchId } = getBusinessAndBranchIds();
      
      if (!businessId || !branchId) {
        alert("Error: Business ID or Branch ID is missing. Please ensure you're properly assigned.");
        setLoading(false);
        return;
      }
      
      await transactionService.createMoMoTransaction({
        businessId,
        branchId,
        ...momoForm,
        agentNumber: getAgentNumber(momoForm.provider),
        physicalCashBefore: physicalBefore,
        physicalCashAfter: physicalAfter,
        ecashBefore: ecashBefore,
        ecashAfter: ecashAfter,
        recordedBy: userData.userId,
        recordedByName: userData.name || userData.email,
      });
      alert("Transaction recorded successfully!");
      setMomoForm({
        date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString(),
        transactionType: "cash_in",
        provider: "MTN",
        merchantSimId: "",
        merchantSimName: "",
        customerName: "",
        customerNumber: "",
        customerGhanaCard: "",
        amount: "",
        charges: "",
        commissionEarned: "",
        physicalCashBefore: "",
        physicalCashAfter: "",
        ecashBefore: "",
        ecashAfter: "",
        transactionReference: "",
        receiptNumber: "",
        remarks: "",
      });
      // Reload balances after transaction
      loadCurrentBalances();
      loadCurrentBalances();
      setActiveForm(null);
    } catch (error) {
      alert("Error recording transaction: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const [bankCommissionForm, setBankCommissionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    bankName: "Ecobank",
    commissionType: "deposit",
    numberOfTransactions: "",
    totalTransactionValue: "",
    commissionRate: "",
    commissionAmount: "",
    commissionReceived: false,
    paymentDate: "",
    balance: "",
    remarks: "",
  });

  const [momoCommissionForm, setMomoCommissionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    provider: "MTN",
    commissionType: "cash_in",
    numberOfTransactions: "",
    totalTransactionValue: "",
    commissionRate: "",
    commissionEarned: "",
    commissionPaymentType: "physical",
    balance: "",
    remarks: "",
  });

  const [simSaleForm, setSimSaleForm] = useState({
    date: new Date().toISOString().split("T")[0],
    provider: "MTN",
    simType: "regular",
    customerName: "",
    customerNumber: "",
    customerGhanaCard: "",
    quantity: "",
    unitPrice: "",
    totalAmount: "",
    paymentMethod: "cash",
    registrationStatus: "registered",
    agentCommission: "",
    balance: "",
    remarks: "",
  });

  const [expenseForm, setExpenseForm] = useState({
    date: new Date().toISOString().split("T")[0],
    expenseCategory: "transport",
    description: "",
    quantity: "",
    unitPrice: "",
    amountPaid: "",
    amountReceived: "",
    paymentMethod: "cash",
    paidTo: "",
    approvedBy: "",
    receiptNumber: "",
    attachmentUrl: "",
    pettyCashBalance: "",
    remarks: "",
  });

  const [generalCommissionForm, setGeneralCommissionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    mtn33PhysicalCash: "",
    mtn33Ecash: "",
    mtn34PhysicalCash: "",
    mtn34Ecash: "",
    vodafonePhysicalCash: "",
    vodafoneEcash: "",
    airtelTigoPhysicalCash: "",
    airtelTigoEcash: "",
    telecelPhysicalCash: "",
    telecelEcash: "",
    ecobankCommission: "",
    fidelityCommission: "",
    firstBankCommission: "",
    gcbCommission: "",
    totalBalance: "",
    remarks: "",
  });

  const transactionButtons = [
    { id: "momo", label: "MoMo Transaction", icon: "📱" },
    { id: "bank", label: "Bank Transaction", icon: "🏦" },
    { id: "bank_commission", label: "Bank Commissions", icon: "💰" },
    { id: "momo_commission", label: "MoMo Commissions", icon: "💵" },
    { id: "sim_sale", label: "SIM Sales", icon: "📞" },
    { id: "expense", label: "Expenses", icon: "💸" },
    { id: "general_commission", label: "General Daily Commission", icon: "📊" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Transaction Recording</h1>
        <p className="text-muted-foreground">Record all business transactions</p>
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {transactionButtons.map((btn) => (
          <Button
            key={btn.id}
            variant={activeForm === btn.id ? "default" : "outline"}
            className="h-24 flex flex-col items-center justify-center gap-2"
            onClick={() => setActiveForm(activeForm === btn.id ? null : btn.id)}
          >
            <span className="text-2xl">{btn.icon}</span>
            <span className="text-sm">{btn.label}</span>
          </Button>
        ))}
      </div>

      {activeForm === "momo" && (
        <Card>
          <CardHeader>
            <CardTitle>MoMo Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleMoMoSubmit} className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="date">Date *</Label>
                  <Input
                    id="date"
                    type="date"
                    value={momoForm.date}
                    readOnly
                    disabled
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={momoForm.time}
                    readOnly
                    disabled
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="transactionType">Transaction Type *</Label>
                  <Select
                    id="transactionType"
                    value={momoForm.transactionType}
                    onChange={(e) => {
                      const transactionType = e.target.value;
                      let charges = "";
                      let commission = "";
                      
                      // Recalculate charges/commission when transaction type changes
                      if (transactionType === "cash_out") {
                        charges = calculateCashOutCharges(momoForm.amount).toString();
                      } else if (transactionType === "cash_in") {
                        commission = calculateCashInCommission(momoForm.amount).toString();
                        charges = commission;
                      }
                      
                      setMomoForm({ 
                        ...momoForm, 
                        transactionType,
                        charges,
                        commissionEarned: commission
                      });
                    }}
                    required
                  >
                      <option value="cash_in">Cash-In</option>
                    <option value="cash_out">Cash-Out</option>
                    <option value="momo_transfer">MoMo Transfer</option>
                    <option value="bill_payment">Bill Payment</option>
                    <option value="airtime">Airtime</option>
                    <option value="data_bundle">Data Bundle</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="provider">Provider *</Label>
                  <Select
                    id="provider"
                    value={momoForm.provider}
                    onChange={(e) => {
                      setMomoForm({ 
                        ...momoForm, 
                        provider: e.target.value,
                        merchantSimId: "",
                        merchantSimName: ""
                      });
                      // Reload merchant SIMs when provider changes to ensure we have latest data
                      loadMerchantSims();
                    }}
                    required
                  >
                    <option value="MTN">MTN</option>
                    <option value="Vodafone">Vodafone</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </Select>
                </div>
                {momoForm.provider && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <Label htmlFor="merchantSim">Merchant SIM *</Label>
                        <Select
                          id="merchantSim"
                          value={momoForm.merchantSimId}
                          onChange={(e) => {
                            const selectedSim = merchantSims.find(s => (s.merchantSimId || s.id) === e.target.value);
                            const simName = selectedSim?.simName || "";
                            setMomoForm({ 
                              ...momoForm, 
                              merchantSimId: e.target.value,
                              merchantSimName: simName,
                              // Reset ecashBefore so it recalculates with new merchant SIM
                              ecashBefore: "",
                              // Auto-generate receipt number and transaction reference
                              receiptNumber: generateReceiptNumber(simName),
                              transactionReference: generateTransactionReference(simName)
                            });
                            // Reload balances to get latest merchant SIM balance
                            loadCurrentBalances();
                          }}
                          required
                        >
                          <option value="">Select Merchant SIM</option>
                          {merchantSims && merchantSims.length > 0 ? (
                            merchantSims
                              .filter(sim => sim.provider === momoForm.provider)
                              .map((sim) => (
                                <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>
                                  {sim.simName}
                                </option>
                              ))
                          ) : (
                            <option value="" disabled>No merchant SIMs found for {momoForm.provider}. Click + to add.</option>
                          )}
                        </Select>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setNewMerchantSim({ provider: momoForm.provider, simName: "", agentNumber: "" });
                          setShowAddMerchantSim(true);
                        }}
                        className="mt-6"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    {showAddMerchantSim && newMerchantSim.provider === momoForm.provider && (
                      <div className="p-3 border rounded-md bg-muted space-y-2">
                        <Input
                          placeholder="SIM Name (e.g., MTN33)"
                          value={newMerchantSim.simName}
                          onChange={(e) => setNewMerchantSim({ ...newMerchantSim, simName: e.target.value })}
                        />
                        <Input
                          placeholder="Agent Number (optional)"
                          value={newMerchantSim.agentNumber}
                          onChange={(e) => setNewMerchantSim({ ...newMerchantSim, agentNumber: e.target.value })}
                        />
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleAddMerchantSim}
                          >
                            Add
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setShowAddMerchantSim(false);
                              setNewMerchantSim({ provider: "", simName: "", agentNumber: "" });
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="customerName">Customer Name *</Label>
                  <Input
                    id="customerName"
                    value={momoForm.customerName}
                    onChange={(e) => setMomoForm({ ...momoForm, customerName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerNumber">Customer Phone *</Label>
                  <Input
                    id="customerNumber"
                    type="tel"
                    value={momoForm.customerNumber}
                    onChange={(e) =>
                      setMomoForm({ ...momoForm, customerNumber: e.target.value })
                    }
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="customerGhanaCard">
                  Customer Ghana Card {parseFloat(momoForm.amount || 0) > 1000 ? "*" : ""}
                </Label>
                <Input
                  id="customerGhanaCard"
                  value={momoForm.customerGhanaCard}
                  onChange={(e) =>
                    setMomoForm({ ...momoForm, customerGhanaCard: e.target.value })
                  }
                  required={parseFloat(momoForm.amount || 0) > 1000}
                  placeholder="Required for transactions over GHS 1000"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="amount">Transaction Amount (GHS) *</Label>
                  <Input
                    id="amount"
                    type="number"
                    step="0.01"
                    value={momoForm.amount}
                    onChange={(e) => {
                      const amount = e.target.value;
                      let charges = "";
                      let commission = "";
                      
                      // Auto-calculate based on transaction type
                      if (momoForm.transactionType === "cash_out") {
                        charges = calculateCashOutCharges(amount).toString();
                      } else if (momoForm.transactionType === "cash_in") {
                        commission = calculateCashInCommission(amount).toString();
                        charges = commission; // For cash in, service charges = commission
                      }
                      
                      setMomoForm({ 
                        ...momoForm, 
                        amount,
                        charges,
                        commissionEarned: commission
                      });
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="charges">Service Charges (GHS)</Label>
                  <Input
                    id="charges"
                    type="number"
                    step="0.01"
                    value={momoForm.charges}
                    readOnly
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="commissionEarned">Commission Earned (GHS)</Label>
                  <Input
                    id="commissionEarned"
                    type="number"
                    step="0.01"
                    value={momoForm.commissionEarned}
                    readOnly
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="physicalCashBefore">Physical Cash Before (GHS)</Label>
                  <Input
                    id="physicalCashBefore"
                    type="number"
                    step="0.01"
                    value={momoForm.physicalCashBefore || currentBalances.physicalCash}
                    onChange={(e) => setMomoForm({ ...momoForm, physicalCashBefore: e.target.value })}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="physicalCashAfter">Physical Cash After (GHS)</Label>
                  <Input
                    id="physicalCashAfter"
                    type="number"
                    step="0.01"
                    value={momoForm.physicalCashAfter || (() => {
                      const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
                      const before = roundTo2(parseFloat(momoForm.physicalCashBefore || currentBalances.physicalCash));
                      const amount = roundTo2(parseFloat(momoForm.amount || 0));
                      if (momoForm.transactionType === "cash_in") return roundTo2(before + amount);
                      if (momoForm.transactionType === "cash_out") return roundTo2(before - amount);
                      return before;
                    })()}
                    readOnly
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ecashBefore">E-Cash Before (GHS)</Label>
                  <Input
                    id="ecashBefore"
                    type="number"
                    step="0.01"
                    value={momoForm.ecashBefore || getEcashBalance(momoForm.provider, momoForm.merchantSimId)}
                    onChange={(e) => setMomoForm({ ...momoForm, ecashBefore: e.target.value })}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ecashAfter">E-Cash After (GHS)</Label>
                  <Input
                    id="ecashAfter"
                    type="number"
                    step="0.01"
                    value={momoForm.ecashAfter || (() => {
                      const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
                      const before = roundTo2(getEcashBalance(momoForm.provider, momoForm.merchantSimId));
                      const amount = roundTo2(parseFloat(momoForm.amount || 0));
                      if (momoForm.transactionType === "cash_in") return roundTo2(before - amount); // E-Cash decreases (agent credits customer)
                      if (momoForm.transactionType === "cash_out") return roundTo2(before + amount); // E-Cash increases (customer credits agent)
                      return before;
                    })()}
                    readOnly
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="transactionReference">Transaction Reference *</Label>
                  <Input
                    id="transactionReference"
                    value={momoForm.transactionReference}
                    readOnly
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiptNumber">Receipt Number</Label>
                  <Input
                    id="receiptNumber"
                    value={momoForm.receiptNumber}
                    readOnly
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="remarks">Remarks</Label>
                <Input
                  id="remarks"
                  value={momoForm.remarks}
                  onChange={(e) => setMomoForm({ ...momoForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Transaction"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "bank" && (
        <Card>
          <CardHeader>
            <CardTitle>Bank Transaction</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const amount = parseFloat(bankForm.amount || 0);
                  const physicalBefore = parseFloat(bankForm.physicalCashBefore || currentBalances.physicalCash);
                  let physicalAfter = physicalBefore;
                  
                  if (bankForm.transactionType === "deposit") {
                    physicalAfter = physicalBefore + amount;
                  } else if (bankForm.transactionType === "withdrawal") {
                    physicalAfter = physicalBefore - amount;
                  }

                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  await transactionService.createBankTransaction({
                    businessId,
                    branchId,
                    ...bankForm,
                    physicalCashBefore: physicalBefore,
                    physicalCashAfter: physicalAfter,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("Bank transaction recorded successfully!");
                  setBankForm({
                    date: new Date().toISOString().split("T")[0],
                    time: new Date().toLocaleTimeString(),
                    bankName: "Ecobank",
                    bankBranch: "",
                    transactionType: "deposit",
                    customerName: "",
                    customerNumber: "",
                    accountNumber: "",
                    accountName: "",
                    amount: "",
                    transactionReference: generateTransactionReference(null, "Ecobank"),
                    physicalCashBefore: "",
                    physicalCashAfter: "",
                    remarks: "",
                  });
                  loadCurrentBalances();
                  loadCurrentBalances();
                  setActiveForm(null);
                } catch (error) {
                  alert("Error: " + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankDate">Date *</Label>
                  <Input
                    id="bankDate"
                    type="date"
                    value={bankForm.date}
                    readOnly
                    disabled
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankTime">Time *</Label>
                  <Input
                    id="bankTime"
                    type="time"
                    value={bankForm.time}
                    readOnly
                    disabled
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankName">Bank Name *</Label>
                  <Select
                    id="bankName"
                    value={bankForm.bankName}
                    onChange={(e) => {
                      const bankName = e.target.value;
                      setBankForm({ 
                        ...bankForm, 
                        bankName,
                        // Auto-generate transaction reference when bank name changes
                        transactionReference: generateTransactionReference(null, bankName)
                      });
                    }}
                    required
                  >
                    <option value="Ecobank">Ecobank</option>
                    <option value="Fidelity">Fidelity</option>
                    <option value="First Bank">First Bank</option>
                    <option value="GCB">GCB</option>
                    <option value="Others">Others</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankBranch">Bank Branch *</Label>
                  <Input
                    id="bankBranch"
                    value={bankForm.bankBranch}
                    onChange={(e) => setBankForm({ ...bankForm, bankBranch: e.target.value })}
                    required
                    placeholder="Enter bank branch"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankTransactionType">Transaction Type *</Label>
                  <Select
                    id="bankTransactionType"
                    value={bankForm.transactionType}
                    onChange={(e) => setBankForm({ ...bankForm, transactionType: e.target.value })}
                    required
                  >
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                    <option value="transfer">Transfer</option>
                    <option value="bill_payment">Bill Payment</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankCustomerName">Customer Name *</Label>
                  <Input
                    id="bankCustomerName"
                    value={bankForm.customerName}
                    onChange={(e) => setBankForm({ ...bankForm, customerName: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankCustomerNumber">Customer Phone *</Label>
                  <Input
                    id="bankCustomerNumber"
                    type="tel"
                    value={bankForm.customerNumber}
                    onChange={(e) => setBankForm({ ...bankForm, customerNumber: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="accountNumber">Account Number *</Label>
                  <Input
                    id="accountNumber"
                    value={bankForm.accountNumber}
                    onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="accountName">Account Name *</Label>
                  <Input
                    id="accountName"
                    value={bankForm.accountName}
                    onChange={(e) => setBankForm({ ...bankForm, accountName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankAmount">Amount (GHS) *</Label>
                <Input
                  id="bankAmount"
                  type="number"
                  step="0.01"
                  value={bankForm.amount}
                  onChange={(e) => setBankForm({ ...bankForm, amount: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankTransactionReference">Transaction Reference *</Label>
                  <Input
                    id="bankTransactionReference"
                    value={bankForm.transactionReference}
                    readOnly
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankPhysicalCashBefore">Physical Cash Before (GHS)</Label>
                  <Input
                    id="bankPhysicalCashBefore"
                    type="number"
                    step="0.01"
                    value={bankForm.physicalCashBefore || currentBalances.physicalCash}
                    readOnly
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankPhysicalCashAfter">Physical Cash After (GHS)</Label>
                <Input
                  id="bankPhysicalCashAfter"
                  type="number"
                  step="0.01"
                  value={bankForm.physicalCashAfter || (bankForm.transactionType === "deposit"
                    ? (parseFloat(bankForm.physicalCashBefore || currentBalances.physicalCash) + parseFloat(bankForm.amount || 0))
                    : (parseFloat(bankForm.physicalCashBefore || currentBalances.physicalCash) - parseFloat(bankForm.amount || 0)))}
                  readOnly
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankRemarks">Remarks</Label>
                <Input
                  id="bankRemarks"
                  value={bankForm.remarks}
                  onChange={(e) => setBankForm({ ...bankForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Transaction"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "bank_commission" && (
        <Card>
          <CardHeader>
            <CardTitle>Bank Commissions</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  await commissionService.createBankCommission({
                    businessId,
                    branchId,
                    ...bankCommissionForm,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("Bank commission recorded successfully!");
                  setBankCommissionForm({
                    date: new Date().toISOString().split("T")[0],
                    bankName: "Ecobank",
                    commissionType: "deposit",
                    numberOfTransactions: "",
                    totalTransactionValue: "",
                    commissionRate: "",
                    commissionAmount: "",
                    commissionReceived: false,
                    paymentDate: "",
                    balance: "",
                    remarks: "",
                  });
                  setActiveForm(null);
                } catch (error) {
                  alert("Error: " + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bcDate">Date *</Label>
                  <Input
                    id="bcDate"
                    type="date"
                    value={bankCommissionForm.date}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bcBankName">Bank Name *</Label>
                  <Select
                    id="bcBankName"
                    value={bankCommissionForm.bankName}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, bankName: e.target.value })}
                    required
                  >
                    <option value="Ecobank">Ecobank</option>
                    <option value="Fidelity">Fidelity</option>
                    <option value="First Bank">First Bank</option>
                    <option value="GCB">GCB</option>
                    <option value="Others">Others</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bcCommissionType">Commission Type *</Label>
                  <Select
                    id="bcCommissionType"
                    value={bankCommissionForm.commissionType}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, commissionType: e.target.value })}
                    required
                  >
                    <option value="deposit">Deposit</option>
                    <option value="withdrawal">Withdrawal</option>
                    <option value="transfer">Transfer</option>
                    <option value="standing_order">Standing Order</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bcNumberOfTransactions">Number of Transactions *</Label>
                  <Input
                    id="bcNumberOfTransactions"
                    type="number"
                    value={bankCommissionForm.numberOfTransactions}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, numberOfTransactions: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bcTotalValue">Total Transaction Value (GHS) *</Label>
                  <Input
                    id="bcTotalValue"
                    type="number"
                    step="0.01"
                    value={bankCommissionForm.totalTransactionValue}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, totalTransactionValue: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bcCommissionRate">Commission Rate (%)</Label>
                  <Input
                    id="bcCommissionRate"
                    type="number"
                    step="0.01"
                    value={bankCommissionForm.commissionRate}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, commissionRate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bcCommissionAmount">Commission Amount (GHS) *</Label>
                  <Input
                    id="bcCommissionAmount"
                    type="number"
                    step="0.01"
                    value={bankCommissionForm.commissionAmount}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, commissionAmount: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bcPaymentDate">Payment Date</Label>
                  <Input
                    id="bcPaymentDate"
                    type="date"
                    value={bankCommissionForm.paymentDate}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, paymentDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bcBalance">Balance (GHS)</Label>
                  <Input
                    id="bcBalance"
                    type="number"
                    step="0.01"
                    value={bankCommissionForm.balance}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, balance: e.target.value })}
                  />
                </div>
                <div className="space-y-2 flex items-center">
                  <input
                    type="checkbox"
                    id="bcCommissionReceived"
                    checked={bankCommissionForm.commissionReceived}
                    onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, commissionReceived: e.target.checked })}
                    className="mr-2"
                  />
                  <Label htmlFor="bcCommissionReceived">Commission Received</Label>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bcRemarks">Remarks</Label>
                <Input
                  id="bcRemarks"
                  value={bankCommissionForm.remarks}
                  onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Commission"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "momo_commission" && (
        <Card>
          <CardHeader>
            <CardTitle>MoMo E-Cash Commissions</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  await commissionService.createMoMoCommission({
                    businessId,
                    branchId,
                    ...momoCommissionForm,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("MoMo commission recorded successfully!");
                  setMomoCommissionForm({
                    date: new Date().toISOString().split("T")[0],
                    provider: "MTN",
                    commissionType: "cash_in",
                    numberOfTransactions: "",
                    totalTransactionValue: "",
                    commissionRate: "",
                    commissionEarned: "",
                    commissionPaymentType: "physical",
                    balance: "",
                    remarks: "",
                  });
                  setActiveForm(null);
                } catch (error) {
                  alert("Error: " + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcDate">Date *</Label>
                  <Input
                    id="mcDate"
                    type="date"
                    value={momoCommissionForm.date}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcProvider">Provider *</Label>
                  <Select
                    id="mcProvider"
                    value={momoCommissionForm.provider}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, provider: e.target.value })}
                    required
                  >
                    <option value="MTN">MTN</option>
                    <option value="Vodafone">Vodafone</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcCommissionType">Commission Type *</Label>
                  <Select
                    id="mcCommissionType"
                    value={momoCommissionForm.commissionType}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, commissionType: e.target.value })}
                    required
                  >
                    <option value="cash_in">Cash-In</option>
                    <option value="cash_out">Cash-Out</option>
                    <option value="transfer">Transfer</option>
                    <option value="bill_payment">Bill Payment</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcNumberOfTransactions">Number of Transactions *</Label>
                  <Input
                    id="mcNumberOfTransactions"
                    type="number"
                    value={momoCommissionForm.numberOfTransactions}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, numberOfTransactions: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcTotalValue">Total Transaction Value (GHS) *</Label>
                  <Input
                    id="mcTotalValue"
                    type="number"
                    step="0.01"
                    value={momoCommissionForm.totalTransactionValue}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, totalTransactionValue: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcCommissionRate">Commission Rate (%)</Label>
                  <Input
                    id="mcCommissionRate"
                    type="number"
                    step="0.01"
                    value={momoCommissionForm.commissionRate}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, commissionRate: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcCommissionEarned">Commission Earned (GHS) *</Label>
                  <Input
                    id="mcCommissionEarned"
                    type="number"
                    step="0.01"
                    value={momoCommissionForm.commissionEarned}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, commissionEarned: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="mcPaymentType">Commission Payment Type *</Label>
                  <Select
                    id="mcPaymentType"
                    value={momoCommissionForm.commissionPaymentType}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, commissionPaymentType: e.target.value })}
                    required
                  >
                    <option value="physical">Physical</option>
                    <option value="ecash">E-Cash</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mcBalance">Balance (GHS)</Label>
                  <Input
                    id="mcBalance"
                    type="number"
                    step="0.01"
                    value={momoCommissionForm.balance}
                    onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, balance: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="mcRemarks">Remarks</Label>
                <Input
                  id="mcRemarks"
                  value={momoCommissionForm.remarks}
                  onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Commission"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "sim_sale" && (
        <Card>
          <CardHeader>
            <CardTitle>SIM Sales</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const totalAmount = parseFloat(simSaleForm.quantity || 0) * parseFloat(simSaleForm.unitPrice || 0);
                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  await simSaleService.create({
                    businessId,
                    branchId,
                    ...simSaleForm,
                    totalAmount: totalAmount || simSaleForm.totalAmount,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("SIM sale recorded successfully!");
                  setSimSaleForm({
                    date: new Date().toISOString().split("T")[0],
                    provider: "MTN",
                    simType: "regular",
                    customerName: "",
                    customerNumber: "",
                    customerGhanaCard: "",
                    quantity: "",
                    unitPrice: "",
                    totalAmount: "",
                    paymentMethod: "cash",
                    registrationStatus: "registered",
                    agentCommission: "",
                    balance: "",
                    remarks: "",
                  });
                  setActiveForm(null);
                } catch (error) {
                  alert("Error: " + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simDate">Date *</Label>
                  <Input
                    id="simDate"
                    type="date"
                    value={simSaleForm.date}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="simProvider">Provider *</Label>
                  <Select
                    id="simProvider"
                    value={simSaleForm.provider}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, provider: e.target.value })}
                    required
                  >
                    <option value="MTN">MTN</option>
                    <option value="Vodafone">Vodafone</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simType">SIM Type *</Label>
                  <Select
                    id="simType"
                    value={simSaleForm.simType}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, simType: e.target.value })}
                    required
                  >
                    <option value="regular">Regular</option>
                    <option value="data">Data</option>
                    <option value="combo">Combo</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="simCustomerName">Customer Name *</Label>
                  <Input
                    id="simCustomerName"
                    value={simSaleForm.customerName}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, customerName: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simCustomerNumber">Customer Phone *</Label>
                  <Input
                    id="simCustomerNumber"
                    type="tel"
                    value={simSaleForm.customerNumber}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, customerNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="simGhanaCard">Customer Ghana Card *</Label>
                  <Input
                    id="simGhanaCard"
                    value={simSaleForm.customerGhanaCard}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, customerGhanaCard: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simQuantity">Quantity *</Label>
                  <Input
                    id="simQuantity"
                    type="number"
                    value={simSaleForm.quantity}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, quantity: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="simUnitPrice">Unit Price (GHS) *</Label>
                  <Input
                    id="simUnitPrice"
                    type="number"
                    step="0.01"
                    value={simSaleForm.unitPrice}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, unitPrice: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simTotalAmount">Total Amount (GHS)</Label>
                  <Input
                    id="simTotalAmount"
                    type="number"
                    step="0.01"
                    value={simSaleForm.totalAmount || (parseFloat(simSaleForm.quantity || 0) * parseFloat(simSaleForm.unitPrice || 0))}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="simPaymentMethod">Payment Method *</Label>
                  <Select
                    id="simPaymentMethod"
                    value={simSaleForm.paymentMethod}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, paymentMethod: e.target.value })}
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="momo">MoMo</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simRegistrationStatus">Registration Status *</Label>
                  <Select
                    id="simRegistrationStatus"
                    value={simSaleForm.registrationStatus}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, registrationStatus: e.target.value })}
                    required
                  >
                    <option value="registered">Registered</option>
                    <option value="unregistered">Unregistered</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="simAgentCommission">Agent Commission (GHS)</Label>
                  <Input
                    id="simAgentCommission"
                    type="number"
                    step="0.01"
                    value={simSaleForm.agentCommission}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, agentCommission: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="simBalance">Balance (GHS)</Label>
                  <Input
                    id="simBalance"
                    type="number"
                    step="0.01"
                    value={simSaleForm.balance}
                    onChange={(e) => setSimSaleForm({ ...simSaleForm, balance: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="simRemarks">Remarks</Label>
                <Input
                  id="simRemarks"
                  value={simSaleForm.remarks}
                  onChange={(e) => setSimSaleForm({ ...simSaleForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Sale"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "expense" && (
        <Card>
          <CardHeader>
            <CardTitle>Expenses & Petty Cash</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  await expenseService.create({
                    businessId,
                    branchId,
                    ...expenseForm,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("Expense recorded successfully!");
                  setExpenseForm({
                    date: new Date().toISOString().split("T")[0],
                    expenseCategory: "transport",
                    description: "",
                    quantity: "",
                    unitPrice: "",
                    amountPaid: "",
                    amountReceived: "",
                    paymentMethod: "cash",
                    paidTo: "",
                    approvedBy: "",
                    receiptNumber: "",
                    attachmentUrl: "",
                    pettyCashBalance: "",
                    remarks: "",
                  });
                  setActiveForm(null);
                } catch (error) {
                  alert("Error: " + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expDate">Date *</Label>
                  <Input
                    id="expDate"
                    type="date"
                    value={expenseForm.date}
                    onChange={(e) => setExpenseForm({ ...expenseForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expCategory">Expense Category *</Label>
                  <Select
                    id="expCategory"
                    value={expenseForm.expenseCategory}
                    onChange={(e) => setExpenseForm({ ...expenseForm, expenseCategory: e.target.value })}
                    required
                  >
                    <option value="transport">Transport</option>
                    <option value="airtime">Airtime</option>
                    <option value="stationery">Stationery</option>
                    <option value="utilities">Utilities</option>
                    <option value="rent">Rent</option>
                    <option value="salaries">Salaries</option>
                    <option value="repairs">Repairs</option>
                    <option value="maintenance">Maintenance</option>
                    <option value="other">Other</option>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expDescription">Description *</Label>
                <Input
                  id="expDescription"
                  value={expenseForm.description}
                  onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })}
                  required
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expQuantity">Quantity</Label>
                  <Input
                    id="expQuantity"
                    type="number"
                    value={expenseForm.quantity}
                    onChange={(e) => setExpenseForm({ ...expenseForm, quantity: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expUnitPrice">Unit Price (GHS)</Label>
                  <Input
                    id="expUnitPrice"
                    type="number"
                    step="0.01"
                    value={expenseForm.unitPrice}
                    onChange={(e) => setExpenseForm({ ...expenseForm, unitPrice: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expAmountPaid">Amount Paid (GHS)</Label>
                  <Input
                    id="expAmountPaid"
                    type="number"
                    step="0.01"
                    value={expenseForm.amountPaid}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amountPaid: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expAmountReceived">Amount Received (GHS) - Petty Cash Replenishment</Label>
                  <Input
                    id="expAmountReceived"
                    type="number"
                    step="0.01"
                    value={expenseForm.amountReceived}
                    onChange={(e) => setExpenseForm({ ...expenseForm, amountReceived: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expPaymentMethod">Payment Method *</Label>
                  <Select
                    id="expPaymentMethod"
                    value={expenseForm.paymentMethod}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paymentMethod: e.target.value })}
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="momo">MoMo</option>
                    <option value="bank_transfer">Bank Transfer</option>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expPaidTo">Paid To</Label>
                  <Input
                    id="expPaidTo"
                    value={expenseForm.paidTo}
                    onChange={(e) => setExpenseForm({ ...expenseForm, paidTo: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expApprovedBy">Approved By</Label>
                  <Input
                    id="expApprovedBy"
                    value={expenseForm.approvedBy}
                    onChange={(e) => setExpenseForm({ ...expenseForm, approvedBy: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expReceiptNumber">Receipt Number</Label>
                  <Input
                    id="expReceiptNumber"
                    value={expenseForm.receiptNumber}
                    onChange={(e) => setExpenseForm({ ...expenseForm, receiptNumber: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="expAttachmentUrl">Attachment URL</Label>
                  <Input
                    id="expAttachmentUrl"
                    value={expenseForm.attachmentUrl}
                    onChange={(e) => setExpenseForm({ ...expenseForm, attachmentUrl: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="expPettyCashBalance">Petty Cash Balance (GHS)</Label>
                  <Input
                    id="expPettyCashBalance"
                    type="number"
                    step="0.01"
                    value={expenseForm.pettyCashBalance}
                    onChange={(e) => setExpenseForm({ ...expenseForm, pettyCashBalance: e.target.value })}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="expRemarks">Remarks</Label>
                <Input
                  id="expRemarks"
                  value={expenseForm.remarks}
                  onChange={(e) => setExpenseForm({ ...expenseForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Expense"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "general_commission" && (
        <Card>
          <CardHeader>
            <CardTitle>General Daily Commission</CardTitle>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const total = parseFloat(generalCommissionForm.mtn33PhysicalCash || 0) +
                    parseFloat(generalCommissionForm.mtn33Ecash || 0) +
                    parseFloat(generalCommissionForm.mtn34PhysicalCash || 0) +
                    parseFloat(generalCommissionForm.mtn34Ecash || 0) +
                    parseFloat(generalCommissionForm.vodafonePhysicalCash || 0) +
                    parseFloat(generalCommissionForm.vodafoneEcash || 0) +
                    parseFloat(generalCommissionForm.airtelTigoPhysicalCash || 0) +
                    parseFloat(generalCommissionForm.airtelTigoEcash || 0) +
                    parseFloat(generalCommissionForm.telecelPhysicalCash || 0) +
                    parseFloat(generalCommissionForm.telecelEcash || 0) +
                    parseFloat(generalCommissionForm.ecobankCommission || 0) +
                    parseFloat(generalCommissionForm.fidelityCommission || 0) +
                    parseFloat(generalCommissionForm.firstBankCommission || 0) +
                    parseFloat(generalCommissionForm.gcbCommission || 0);

                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  await generalDailyCommissionService.create({
                    businessId,
                    branchId,
                    ...generalCommissionForm,
                    totalBalance: total || generalCommissionForm.totalBalance,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("General daily commission recorded successfully!");
                  setGeneralCommissionForm({
                    date: new Date().toISOString().split("T")[0],
                    description: "",
                    mtn33PhysicalCash: "",
                    mtn33Ecash: "",
                    mtn34PhysicalCash: "",
                    mtn34Ecash: "",
                    vodafonePhysicalCash: "",
                    vodafoneEcash: "",
                    airtelTigoPhysicalCash: "",
                    airtelTigoEcash: "",
                    telecelPhysicalCash: "",
                    telecelEcash: "",
                    ecobankCommission: "",
                    fidelityCommission: "",
                    firstBankCommission: "",
                    gcbCommission: "",
                    totalBalance: "",
                    remarks: "",
                  });
                  setActiveForm(null);
                } catch (error) {
                  alert("Error: " + error.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gcDate">Date *</Label>
                  <Input
                    id="gcDate"
                    type="date"
                    value={generalCommissionForm.date}
                    onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcDescription">Description</Label>
                  <Input
                    id="gcDescription"
                    value={generalCommissionForm.description}
                    onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, description: e.target.value })}
                  />
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">MTN Commissions</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mtn33Physical">MTN 33 Physical Cash (GHS)</Label>
                    <Input
                      id="mtn33Physical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn33PhysicalCash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, mtn33PhysicalCash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtn33Ecash">MTN 33 E-Cash (GHS)</Label>
                    <Input
                      id="mtn33Ecash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn33Ecash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, mtn33Ecash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtn34Physical">MTN 34 Physical Cash (GHS)</Label>
                    <Input
                      id="mtn34Physical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn34PhysicalCash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, mtn34PhysicalCash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtn34Ecash">MTN 34 E-Cash (GHS)</Label>
                    <Input
                      id="mtn34Ecash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn34Ecash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, mtn34Ecash: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Other Provider Commissions</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="vodafonePhysical">Vodafone Physical Cash (GHS)</Label>
                    <Input
                      id="vodafonePhysical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.vodafonePhysicalCash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, vodafonePhysicalCash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vodafoneEcash">Vodafone E-Cash (GHS)</Label>
                    <Input
                      id="vodafoneEcash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.vodafoneEcash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, vodafoneEcash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="airtelTigoPhysical">AirtelTigo Physical Cash (GHS)</Label>
                    <Input
                      id="airtelTigoPhysical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.airtelTigoPhysicalCash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, airtelTigoPhysicalCash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="airtelTigoEcash">AirtelTigo E-Cash (GHS)</Label>
                    <Input
                      id="airtelTigoEcash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.airtelTigoEcash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, airtelTigoEcash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telecelPhysical">Telecel Physical Cash (GHS)</Label>
                    <Input
                      id="telecelPhysical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.telecelPhysicalCash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, telecelPhysicalCash: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telecelEcash">Telecel E-Cash (GHS)</Label>
                    <Input
                      id="telecelEcash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.telecelEcash}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, telecelEcash: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Bank Commissions</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ecobankCommission">Ecobank Commission (GHS)</Label>
                    <Input
                      id="ecobankCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.ecobankCommission}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, ecobankCommission: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fidelityCommission">Fidelity Commission (GHS)</Label>
                    <Input
                      id="fidelityCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.fidelityCommission}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, fidelityCommission: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firstBankCommission">First Bank Commission (GHS)</Label>
                    <Input
                      id="firstBankCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.firstBankCommission}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, firstBankCommission: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gcbCommission">GCB Commission (GHS)</Label>
                    <Input
                      id="gcbCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.gcbCommission}
                      onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, gcbCommission: e.target.value })}
                    />
                  </div>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gcTotalBalance">Total Balance (GHS)</Label>
                  <Input
                    id="gcTotalBalance"
                    type="number"
                    step="0.01"
                    value={generalCommissionForm.totalBalance || (
                      parseFloat(generalCommissionForm.mtn33PhysicalCash || 0) +
                      parseFloat(generalCommissionForm.mtn33Ecash || 0) +
                      parseFloat(generalCommissionForm.mtn34PhysicalCash || 0) +
                      parseFloat(generalCommissionForm.mtn34Ecash || 0) +
                      parseFloat(generalCommissionForm.vodafonePhysicalCash || 0) +
                      parseFloat(generalCommissionForm.vodafoneEcash || 0) +
                      parseFloat(generalCommissionForm.airtelTigoPhysicalCash || 0) +
                      parseFloat(generalCommissionForm.airtelTigoEcash || 0) +
                      parseFloat(generalCommissionForm.telecelPhysicalCash || 0) +
                      parseFloat(generalCommissionForm.telecelEcash || 0) +
                      parseFloat(generalCommissionForm.ecobankCommission || 0) +
                      parseFloat(generalCommissionForm.fidelityCommission || 0) +
                      parseFloat(generalCommissionForm.firstBankCommission || 0) +
                      parseFloat(generalCommissionForm.gcbCommission || 0)
                    )}
                    readOnly
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gcRemarks">Remarks</Label>
                <Input
                  id="gcRemarks"
                  value={generalCommissionForm.remarks}
                  onChange={(e) => setGeneralCommissionForm({ ...generalCommissionForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={loading}>
                  {loading ? "Recording..." : "Record Commission"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

