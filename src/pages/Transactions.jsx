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
  const { userData } = useAuth();
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
  });

  useEffect(() => {
    if (userData?.branchId) {
      loadBranchData();
      loadMerchantSims();
      loadCurrentBalances();
    }
  }, [userData?.branchId]);

  const loadBranchData = async () => {
    try {
      const branch = await branchService.getById(userData.branchId);
      setBranchData(branch);
    } catch (error) {
      console.error("Error loading branch:", error);
    }
  };

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
      setShowAddMerchantSim(false);
      alert("Merchant SIM added successfully!");
    } catch (error) {
      alert("Error adding merchant SIM: " + error.message);
    }
  };

  const loadCurrentBalances = async () => {
    try {
      const today = new Date();
      const float = await dailyFloatService.getByBranchAndDate(userData.branchId, today);
      if (float) {
        const transactions = await transactionService.getTodayTransactions(userData.branchId, userData.userId, userData.role);
        
        let physicalCash = parseFloat(float.openingPhysicalCash || 0);
        let mtnEcash = parseFloat(float.openingMtnEcash || 0);
        let vodafoneEcash = parseFloat(float.openingVodafoneEcash || 0);
        let airtelTigoEcash = parseFloat(float.openingAirtelTigoEcash || 0);
        let telecelEcash = parseFloat(float.openingTelecelEcash || 0);

        transactions.momo.forEach((t) => {
          const amount = parseFloat(t.amount || 0);
          // Cash In: Customer gives physical cash → Agent credits customer E-Cash
          // Physical Cash increases, E-Cash decreases
          if (t.transactionType === "cash_in") {
            physicalCash += amount; // Agent receives physical cash
            if (t.provider === "MTN") mtnEcash -= amount; // Agent's E-Cash decreases
            else if (t.provider === "Vodafone") vodafoneEcash -= amount;
            else if (t.provider === "AirtelTigo") airtelTigoEcash -= amount;
            else if (t.provider === "Telecel") telecelEcash -= amount;
          } 
          // Cash Out: Customer receives physical cash → Customer credits agent E-Cash
          // Physical Cash decreases, E-Cash increases
          else if (t.transactionType === "cash_out") {
            physicalCash -= amount; // Agent gives physical cash
            if (t.provider === "MTN") mtnEcash += amount; // Agent's E-Cash increases
            else if (t.provider === "Vodafone") vodafoneEcash += amount;
            else if (t.provider === "AirtelTigo") airtelTigoEcash += amount;
            else if (t.provider === "Telecel") telecelEcash += amount;
          }
        });

        setCurrentBalances({
          physicalCash,
          mtnEcash,
          vodafoneEcash,
          airtelTigoEcash,
          telecelEcash,
        });
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

  const getEcashBalance = (provider) => {
    const providerMap = {
      MTN: currentBalances.mtnEcash,
      Vodafone: currentBalances.vodafoneEcash,
      AirtelTigo: currentBalances.airtelTigoEcash,
      Telecel: currentBalances.telecelEcash,
    };
    return providerMap[provider] || 0;
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

  const handleMoMoSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      // Round to 2 decimal places to avoid floating point precision issues
      const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
      
      const amount = roundTo2(parseFloat(momoForm.amount || 0));
      const physicalBefore = roundTo2(parseFloat(momoForm.physicalCashBefore || currentBalances.physicalCash));
      const ecashBefore = roundTo2(parseFloat(momoForm.ecashBefore || getEcashBalance(momoForm.provider)));
      
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

      await transactionService.createMoMoTransaction({
        businessId: userData.businessId,
        branchId: userData.branchId,
        ...momoForm,
        agentNumber: momoForm.agentNumber || getAgentNumber(momoForm.provider),
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
        agentNumber: "",
        physicalCashBefore: "",
        physicalCashAfter: "",
        ecashBefore: "",
        ecashAfter: "",
        transactionReference: "",
        receiptNumber: "",
        remarks: "",
      });
      loadCurrentBalances();
      setActiveForm(null);
    } catch (error) {
      alert("Error recording transaction: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const [bankForm, setBankForm] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
    bankName: "Ecobank",
    transactionType: "deposit",
    customerName: "",
    customerNumber: "",
    accountNumber: "",
    accountName: "",
    amount: "",
    bankCharges: "",
    agentCommission: "",
    agentNumber: "",
    transactionReference: "",
    physicalCashBefore: "",
    physicalCashAfter: "",
    remarks: "",
  });

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
                    onChange={(e) => setMomoForm({ ...momoForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="time">Time *</Label>
                  <Input
                    id="time"
                    type="time"
                    value={momoForm.time}
                    onChange={(e) => setMomoForm({ ...momoForm, time: e.target.value })}
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
                    onChange={(e) =>
                      setMomoForm({ ...momoForm, transactionType: e.target.value })
                    }
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
                            const selectedSim = merchantSims.find(s => s.merchantSimId === e.target.value);
                            setMomoForm({ 
                              ...momoForm, 
                              merchantSimId: e.target.value,
                              merchantSimName: selectedSim?.simName || ""
                            });
                          }}
                          required
                        >
                          <option value="">Select Merchant SIM</option>
                          {merchantSims
                            .filter(sim => sim.provider === momoForm.provider)
                            .map((sim) => (
                              <option key={sim.merchantSimId} value={sim.merchantSimId}>
                                {sim.simName}
                              </option>
                            ))}
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
                    onChange={(e) => setMomoForm({ ...momoForm, amount: e.target.value })}
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
                    onChange={(e) => setMomoForm({ ...momoForm, charges: e.target.value })}
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
                    onChange={(e) =>
                      setMomoForm({ ...momoForm, commissionEarned: e.target.value })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="agentNumber">Agent Number *</Label>
                  <Input
                    id="agentNumber"
                    value={momoForm.agentNumber || getAgentNumber(momoForm.provider)}
                    onChange={(e) => setMomoForm({ ...momoForm, agentNumber: e.target.value })}
                    required
                    placeholder="Agent number for this provider"
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
                    value={momoForm.ecashBefore || getEcashBalance(momoForm.provider)}
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
                      const before = roundTo2(getEcashBalance(momoForm.provider));
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
                    onChange={(e) =>
                      setMomoForm({ ...momoForm, transactionReference: e.target.value })
                    }
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="receiptNumber">Receipt Number</Label>
                  <Input
                    id="receiptNumber"
                    value={momoForm.receiptNumber}
                    onChange={(e) => setMomoForm({ ...momoForm, receiptNumber: e.target.value })}
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

                  await transactionService.createBankTransaction({
                    businessId: userData.businessId,
                    branchId: userData.branchId,
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
                    transactionType: "deposit",
                    customerName: "",
                    customerNumber: "",
                    accountNumber: "",
                    accountName: "",
                    amount: "",
                    bankCharges: "",
                    agentCommission: "",
                    agentNumber: "",
                    transactionReference: "",
                    physicalCashBefore: "",
                    physicalCashAfter: "",
                    remarks: "",
                  });
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
                    onChange={(e) => setBankForm({ ...bankForm, date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankTime">Time *</Label>
                  <Input
                    id="bankTime"
                    type="time"
                    value={bankForm.time}
                    onChange={(e) => setBankForm({ ...bankForm, time: e.target.value })}
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
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
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

              <div className="grid gap-4 md:grid-cols-2">
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
                <div className="space-y-2">
                  <Label htmlFor="bankCharges">Bank Charges (GHS)</Label>
                  <Input
                    id="bankCharges"
                    type="number"
                    step="0.01"
                    value={bankForm.bankCharges}
                    onChange={(e) => setBankForm({ ...bankForm, bankCharges: e.target.value })}
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankAgentCommission">Agent Commission (GHS)</Label>
                  <Input
                    id="bankAgentCommission"
                    type="number"
                    step="0.01"
                    value={bankForm.agentCommission}
                    onChange={(e) => setBankForm({ ...bankForm, agentCommission: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="bankAgentNumber">Agent Number *</Label>
                  <Input
                    id="bankAgentNumber"
                    value={bankForm.agentNumber}
                    onChange={(e) => setBankForm({ ...bankForm, agentNumber: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="bankTransactionReference">Transaction Reference *</Label>
                  <Input
                    id="bankTransactionReference"
                    value={bankForm.transactionReference}
                    onChange={(e) => setBankForm({ ...bankForm, transactionReference: e.target.value })}
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
                  await commissionService.createBankCommission({
                    businessId: userData.businessId,
                    branchId: userData.branchId,
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
                  await commissionService.createMoMoCommission({
                    businessId: userData.businessId,
                    branchId: userData.branchId,
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
                  await simSaleService.create({
                    businessId: userData.businessId,
                    branchId: userData.branchId,
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
                  await expenseService.create({
                    businessId: userData.businessId,
                    branchId: userData.branchId,
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

                  await generalDailyCommissionService.create({
                    businessId: userData.businessId,
                    branchId: userData.branchId,
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

