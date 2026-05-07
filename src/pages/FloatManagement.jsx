import React, { useState, useEffect, useRef } from "react";
import { dailyFloatService, transactionService, activityLogService, topUpService, bankService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { useAuth } from "../context/AuthContext";
import { Timestamp } from "firebase/firestore";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../lib/firebase";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Select } from "../components/ui/select";
import { AlertCircle, CheckCircle, XCircle, Plus, ArrowUpCircle } from "lucide-react";
import TopUpModal from "../components/TopUpModal";

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
    merchantSimEcash: {},
    merchantSimPhysicalCash: {},
    bankBalances: {},
  });
  const [merchantSims, setMerchantSims] = useState([]);
  const [showAddMerchantSim, setShowAddMerchantSim] = useState({ provider: "", visible: false });
  const [newMerchantSim, setNewMerchantSim] = useState({ provider: "", simName: "", agentNumber: "" });
  const [banks, setBanks] = useState([]);
  const [pendingFloats, setPendingFloats] = useState([]);
  const [showPendingFloatsModal, setShowPendingFloatsModal] = useState(false);
  const [selectedPendingFloat, setSelectedPendingFloat] = useState(null);
  const [showCloseFloatModal, setShowCloseFloatModal] = useState(false);
  const [showGoodEveningModal, setShowGoodEveningModal] = useState(false);
  const [showGoodMorningModal, setShowGoodMorningModal] = useState(false);
  const [isFloatClosedToday, setIsFloatClosedToday] = useState(false);
  const [closedFloatIdForUnlock, setClosedFloatIdForUnlock] = useState(null);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
    openingPhysicalCash: "",
    openingMtnEcash: "",
    openingVodafoneEcash: "",
    openingAirtelTigoEcash: "",
    openingTelecelEcash: "",
    openingMerchantSimEcash: {},
    openingMerchantSimPhysicalCash: {},
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
    closingMerchantSimPhysicalCash: {},
    closingBankBalances: {},
    variance: "",
    varianceReason: "",
    openingBankBalances: {},
    // Store bank transactions as array: [{ bankName, transactionType, amount }, ...]
    cashBanked: [],
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
      loadPendingFloats();
    }
  }, [branchId]);

  useEffect(() => {
    if (businessId) {
      bankService.getByBusinessId(businessId).then(setBanks).catch(() => setBanks([]));
    }
  }, [businessId]);

  // Calculate expected balances when todayFloat or selectedPendingFloat is loaded
  useEffect(() => {
    if ((todayFloat || selectedPendingFloat) && branchId) {
      calculateExpectedBalances();
    }
  }, [todayFloat, selectedPendingFloat, branchId]);

  // Show pending floats modal only when there are unclosed floats from previous days (not today)
  useEffect(() => {
    if (pendingFloats.length > 0) {
      const today = new Date().toISOString().split("T")[0];
      
      // Filter pending floats to only include those from previous days (not today)
      const previousDayFloats = pendingFloats.filter(f => {
        const floatDate = f.date?.toDate ? f.date.toDate().toISOString().split("T")[0] : 
                         (typeof f.date === 'string' ? f.date : new Date(f.date).toISOString().split("T")[0]);
        return floatDate !== today;
      });
      
      // Only show modal if there are pending floats from previous days
      if (previousDayFloats.length > 0) {
        setShowPendingFloatsModal(true);
      } else {
        // If all pending floats are from today, don't show the modal
        setShowPendingFloatsModal(false);
      }
    } else {
      setShowPendingFloatsModal(false);
    }
  }, [pendingFloats]);

  // Auto-populate closing form with expected balances when mode changes to closing and expected balances are ready
  useEffect(() => {
    if (mode === "closing" && todayFloat && expectedBalances.physicalCash !== undefined && expectedBalances.physicalCash !== null) {
      // Check if closing values are empty or invalid
      const currentPhysicalCash = parseFloat(formData.closingPhysicalCash || 0);
      const expectedPhysicalCash = parseFloat(expectedBalances.physicalCash || 0);
      const hasValidClosingValues = formData.closingPhysicalCash && 
                                    formData.closingPhysicalCash !== "" && 
                                    formData.closingPhysicalCash !== "0.00" &&
                                    !isNaN(currentPhysicalCash);
      
      // Auto-populate if values are empty or significantly different from expected (more than 1 cent difference)
      // This ensures values always match reconciliation
      if (!hasValidClosingValues || Math.abs(currentPhysicalCash - expectedPhysicalCash) > 0.01) {
        const merchantSimEcash = {};
        if (expectedBalances.merchantSimEcash && typeof expectedBalances.merchantSimEcash === 'object') {
          Object.keys(expectedBalances.merchantSimEcash).forEach(simId => {
            const expectedValue = expectedBalances.merchantSimEcash[simId];
            if (expectedValue !== undefined && expectedValue !== null && !isNaN(expectedValue)) {
              merchantSimEcash[simId] = parseFloat(expectedValue).toFixed(2);
            }
          });
        }
        
        const closingBankBalances = {};
        if (expectedBalances.bankBalances && typeof expectedBalances.bankBalances === "object") {
          Object.keys(expectedBalances.bankBalances).forEach((name) => {
            const v = expectedBalances.bankBalances[name];
            if (v !== undefined && v !== null && !isNaN(v)) closingBankBalances[name] = parseFloat(v).toFixed(2);
          });
        }
        setFormData(prev => {
          const newData = {
            ...prev,
            closingPhysicalCash: expectedBalances.physicalCash.toFixed(2),
            closingMerchantSimEcash: { ...prev.closingMerchantSimEcash, ...merchantSimEcash },
            closingBankBalances: { ...prev.closingBankBalances, ...closingBankBalances },
          };
          return newData;
        });
      }
    }
  }, [mode, todayFloat, expectedBalances.physicalCash]);

  const loadMerchantSims = async () => {
    try {
      const sims = await merchantSimService.getByBranch(branchId, businessId);
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
        businessId,
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
      const floatToUse = selectedPendingFloat || todayFloat;
      if (!floatToUse) return;
      
      // Get the date from the float (could be today or a previous day)
      const floatDate = floatToUse.date?.toDate ? floatToUse.date.toDate() : new Date(floatToUse.date);
      const dateString = floatDate.toISOString().split("T")[0];
      
      // For float management, admins should see ALL branch transactions
      const isAdmin = userData?.role === "admin" || userData?.role === "branch_manager" || userData?.role === "it_admin";
      
      // Get all transactions (we'll filter by date)
      const transactions = await transactionService.getTodayTransactions(
        branchId, 
        isAdmin ? null : userData?.userId, 
        isAdmin ? "admin" : userData?.role
      );
      
      // Filter transactions by the float's date
      const filteredTransactions = {
        momo: (transactions.momo || []).filter(t => {
          const tDate = t.date?.toDate ? t.date.toDate().toISOString().split("T")[0] : (typeof t.date === 'string' ? t.date : new Date(t.date).toISOString().split("T")[0]);
          return tDate === dateString;
        }),
        bank: (transactions.bank || []).filter(t => {
          const tDate = t.date?.toDate ? t.date.toDate().toISOString().split("T")[0] : (typeof t.date === 'string' ? t.date : new Date(t.date).toISOString().split("T")[0]);
          return tDate === dateString;
        }),
      };
      
      const merchantSimBalances = {};
      if (floatToUse?.openingMerchantSimEcash && typeof floatToUse.openingMerchantSimEcash === 'object') {
        Object.keys(floatToUse.openingMerchantSimEcash).forEach(simId => {
          merchantSimBalances[simId] = parseFloat(floatToUse.openingMerchantSimEcash[simId] || 0);
        });
      }
      const merchantSimPhysicalCash = {};
      if (floatToUse?.openingMerchantSimPhysicalCash && typeof floatToUse.openingMerchantSimPhysicalCash === 'object') {
        Object.keys(floatToUse.openingMerchantSimPhysicalCash).forEach(simId => {
          merchantSimPhysicalCash[simId] = parseFloat(floatToUse.openingMerchantSimPhysicalCash[simId] || 0);
        });
      }

      let physicalCash = parseFloat(floatToUse?.openingPhysicalCash || 0);
      let mtnEcash = parseFloat(floatToUse?.openingMtnEcash || 0);
      let vodafoneEcash = parseFloat(floatToUse?.openingVodafoneEcash || 0);
      let airtelTigoEcash = parseFloat(floatToUse?.openingAirtelTigoEcash || 0);
      let telecelEcash = parseFloat(floatToUse?.openingTelecelEcash || 0);
      const bankBalances = {};
      if (floatToUse?.openingBankBalances && typeof floatToUse.openingBankBalances === "object") {
        Object.keys(floatToUse.openingBankBalances).forEach((name) => {
          bankBalances[name] = parseFloat(floatToUse.openingBankBalances[name] || 0);
        });
      }
      const businessId = selectedBusinessId || userData?.businessId;
      let allSims = [];
      let bankList = [];
      try {
        allSims = await merchantSimService.getByBranch(branchId, businessId);
        bankList = await bankService.getByBusinessId(businessId);
      } catch (_) {}
      allSims.forEach((sim) => {
        const id = sim.merchantSimId || sim.id;
        if (merchantSimBalances[id] === undefined) merchantSimBalances[id] = 0;
        if (merchantSimPhysicalCash[id] === undefined) merchantSimPhysicalCash[id] = 0;
      });
      (bankList || []).forEach((b) => {
        const name = b.bankName || b;
        if (bankBalances[name] === undefined) bankBalances[name] = 0;
      });
      // Process MoMo transactions if they exist
      if (filteredTransactions?.momo && Array.isArray(filteredTransactions.momo)) {
      filteredTransactions.momo.forEach((t) => {
        const amount = parseFloat(t.amount || 0);
          // Cash In: Customer gives physical cash → Agent credits customer E-Cash
          // Physical Cash increases, E-Cash decreases
        const simHasPhysicalFloat = floatToUse?.openingMerchantSimPhysicalCash && typeof floatToUse.openingMerchantSimPhysicalCash === "object"
          ? (simId) => floatToUse.openingMerchantSimPhysicalCash[simId] != null
          : () => false;
        if (t.transactionType === "cash_in" || t.transactionType === "deposit") {
            if (t.merchantSimId && simHasPhysicalFloat(t.merchantSimId)) {
              if (merchantSimPhysicalCash[t.merchantSimId] === undefined) merchantSimPhysicalCash[t.merchantSimId] = parseFloat(floatToUse?.openingMerchantSimPhysicalCash?.[t.merchantSimId] || 0);
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
            const useSimFloat = t.physicalCashSource === "sim_float" || (t.physicalCashSource !== "branch_opening" && t.merchantSimId && simHasPhysicalFloat(t.merchantSimId));
            if (useSimFloat && t.merchantSimId && simHasPhysicalFloat(t.merchantSimId)) {
              if (merchantSimPhysicalCash[t.merchantSimId] === undefined) merchantSimPhysicalCash[t.merchantSimId] = parseFloat(floatToUse?.openingMerchantSimPhysicalCash?.[t.merchantSimId] || 0);
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
      
      // Process bank transactions if they exist
      if (filteredTransactions?.bank && Array.isArray(filteredTransactions.bank)) {
        filteredTransactions.bank.forEach((t) => {
          const amount = parseFloat(t.amount || 0);
          if (isNaN(amount) || amount <= 0) {
            console.warn("Skipping invalid bank transaction:", t);
            return;
          }
          
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
        let simSalesQuery = query(
          collection(db, "sim_sales"),
          where("branchId", "==", branchId),
          where("date", "==", dateString)
        );
        
        // If user is not admin, filter by recordedBy
        if (!isAdmin && userData?.userId) {
          simSalesQuery = query(
            collection(db, "sim_sales"),
            where("branchId", "==", branchId),
            where("date", "==", dateString),
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
              physicalCash += amount;
              if (sale.merchantSimId && merchantSimBalances.hasOwnProperty(sale.merchantSimId)) {
                merchantSimBalances[sale.merchantSimId] -= amount;
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
              
              // If paid in cash, increase physical cash
              if (sale.paymentMethod === "cash") {
                physicalCash += price;
              }
            }
          }
        });
      } catch (error) {
        console.error("Error loading SIM sales:", error);
      }

      // Process top-ups for the float date
      try {
        const topUps = await topUpService.getByBranchAndDate(branchId, floatDate);
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
            if (merchantSimBalances.hasOwnProperty(topUp.fromMerchantSimId)) {
              merchantSimBalances[topUp.fromMerchantSimId] -= amt;
            }
            if (topUp.bankName) {
              bankBalances[topUp.bankName] = (bankBalances[topUp.bankName] ?? 0) + amt;
            }
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

      setExpectedBalances({
        physicalCash,
        mtnEcash,
        vodafoneEcash,
        airtelTigoEcash,
        telecelEcash,
        merchantSimEcash: merchantSimBalances,
        merchantSimPhysicalCash,
        bankBalances,
      });
    } catch (error) {
      console.error("Error calculating expected balances:", error);
      const floatToUse = selectedPendingFloat || todayFloat;
      setExpectedBalances({
        physicalCash: parseFloat(floatToUse?.openingPhysicalCash || 0),
        mtnEcash: parseFloat(floatToUse?.openingMtnEcash || 0),
        vodafoneEcash: parseFloat(floatToUse?.openingVodafoneEcash || 0),
        airtelTigoEcash: parseFloat(floatToUse?.openingAirtelTigoEcash || 0),
        telecelEcash: parseFloat(floatToUse?.openingTelecelEcash || 0),
        merchantSimPhysicalCash: floatToUse?.openingMerchantSimPhysicalCash && typeof floatToUse.openingMerchantSimPhysicalCash === 'object' ? { ...floatToUse.openingMerchantSimPhysicalCash } : {},
        bankBalances: floatToUse?.openingBankBalances && typeof floatToUse.openingBankBalances === 'object' ? { ...floatToUse.openingBankBalances } : {},
      });
    }
  };

  const loadTodayFloat = async (skipModeReset = false) => {
    try {
      if (!branchId) return;
      if (isCreatingFloat.current) return;
      const today = new Date();
      let float = null;
      if (userData?.role === "branch_manager" || userData?.role === "admin") {
        const floats = await dailyFloatService.getFloatsByBranchAndDate(branchId, today);
        float = floats.length > 0 ? floats[0] : null;
      } else {
        float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userData?.userId);
      }
      if (float) {
        hasFloatInState.current = true;
        setTodayFloat(float);
        // Only load closing values if they exist, otherwise let auto-population handle it
        const hasClosingValues = float.closingPhysicalCash && float.closingPhysicalCash !== "";
        setFormData((prev) => {
          const newFormData = {
            ...prev,
          ...float,
            date: float.date?.toDate?.()?.toISOString().split("T")[0] || 
                  (typeof float.date === 'string' ? float.date : prev.date),
          };
          
          // Only set closing values if they exist in the float, otherwise keep empty for auto-population
          if (!hasClosingValues) {
            newFormData.closingPhysicalCash = "";
            newFormData.closingMerchantSimEcash = {};
            newFormData.closingMerchantSimPhysicalCash = {};
            newFormData.closingBankBalances = {};
          } else {
            newFormData.closingPhysicalCash = float.closingPhysicalCash || "";
            newFormData.closingMerchantSimEcash = float.closingMerchantSimEcash || {};
            newFormData.closingMerchantSimPhysicalCash = float.closingMerchantSimPhysicalCash || {};
            newFormData.closingBankBalances = float.closingBankBalances || {};
          }
          newFormData.openingMerchantSimPhysicalCash = float.openingMerchantSimPhysicalCash || {};
          return newFormData;
        });
        const isClosed = float.closingPhysicalCash && float.closingPhysicalCash !== "";
        const unlockedByItAdmin = float.unlockedByItAdmin === true;
        setIsFloatClosedToday(isClosed && !unlockedByItAdmin);
        setClosedFloatIdForUnlock(isClosed ? float.floatId : null);
        if (!isClosed) {
          setMode("closing");
      } else {
          setMode("view");
          // Show good evening modal if float was just closed today
          const floatDate = float.date?.toDate ? float.date.toDate().toISOString().split("T")[0] : 
                           (typeof float.date === 'string' ? float.date : new Date(float.date).toISOString().split("T")[0]);
          const today = new Date().toISOString().split("T")[0];
          if (floatDate === today) {
            setShowGoodEveningModal(true);
          }
        }
      } else {
        hasFloatInState.current = false;
        setIsFloatClosedToday(false);
        setClosedFloatIdForUnlock(null);
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

  const loadPendingFloats = async () => {
    try {
      if (!branchId) return;
      const allFloats = await dailyFloatService.getByBranch(branchId, 100);
      const pending = allFloats.filter(f => {
        // A float is considered "unclosed" ONLY if there is no valid closing physical cash value recorded.
        // Treat both string and numeric values as valid as long as they are not empty/NaN.
        const rawClosing = f.closingPhysicalCash;
        const closingNumber =
          rawClosing !== undefined && rawClosing !== null && rawClosing !== ""
            ? parseFloat(rawClosing)
            : NaN;
        const hasValidClosing =
          rawClosing !== undefined &&
          rawClosing !== null &&
          rawClosing !== "" &&
          !Number.isNaN(closingNumber);
        const isUnclosed = !hasValidClosing;
        return isUnclosed;
      });
      setPendingFloats(pending);
    } catch (error) {
      console.error("Error loading pending floats:", error);
    }
  };

  const calculateVariance = () => {
    const floatToUse = selectedPendingFloat || todayFloat;
    if (!floatToUse) return { physicalCash: 0, mtn: 0, vodafone: 0, airtelTigo: 0, telecel: 0 };
    
    // Only calculate variance if closing values are entered
    const closingPhysical = parseFloat(formData.closingPhysicalCash || 0);
    if (!formData.closingPhysicalCash || formData.closingPhysicalCash === "") {
      return { physicalCash: 0, mtn: 0, vodafone: 0, airtelTigo: 0, telecel: 0, merchantSim: {} };
    }
    
    const expectedPhysical = expectedBalances.physicalCash;
    const physicalVariance = closingPhysical - expectedPhysical;

    // Calculate merchant SIM variances
    const merchantSimVariances = {};
    if (formData.closingMerchantSimEcash && expectedBalances.merchantSimEcash) {
      Object.keys(expectedBalances.merchantSimEcash).forEach(simId => {
        const closingValue = parseFloat(formData.closingMerchantSimEcash?.[simId] || 0);
        const expectedValue = expectedBalances.merchantSimEcash[simId] || 0;
        merchantSimVariances[simId] = closingValue - expectedValue;
      });
    }

    // Fallback to provider-level if merchant SIM data not available
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
      merchantSim: merchantSimVariances,
    };
  };

  const handleOpeningSubmit = async (e) => {
    e.preventDefault();
    if (!businessId || !branchId) {
      alert("Please select a business and branch first!");
      return;
    }
    
    // First check pendingFloats state (most up-to-date)
    if (pendingFloats.length > 0) {
      const firstPending = pendingFloats[0];
      const floatDate = firstPending.date?.toDate ? firstPending.date.toDate().toLocaleDateString() : new Date(firstPending.date).toLocaleDateString();
      alert(`Cannot create a new opening float. You have ${pendingFloats.length} unclosed float(s). Please close them first. The oldest pending float is from ${floatDate}.`);
      setShowPendingFloatsModal(true);
      return;
    }
    
    // Check if there's an unclosed float in history.
    // A float is considered unclosed ONLY if it has no valid closingPhysicalCash value.
    const unclosedFloatInHistory = floatHistory.find(f => {
      const rawClosing = f.closingPhysicalCash;
      const closingNumber =
        rawClosing !== undefined && rawClosing !== null && rawClosing !== ""
          ? parseFloat(rawClosing)
          : NaN;
      const hasValidClosing =
        rawClosing !== undefined &&
        rawClosing !== null &&
        rawClosing !== "" &&
        !Number.isNaN(closingNumber);
      return !hasValidClosing;
    });
    
    if (unclosedFloatInHistory) {
      const floatDate = unclosedFloatInHistory.date?.toDate ? unclosedFloatInHistory.date.toDate().toLocaleDateString() : new Date(unclosedFloatInHistory.date).toLocaleDateString();
      alert(`Cannot create a new opening float. Please close the previous float first. There is an unclosed float from ${floatDate} that needs to be closed.`);
      // Reload pending floats to show modal
      await loadPendingFloats();
      return;
    }
    
    // Also check todayFloat in state
    const today = new Date().toISOString().split("T")[0];
    const todayFloatDate = todayFloat?.date?.toDate ? todayFloat.date.toDate().toISOString().split("T")[0] : 
                          (typeof todayFloat?.date === 'string' ? todayFloat.date : null);
    const isTodayFloat = todayFloatDate === today;
    
    if (todayFloat && !isTodayFloat) {
      const rawClosing = todayFloat.closingPhysicalCash;
      const closingNumber =
        rawClosing !== undefined && rawClosing !== null && rawClosing !== ""
          ? parseFloat(rawClosing)
          : NaN;
      const hasValidClosing =
        rawClosing !== undefined &&
        rawClosing !== null &&
        rawClosing !== "" &&
        !Number.isNaN(closingNumber);
      const isUnclosed = !hasValidClosing;

      if (isUnclosed) {
      alert("Cannot create a new opening float. Please close the previous float first.");
      // Reload pending floats to show modal
      await loadPendingFloats();
      return;
      }
    }
    
    // Check database for any unclosed float (from any date)
    try {
      const allFloats = await dailyFloatService.getByBranch(branchId, 100); // Get more floats to check
      const unclosedFloat = allFloats.find(f => {
        // A float is considered "unclosed" ONLY if there is no valid closing physical cash value recorded.
        const rawClosing = f.closingPhysicalCash;
        const closingNumber =
          rawClosing !== undefined && rawClosing !== null && rawClosing !== ""
            ? parseFloat(rawClosing)
            : NaN;
        const hasValidClosing =
          rawClosing !== undefined &&
          rawClosing !== null &&
          rawClosing !== "" &&
          !Number.isNaN(closingNumber);
        const isUnclosed = !hasValidClosing;
        return isUnclosed;
      });
      
      if (unclosedFloat) {
        const floatDate = unclosedFloat.date?.toDate ? unclosedFloat.date.toDate().toLocaleDateString() : new Date(unclosedFloat.date).toLocaleDateString();
        alert(`Cannot create a new opening float. Please close the previous float first. There is an unclosed float from ${floatDate} that needs to be closed.`);
        // Reload pending floats to show modal
        await loadPendingFloats();
        return;
      }
    } catch (error) {
      console.error("Error checking for unclosed floats:", error);
      // Continue anyway - don't block if query fails, but log the error
    }
    
    setLoading(true);
    isCreatingFloat.current = true;
    try {
      // Check if this is a new day (no float exists for today)
      const today = new Date().toISOString().split("T")[0];
      const existingFloat = await dailyFloatService.getByBranchDateAndUser(branchId, new Date(today), userData?.userId);
      const isNewDay = !existingFloat;
      
      const floatId = await dailyFloatService.create({
        businessId: businessId,
        branchId: branchId,
        ...formData,
        recordedBy: userData.userId,
        recordedByName: userData.name || userData.email,
      });
      
      setMode("closing");
      setIsFloatClosedToday(false);
      
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
      
      // Log activity (best-effort)
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId,
          branchId,
          actionType: "float_opening_created",
          details: `Opening float recorded for ${formData.date} with opening physical cash GHS ${formData.openingPhysicalCash || "0.00"}.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log opening float activity:", logError);
      }

      // Show good morning modal if it's a new day
      if (isNewDay) {
        setShowGoodMorningModal(true);
      }
      
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
    
    // Check if user has permission to approve
    // Admin can approve for all branches in their assigned company
    // Branch Manager can only approve for their assigned branch
    // IT Admin cannot approve
    const isAdmin = userData?.role === "admin";
    const isBranchManager = userData?.role === "branch_manager";
    const isITAdmin = userData?.role === "it_admin";
    
    if (isITAdmin) {
      alert("IT Admin cannot approve variances.");
      return;
    }
    
    if (!isAdmin && !isBranchManager) {
      alert("You don't have permission to approve variances. Only admin or branch manager can approve.");
      return;
    }
    
    // Branch manager can only approve for their branch
    if (isBranchManager && userData?.branchId !== branchId) {
      alert("Branch managers can only approve variances for their assigned branch.");
      return;
    }
    
    // Admin can approve for any branch in their company
    if (isAdmin && todayFloat.businessId !== businessId) {
      alert("You can only approve variances for branches in your assigned company.");
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
      
      // Log variance approval (best-effort)
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId,
          branchId,
          actionType: "float_variance_approved",
          details: `Variance for float ${todayFloat.floatId} approved. Manager comments: ${formData.managerComments || todayFloat.managerComments || "None"}.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log float variance approval:", logError);
      }
    } catch (error) {
      alert("Error approving variance: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApproveVarianceFromHistory = async (float) => {
    // Check if user has permission to approve
    // Admin can approve for all branches in their assigned company
    // Branch Manager can only approve for their assigned branch
    // IT Admin cannot approve
    const isAdmin = userData?.role === "admin";
    const isBranchManager = userData?.role === "branch_manager";
    const isITAdmin = userData?.role === "it_admin";
    
    if (isITAdmin) {
      alert("IT Admin cannot approve variances.");
      return;
    }
    
    if (!isAdmin && !isBranchManager) {
      alert("You don't have permission to approve variances. Only admin or branch manager can approve.");
      return;
    }
    
    // Branch manager can only approve for their branch
    if (isBranchManager && userData?.branchId !== float.branchId) {
      alert("Branch managers can only approve variances for their assigned branch.");
      return;
    }
    
    // Admin can approve for any branch in their company
    if (isAdmin && float.businessId !== businessId) {
      alert("You can only approve variances for branches in your assigned company.");
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
    const floatToClose = selectedPendingFloat || todayFloat;
    if (!floatToClose) {
      alert("Please record opening float first!");
      return;
    }
    setLoading(true);
    try {
      const variances = calculateVariance();
      const totalVariance = Math.abs(variances.physicalCash);
      // Calculate variance percentage based on expected balance (after all transactions)
      const variancePercentage = expectedBalances.physicalCash > 0
        ? (totalVariance / expectedBalances.physicalCash) * 100
        : (totalVariance > 0 ? 100 : 0); // If expected is 0 but there's variance, show 100%

      // Allow approval of any variance amount - all variances can be flagged for review
      const status = Math.abs(variancePercentage) > 0 ? "flagged" : "pending";

      await dailyFloatService.update(floatToClose.floatId, {
        ...formData,
        variance: variances.physicalCash,
        variancePercentage,
        variances,
        businessId: businessId,
        branchId: branchId,
        recordedBy: userData.userId,
        recordedByName: userData.name || userData.email,
        status,
        unlockedByItAdmin: false,
      });
      
      // Log closing float (best-effort)
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId,
          branchId,
          actionType: "float_closing_recorded",
          details: `Closing float recorded for ${formData.date} with closing physical cash GHS ${formData.closingPhysicalCash || "0.00"}. Variance: GHS ${
            typeof variances.physicalCash === "number"
              ? variances.physicalCash.toFixed(2)
              : variances.physicalCash
          }.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log closing float activity:", logError);
      }

      setShowGoodEveningModal(true);
      setIsFloatClosedToday(true);
      setClosedFloatIdForUnlock(floatToClose.floatId);
      hasFloatInState.current = false;
      setTodayFloat(null);
      setSelectedPendingFloat(null);
      setShowCloseFloatModal(false);
      setMode("view");
      
      // Reset form data for new day
      setFormData({
        date: new Date().toISOString().split("T")[0],
        time: new Date().toLocaleTimeString(),
        openingPhysicalCash: "",
        openingMtnEcash: "",
        openingVodafoneEcash: "",
        openingAirtelTigoEcash: "",
        openingTelecelEcash: "",
        openingMerchantSimEcash: {},
        openingMerchantSimPhysicalCash: {},
        openingBankBalances: {},
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
        closingMerchantSimPhysicalCash: {},
        closingBankBalances: {},
        variance: "",
        varianceReason: "",
        cashBanked: [],
        ecashSentToHQ: "",
        ecashSentToBranch: "",
        ecashRecipient: "",
        ecashReference: "",
        managerComments: "",
        status: "pending",
      });
      setExpectedBalances({
        physicalCash: 0,
        mtnEcash: 0,
        vodafoneEcash: 0,
        airtelTigoEcash: 0,
        telecelEcash: 0,
        merchantSimEcash: {},
        merchantSimPhysicalCash: {},
      });
    } catch (error) {
      alert("Error recording closing float: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPendingFloat = async (float) => {
    setSelectedPendingFloat(float);
    setShowPendingFloatsModal(false);
    
    // Set todayFloat temporarily to use existing closing form logic
    setTodayFloat(float);
    
    // Load form data from the selected float
    setFormData(prev => ({
      ...prev,
      ...float,
      date: float.date?.toDate?.()?.toISOString().split("T")[0] ||
            (typeof float.date === 'string' ? float.date : prev.date),
      closingPhysicalCash: float.closingPhysicalCash || "",
      closingMerchantSimEcash: float.closingMerchantSimEcash || {},
      closingMerchantSimPhysicalCash: float.closingMerchantSimPhysicalCash || {},
      closingBankBalances: float.closingBankBalances || {},
    }));
    
    // Calculate expected balances for this float
    await calculateExpectedBalances();
    
    setShowCloseFloatModal(true);
  };

  const variances = calculateVariance();
  const totalVariance = Math.abs(variances.physicalCash);
  
  // Check if closing values have been entered
  const hasClosingValues = formData.closingPhysicalCash && formData.closingPhysicalCash !== "";
  
  // Calculate variance percentage based on expected balance (after all transactions)
  const variancePercentage = expectedBalances.physicalCash > 0
    ? (totalVariance / expectedBalances.physicalCash) * 100
    : (totalVariance > 0 ? 100 : 0); // If expected is 0 but there's variance, show 100%

  return (
    <div className="space-y-6 relative">
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
                {userData?.role === "it_admin" && closedFloatIdForUnlock && (
                  <Button
                    variant="outline"
                    onClick={async () => {
                      try {
                        await dailyFloatService.update(closedFloatIdForUnlock, { unlockedByItAdmin: true });
                        setClosedFloatIdForUnlock(null);
                        await loadTodayFloat();
                        calculateExpectedBalances();
                      } catch (e) {
                        alert("Failed to unlock: " + e.message);
                      }
                    }}
                  >
                    Unlock float (IT Admin only)
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div>
          <h1 className="page-title">Daily Float Management</h1>
          <p className="page-description">Record opening and closing float balances</p>
        </div>
        {!isFloatClosedToday && todayFloat && (
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
        <Card className={pendingFloats.length > 0 ? "opacity-50 pointer-events-none relative" : ""}>
          {pendingFloats.length > 0 && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/80 rounded-lg">
              <div className="text-center p-6 bg-yellow-50 border-2 border-yellow-400 rounded-lg shadow-lg max-w-md">
                <AlertCircle className="h-12 w-12 text-yellow-600 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-yellow-900 mb-2">
                  Cannot Create New Opening Float
                </h3>
                <p className="text-sm text-yellow-800 mb-4">
                  You have {pendingFloats.length} unclosed float(s) that must be closed before creating a new opening float.
                </p>
                <p className="text-xs text-yellow-700">
                  Please select a pending float from the modal above to close it first.
                </p>
              </div>
            </div>
          )}
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
                  {["MTN", "AirtelTigo", "Telecel"].map((provider) => {
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
                                <div key={sim.merchantSimId} className="space-y-2 md:col-span-2 grid gap-2 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={fieldKey}>{sim.simName} E-Cash (GHS) *</Label>
                                    <Input
                                      id={fieldKey}
                                      type="text"
                                      inputMode="decimal"
                                      value={value}
                                      onChange={(e) => {
                                        const updated = { ...formData.openingMerchantSimEcash, [sim.merchantSimId]: e.target.value };
                                        setFormData({ ...formData, openingMerchantSimEcash: updated });
                                      }}
                                      onBlur={(e) => {
                                        const num = parseFloat(e.target.value);
                                        if (!isNaN(num)) {
                                          const updated = { ...formData.openingMerchantSimEcash, [sim.merchantSimId]: num.toFixed(2) };
                                          setFormData({ ...formData, openingMerchantSimEcash: updated });
                                        }
                                      }}
                                      required
                                    />
                                  </div>
                                  <div>
                                    <Label htmlFor={`opening_physical_${sim.merchantSimId}`}>{sim.simName} Physical Cash (GHS)</Label>
                                    <Input
                                      id={`opening_physical_${sim.merchantSimId}`}
                                      type="text"
                                      inputMode="decimal"
                                      value={formData.openingMerchantSimPhysicalCash?.[sim.merchantSimId] ?? ""}
                                      onChange={(e) => {
                                        const updated = { ...formData.openingMerchantSimPhysicalCash, [sim.merchantSimId]: e.target.value };
                                        setFormData({ ...formData, openingMerchantSimPhysicalCash: updated });
                                      }}
                                      onBlur={(e) => {
                                        const num = parseFloat(e.target.value);
                                        if (!isNaN(num)) {
                                          const updated = { ...formData.openingMerchantSimPhysicalCash, [sim.merchantSimId]: num.toFixed(2) };
                                          setFormData({ ...formData, openingMerchantSimPhysicalCash: updated });
                                        }
                                      }}
                                    />
                                  </div>
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

              {banks.length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Opening Bank Balances (GHS)</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {banks.map((b) => {
                      const bankName = b.bankName || b.id;
                      const value = formData.openingBankBalances?.[bankName] ?? "";
                      return (
                        <div key={bankName} className="space-y-2">
                          <Label htmlFor={`opening_bank_${bankName}`}>{bankName}</Label>
                          <Input
                            id={`opening_bank_${bankName}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={value}
                            onChange={(e) => {
                              const updated = { ...formData.openingBankBalances, [bankName]: e.target.value };
                              setFormData({ ...formData, openingBankBalances: updated });
                            }}
                            onBlur={(e) => {
                              const num = parseFloat(e.target.value);
                              if (!isNaN(num) && num >= 0) {
                                const updated = { ...formData.openingBankBalances, [bankName]: num.toFixed(2) };
                                setFormData({ ...formData, openingBankBalances: updated });
                              }
                            }}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                    <div className="flex items-center justify-between">
                    <Label htmlFor="closingPhysicalCash">Physical Cash in Hand (GHS) *</Label>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={async () => {
                          // Recalculate expected balances first to ensure latest values
                          await calculateExpectedBalances();
                          // Wait a bit for state to update
                          setTimeout(() => {
                            const merchantSimEcash = {};
                            if (expectedBalances.merchantSimEcash && typeof expectedBalances.merchantSimEcash === 'object') {
                              Object.keys(expectedBalances.merchantSimEcash).forEach(simId => {
                                const expectedValue = expectedBalances.merchantSimEcash[simId];
                                if (expectedValue !== undefined && expectedValue !== null && !isNaN(expectedValue)) {
                                  merchantSimEcash[simId] = parseFloat(expectedValue).toFixed(2);
                                }
                              });
                            }
                            
                            const closingBankBalances = {};
                            if (expectedBalances.bankBalances && typeof expectedBalances.bankBalances === "object") {
                              Object.keys(expectedBalances.bankBalances).forEach((name) => {
                                const v = expectedBalances.bankBalances[name];
                                if (v !== undefined && v !== null && !isNaN(v)) closingBankBalances[name] = parseFloat(v).toFixed(2);
                              });
                            }
                            setFormData(prev => ({
                              ...prev,
                              closingPhysicalCash: expectedBalances.physicalCash.toFixed(2),
                              closingMerchantSimEcash: { ...prev.closingMerchantSimEcash, ...merchantSimEcash },
                              closingBankBalances: { ...prev.closingBankBalances, ...closingBankBalances },
                            }));
                          }, 100);
                        }}
                      >
                        🔄 Sync with Reconciliation
                      </Button>
                    </div>
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
                        Expected (from Reconciliation): GHS {expectedBalances.physicalCash.toFixed(2)}
                      </p>
                    )}
                  </div>
                  {/* Merchant SIM E-Cash sections per provider for closing */}
                  {["MTN", "AirtelTigo", "Telecel"].map((provider) => {
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
                              const expectedValue = expectedBalances.merchantSimEcash?.[sim.merchantSimId] || 0;
                              const physicalValue = formData.closingMerchantSimPhysicalCash?.[sim.merchantSimId] ?? "";
                              const expectedPhysical = expectedBalances.merchantSimPhysicalCash?.[sim.merchantSimId] ?? 0;
                              return (
                                <div key={sim.merchantSimId} className="space-y-2 md:col-span-2 grid gap-2 md:grid-cols-2">
                                  <div>
                                    <Label htmlFor={fieldKey}>{sim.simName} E-Cash (GHS) *</Label>
                                    <Input
                                      id={fieldKey}
                                      type="text"
                                      inputMode="decimal"
                                      value={value}
                                      onChange={(e) => {
                                        const updated = { ...formData.closingMerchantSimEcash, [sim.merchantSimId]: e.target.value };
                                        setFormData({ ...formData, closingMerchantSimEcash: updated });
                                      }}
                                      onBlur={(e) => {
                                        const num = parseFloat(e.target.value);
                                        if (!isNaN(num)) {
                                          const updated = { ...formData.closingMerchantSimEcash, [sim.merchantSimId]: num.toFixed(2) };
                                          setFormData({ ...formData, closingMerchantSimEcash: updated });
                                        }
                                      }}
                                      required
                                    />
                                    {expectedValue > 0 && <p className="text-xs text-muted-foreground">Expected: GHS {expectedValue.toFixed(2)}</p>}
                                  </div>
                                  <div>
                                    <Label htmlFor={`closing_physical_${sim.merchantSimId}`}>{sim.simName} Physical Cash (GHS)</Label>
                                    <Input
                                      id={`closing_physical_${sim.merchantSimId}`}
                                      type="text"
                                      inputMode="decimal"
                                      value={physicalValue}
                                      onChange={(e) => {
                                        const updated = { ...formData.closingMerchantSimPhysicalCash, [sim.merchantSimId]: e.target.value };
                                        setFormData({ ...formData, closingMerchantSimPhysicalCash: updated });
                                      }}
                                      onBlur={(e) => {
                                        const num = parseFloat(e.target.value);
                                        if (!isNaN(num)) {
                                          const updated = { ...formData.closingMerchantSimPhysicalCash, [sim.merchantSimId]: num.toFixed(2) };
                                          setFormData({ ...formData, closingMerchantSimPhysicalCash: updated });
                                        }
                                      }}
                                    />
                                    {expectedPhysical > 0 && <p className="text-xs text-muted-foreground">Expected: GHS {expectedPhysical.toFixed(2)}</p>}
                                  </div>
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

              {/* Closing Bank Balances – includes banks with no opening float (e.g. received transfer from SIM) */}
              {expectedBalances.bankBalances && typeof expectedBalances.bankBalances === "object" && Object.keys(expectedBalances.bankBalances).length > 0 && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Closing Bank Balances (GHS)</h3>
                  <p className="text-sm text-muted-foreground mb-3">Banks that had activity (e.g. SIM→Bank or Bank→SIM transfers) — enter actual closing balance for each.</p>
                  <div className="grid gap-4 md:grid-cols-2">
                    {Object.keys(expectedBalances.bankBalances).map((bankName) => {
                      const expectedVal = expectedBalances.bankBalances[bankName];
                      const value = formData.closingBankBalances?.[bankName] ?? "";
                      return (
                        <div key={bankName} className="space-y-2">
                          <Label htmlFor={`closing_bank_${bankName}`}>{bankName}</Label>
                          <Input
                            id={`closing_bank_${bankName}`}
                            type="number"
                            step="0.01"
                            min="0"
                            value={value}
                            onChange={(e) => {
                              const updated = { ...formData.closingBankBalances, [bankName]: e.target.value };
                              setFormData({ ...formData, closingBankBalances: updated });
                            }}
                            onBlur={(e) => {
                              const num = parseFloat(e.target.value);
                              if (!isNaN(num) && num >= 0) {
                                const updated = { ...formData.closingBankBalances, [bankName]: num.toFixed(2) };
                                setFormData({ ...formData, closingBankBalances: updated });
                              }
                            }}
                          />
                          <p className="text-xs text-muted-foreground">Expected: GHS {(expectedVal ?? 0).toFixed(2)}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {hasClosingValues && (
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Variance Analysis</h3>
                  <div className={`space-y-2 p-4 border rounded-md ${
                    totalVariance === 0 
                      ? "bg-green-50 border-green-200" 
                      : variancePercentage > 2 
                        ? "bg-red-50 border-red-200" 
                        : "bg-yellow-50 border-yellow-200"
                  }`}>
                    <div className="flex items-center gap-2">
                      {totalVariance === 0 ? (
                        <CheckCircle className="h-5 w-5 text-green-600" />
                      ) : variancePercentage > 2 ? (
                        <XCircle className="h-5 w-5 text-red-600" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-yellow-600" />
                      )}
                      <span className="font-semibold">
                        Physical Cash Variance: GHS {variances.physicalCash >= 0 ? `+${variances.physicalCash.toFixed(2)}` : variances.physicalCash.toFixed(2)} (
                        {variancePercentage.toFixed(2)}%)
                      </span>
                    </div>
                    {totalVariance === 0 && (
                      <p className="text-sm text-green-600 font-semibold">
                        ✅ Balanced - No variance detected
                      </p>
                    )}
                    {totalVariance > 0 && variancePercentage > 2 && (
                      <p className="text-sm text-red-600 font-semibold">
                        ⚠️ Major variance detected! Manager approval required.
                      </p>
                    )}
                    {totalVariance > 0 && variancePercentage <= 2 && (
                      <p className="text-sm text-yellow-600 font-semibold">
                        ⚠️ Minor variance detected
                      </p>
                    )}
                    {/* Show merchant SIM variances if available */}
                    {variances.merchantSim && Object.keys(variances.merchantSim).length > 0 && (
                      <div className="space-y-1 text-sm mt-2">
                        <p className="font-semibold">Merchant SIM Variances:</p>
                        {Object.keys(variances.merchantSim).map(simId => {
                          const sim = merchantSims.find(s => (s.merchantSimId || s.id) === simId);
                          const simVariance = variances.merchantSim[simId];
                          return (
                            <p key={simId}>
                              {sim?.simName || simId}: GHS {simVariance >= 0 ? `+${simVariance.toFixed(2)}` : simVariance.toFixed(2)}
                            </p>
                          );
                        })}
                      </div>
                    )}
                    {/* Fallback to provider-level if merchant SIM data not available */}
                    {(!variances.merchantSim || Object.keys(variances.merchantSim).length === 0) && (
                    <div className="space-y-1 text-sm">
                        <p>MTN Variance: GHS {variances.mtn >= 0 ? `+${variances.mtn.toFixed(2)}` : variances.mtn.toFixed(2)}</p>
                        <p>Vodafone Variance: GHS {variances.vodafone >= 0 ? `+${variances.vodafone.toFixed(2)}` : variances.vodafone.toFixed(2)}</p>
                        <p>AirtelTigo Variance: GHS {variances.airtelTigo >= 0 ? `+${variances.airtelTigo.toFixed(2)}` : variances.airtelTigo.toFixed(2)}</p>
                        <p>Telecel Variance: GHS {variances.telecel >= 0 ? `+${variances.telecel.toFixed(2)}` : variances.telecel.toFixed(2)}</p>
                    </div>
                    )}
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

        {/* Approval Section - branch manager (own branch) or admin (any) can approve closed floats */}
        {todayFloat.status !== "approved" &&
         ((userData?.role === "branch_manager" && userData?.branchId === branchId) || userData?.role === "admin") && (
              <div className="border-t pt-4">
                <h3 className="text-lg font-semibold mb-4">Variance Approval</h3>
                <div className="space-y-4">
              {parseFloat(todayFloat.variance || 0) !== 0 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-md">
                  <p className="text-sm font-semibold text-yellow-800 mb-2">
                    ⚠️ This float has been flagged due to variance ({parseFloat(todayFloat.variancePercentage || 0).toFixed(2)}%)
                  </p>
                  <p className="text-sm text-yellow-700">
                    Variance: GHS {parseFloat(todayFloat.variance || 0).toLocaleString()}
                  </p>
                </div>
              )}
                  
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {floatHistory.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
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

                  // Derive a clearer status for display:
                  // - "Pending Close"  => no closing values entered yet
                  // - "Pending Approval" => closed, zero variance, waiting for manager/admin
                  // - "Variance Flagged"  => closed, non‑zero variance
                  // - "Approved"          => variance approved
                  const hasClosing = !!float.closingPhysicalCash && float.closingPhysicalCash !== "";
                  let statusLabel = "Pending Close";
                  let statusVariant = "secondary";

                  if (hasClosing) {
                    if (float.status === "approved") {
                      statusLabel = "Approved";
                      statusVariant = "default";
                    } else if (float.status === "flagged") {
                      statusLabel = "Variance Flagged";
                      statusVariant = "destructive";
                    } else {
                      // status "pending" after closing now means: pending variance approval
                      statusLabel = "Pending Approval";
                      statusVariant = "secondary";
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
                      <Badge variant={statusVariant}>{statusLabel}</Badge>
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      {/* Pending Floats Modal - Only show floats from previous days (not today) */}
      {showPendingFloatsModal && (() => {
        const today = new Date().toISOString().split("T")[0];
        const previousDayFloats = pendingFloats.filter(float => {
          const floatDate = float.date?.toDate ? float.date.toDate().toISOString().split("T")[0] : 
                           (typeof float.date === 'string' ? float.date : new Date(float.date).toISOString().split("T")[0]);
          return floatDate !== today;
        });
        
        // Don't show modal if there are no previous day floats
        if (previousDayFloats.length === 0) {
          return null;
        }
        
        return (
          <div 
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={(e) => {
              // Prevent closing by clicking outside
              if (e.target === e.currentTarget) {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
          >
            <Card className="w-full max-w-3xl max-h-[90vh] overflow-y-auto">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-yellow-600" />
                  Pending Floats to Close
                </CardTitle>
                <p className="text-sm text-muted-foreground">
                  You have {previousDayFloats.length} unclosed float(s) from previous days. Please close them before creating a new opening float.
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {previousDayFloats.map((float) => {
                    const floatDate = float.date?.toDate ? float.date.toDate().toLocaleDateString() : new Date(float.date).toLocaleDateString();
                    return (
                      <div
                        key={float.floatId}
                        onClick={() => handleSelectPendingFloat(float)}
                        className="p-4 border rounded-md cursor-pointer hover:bg-accent transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold">Float from {floatDate}</h3>
                            <p className="text-sm text-muted-foreground">
                              Opening Physical Cash: GHS {parseFloat(float.openingPhysicalCash || 0).toLocaleString()}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              Status: <Badge variant={float.status === "pending" ? "default" : "destructive"}>{float.status}</Badge>
                            </p>
                          </div>
                          <Button variant="outline">Close Float</Button>
                        </div>
    </div>
  );
                  })}
                </div>
                <div className="flex justify-end gap-4 mt-6">
                  <p className="text-sm text-muted-foreground flex-1">
                    ⚠️ You must close all pending floats from previous days before creating a new opening float. Please select a float above to close it.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      })()}

      {/* Close Pending Float Modal */}
      {showCloseFloatModal && selectedPendingFloat && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="w-full max-w-4xl max-h-[90vh] overflow-y-auto my-4">
            <CardHeader>
              <CardTitle>Close Float - {selectedPendingFloat.date?.toDate ? selectedPendingFloat.date.toDate().toLocaleDateString() : new Date(selectedPendingFloat.date).toLocaleDateString()}</CardTitle>
              <p className="text-sm text-muted-foreground">
                Complete the closing form to close this pending float.
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleClosingSubmit} className="space-y-6">
                {/* Reuse the same closing form structure from mode === "closing" */}
                <div className="border-t pt-4">
                  <h3 className="text-lg font-semibold mb-4">Closing Balances</h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="modalClosingPhysicalCash">Physical Cash in Hand (GHS) *</Label>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            await calculateExpectedBalances();
                            setTimeout(() => {
                              const merchantSimEcash = {};
                              if (expectedBalances.merchantSimEcash && typeof expectedBalances.merchantSimEcash === 'object') {
                                Object.keys(expectedBalances.merchantSimEcash).forEach(simId => {
                                  const expectedValue = expectedBalances.merchantSimEcash[simId];
                                  if (expectedValue !== undefined && expectedValue !== null && !isNaN(expectedValue)) {
                                    merchantSimEcash[simId] = parseFloat(expectedValue).toFixed(2);
                                  }
                                });
                              }
                              setFormData(prev => ({
                                ...prev,
                                closingPhysicalCash: expectedBalances.physicalCash.toFixed(2),
                                closingMerchantSimEcash: { ...prev.closingMerchantSimEcash, ...merchantSimEcash },
                              }));
                            }, 100);
                          }}
                        >
                          🔄 Sync with Reconciliation
                        </Button>
                      </div>
                      <Input
                        id="modalClosingPhysicalCash"
                        type="number"
                        step="0.01"
                        value={formData.closingPhysicalCash}
                        onChange={(e) => setFormData({ ...formData, closingPhysicalCash: e.target.value })}
                        required
                      />
                      {expectedBalances.physicalCash > 0 && (
                        <p className="text-sm text-muted-foreground">
                          Expected (from Reconciliation): GHS {expectedBalances.physicalCash.toFixed(2)}
                        </p>
                      )}
                    </div>
                    {/* Merchant SIM E-Cash sections per provider for closing */}
                    {["MTN", "AirtelTigo", "Telecel"].map((provider) => {
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
                                const fieldKey = `modal_closing_${sim.merchantSimId}`;
                                const value = formData.closingMerchantSimEcash?.[sim.merchantSimId] || "";
                                const expectedValue = expectedBalances.merchantSimEcash?.[sim.merchantSimId] || 0;
                                const physicalValue = formData.closingMerchantSimPhysicalCash?.[sim.merchantSimId] ?? "";
                                const expectedPhysical = expectedBalances.merchantSimPhysicalCash?.[sim.merchantSimId] ?? 0;
                                return (
                                  <div key={sim.merchantSimId} className="space-y-2 md:col-span-2 grid gap-2 md:grid-cols-2">
                                    <div>
                                      <Label htmlFor={fieldKey}>{sim.simName} E-Cash (GHS) *</Label>
                                      <Input
                                        id={fieldKey}
                                        type="text"
                                        inputMode="decimal"
                                        value={value}
                                        onChange={(e) => {
                                          const updated = { ...formData.closingMerchantSimEcash, [sim.merchantSimId]: e.target.value };
                                          setFormData({ ...formData, closingMerchantSimEcash: updated });
                                        }}
                                        onBlur={(e) => {
                                          const num = parseFloat(e.target.value);
                                          if (!isNaN(num)) {
                                            const updated = { ...formData.closingMerchantSimEcash, [sim.merchantSimId]: num.toFixed(2) };
                                            setFormData({ ...formData, closingMerchantSimEcash: updated });
                                          }
                                        }}
                                        required
                                      />
                                      {expectedValue > 0 && <p className="text-xs text-muted-foreground">Expected: GHS {expectedValue.toFixed(2)}</p>}
                                    </div>
                                    <div>
                                      <Label htmlFor={`modal_closing_physical_${sim.merchantSimId}`}>{sim.simName} Physical Cash (GHS)</Label>
                                      <Input
                                        id={`modal_closing_physical_${sim.merchantSimId}`}
                                        type="text"
                                        inputMode="decimal"
                                        value={physicalValue}
                                        onChange={(e) => {
                                          const updated = { ...formData.closingMerchantSimPhysicalCash, [sim.merchantSimId]: e.target.value };
                                          setFormData({ ...formData, closingMerchantSimPhysicalCash: updated });
                                        }}
                                        onBlur={(e) => {
                                          const num = parseFloat(e.target.value);
                                          if (!isNaN(num)) {
                                            const updated = { ...formData.closingMerchantSimPhysicalCash, [sim.merchantSimId]: num.toFixed(2) };
                                            setFormData({ ...formData, closingMerchantSimPhysicalCash: updated });
                                          }
                                        }}
                                      />
                                      {expectedPhysical > 0 && <p className="text-xs text-muted-foreground">Expected: GHS {expectedPhysical.toFixed(2)}</p>}
                                    </div>
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

                {/* Variance Analysis - only show if values entered */}
                {hasClosingValues && totalVariance > 0 && (
                  <div className="border-t pt-4">
                    <h3 className="text-lg font-semibold mb-4">Variance Analysis</h3>
                    <div className={`space-y-2 p-4 border rounded-md ${
                      totalVariance === 0 
                        ? "bg-green-50 border-green-200" 
                        : variancePercentage > 2 
                          ? "bg-red-50 border-red-200" 
                          : "bg-yellow-50 border-yellow-200"
                    }`}>
                      <div className="flex items-center gap-2">
                        {totalVariance === 0 ? (
                          <CheckCircle className="h-5 w-5 text-green-600" />
                        ) : variancePercentage > 2 ? (
                          <XCircle className="h-5 w-5 text-red-600" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-yellow-600" />
                        )}
                        <span className="font-semibold">
                          Total Variance: GHS {totalVariance > 0 ? "+" : ""}{totalVariance.toLocaleString()} ({variancePercentage.toFixed(2)}%)
                        </span>
                      </div>
                      <div className="space-y-2">
                        <div>
                          <Label htmlFor="modalVarianceReason">Variance Reason *</Label>
                          <Input
                            id="modalVarianceReason"
                            value={formData.varianceReason}
                            onChange={(e) => setFormData({ ...formData, varianceReason: e.target.value })}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="flex justify-end gap-4 border-t pt-4">
                  <Button type="button" variant="outline" onClick={() => {
                    setShowCloseFloatModal(false);
                    setSelectedPendingFloat(null);
                    setTodayFloat(null);
                  }}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Closing..." : "Close Float"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Good Evening Modal */}
      {showGoodEveningModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="text-6xl">🌙</div>
                <h2 className="text-2xl font-bold">Have a Good Evening!</h2>
                <p className="text-muted-foreground">
                  Your float has been closed for today. All activities are now locked until a new day begins.
                </p>
                <Button
                  onClick={() => setShowGoodEveningModal(false)}
                  className="w-full"
                >
                  Close
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Good Morning Modal */}
      {showGoodMorningModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center">
          <Card className="w-full max-w-md mx-4">
            <CardContent className="pt-6">
              <div className="text-center space-y-4">
                <div className="text-6xl">☀️</div>
                <h2 className="text-2xl font-bold">Good Morning!</h2>
                <p className="text-muted-foreground">
                  Your opening float has been created. You can now start day operations.
                </p>
                <Button
                  onClick={() => setShowGoodMorningModal(false)}
                  className="w-full"
                >
                  Start Day
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Block UI if float is closed for today */}
      {isFloatClosedToday && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-center justify-center pointer-events-auto">
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

      {showTopUpModal && (
        <TopUpModal
          branchId={branchId}
          businessId={businessId}
          userId={userData?.userId}
          userName={userData?.name || userData?.email}
          currentBalances={expectedBalances}
          onClose={() => setShowTopUpModal(false)}
          onSuccess={() => {
            calculateExpectedBalances();
          }}
        />
      )}
    </div>
  );
}
