import React, { useState, useEffect } from "react";
import { transactionService, commissionService, expenseService, simSaleService, generalDailyCommissionService, branchService, dailyFloatService, disbursementService, activityLogService, topUpService, bankService, commissionConfigService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Plus, ArrowUpCircle } from "lucide-react";
import TopUpModal from "../components/TopUpModal";
import { collection, query, where, getDocs, Timestamp } from "firebase/firestore";
import { db } from "../lib/firebase";

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
    merchantSimEcash: {},
    merchantSimPhysicalCash: {},
    bankBalances: {},
  });
  const [simHasPhysicalFloat, setSimHasPhysicalFloat] = useState({});
  const [isFloatClosedToday, setIsFloatClosedToday] = useState(false);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [banks, setBanks] = useState([]);
  const [showAddBank, setShowAddBank] = useState(false);
  const [newBankName, setNewBankName] = useState("");

  // State for SIM Sales submenu (Airtime or SIM Sales) - must be declared before useEffect hooks that use it
  const [simSaleType, setSimSaleType] = useState(null); // "airtime" or "sim_sale"

  // Commission configuration loaded per branch (used to calculate all commissions consistently)
  const [commissionConfig, setCommissionConfig] = useState(null);
  const [commissionConfigLoading, setCommissionConfigLoading] = useState(false);

  useEffect(() => {
    if (!userData) return; // Wait for userData to load
    
    const branchId = selectedBranchId || userData?.branchId;
    const businessId = selectedBusinessId || userData?.businessId;
    
    if (branchId && businessId) {
      loadBranchData();
      loadMerchantSims();
      loadBanks();
      loadCurrentBalances();
      
      // Refresh balances every 30 seconds to get latest values
      const interval = setInterval(() => {
        loadCurrentBalances();
      }, 30000); // 30 seconds
      
      return () => clearInterval(interval);
    }
  }, [userData, userData?.branchId, userData?.businessId, selectedBranchId, selectedBusinessId]);

  // Load commission configuration for current branch
  useEffect(() => {
    const loadConfig = async () => {
      const branchId = selectedBranchId || userData?.branchId;
      const businessId = selectedBusinessId || userData?.businessId;
      if (!branchId || !businessId) {
        setCommissionConfig(null);
        return;
      }
      try {
        setCommissionConfigLoading(true);
        const configDoc = await commissionConfigService.getByBranch(branchId);
        setCommissionConfig(configDoc?.activeConfig || null);
      } catch (error) {
        console.error("Error loading commission configuration:", error);
      } finally {
        setCommissionConfigLoading(false);
      }
    };

    if (userData) {
      loadConfig();
    }
  }, [userData, selectedBranchId, selectedBusinessId]);

  // Refresh balances when bank form or airtime form is opened to show latest values
  useEffect(() => {
    if (activeForm === "bank" || (activeForm === "sim_sale" && simSaleType === "airtime")) {
      loadCurrentBalances();
    }
  }, [activeForm, simSaleType]);

  // Load and auto-populate General Daily Commission when form opens
  useEffect(() => {
    if (activeForm === "general_commission") {
      loadGeneralDailyCommission();
    }
  }, [activeForm]);

  const loadGeneralDailyCommission = async () => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) return;

      const today = new Date().toISOString().split("T")[0];
      
      // Get today's transactions
      const transactions = await transactionService.getTodayTransactions(branchId, userData?.userId, userData?.role);
      
      // Get today's bank commissions
      let bankCommissions = [];
      try {
        const bankCommQuery = query(
          collection(db, "bank_commissions"),
          where("branchId", "==", branchId),
          where("date", "==", today)
        );
        const bankCommSnapshot = await getDocs(bankCommQuery).catch(() => ({ docs: [] }));
        bankCommissions = bankCommSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (error) {
        console.error("Error loading bank commissions:", error);
      }
      
      // Initialize form values
      const calculatedValues = {
        date: today,
        description: `System-calculated daily commissions for ${today}`,
        mtn33PhysicalCash: "0.00",
        mtn33Ecash: "0.00",
        mtn34PhysicalCash: "0.00",
        mtn34Ecash: "0.00",
        airtelTigoPhysicalCash: "0.00",
        airtelTigoEcash: "0.00",
        telecelPhysicalCash: "0.00",
        telecelEcash: "0.00",
        ecobankCommission: "0.00",
        fidelityCommission: "0.00",
        firstBankCommission: "0.00",
        gcbCommission: "0.00",
        totalBalance: "0.00",
        remarks: "Auto-calculated from system transactions (read-only)",
      };

      // Calculate MoMo commissions by merchant SIM
      const commissionsBySim = {};
      const mtnCommissions = [];
      let airtelTigoTotal = 0;
      let telecelTotal = 0;

      if (transactions?.momo && Array.isArray(transactions.momo)) {
        transactions.momo.forEach((t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          const totalCommission = commission + charges;

          if (t.merchantSimId) {
            if (!commissionsBySim[t.merchantSimId]) {
              commissionsBySim[t.merchantSimId] = { total: 0, simName: t.merchantSimName || "" };
            }
            commissionsBySim[t.merchantSimId].total += totalCommission;
          }

          if (t.provider === "MTN") {
            mtnCommissions.push(totalCommission);
          } else if (t.provider === "AirtelTigo") {
            airtelTigoTotal += totalCommission;
          } else if (t.provider === "Telecel" || t.provider === "Vodafone") {
            telecelTotal += totalCommission;
          }
        });
      }

      // Map merchant SIM commissions to form fields (try to match MTN33, MTN34, etc.)
      let mtn33Total = 0;
      let mtn34Total = 0;
      
      Object.keys(commissionsBySim).forEach(simId => {
        const simData = commissionsBySim[simId];
        const simName = (simData.simName || "").toUpperCase().replace(/\s+/g, "");
        const commission = simData.total;

        if (simName.includes("MTN33")) {
          mtn33Total += commission;
        } else if (simName.includes("MTN34")) {
          mtn34Total += commission;
        } else {
          // For other MTN SIMs, split equally or add to MTN33
          const sim = merchantSims.find(s => (s.merchantSimId || s.id) === simId);
          if (sim && sim.provider === "MTN") {
            mtn33Total += commission * 0.5;
            mtn34Total += commission * 0.5;
          }
        }
      });

      // If no SIM-specific commissions, split MTN total equally
      if (mtn33Total === 0 && mtn34Total === 0 && mtnCommissions.length > 0) {
        const mtnTotal = mtnCommissions.reduce((sum, c) => sum + c, 0);
        mtn33Total = mtnTotal * 0.5;
        mtn34Total = mtnTotal * 0.5;
      }

      calculatedValues.mtn33Ecash = mtn33Total.toFixed(2);
      calculatedValues.mtn34Ecash = mtn34Total.toFixed(2);
      calculatedValues.airtelTigoEcash = airtelTigoTotal.toFixed(2);
      calculatedValues.telecelEcash = telecelTotal.toFixed(2);
      const simCommissions = {};
      merchantSims.forEach((sim) => {
        const simId = sim.merchantSimId || sim.id;
        const data = commissionsBySim[simId];
        simCommissions[simId] = (data ? data.total : 0).toFixed(2);
      });
      calculatedValues.simCommissions = simCommissions;

      // Calculate bank commissions
      bankCommissions.forEach((comm) => {
        const amount = parseFloat(comm.commissionAmount || 0);
        const bankName = (comm.bankName || "").toLowerCase();
        
        if (bankName.includes("ecobank")) {
          calculatedValues.ecobankCommission = (parseFloat(calculatedValues.ecobankCommission) + amount).toFixed(2);
        } else if (bankName.includes("fidelity")) {
          calculatedValues.fidelityCommission = (parseFloat(calculatedValues.fidelityCommission) + amount).toFixed(2);
        } else if (bankName.includes("first")) {
          calculatedValues.firstBankCommission = (parseFloat(calculatedValues.firstBankCommission) + amount).toFixed(2);
        } else if (bankName.includes("gcb")) {
          calculatedValues.gcbCommission = (parseFloat(calculatedValues.gcbCommission) + amount).toFixed(2);
        }
      });

      // Calculate total
      const total = parseFloat(calculatedValues.mtn33PhysicalCash) +
        parseFloat(calculatedValues.mtn33Ecash) +
        parseFloat(calculatedValues.mtn34PhysicalCash) +
        parseFloat(calculatedValues.mtn34Ecash) +
        parseFloat(calculatedValues.airtelTigoPhysicalCash) +
        parseFloat(calculatedValues.airtelTigoEcash) +
        parseFloat(calculatedValues.telecelPhysicalCash) +
        parseFloat(calculatedValues.telecelEcash) +
        parseFloat(calculatedValues.ecobankCommission) +
        parseFloat(calculatedValues.fidelityCommission) +
        parseFloat(calculatedValues.firstBankCommission) +
        parseFloat(calculatedValues.gcbCommission);
      
      calculatedValues.totalBalance = total.toFixed(2);

      setGeneralCommissionForm(calculatedValues);
    } catch (error) {
      console.error("Error loading general daily commission:", error);
    }
  };

  // Initialize physical cash when airtime form opens
  useEffect(() => {
    if (activeForm === "sim_sale" && simSaleType === "airtime") {
      setAirtimeForm(prev => ({
        ...prev,
        physicalCashBefore: currentBalances.physicalCash.toFixed(2),
        physicalCashAfter: currentBalances.physicalCash.toFixed(2),
      }));
    }
  }, [activeForm, simSaleType, currentBalances.physicalCash]);

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
    pettyCashBalance: "",
    remarks: "",
  });

  // Categories that require quantity and unit price
  const categoriesRequiringQuantity = ["stationery", "airtime", "other"];

  // Load latest disbursement amount when expense form is opened
  useEffect(() => {
    const loadLatestDisbursement = async () => {
      if (activeForm === "expense") {
        const branchId = selectedBranchId || userData?.branchId;
        if (!branchId) {
          console.warn("Expenses: No branchId available");
          return;
        }

        try {
          console.log("Expenses: Loading latest disbursement for branch:", branchId);
          const latestDisbursement = await disbursementService.getLatestByBranch(branchId);
          console.log("Expenses: Latest disbursement:", latestDisbursement);
          
          if (latestDisbursement && latestDisbursement.amountReceived) {
            const amountReceived = latestDisbursement.amountReceived;
            console.log("Expenses: Setting amountReceived to:", amountReceived);
            setExpenseForm(prev => ({
              ...prev,
              amountReceived: typeof amountReceived === 'number' ? amountReceived.toString() : amountReceived,
            }));
          } else {
            console.warn("Expenses: No disbursement found or amountReceived is missing");
            setExpenseForm(prev => ({
              ...prev,
              amountReceived: "",
            }));
          }
        } catch (error) {
          console.error("Error loading latest disbursement:", error);
          setExpenseForm(prev => ({
            ...prev,
            amountReceived: "",
          }));
        }
      }
    };
    loadLatestDisbursement();
  }, [activeForm, selectedBranchId, userData?.branchId]);

  // Auto-calculate petty cash balance when amount paid changes or expenses are loaded
  useEffect(() => {
    const calculatePettyCashBalance = async () => {
      if (activeForm === "expense" && expenseForm.amountReceived) {
        const branchId = selectedBranchId || userData?.branchId;
        if (!branchId) return;

        try {
          // Get all expenses for this branch to calculate total spent
          const allExpenses = await expenseService.getByBranch(branchId);
          const totalSpent = allExpenses.reduce((sum, e) => {
            const amountPaid = parseFloat(e.amountPaid || 0);
            return sum + (isNaN(amountPaid) ? 0 : amountPaid);
          }, 0);

          const received = parseFloat(expenseForm.amountReceived || 0);
          const balance = received - totalSpent;

          setExpenseForm(prev => ({
            ...prev,
            pettyCashBalance: balance.toFixed(2),
          }));
        } catch (error) {
          console.error("Error calculating petty cash balance:", error);
          // Fallback to simple calculation if expense fetch fails
          const received = parseFloat(expenseForm.amountReceived || 0);
          const paid = parseFloat(expenseForm.amountPaid || 0);
          const balance = received - paid;
          setExpenseForm(prev => ({
            ...prev,
            pettyCashBalance: balance.toFixed(2),
          }));
        }
      }
    };

    calculatePettyCashBalance();
  }, [activeForm, expenseForm.amountReceived, expenseForm.amountPaid, selectedBranchId, userData?.branchId]);

  const [bankCommissionForm, setBankCommissionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    bankName: "Ecobank",
    commissionType: "All", // Default to "All" for non-Ecobank banks
    commissionAmount: "",
    commissionReceived: false,
    remarks: "",
  });

  const [momoCommissionForm, setMomoCommissionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    provider: "",
    merchantSimId: "",
    merchantSimName: "",
    commissionType: "",
    commissionRate: "",
    commissionEarned: "",
    remarks: "",
  });
  
  const [momoCommissions, setMomoCommissions] = useState([]); // Store multiple commissions

  // Load bank transactions for commission form
  const loadBankTransactionsForCommission = async (bankName, commissionType, date) => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) return { count: 0, total: 0 };
      
      // Query bank transactions for the specific date
      const dateString = typeof date === 'string' ? date : new Date(date).toISOString().split("T")[0];
      
      // Try to query by string date first
      let bankTransactions = [];
      try {
        const q = query(
          collection(db, "bank_transactions"),
          where("branchId", "==", branchId),
          where("date", "==", dateString)
        );
        const snapshot = await getDocs(q);
        bankTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (stringError) {
        // If string query fails, try Timestamp query
        try {
          const dateStart = new Date(dateString);
          dateStart.setHours(0, 0, 0, 0);
          const dateEnd = new Date(dateString);
          dateEnd.setHours(23, 59, 59, 999);
          
          const q = query(
            collection(db, "bank_transactions"),
            where("branchId", "==", branchId),
            where("date", ">=", Timestamp.fromDate(dateStart)),
            where("date", "<=", Timestamp.fromDate(dateEnd))
          );
          const snapshot = await getDocs(q);
          bankTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (timestampError) {
          console.error("Error loading bank transactions:", timestampError);
          return { count: 0, total: 0 };
        }
      }
      
      if (!bankTransactions || bankTransactions.length === 0) {
        return { count: 0, total: 0 };
      }
      
      // Filter by bank name and commission type (if not "All")
      const filtered = bankTransactions.filter(t => {
        const matchesBank = t.bankName === bankName;
        const matchesType = commissionType === "All" || t.transactionType === commissionType;
        return matchesBank && matchesType;
      });
      
      const count = filtered.length;
      const total = filtered.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      
      return { count, total };
    } catch (error) {
      console.error("Error loading bank transactions:", error);
      return { count: 0, total: 0 };
    }
  };

  // Auto-populate logic removed since numberOfTransactions and totalTransactionValue fields were removed
  useEffect(() => {
    // Fields removed per requirements
  }, []);

  // Load MoMo transactions for commission form
  const loadMoMoTransactionsForCommission = async (provider, merchantSimId, commissionType, date) => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) return { count: 0, total: 0 };
      
      // Use getMoMoTransactions with the specific date
      const dateObj = typeof date === 'string' ? new Date(date) : date;
      const momoTransactions = await transactionService.getMoMoTransactions(
        branchId,
        dateObj,
        1000, // Large limit to get all transactions for the date
        null, // Admin view for commission calculation
        "admin"
      );
      
      if (!momoTransactions || !Array.isArray(momoTransactions) || momoTransactions.length === 0) {
        return { count: 0, total: 0 };
      }
      
      // Filter by provider, merchant SIM, and commission type
      const filtered = momoTransactions.filter(t => {
        const matchesProvider = t.provider === provider;
        const matchesSim = merchantSimId ? t.merchantSimId === merchantSimId : true;
        const matchesType = t.transactionType === commissionType;
        return matchesProvider && matchesSim && matchesType;
      });
      
      const count = filtered.length;
      const total = filtered.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
      
      return { count, total };
    } catch (error) {
      console.error("Error loading MoMo transactions:", error);
      return { count: 0, total: 0 };
    }
  };

  // Auto-calculate commission rate from commission earned
  // Note: Rate calculation requires total transaction value, but since we removed that field,
  // we'll calculate rate based on a placeholder or make it optional
  // For now, we'll leave rate as manual entry since we don't have transaction value
  useEffect(() => {
    // Rate calculation removed since totalTransactionValue field was removed
    // Users can manually enter rate if needed, or it can be calculated separately
  }, []);

  // Helper function to get businessId and branchId with fallbacks
  const getBusinessAndBranchIds = () => {
    // For IT admins, use selected IDs; for others, use userData IDs
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

  const loadBanks = async () => {
    try {
      const businessId = selectedBusinessId || userData?.businessId;
      if (!businessId) return;
      const list = await bankService.getByBusinessId(businessId);
      setBanks(list || []);
    } catch (error) {
      console.error("Error loading banks:", error);
    }
  };

  const loadMerchantSims = async () => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      const businessId = selectedBusinessId || userData?.businessId;
      if (!branchId && !businessId) {
        console.warn("No branchId or businessId available to load merchant SIMs");
        return;
      }
      const sims = await merchantSimService.getByBranch(branchId, businessId);
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
      const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userData?.userId);
      if (float) {
        const isClosed = float.closingPhysicalCash && float.closingPhysicalCash !== "";
        const unlockedByItAdmin = float.unlockedByItAdmin === true;
        setIsFloatClosedToday(isClosed && !unlockedByItAdmin);
        if (isClosed && !unlockedByItAdmin) return;
        const transactions = await transactionService.getTodayTransactions(branchId, userData.userId, userData.role);
        
        let physicalCash = parseFloat(float.openingPhysicalCash || 0);
        const merchantSimBalances = {};
        if (float.openingMerchantSimEcash && typeof float.openingMerchantSimEcash === 'object') {
          Object.keys(float.openingMerchantSimEcash).forEach(simId => {
            merchantSimBalances[simId] = parseFloat(float.openingMerchantSimEcash[simId] || 0);
          });
        }
        const merchantSimPhysicalCash = {};
        const hasPhysicalFloat = {};
        if (float.openingMerchantSimPhysicalCash && typeof float.openingMerchantSimPhysicalCash === 'object') {
          Object.keys(float.openingMerchantSimPhysicalCash).forEach(simId => {
            merchantSimPhysicalCash[simId] = parseFloat(float.openingMerchantSimPhysicalCash[simId] || 0);
            hasPhysicalFloat[simId] = true;
          });
        }
        setSimHasPhysicalFloat(hasPhysicalFloat);

        const bankBalances = {};
        if (float.openingBankBalances && typeof float.openingBankBalances === 'object') {
          Object.keys(float.openingBankBalances).forEach((name) => {
            bankBalances[name] = parseFloat(float.openingBankBalances[name] || 0);
          });
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
            
            if (t.transactionType === "cash_in" || t.transactionType === "deposit") {
              if (t.merchantSimId && hasPhysicalFloat[t.merchantSimId]) {
                if (merchantSimPhysicalCash[t.merchantSimId] === undefined) merchantSimPhysicalCash[t.merchantSimId] = parseFloat(float.openingMerchantSimPhysicalCash?.[t.merchantSimId] || 0);
                merchantSimPhysicalCash[t.merchantSimId] += amount;
              } else {
                physicalCash += amount;
              }
              if (t.merchantSimId && merchantSimBalances.hasOwnProperty(t.merchantSimId)) {
                merchantSimBalances[t.merchantSimId] -= amount;
              } else {
                if (t.provider === "MTN") mtnEcash -= amount;
                else if (t.provider === "Vodafone") vodafoneEcash -= amount;
                else if (t.provider === "AirtelTigo") airtelTigoEcash -= amount;
                else if (t.provider === "Telecel") telecelEcash -= amount;
              }
            } else if (t.transactionType === "cash_out") {
              const useSimFloat = t.physicalCashSource === "sim_float" || (t.physicalCashSource !== "branch_opening" && t.merchantSimId && hasPhysicalFloat[t.merchantSimId]);
              if (useSimFloat && t.merchantSimId && (merchantSimPhysicalCash.hasOwnProperty(t.merchantSimId) || hasPhysicalFloat[t.merchantSimId])) {
                if (merchantSimPhysicalCash[t.merchantSimId] === undefined) merchantSimPhysicalCash[t.merchantSimId] = parseFloat(float.openingMerchantSimPhysicalCash?.[t.merchantSimId] || 0);
                merchantSimPhysicalCash[t.merchantSimId] -= amount;
              } else {
                physicalCash -= amount;
              }
              if (t.merchantSimId && merchantSimBalances.hasOwnProperty(t.merchantSimId)) {
                merchantSimBalances[t.merchantSimId] += amount;
              } else {
                if (t.provider === "MTN") mtnEcash += amount;
                else if (t.provider === "Vodafone") vodafoneEcash += amount;
                else if (t.provider === "AirtelTigo") airtelTigoEcash += amount;
                else if (t.provider === "Telecel") telecelEcash += amount;
              }
            }
          });
        }
        
        // Process bank transactions to update physical cash
        if (transactions?.bank && Array.isArray(transactions.bank)) {
          transactions.bank.forEach((t) => {
            const amount = parseFloat(t.amount || 0);
            if (isNaN(amount) || amount <= 0) return;
            
            // Deposit: Customer deposits money into bank account → Agent receives physical cash
            // Physical Cash increases
            if (t.transactionType === "deposit") {
              physicalCash += amount; // Agent receives physical cash
            } 
            // Withdrawal: Customer withdraws money from bank account → Agent gives physical cash
            // Physical Cash decreases
            else if (t.transactionType === "withdrawal") {
              physicalCash -= amount; // Agent gives physical cash
            }
          });
        }

        // Process SIM Sales (both regular SIM sales and airtime sales)
        try {
          const todayString = today.toISOString().split("T")[0];
          let simSalesQuery = query(
            collection(db, "sim_sales"),
            where("branchId", "==", branchId),
            where("date", "==", todayString)
          );
          
          // If user is not admin, filter by recordedBy
          if (userData.role !== "admin" && userData.role !== "branch_manager" && userData.role !== "it_admin" && userData.userId) {
            simSalesQuery = query(
              collection(db, "sim_sales"),
              where("branchId", "==", branchId),
              where("date", "==", todayString),
              where("recordedBy", "==", userData.userId)
            );
          }
          
          const simSalesSnapshot = await getDocs(simSalesQuery).catch(() => ({ docs: [] }));
          const simSales = simSalesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          simSales.forEach((sale) => {
            if (!sale.saleType || sale.saleType === "sim_sale") {
              const totalAmount = parseFloat(sale.totalAmount || 0);
              if (!isNaN(totalAmount) && totalAmount > 0 && sale.paymentMethod === "cash") {
                physicalCash += totalAmount;
              }
            } else if (sale.saleType === "bundle") {
              const amount = parseFloat(sale.amount || sale.totalAmount || 0);
              if (!isNaN(amount) && amount > 0) {
                if (sale.merchantSimId && hasPhysicalFloat[sale.merchantSimId]) {
                  if (merchantSimPhysicalCash[sale.merchantSimId] === undefined) {
                    merchantSimPhysicalCash[sale.merchantSimId] = parseFloat(
                      float.openingMerchantSimPhysicalCash?.[sale.merchantSimId] || 0
                    );
                  }
                  merchantSimPhysicalCash[sale.merchantSimId] += amount;
                } else {
                  physicalCash += amount;
                }
                if (sale.merchantSimId && merchantSimBalances.hasOwnProperty(sale.merchantSimId)) {
                  merchantSimBalances[sale.merchantSimId] -= amount;
                } else {
                  if (sale.provider === "MTN") mtnEcash -= amount;
                  else if (sale.provider === "Vodafone") vodafoneEcash -= amount;
                  else if (sale.provider === "AirtelTigo") airtelTigoEcash -= amount;
                  else if (sale.provider === "Telecel") telecelEcash -= amount;
                }
              }
            } else if (sale.saleType === "airtime") {
              const price = parseFloat(sale.price || 0);
              if (!isNaN(price) && price > 0) {
                // Decrease E-Cash for the merchant SIM
                if (sale.merchantSimId && merchantSimBalances.hasOwnProperty(sale.merchantSimId)) {
                  merchantSimBalances[sale.merchantSimId] -= price;
                } else {
                  // Fallback to provider-level tracking
                  if (sale.provider === "MTN") mtnEcash -= price;
                  else if (sale.provider === "Vodafone") vodafoneEcash -= price;
                  else if (sale.provider === "AirtelTigo") airtelTigoEcash -= price;
                }
                
                // If paid in cash, increase SIM physical cash when available, otherwise branch physical
                if (sale.paymentMethod === "cash") {
                  if (sale.merchantSimId && hasPhysicalFloat[sale.merchantSimId]) {
                    if (merchantSimPhysicalCash[sale.merchantSimId] === undefined) {
                      merchantSimPhysicalCash[sale.merchantSimId] = parseFloat(
                        float.openingMerchantSimPhysicalCash?.[sale.merchantSimId] || 0
                      );
                    }
                    merchantSimPhysicalCash[sale.merchantSimId] += price;
                  } else {
                    physicalCash += price;
                  }
                }
              }
            }
          });
        } catch (error) {
          console.error("Error loading SIM sales:", error);
        }

        // Process top-ups for today
        try {
          const topUps = await topUpService.getByBranchAndDate(branchId, today);
          topUps.forEach((topUp) => {
            const amount = parseFloat(topUp.amount || 0);
            if (isNaN(amount) || amount <= 0) return;

            if (topUp.topUpType === "physical_cash") {
              physicalCash += amount;
          } else if (topUp.topUpType === "merchant_sim_ecash" && topUp.merchantSimId) {
            if (merchantSimBalances.hasOwnProperty(topUp.merchantSimId)) {
              merchantSimBalances[topUp.merchantSimId] += amount;
            } else {
              merchantSimBalances[topUp.merchantSimId] = amount;
            }
          } else if (topUp.topUpType === "sim_to_sim" && topUp.fromMerchantSimId && topUp.toMerchantSimId) {
            const amt = parseFloat(topUp.amount || 0);
            if (merchantSimBalances.hasOwnProperty(topUp.fromMerchantSimId)) merchantSimBalances[topUp.fromMerchantSimId] -= amt;
            if (merchantSimBalances.hasOwnProperty(topUp.toMerchantSimId)) merchantSimBalances[topUp.toMerchantSimId] += amt;
          } else if (topUp.topUpType === "bank_to_sim" && topUp.merchantSimId) {
            if (merchantSimBalances.hasOwnProperty(topUp.merchantSimId)) merchantSimBalances[topUp.merchantSimId] += amount;
            else merchantSimBalances[topUp.merchantSimId] = amount;
            if (topUp.bankName) bankBalances[topUp.bankName] = (bankBalances[topUp.bankName] ?? 0) - amount;
          } else if (topUp.topUpType === "sim_to_bank" && topUp.fromMerchantSimId) {
            const amt = parseFloat(topUp.amount || 0);
            if (merchantSimBalances.hasOwnProperty(topUp.fromMerchantSimId)) merchantSimBalances[topUp.fromMerchantSimId] -= amt;
            if (topUp.bankName) bankBalances[topUp.bankName] = (bankBalances[topUp.bankName] ?? 0) + amt;
          } else if (topUp.topUpType === "sim_to_sim_physical" && topUp.fromMerchantSimId && topUp.toMerchantSimId) {
            const amt = parseFloat(topUp.amount || 0);
            if (merchantSimPhysicalCash[topUp.fromMerchantSimId] !== undefined) merchantSimPhysicalCash[topUp.fromMerchantSimId] -= amt;
            if (merchantSimPhysicalCash[topUp.toMerchantSimId] !== undefined) merchantSimPhysicalCash[topUp.toMerchantSimId] += amt;
            else merchantSimPhysicalCash[topUp.toMerchantSimId] = amt;
          } else if (topUp.topUpType === "bank_to_sim_physical" && topUp.merchantSimId && topUp.bankName) {
            const amt = parseFloat(topUp.amount || 0);
            if (bankBalances[topUp.bankName] !== undefined) bankBalances[topUp.bankName] -= amt;
            if (merchantSimPhysicalCash[topUp.merchantSimId] !== undefined) merchantSimPhysicalCash[topUp.merchantSimId] += amt;
            else merchantSimPhysicalCash[topUp.merchantSimId] = amt;
          } else if (topUp.topUpType === "sim_to_bank_physical" && topUp.fromMerchantSimId && topUp.bankName) {
            const amt = parseFloat(topUp.amount || 0);
            if (merchantSimPhysicalCash[topUp.fromMerchantSimId] !== undefined) merchantSimPhysicalCash[topUp.fromMerchantSimId] -= amt;
            if (bankBalances[topUp.bankName] !== undefined) bankBalances[topUp.bankName] += amt;
            else bankBalances[topUp.bankName] = amt;
          }
        });
        } catch (error) {
          console.error("Error loading top-ups:", error);
        }

        setCurrentBalances({
          physicalCash,
          mtnEcash,
          vodafoneEcash,
          airtelTigoEcash,
          telecelEcash,
          merchantSimEcash: merchantSimBalances,
          merchantSimPhysicalCash: merchantSimPhysicalCash,
          bankBalances,
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
    if (merchantSimId && currentBalances.merchantSimEcash && currentBalances.merchantSimEcash[merchantSimId] !== undefined) {
      return currentBalances.merchantSimEcash[merchantSimId];
    }
    const providerMap = {
      MTN: currentBalances.mtnEcash,
      Vodafone: currentBalances.vodafoneEcash,
      AirtelTigo: currentBalances.airtelTigoEcash,
      Telecel: currentBalances.telecelEcash,
    };
    return providerMap[provider] || 0;
  };

  const getPhysicalBalanceForMoMo = (transactionType, merchantSimId, physicalCashSource = "sim_float") => {
    if (transactionType === "cash_in" || transactionType === "deposit") {
      if (merchantSimId && simHasPhysicalFloat[merchantSimId]) {
        return currentBalances.merchantSimPhysicalCash?.[merchantSimId] ?? 0;
      }
      return currentBalances.physicalCash ?? 0;
    }
    if (transactionType === "cash_out") {
      if (physicalCashSource === "sim_float" && merchantSimId) {
        return currentBalances.merchantSimPhysicalCash?.[merchantSimId] ?? 0;
      }
      return currentBalances.physicalCash ?? 0;
    }
    return currentBalances.physicalCash ?? 0;
  };

  // Helper function to round to 2 decimal places
  const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;

  // Special charges on cash-out disabled – no extra charges on cash-out
  // const calculateCashOutCharges = (amount) => {
  //   const amt = parseFloat(amount || 0);
  //   const tiers = commissionConfig?.momo?.cashOutSpecialCharges;
  //   if (tiers && Array.isArray(tiers) && tiers.length > 0) {
  //     for (const tier of tiers) {
  //       const min = tier.min ?? 0;
  //       const max = tier.max ?? Infinity;
  //       if (amt >= min && amt <= max) {
  //         return parseFloat(tier.charge || 0);
  //       }
  //     }
  //     return 0;
  //   }
  //   if (amt <= 3000) return 0;
  //   if (amt >= 3500 && amt < 7000) return 10;
  //   if (amt >= 7000 && amt <= 11000) return 20;
  //   if (amt >= 15000) return 50;
  //   return 0;
  // };

  const calculateCashOutCommissionEarned = (amount) => {
    const amt = parseFloat(amount || 0);
    const networkRatePercent =
      commissionConfig?.momo?.cashOutNetworkRatePercent ?? 1;
    const networkCapCommission =
      commissionConfig?.momo?.cashOutNetworkCapCommission ?? 20;
    const networkSharePercent =
      commissionConfig?.momo?.cashOutNetworkSharePercent ?? 40;

    const networkCharge = Math.min(
      amt * (networkRatePercent / 100),
      networkCapCommission
    );
    const networkShare = (networkSharePercent / 100) * networkCharge;
    // No special charges on cash-out
    return roundTo2(networkShare);
  };

  const calculateCashInCommission = (amount) => {
    const amt = parseFloat(amount || 0);
    const ratePercent =
      commissionConfig?.momo?.cashInRatePercent ?? 1; // 1% default
    return Math.round((amt * (ratePercent / 100) + Number.EPSILON) * 100) / 100;
  };

  const calculateAirtimeCommission = (price) => {
    const amt = parseFloat(price || 0);
    const ratePercent =
      commissionConfig?.airtime?.ratePercent ?? 1; // 1% default
    return roundTo2(amt * (ratePercent / 100));
  };

  const calculateBundleCommission = (amount) => {
    const amt = parseFloat(amount || 0);
    const ratePercent =
      commissionConfig?.bundle?.ratePercent ?? 1; // 1% default
    return roundTo2(amt * (ratePercent / 100));
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
    physicalCashSource: "sim_float",
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
      
      const amount = roundTo2(parseFloat(momoForm.amount || 0));
      const physicalBefore = roundTo2(parseFloat(momoForm.physicalCashBefore || getPhysicalBalanceForMoMo(momoForm.transactionType, momoForm.merchantSimId, momoForm.physicalCashSource)));
      const ecashBefore = roundTo2(parseFloat(momoForm.ecashBefore || getEcashBalance(momoForm.provider, momoForm.merchantSimId)));
      let physicalAfter = physicalBefore;
      let ecashAfter = ecashBefore;
      if (momoForm.transactionType === "cash_in" || momoForm.transactionType === "deposit") {
        physicalAfter = roundTo2(physicalBefore + amount);
        ecashAfter = roundTo2(ecashBefore - amount);
      } else if (momoForm.transactionType === "cash_out") {
        physicalAfter = roundTo2(physicalBefore - amount);
        ecashAfter = roundTo2(ecashBefore + amount);
      }

      const { businessId, branchId } = getBusinessAndBranchIds();
      
      if (!businessId || !branchId) {
        alert("Error: Business ID or Branch ID is missing. Please ensure you're properly assigned.");
        setLoading(false);
        return;
      }
      if (momoForm.transactionType === "cash_out" && momoForm.merchantSimId) {
        const poolBalance = getPhysicalBalanceForMoMo("cash_out", momoForm.merchantSimId, momoForm.physicalCashSource);
        if (poolBalance < amount) {
          alert(`Insufficient balance. Selected pool has GHS ${poolBalance.toFixed(2)}.`);
          setLoading(false);
          return;
        }
        if (poolBalance === 0) {
          alert(momoForm.physicalCashSource === "sim_float"
            ? "Physical Cash float of this SIM is 0. You cannot use it."
            : "Opening Physical Cash (GHS) is 0. You cannot use it.");
          setLoading(false);
          return;
        }
      }
      await transactionService.createMoMoTransaction({
        businessId,
        branchId,
        ...momoForm,
        charges: momoForm.transactionType === "cash_out" ? "0" : (momoForm.charges ?? ""),
        physicalCashSource: momoForm.transactionType === "cash_out" ? (momoForm.physicalCashSource || "sim_float") : "sim_float",
        agentNumber: getAgentNumber(momoForm.provider),
        physicalCashBefore: physicalBefore,
        physicalCashAfter: physicalAfter,
        ecashBefore: ecashBefore,
        ecashAfter: ecashAfter,
        recordedBy: userData.userId,
        recordedByName: userData.name || userData.email,
      });
      
      // Log MoMo transaction (best-effort)
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId,
          branchId,
          actionType: "momo_transaction_created",
          details: `MoMo ${momoForm.transactionType} of GHS ${amount.toFixed(2)} via ${
            momoForm.provider
          } ${momoForm.merchantSimName || ""} for customer ${momoForm.customerNumber || "N/A"}.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log MoMo transaction activity:", logError);
      }
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
        physicalCashSource: "sim_float",
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

  const [simSaleForm, setSimSaleForm] = useState({
    date: new Date().toISOString().split("T")[0],
    provider: "MTN",
    customerName: "",
    quantity: "",
    unitPrice: "",
    totalAmount: "",
    paymentMethod: "cash",
    registrationStatus: "registered",
    remarks: "",
  });

  // Airtime Sales Form
  const [airtimeForm, setAirtimeForm] = useState({
    date: new Date().toISOString().split("T")[0],
    provider: "MTN",
    merchantSimId: "",
    merchantSimName: "",
    price: "",
    phoneNumber: "",
    commission: "",
    ecashBefore: "",
    ecashAfter: "",
    physicalCashBefore: "",
    physicalCashAfter: "",
    paymentMethod: "cash",
    remarks: "",
  });

  const [bundleForm, setBundleForm] = useState({
    date: new Date().toISOString().split("T")[0],
    provider: "MTN",
    merchantSimId: "",
    merchantSimName: "",
    amount: "",
    commission: "",
    ecashBefore: "",
    ecashAfter: "",
    physicalCashBefore: "",
    physicalCashAfter: "",
    remarks: "",
  });

  const [generalCommissionForm, setGeneralCommissionForm] = useState({
    date: new Date().toISOString().split("T")[0],
    description: "",
    mtn33PhysicalCash: "",
    mtn33Ecash: "",
    mtn34PhysicalCash: "",
    mtn34Ecash: "",
    airtelTigoPhysicalCash: "",
    airtelTigoEcash: "",
    telecelPhysicalCash: "",
    telecelEcash: "",
    ecobankCommission: "",
    fidelityCommission: "",
    firstBankCommission: "",
    gcbCommission: "",
    simCommissions: {},
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
    <div className="space-y-6 relative">
      {/* Block UI if float is closed for today */}
      {isFloatClosedToday && (
        <div className="absolute inset-0 bg-white/90 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-auto">
          <Card className="w-full max-w-md mx-4 pointer-events-auto">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="text-6xl">🔒</div>
                <h2 className="text-2xl font-bold">Day Closed</h2>
                <p className="text-muted-foreground">
                  Today's float has been closed. All activities are locked until a new day begins.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Transaction Recording</h1>
          <p className="page-description">Record all business transactions</p>
        </div>
        {!isFloatClosedToday && userData?.role !== "admin" && userData?.role !== "branch_manager" && (
          <Button
            variant="outline"
            onClick={() => setShowTopUpModal(true)}
            className="flex items-center gap-2"
          >
            <ArrowUpCircle className="h-4 w-4" />
            Top-Up Float/Cash
          </Button>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
        {transactionButtons.map((btn) => (
          <div key={btn.id} className="relative">
            {btn.id === "sim_sale" ? (
              <div className="relative">
          <Button
            variant={activeForm === btn.id ? "default" : "outline"}
                  className="h-24 w-full flex flex-col items-center justify-center gap-2"
                  onClick={() => {
                    if (activeForm === btn.id) {
                      setActiveForm(null);
                      setSimSaleType(null);
                    } else {
                      setActiveForm(btn.id);
                      // Show dropdown menu
                    }
                  }}
                >
                  <span className="text-2xl">{btn.icon}</span>
                  <span className="text-sm">{btn.label}</span>
                </Button>
                {activeForm === "sim_sale" && !simSaleType && (
                  <div className="absolute top-full left-0 mt-2 w-full bg-white border border-gray-200 rounded-md shadow-lg z-10">
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2"
                      onClick={() => {
                        setSimSaleType("airtime");
                        setAirtimeForm({
                          date: new Date().toISOString().split("T")[0],
                          provider: "MTN",
                          merchantSimId: "",
                          merchantSimName: "",
                          price: "",
                          phoneNumber: "",
                          commission: "",
                          ecashBefore: "",
                          ecashAfter: "",
                          physicalCashBefore: "",
                          physicalCashAfter: "",
                          paymentMethod: "cash",
                          remarks: "",
                        });
                        loadCurrentBalances();
                      }}
                    >
                      <span>📱</span>
                      <span>Airtime</span>
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-200"
                      onClick={() => setSimSaleType("sim_sale")}
                    >
                      <span>📞</span>
                      <span>SIM Sales</span>
                    </button>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex items-center gap-2 border-t border-gray-200"
                      onClick={() => {
                        setSimSaleType("bundle");
                        setBundleForm({
                          date: new Date().toISOString().split("T")[0],
                          provider: "MTN",
                          merchantSimId: "",
                          merchantSimName: "",
                          amount: "",
                          commission: "",
                          remarks: "",
                        });
                        loadCurrentBalances();
                      }}
                    >
                      <span>📦</span>
                      <span>Bundle</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <Button
                variant={activeForm === btn.id ? "default" : "outline"}
                className="h-24 w-full flex flex-col items-center justify-center gap-2"
            onClick={() => setActiveForm(activeForm === btn.id ? null : btn.id)}
          >
            <span className="text-2xl">{btn.icon}</span>
            <span className="text-sm">{btn.label}</span>
          </Button>
            )}
          </div>
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
                      if (transactionType === "cash_out") {
                        charges = "0";
                        commission = calculateCashOutCommissionEarned(momoForm.amount).toFixed(2);
                      } else if (transactionType === "cash_in") {
                        commission = calculateCashInCommission(momoForm.amount).toString();
                        charges = commission;
                      } else if (transactionType === "deposit") {
                        commission = "0";
                      }
                      const defaultSource = transactionType === "cash_out" && momoForm.merchantSimId && simHasPhysicalFloat[momoForm.merchantSimId] ? "sim_float" : "branch_opening";
                      setMomoForm({ ...momoForm, transactionType, charges, commissionEarned: commission, physicalCashSource: transactionType === "cash_out" ? defaultSource : momoForm.physicalCashSource });
                    }}
                    required
                  >
                    <option value="cash_in">Cash-In</option>
                    <option value="cash_out">Cash-Out</option>
                    <option value="deposit">Deposit</option>
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
                            const simId = e.target.value;
                            const defaultSource = simHasPhysicalFloat[simId] ? "sim_float" : "branch_opening";
                            setMomoForm({
                              ...momoForm,
                              merchantSimId: simId,
                              merchantSimName: simName,
                              ecashBefore: "",
                              physicalCashSource: momoForm.transactionType === "cash_out" ? defaultSource : momoForm.physicalCashSource,
                              receiptNumber: generateReceiptNumber(simName),
                              transactionReference: generateTransactionReference(simName),
                            });
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
                      if (momoForm.transactionType === "cash_out") {
                        charges = "0";
                        commission = calculateCashOutCommissionEarned(amount).toFixed(2);
                      } else if (momoForm.transactionType === "cash_in") {
                        commission = calculateCashInCommission(amount).toString();
                        charges = commission;
                      }
                      setMomoForm({ ...momoForm, amount, charges, commissionEarned: commission });
                    }}
                    required
                  />
                </div>
                {momoForm.transactionType === "cash_out" && (
                  <div className="space-y-2">
                    <Label htmlFor="charges">Special / Service Charges (GHS)</Label>
                    <Input id="charges" type="number" step="0.01" value={momoForm.charges} readOnly />
                  </div>
                )}
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="commissionEarned">Commission Earned (GHS)</Label>
                  <Input
                    id="commissionEarned"
                    type="number"
                    step="0.01"
                    value={momoForm.transactionType === "deposit" ? "0" : momoForm.commissionEarned}
                    readOnly
                  />
                </div>
              </div>

              {momoForm.transactionType === "cash_out" && momoForm.merchantSimId && (
                <div className="space-y-2">
                  <Label>Use physical cash from</Label>
                  <Select
                    value={momoForm.physicalCashSource || "sim_float"}
                    onChange={(e) => setMomoForm({ ...momoForm, physicalCashSource: e.target.value })}
                  >
                    <option value="sim_float">
                      Physical Cash float of {momoForm.merchantSimName || "SIM"} (GHS {(currentBalances.merchantSimPhysicalCash?.[momoForm.merchantSimId] ?? 0).toFixed(2)})
                    </option>
                    <option value="branch_opening">
                      Opening Physical Cash (GHS) (GHS {(currentBalances.physicalCash ?? 0).toFixed(2)})
                    </option>
                  </Select>
                  {(() => {
                    const poolBal = getPhysicalBalanceForMoMo("cash_out", momoForm.merchantSimId, momoForm.physicalCashSource);
                    if (poolBal === 0) {
                      return (
                        <p className="text-sm text-destructive">
                          {momoForm.physicalCashSource === "sim_float"
                            ? "Physical Cash float of this SIM is 0. You cannot use it."
                            : "Opening Physical Cash (GHS) is 0. You cannot use it."}
                        </p>
                      );
                    }
                    return null;
                  })()}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="physicalCashBefore">Physical Cash Before (GHS)</Label>
                  <Input
                    id="physicalCashBefore"
                    type="number"
                    step="0.01"
                    value={momoForm.physicalCashBefore || getPhysicalBalanceForMoMo(momoForm.transactionType, momoForm.merchantSimId, momoForm.physicalCashSource)}
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
                      const before = roundTo2(parseFloat(momoForm.physicalCashBefore || getPhysicalBalanceForMoMo(momoForm.transactionType, momoForm.merchantSimId, momoForm.physicalCashSource)));
                      const amount = roundTo2(parseFloat(momoForm.amount || 0));
                      if (momoForm.transactionType === "cash_in" || momoForm.transactionType === "deposit") return roundTo2(before + amount);
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
                      const before = roundTo2(getEcashBalance(momoForm.provider, momoForm.merchantSimId));
                      const amount = roundTo2(parseFloat(momoForm.amount || 0));
                      if (momoForm.transactionType === "cash_in" || momoForm.transactionType === "deposit") return roundTo2(before - amount);
                      if (momoForm.transactionType === "cash_out") return roundTo2(before + amount);
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
                <Button
                  type="submit"
                  disabled={
                    loading ||
                    (momoForm.transactionType === "cash_out" &&
                      momoForm.merchantSimId &&
                      getPhysicalBalanceForMoMo("cash_out", momoForm.merchantSimId, momoForm.physicalCashSource) === 0)
                  }
                >
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
                  if (!bankForm.bankName) {
                    alert("Please select or add a bank.");
                    setLoading(false);
                    return;
                  }
                  const roundTo2 = (num) => Math.round((num + Number.EPSILON) * 100) / 100;
                  const amount = roundTo2(parseFloat(bankForm.amount || 0));
                  const physicalBefore = roundTo2(currentBalances.bankBalances?.[bankForm.bankName] ?? 0);
                  let physicalAfter = physicalBefore;
                  if (bankForm.transactionType === "deposit") {
                    physicalAfter = roundTo2(physicalBefore + amount);
                  } else if (bankForm.transactionType === "withdrawal") {
                    physicalAfter = roundTo2(physicalBefore - amount);
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
                  // Log bank transaction (best-effort)
                  try {
                    await activityLogService.log({
                      userId: userData?.userId || null,
                      userName: userData?.name || userData?.email || "Unknown User",
                      businessId,
                      branchId,
                      actionType: "bank_transaction_created",
                      details: `Bank ${bankForm.transactionType} of GHS ${amount.toFixed(
                        2
                      )} at ${bankForm.bankName} for account ${bankForm.accountNumber || "N/A"}.`,
                      status: "success",
                    });
                  } catch (logError) {
                    console.error("Failed to log bank transaction activity:", logError);
                  }
                  setBankForm({
                    date: new Date().toISOString().split("T")[0],
                    time: new Date().toLocaleTimeString(),
                    bankName: banks[0]?.bankName || "",
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
                    value={showAddBank ? "" : bankForm.bankName}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === "__add_new__") {
                        setShowAddBank(true);
                        setNewBankName("");
                      } else {
                        setShowAddBank(false);
                        setBankForm({ ...bankForm, bankName: v, transactionReference: generateTransactionReference(null, v) });
                      }
                    }}
                    required={!showAddBank}
                  >
                    <option value="">Select bank</option>
                    {banks.map((b) => (
                      <option key={b.bankId || b.id} value={b.bankName}>{b.bankName}</option>
                    ))}
                    <option value="__add_new__">+ Add new bank</option>
                  </Select>
                  {showAddBank && (
                    <div className="flex gap-2 mt-2">
                      <Input
                        placeholder="New bank name"
                        value={newBankName}
                        onChange={(e) => setNewBankName(e.target.value)}
                      />
                      <Button
                        type="button"
                        size="sm"
                        onClick={async () => {
                          const businessId = selectedBusinessId || userData?.businessId;
                          if (!newBankName.trim() || !businessId) return;
                          try {
                            await bankService.create({ businessId, bankName: newBankName.trim() });
                            await loadBanks();
                            setBankForm((prev) => ({ ...prev, bankName: newBankName.trim(), transactionReference: generateTransactionReference(null, newBankName.trim()) }));
                            setShowAddBank(false);
                            setNewBankName("");
                          } catch (err) {
                            alert("Error adding bank: " + err.message);
                          }
                        }}
                      >
                        Add
                      </Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => { setShowAddBank(false); setNewBankName(""); }}>Cancel</Button>
                    </div>
                  )}
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
                    value={(() => {
                      return roundTo2(currentBalances.bankBalances?.[bankForm.bankName] ?? 0).toFixed(2);
                    })()}
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    {bankForm.bankName ? `${bankForm.bankName} balance` : "Select a bank"}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="bankPhysicalCashAfter">Physical Cash After (GHS)</Label>
                <Input
                  id="bankPhysicalCashAfter"
                  type="number"
                  step="0.01"
                  value={(() => {
                    const before = roundTo2(currentBalances.bankBalances?.[bankForm.bankName] ?? 0);
                    const amount = roundTo2(parseFloat(bankForm.amount || 0));
                    if (bankForm.transactionType === "deposit") {
                      return roundTo2(before + amount).toFixed(2);
                    } else if (bankForm.transactionType === "withdrawal") {
                      return roundTo2(before - amount).toFixed(2);
                    }
                    return before.toFixed(2);
                  })()}
                  readOnly
                  className="bg-muted"
                />
                <p className="text-xs text-muted-foreground">
                  {bankForm.bankName ? "Chosen bank balance after transaction" : "Select a bank"}
                </p>
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
                    commissionType: "All",
                    commissionAmount: "",
                    commissionReceived: false,
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
                    onChange={(e) => {
                      const newBankName = e.target.value;
                      setBankCommissionForm({ 
                        ...bankCommissionForm, 
                        bankName: newBankName,
                        // Set commission type to "All" if not Ecobank
                        commissionType: newBankName === "Ecobank" ? bankCommissionForm.commissionType : "All"
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
              </div>

              {bankCommissionForm.bankName === "Ecobank" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="bcCommissionType">Commission Type *</Label>
                    <Select
                      id="bcCommissionType"
                      value={bankCommissionForm.commissionType}
                      onChange={(e) => setBankCommissionForm({ ...bankCommissionForm, commissionType: e.target.value })}
                      required
                    >
                      <option value="PO">PO</option>
                      <option value="deposit">Deposit</option>
                      <option value="withdrawal">Withdrawal</option>
                    </Select>
                  </div>
                </div>
              )}

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
            {/* List of recorded commissions */}
            {momoCommissions.length > 0 && (
              <div className="mb-6 p-4 bg-muted rounded-lg">
                <h3 className="font-semibold mb-2">Recorded Commissions ({momoCommissions.length})</h3>
                <div className="space-y-2">
                  {momoCommissions.map((comm, idx) => (
                    <div key={idx} className="text-sm p-2 bg-background rounded">
                      {comm.merchantSimName} - {comm.commissionType} - GHS {comm.commissionEarned}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!momoCommissionForm.provider || !momoCommissionForm.merchantSimId || !momoCommissionForm.commissionType || !momoCommissionForm.commissionEarned) {
                  alert("Please fill all required fields");
                  return;
                }
                
                // Add to commissions list
                const newCommission = {
                  ...momoCommissionForm,
                  date: momoCommissionForm.date || new Date().toISOString().split("T")[0],
                  time: new Date().toLocaleTimeString(),
                };
                setMomoCommissions([...momoCommissions, newCommission]);
                
                // Reset form for next entry
                setMomoCommissionForm({
                  date: new Date().toISOString().split("T")[0],
                  provider: "",
                  merchantSimId: "",
                  merchantSimName: "",
                  commissionType: "",
                  commissionRate: "",
                  commissionEarned: "",
                  remarks: "",
                });
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
                    onChange={(e) => setMomoCommissionForm({ 
                      ...momoCommissionForm, 
                      provider: e.target.value,
                      merchantSimId: "", // Reset merchant SIM when provider changes
                      merchantSimName: "",
                      commissionType: "", // Reset commission type
                    })}
                    required
                  >
                    <option value="">Select Provider</option>
                    <option value="MTN">MTN</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </Select>
                </div>
              </div>

              {momoCommissionForm.provider && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mcMerchantSim">Merchant SIM *</Label>
                    <Select
                      id="mcMerchantSim"
                      value={momoCommissionForm.merchantSimId}
                      onChange={(e) => {
                        const selectedSim = merchantSims.find(s => s.merchantSimId === e.target.value);
                        setMomoCommissionForm({ 
                          ...momoCommissionForm, 
                          merchantSimId: e.target.value,
                          merchantSimName: selectedSim?.simName || "",
                          commissionType: "", // Reset commission type
                        });
                      }}
                      required
                    >
                      <option value="">Select Merchant SIM</option>
                      {merchantSims
                        .filter(sim => sim.provider === momoCommissionForm.provider)
                        .map(sim => (
                          <option key={sim.merchantSimId} value={sim.merchantSimId}>
                            {sim.simName}
                          </option>
                        ))}
                    </Select>
                  </div>
                </div>
              )}

              {momoCommissionForm.merchantSimId && (
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="mcCommissionType">Commission Type *</Label>
                    <Select
                      id="mcCommissionType"
                      value={momoCommissionForm.commissionType}
                      onChange={(e) => setMomoCommissionForm({ ...momoCommissionForm, commissionType: e.target.value })}
                      required
                    >
                      <option value="">Select Commission Type</option>
                      <option value="cash_in">Cash-In</option>
                      <option value="cash_out">Cash-Out</option>
                    </Select>
                  </div>
                </div>
              )}

              {momoCommissionForm.commissionType && (
                <>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="mcCommissionEarned">Commission Earned (GHS) *</Label>
                      <Input
                        id="mcCommissionEarned"
                        type="number"
                        step="0.01"
                        value={momoCommissionForm.commissionEarned}
                        onChange={(e) => {
                          const commissionEarned = parseFloat(e.target.value || 0);
                          setMomoCommissionForm({ ...momoCommissionForm, commissionEarned: e.target.value });
                        }}
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
                        readOnly
                        className="bg-muted"
                      />
                      <p className="text-xs text-muted-foreground">Optional - Enter manually if needed</p>
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
                    <Button 
                      type="button" 
                      variant="outline" 
                      onClick={() => {
                        setMomoCommissions([]);
                        setMomoCommissionForm({
                          date: new Date().toISOString().split("T")[0],
                          provider: "",
                          merchantSimId: "",
                          merchantSimName: "",
                          commissionType: "",
                          numberOfTransactions: "",
                          totalTransactionValue: "",
                          commissionRate: "",
                          commissionEarned: "",
                          remarks: "",
                        });
                        setActiveForm(null);
                      }}
                    >
                      Cancel
                    </Button>
                    <Button type="button" variant="secondary" onClick={async () => {
                      // Add current commission to list
                      if (!momoCommissionForm.provider || !momoCommissionForm.merchantSimId || !momoCommissionForm.commissionType || !momoCommissionForm.commissionEarned) {
                        alert("Please fill all required fields");
                        return;
                      }
                      const newCommission = {
                        ...momoCommissionForm,
                        date: momoCommissionForm.date || new Date().toISOString().split("T")[0],
                        time: new Date().toLocaleTimeString(),
                      };
                      setMomoCommissions([...momoCommissions, newCommission]);
                      setMomoCommissionForm({
                        date: new Date().toISOString().split("T")[0],
                        provider: "",
                        merchantSimId: "",
                        merchantSimName: "",
                        commissionType: "",
                        commissionRate: "",
                        commissionEarned: "",
                        remarks: "",
                      });
                    }}>
                      Add Another Commission
                    </Button>
                    <Button 
                      type="submit" 
                      disabled={loading || momoCommissions.length === 0}
                      onClick={async (e) => {
                        e.preventDefault();
                        if (momoCommissions.length === 0) {
                          alert("Please add at least one commission");
                          return;
                        }
                        setLoading(true);
                        try {
                          const { businessId, branchId } = getBusinessAndBranchIds();
                          if (!businessId || !branchId) {
                            alert("Error: Business ID or Branch ID is missing.");
                            setLoading(false);
                            return;
                          }
                          // Save all commissions
                          for (const comm of momoCommissions) {
                            await commissionService.createMoMoCommission({
                              businessId,
                              branchId,
                              ...comm,
                              recordedBy: userData.userId,
                              recordedByName: userData.name || userData.email,
                            });
                          }
                          alert(`${momoCommissions.length} commission(s) recorded successfully!`);
                          setMomoCommissions([]);
                          setMomoCommissionForm({
                            date: new Date().toISOString().split("T")[0],
                            provider: "",
                            merchantSimId: "",
                            merchantSimName: "",
                            commissionType: "",
                            numberOfTransactions: "",
                            totalTransactionValue: "",
                            commissionRate: "",
                            commissionEarned: "",
                            remarks: "",
                          });
                          setActiveForm(null);
                        } catch (error) {
                          alert("Error: " + error.message);
                        } finally {
                          setLoading(false);
                        }
                      }}
                    >
                      {loading ? "Saving..." : `Save All Commissions (${momoCommissions.length})`}
                    </Button>
                  </div>
                </>
              )}
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "sim_sale" && simSaleType === "airtime" && (
        <Card>
          <CardHeader>
            <CardTitle>Airtime Sales</CardTitle>
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

                  const price = parseFloat(airtimeForm.price || 0);
                  if (price <= 0) {
                    alert("Please enter a valid price");
                    setLoading(false);
                    return;
                  }
                  
                  if (!airtimeForm.merchantSimId) {
                    alert("Please select a Merchant SIM");
                    setLoading(false);
                    return;
                  }
                  
                  const commission = calculateAirtimeCommission(price); 
                  const ecashBefore = roundTo2(parseFloat(airtimeForm.ecashBefore || getEcashBalance(airtimeForm.provider, airtimeForm.merchantSimId)));
                  const ecashAfter = roundTo2(ecashBefore - price);
                  
                  if (ecashAfter < 0) {
                    alert("Insufficient E-Cash balance. E-Cash After cannot be negative.");
                    setLoading(false);
                    return;
                  }
                  
                  const physicalBase =
                    currentBalances.merchantSimPhysicalCash?.[airtimeForm.merchantSimId] ?? 0;
                  const physicalCashBefore = roundTo2(
                    parseFloat(airtimeForm.physicalCashBefore || physicalBase)
                  );
                  const physicalCashAfter = airtimeForm.paymentMethod === "cash" 
                    ? roundTo2(physicalCashBefore + price)
                    : physicalCashBefore;

                  // Create airtime sale record
                  await simSaleService.create({
                    businessId,
                    branchId,
                    saleType: "airtime",
                    date: airtimeForm.date,
                    provider: airtimeForm.provider,
                    merchantSimId: airtimeForm.merchantSimId,
                    merchantSimName: airtimeForm.merchantSimName,
                    price: price,
                    phoneNumber: airtimeForm.phoneNumber,
                    commission: commission,
                    ecashBefore: ecashBefore,
                    ecashAfter: ecashAfter,
                    physicalCashBefore: physicalCashBefore,
                    physicalCashAfter: physicalCashAfter,
                    paymentMethod: airtimeForm.paymentMethod,
                    remarks: airtimeForm.remarks,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });

                  alert("Airtime sale recorded successfully!");
                  
                  
                  try {
                    await activityLogService.log({
                      userId: userData?.userId || null,
                      userName: userData?.name || userData?.email || "Unknown User",
                      businessId,
                      branchId,
                      actionType: "airtime_sale_created",
                      details: `Airtime sale of GHS ${price.toFixed(
                        2
                      )} on ${airtimeForm.provider} ${airtimeForm.merchantSimName || ""} for ${
                        airtimeForm.phoneNumber || "N/A"
                      }.`,
                      status: "success",
                    });
                  } catch (logError) {
                    console.error("Failed to log airtime sale activity:", logError);
                  }
                  
                  // Reset form
                  setAirtimeForm({
                    date: new Date().toISOString().split("T")[0],
                    provider: "MTN",
                    merchantSimId: "",
                    merchantSimName: "",
                    price: "",
                    phoneNumber: "",
                    commission: "",
                    ecashBefore: "",
                    ecashAfter: "",
                    physicalCashBefore: "",
                    physicalCashAfter: "",
                    paymentMethod: "cash",
                    remarks: "",
                  });
                  
                  // Reload balances
                  await loadCurrentBalances();
                  setActiveForm(null);
                  setSimSaleType(null);
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
                  <Label htmlFor="airtimeDate">Date *</Label>
                  <Input
                    id="airtimeDate"
                    type="date"
                    value={airtimeForm.date}
                    readOnly
                    disabled
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtimeProvider">Provider *</Label>
                  <Select
                    id="airtimeProvider"
                    value={airtimeForm.provider}
                    onChange={(e) => {
                      setAirtimeForm({
                        ...airtimeForm,
                        provider: e.target.value,
                        merchantSimId: "",
                        merchantSimName: "",
                        ecashBefore: "",
                        ecashAfter: "",
                      });
                    }}
                    required
                  >
                    <option value="MTN">MTN</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                  </Select>
                </div>
              </div>

              {airtimeForm.provider && (
                <div className="space-y-2">
                  <Label htmlFor="airtimeMerchantSim">SIM Type (Merchant SIM) *</Label>
                  <div className="flex gap-2">
                    <Select
                      id="airtimeMerchantSim"
                      value={airtimeForm.merchantSimId}
                      onChange={(e) => {
                        const selectedSim = merchantSims.find(s => (s.merchantSimId || s.id) === e.target.value);
                        const ecashBefore = roundTo2(getEcashBalance(airtimeForm.provider, e.target.value));
                        const price = parseFloat(airtimeForm.price || 0);
                        const ecashAfter = roundTo2(ecashBefore - price);
                        const physicalBase =
                          currentBalances.merchantSimPhysicalCash?.[e.target.value] ?? 0;
                        const physicalCashBefore = roundTo2(
                          parseFloat(airtimeForm.physicalCashBefore || physicalBase)
                        );
                        const physicalCashAfter = airtimeForm.paymentMethod === "cash" 
                          ? roundTo2(physicalCashBefore + price)
                          : physicalCashBefore;
                        setAirtimeForm({
                          ...airtimeForm,
                          merchantSimId: e.target.value,
                          merchantSimName: selectedSim ? (selectedSim.simName || selectedSim.merchantSimName) : "",
                          ecashBefore: ecashBefore.toFixed(2),
                          ecashAfter: ecashAfter.toFixed(2),
                          physicalCashBefore: physicalCashBefore.toFixed(2),
                          physicalCashAfter: physicalCashAfter.toFixed(2),
                        });
                      }}
                      required
                      className="flex-1"
                    >
                      <option value="">Select Merchant SIM</option>
                      {merchantSims
                        .filter(sim => sim.provider === airtimeForm.provider)
                        .map((sim) => (
                          <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>
                            {sim.simName || sim.merchantSimName || sim.merchantSimId || sim.id}
                          </option>
                        ))}
                    </Select>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setShowAddMerchantSim(true);
                        setNewMerchantSim({ provider: airtimeForm.provider, simName: "", agentNumber: "" });
                      }}
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="airtimePrice">Price (GHS) *</Label>
                  <Input
                    id="airtimePrice"
                    type="number"
                    step="0.01"
                    value={airtimeForm.price}
                    onChange={(e) => {
                      const price = parseFloat(e.target.value || 0);
                      const commission = calculateAirtimeCommission(price);
                      const ecashBefore = roundTo2(parseFloat(airtimeForm.ecashBefore || getEcashBalance(airtimeForm.provider, airtimeForm.merchantSimId)));
                      const ecashAfter = roundTo2(ecashBefore - price);
                      const physicalBase =
                        currentBalances.merchantSimPhysicalCash?.[airtimeForm.merchantSimId] ?? 0;
                      const physicalCashBefore = roundTo2(
                        parseFloat(airtimeForm.physicalCashBefore || physicalBase)
                      );
                      const physicalCashAfter = airtimeForm.paymentMethod === "cash" 
                        ? roundTo2(physicalCashBefore + price)
                        : physicalCashBefore;
                      setAirtimeForm({
                        ...airtimeForm,
                        price: e.target.value,
                        commission: commission.toFixed(2),
                        ecashBefore: ecashBefore.toFixed(2),
                        ecashAfter: ecashAfter.toFixed(2),
                        physicalCashAfter: physicalCashAfter.toFixed(2),
                      });
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtimePhoneNumber">Phone Number *</Label>
                  <Input
                    id="airtimePhoneNumber"
                    type="tel"
                    value={airtimeForm.phoneNumber}
                    onChange={(e) => setAirtimeForm({ ...airtimeForm, phoneNumber: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="airtimeCommission">Commission (GHS)</Label>
                  <Input
                    id="airtimeCommission"
                    type="number"
                    step="0.01"
                    value={airtimeForm.commission}
                    readOnly
                  />
                  <p className="text-xs text-gray-500">Auto-calculated: 1% of price</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtimePaymentMethod">Payment Method *</Label>
                  <Select
                    id="airtimePaymentMethod"
                    value={airtimeForm.paymentMethod}
                    onChange={(e) => {
                      const price = parseFloat(airtimeForm.price || 0);
                      const physicalCashBefore = roundTo2(parseFloat(airtimeForm.physicalCashBefore || currentBalances.physicalCash));
                      const physicalCashAfter = e.target.value === "cash" 
                        ? roundTo2(physicalCashBefore + price)
                        : physicalCashBefore;
                      const ecashBefore = roundTo2(parseFloat(airtimeForm.ecashBefore || getEcashBalance(airtimeForm.provider, airtimeForm.merchantSimId)));
                      const ecashAfter = roundTo2(ecashBefore - price);
                      setAirtimeForm({
                        ...airtimeForm,
                        paymentMethod: e.target.value,
                        physicalCashAfter: physicalCashAfter.toFixed(2),
                        ecashBefore: ecashBefore.toFixed(2),
                        ecashAfter: ecashAfter.toFixed(2),
                      });
                    }}
                    required
                  >
                    <option value="cash">Cash</option>
                    <option value="momo">MoMo</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="airtimePhysicalCashBefore">Physical Cash Before (GHS)</Label>
                  <Input
                    id="airtimePhysicalCashBefore"
                    type="number"
                    step="0.01"
                    value={
                      airtimeForm.physicalCashBefore ||
                      (airtimeForm.merchantSimId
                        ? (currentBalances.merchantSimPhysicalCash?.[airtimeForm.merchantSimId] ?? 0).toFixed(2)
                        : "0.00")
                    }
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtimePhysicalCashAfter">Physical Cash After (GHS)</Label>
                  <Input
                    id="airtimePhysicalCashAfter"
                    type="number"
                    step="0.01"
                    value={
                      airtimeForm.physicalCashAfter ||
                      (airtimeForm.merchantSimId
                        ? (() => {
                            const base =
                              parseFloat(
                                airtimeForm.physicalCashBefore ||
                                  (currentBalances.merchantSimPhysicalCash?.[airtimeForm.merchantSimId] ?? 0)
                              ) || 0;
                            const price = parseFloat(airtimeForm.price || 0) || 0;
                            const after =
                              airtimeForm.paymentMethod === "cash" ? roundTo2(base + price) : base;
                            return after.toFixed(2);
                          })()
                        : "0.00")
                    }
                    readOnly
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="airtimeEcashBefore">E-Cash Before (GHS)</Label>
                  <Input
                    id="airtimeEcashBefore"
                    type="number"
                    step="0.01"
                    value={airtimeForm.ecashBefore || (airtimeForm.merchantSimId ? getEcashBalance(airtimeForm.provider, airtimeForm.merchantSimId).toFixed(2) : "0.00")}
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtimeEcashAfter">E-Cash After (GHS)</Label>
                  <Input
                    id="airtimeEcashAfter"
                    type="number"
                    step="0.01"
                    value={airtimeForm.ecashAfter || (airtimeForm.merchantSimId && airtimeForm.price
                      ? roundTo2(getEcashBalance(airtimeForm.provider, airtimeForm.merchantSimId) - parseFloat(airtimeForm.price || 0)).toFixed(2)
                      : "0.00")}
                    readOnly
                  />
                  <p className="text-xs text-gray-500">E-Cash Before - Price (Airtime decreases E-Cash)</p>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="airtimeRemarks">Remarks</Label>
                <Input
                  id="airtimeRemarks"
                  value={airtimeForm.remarks}
                  onChange={(e) => setAirtimeForm({ ...airtimeForm, remarks: e.target.value })}
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => {
                    setActiveForm(null);
                    setSimSaleType(null);
                  }}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={loading || !airtimeForm.merchantSimId}>
                  {loading ? "Recording..." : "Record Airtime Sale"}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {activeForm === "sim_sale" && simSaleType === "sim_sale" && (
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
                    saleType: "sim_sale", // Distinguish from airtime sales
                    ...simSaleForm,
                    totalAmount: totalAmount || simSaleForm.totalAmount,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("SIM sale recorded successfully!");
                  setSimSaleForm({
                    date: new Date().toISOString().split("T")[0],
                    provider: "MTN",
                    customerName: "",
                    quantity: "",
                    unitPrice: "",
                    totalAmount: "",
                    paymentMethod: "cash",
                    registrationStatus: "registered",
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
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </Select>
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
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

      {activeForm === "sim_sale" && simSaleType === "bundle" && (
        <Card>
          <CardHeader>
            <CardTitle>Bundle Sale</CardTitle>
            <p className="text-sm text-muted-foreground">
              Bought with e-cash; SIM physical cash increases. Commission follows branch commission settings.
            </p>
          </CardHeader>
          <CardContent>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setLoading(true);
                try {
                  const amount = roundTo2(parseFloat(bundleForm.amount || 0));
                  const commission = calculateBundleCommission(amount);
                  if (!bundleForm.merchantSimId || amount <= 0) {
                    alert("Select merchant SIM and enter amount.");
                    setLoading(false);
                    return;
                  }
                  const { businessId, branchId } = getBusinessAndBranchIds();
                  if (!businessId || !branchId) {
                    alert("Error: Business ID or Branch ID is missing.");
                    setLoading(false);
                    return;
                  }
                  const ecashBefore = roundTo2(
                    parseFloat(
                      bundleForm.ecashBefore ||
                        getEcashBalance(bundleForm.provider, bundleForm.merchantSimId)
                    )
                  );
                  const ecashAfter = roundTo2(ecashBefore - amount);
                  if (ecashAfter < 0) {
                    alert("Insufficient E-Cash balance on this SIM for the bundle amount.");
                    setLoading(false);
                    return;
                  }
                  const physicalBase =
                    currentBalances.merchantSimPhysicalCash?.[bundleForm.merchantSimId] ?? 0;
                  const physicalCashBefore = roundTo2(
                    parseFloat(bundleForm.physicalCashBefore || physicalBase)
                  );
                  const physicalCashAfter = roundTo2(physicalCashBefore + amount);
                  await simSaleService.create({
                    businessId,
                    branchId,
                    saleType: "bundle",
                    date: bundleForm.date,
                    provider: bundleForm.provider,
                    merchantSimId: bundleForm.merchantSimId,
                    merchantSimName: bundleForm.merchantSimName,
                    amount,
                    totalAmount: amount,
                    commission,
                    ecashBefore,
                    ecashAfter,
                    physicalCashBefore,
                    physicalCashAfter,
                    recordedBy: userData.userId,
                    recordedByName: userData.name || userData.email,
                  });
                  alert("Bundle sale recorded!");
                  setBundleForm({
                    date: new Date().toISOString().split("T")[0],
                    provider: "MTN",
                    merchantSimId: "",
                    merchantSimName: "",
                    amount: "",
                    commission: "",
                    ecashBefore: "",
                    ecashAfter: "",
                    physicalCashBefore: "",
                    physicalCashAfter: "",
                    remarks: "",
                  });
                  setActiveForm(null);
                  loadCurrentBalances();
                } catch (err) {
                  alert("Error: " + err.message);
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-4"
            >
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Date *</Label>
                  <Input type="date" value={bundleForm.date} onChange={(e) => setBundleForm({ ...bundleForm, date: e.target.value })} required />
                </div>
                <div className="space-y-2">
                  <Label>Provider *</Label>
                  <Select value={bundleForm.provider} onChange={(e) => setBundleForm({ ...bundleForm, provider: e.target.value, merchantSimId: "", merchantSimName: "" })}>
                    <option value="MTN">MTN</option>
                    <option value="AirtelTigo">AirtelTigo</option>
                    <option value="Telecel">Telecel</option>
                  </Select>
                </div>
              </div>
              {bundleForm.provider && (
                <div className="space-y-2">
                  <Label>Merchant SIM *</Label>
                  <Select
                    value={bundleForm.merchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      const simId = e.target.value;
                      const ecashBefore = roundTo2(
                        getEcashBalance(bundleForm.provider, simId)
                      );
                      const amount = parseFloat(bundleForm.amount || 0) || 0;
                      const ecashAfter = roundTo2(ecashBefore - amount);
                      const physicalBase =
                        currentBalances.merchantSimPhysicalCash?.[simId] ?? 0;
                      const physicalCashBefore = roundTo2(physicalBase);
                      const physicalCashAfter = roundTo2(physicalCashBefore + amount);
                      setBundleForm({
                        ...bundleForm,
                        merchantSimId: simId,
                        merchantSimName: sim?.simName || "",
                        ecashBefore: ecashBefore.toFixed(2),
                        ecashAfter: ecashAfter.toFixed(2),
                        physicalCashBefore: physicalCashBefore.toFixed(2),
                        physicalCashAfter: physicalCashAfter.toFixed(2),
                      });
                    }}
                    required
                  >
                    <option value="">Select SIM</option>
                    {merchantSims.filter((s) => s.provider === bundleForm.provider).map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>{sim.simName}</option>
                    ))}
                  </Select>
                </div>
              )}
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={bundleForm.amount}
                    onChange={(e) => {
                      const amtStr = e.target.value;
                      const amt = parseFloat(amtStr || 0) || 0;
                      const commission = calculateBundleCommission(amt);
                      const simId = bundleForm.merchantSimId;
                      const ecashBefore = roundTo2(
                        parseFloat(
                          bundleForm.ecashBefore ||
                            (simId ? getEcashBalance(bundleForm.provider, simId) : 0)
                        )
                      );
                      const ecashAfter = roundTo2(ecashBefore - amt);
                      const physicalBase =
                        currentBalances.merchantSimPhysicalCash?.[simId] ?? 0;
                      const physicalCashBefore = roundTo2(
                        parseFloat(bundleForm.physicalCashBefore || physicalBase)
                      );
                      const physicalCashAfter = roundTo2(physicalCashBefore + amt);
                      setBundleForm({
                        ...bundleForm,
                        amount: amtStr,
                        commission: commission.toFixed(2),
                        ecashBefore: ecashBefore.toFixed(2),
                        ecashAfter: ecashAfter.toFixed(2),
                        physicalCashBefore: physicalCashBefore.toFixed(2),
                        physicalCashAfter: physicalCashAfter.toFixed(2),
                      });
                    }}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label>Commission</Label>
                  <Input type="number" step="0.01" value={bundleForm.commission} readOnly />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>SIM Physical Cash Before (GHS)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={
                      bundleForm.physicalCashBefore ||
                      (bundleForm.merchantSimId
                        ? (currentBalances.merchantSimPhysicalCash?.[bundleForm.merchantSimId] ?? 0).toFixed(2)
                        : "0.00")
                    }
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>SIM Physical Cash After (GHS)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={
                      bundleForm.physicalCashAfter ||
                      (bundleForm.merchantSimId
                        ? (() => {
                            const base =
                              parseFloat(
                                bundleForm.physicalCashBefore ||
                                  (currentBalances.merchantSimPhysicalCash?.[bundleForm.merchantSimId] ?? 0)
                              ) || 0;
                            const amt = parseFloat(bundleForm.amount || 0) || 0;
                            return roundTo2(base + amt).toFixed(2);
                          })()
                        : "0.00")
                    }
                    readOnly
                  />
                </div>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>E-Cash Before (GHS)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={
                      bundleForm.ecashBefore ||
                      (bundleForm.merchantSimId
                        ? getEcashBalance(bundleForm.provider, bundleForm.merchantSimId).toFixed(2)
                        : "0.00")
                    }
                    readOnly
                  />
                </div>
                <div className="space-y-2">
                  <Label>E-Cash After (GHS)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={
                      bundleForm.ecashAfter ||
                      (bundleForm.merchantSimId
                        ? (() => {
                            const before = getEcashBalance(
                              bundleForm.provider,
                              bundleForm.merchantSimId
                            );
                            const amt = parseFloat(bundleForm.amount || 0) || 0;
                            return roundTo2(before - amt).toFixed(2);
                          })()
                        : "0.00")
                    }
                    readOnly
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Remarks</Label>
                <Input value={bundleForm.remarks} onChange={(e) => setBundleForm({ ...bundleForm, remarks: e.target.value })} />
              </div>
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>Cancel</Button>
                <Button type="submit" disabled={loading}>{loading ? "Recording..." : "Record Bundle Sale"}</Button>
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
                    const missing = [];
                    if (!businessId) missing.push("Business ID");
                    if (!branchId) missing.push("Branch ID");
                    alert(`Error: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing. Please ensure you're properly assigned to a business and branch.`);
                    setLoading(false);
                    return;
                  }
                  await expenseService.create({
                    businessId,
                    branchId,
                    ...expenseForm,
                    recordedBy: userData?.userId,
                    recordedByName: userData?.name || userData?.email,
                  });
                  alert("Expense recorded successfully!");
                  // Log expense (best-effort)
                  try {
                    await activityLogService.log({
                      userId: userData?.userId || null,
                      userName: userData?.name || userData?.email || "Unknown User",
                      businessId,
                      branchId,
                      actionType: "expense_recorded",
                      details: `Expense "${expenseForm.expenseCategory}" of GHS ${expenseForm.amountPaid || "0.00"} paid to ${expenseForm.paidTo || "N/A"}.`,
                      status: "success",
                    });
                  } catch (logError) {
                    console.error("Failed to log expense activity:", logError);
                  }
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

              {categoriesRequiringQuantity.includes(expenseForm.expenseCategory) && (
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
              )}

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
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-filled from latest disbursement
                  </p>
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
                  <Label htmlFor="expPettyCashBalance">Petty Cash Balance (GHS)</Label>
                  <Input
                    id="expPettyCashBalance"
                    type="number"
                    step="0.01"
                    value={expenseForm.pettyCashBalance}
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Auto-calculated: Amount Received - Amount Paid
                  </p>
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
            <CardTitle>General Daily Commission (Read-Only)</CardTitle>
            <p className="text-sm text-muted-foreground mt-2">
              System-calculated daily commissions. This view is read-only and displays totals from today's transactions.
            </p>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="gcDate">Date</Label>
                  <Input
                    id="gcDate"
                    type="date"
                    value={generalCommissionForm.date}
                    readOnly
                    className="bg-muted"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcDescription">Description</Label>
                  <Input
                    id="gcDescription"
                    value={generalCommissionForm.description}
                    readOnly
                    className="bg-muted"
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
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtn33Ecash">MTN 33 E-Cash (GHS)</Label>
                    <Input
                      id="mtn33Ecash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn33Ecash}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtn34Physical">MTN 34 Physical Cash (GHS)</Label>
                    <Input
                      id="mtn34Physical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn34PhysicalCash}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="mtn34Ecash">MTN 34 E-Cash (GHS)</Label>
                    <Input
                      id="mtn34Ecash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.mtn34Ecash}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">By Merchant SIM</h3>
                <div className="space-y-2 mb-4">
                  {merchantSims.map((sim) => {
                    const simId = sim.merchantSimId || sim.id;
                    const simCommission = generalCommissionForm.simCommissions?.[simId] ?? "0.00";
                    return (
                      <div key={simId} className="flex items-center justify-between rounded border p-2">
                        <span className="font-medium">{sim.simName || simId} ({sim.provider})</span>
                        <span>GHS {simCommission}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Other Provider Commissions (Telecel, AirtelTigo)</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="airtelTigoPhysical">AirtelTigo Physical Cash (GHS)</Label>
                    <Input
                      id="airtelTigoPhysical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.airtelTigoPhysicalCash}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="airtelTigoEcash">AirtelTigo E-Cash (GHS)</Label>
                    <Input
                      id="airtelTigoEcash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.airtelTigoEcash}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telecelPhysical">Telecel Physical Cash (GHS)</Label>
                    <Input
                      id="telecelPhysical"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.telecelPhysicalCash}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="telecelEcash">Telecel E-Cash (GHS)</Label>
                    <Input
                      id="telecelEcash"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.telecelEcash}
                      readOnly
                      className="bg-muted"
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
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="fidelityCommission">Fidelity Commission (GHS)</Label>
                    <Input
                      id="fidelityCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.fidelityCommission}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="firstBankCommission">First Bank Commission (GHS)</Label>
                    <Input
                      id="firstBankCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.firstBankCommission}
                      readOnly
                      className="bg-muted"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="gcbCommission">GCB Commission (GHS)</Label>
                    <Input
                      id="gcbCommission"
                      type="number"
                      step="0.01"
                      value={generalCommissionForm.gcbCommission}
                      readOnly
                      className="bg-muted"
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
                    value={generalCommissionForm.totalBalance || "0.00"}
                    readOnly
                    className="bg-muted"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="gcRemarks">Remarks</Label>
                <Input
                  id="gcRemarks"
                  value={generalCommissionForm.remarks}
                  readOnly
                  className="bg-muted"
                />
              </div>

              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => setActiveForm(null)}>
                  Close
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {showTopUpModal && (
        <TopUpModal
          branchId={selectedBranchId || userData?.branchId}
          businessId={selectedBusinessId || userData?.businessId}
          userId={userData?.userId}
          userName={userData?.name || userData?.email}
          currentBalances={currentBalances}
          onClose={() => setShowTopUpModal(false)}
          onSuccess={() => {
            loadCurrentBalances();
          }}
        />
      )}
    </div>
  );
}

