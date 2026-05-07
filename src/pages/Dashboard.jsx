import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import {
  transactionService,
  expenseService,
  generalDailyCommissionService,
  dailyFloatService,
  topUpService,
  commissionConfigService,
  branchService,
} from "../services/firestoreService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../components/ui/table";
import {
  Activity,
  Wallet,
  CreditCard,
  Clock,
  FileText,
  ArrowUpCircle,
  Receipt,
  BarChart3,
  FileCheck,
  MapPin,
  Users,
  Building2,
  Plus,
  Pencil,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "../components/ui/button";
import { cn } from "../utils/cn";
import TopUpModal from "../components/TopUpModal";
import { collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { db } from "../lib/firebase";
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line, AreaChart, Area } from "recharts";

// Date range helpers
const getDateRange = (period) => {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  switch (period) {
    case "today":
      return { start: today, end: new Date() };
    case "week":
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay()); // Start of week (Sunday)
      return { start: weekStart, end: new Date() };
    case "month":
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      return { start: monthStart, end: new Date() };
    case "year":
      const yearStart = new Date(today.getFullYear(), 0, 1);
      return { start: yearStart, end: new Date() };
    default:
      return { start: today, end: new Date() };
  }
};

// Query transactions by date range
const queryTransactionsByRange = async (branchId, period, userId, userRole) => {
  const { start, end } = getDateRange(period);
  const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
  
  try {
    // For today, use optimized query; for other periods, query all and filter in memory
    let momoTransactions = [];
    let bankTransactions = [];
    
    if (period === "today") {
      // Use getTodayTransactions for today (optimized)
      const todayData = await transactionService.getTodayTransactions(branchId, userId, userRole);
      momoTransactions = todayData.momo || [];
      bankTransactions = todayData.bank || [];
    } else {
      // For week/month/year: query all transactions and filter in memory
      // Query MoMo transactions
      let momoQ = query(
        collection(db, "momo_transactions"),
        where("branchId", "==", branchId),
        limit(1000)
      );
      
      if (!isAdmin && userId) {
        momoQ = query(
          collection(db, "momo_transactions"),
          where("branchId", "==", branchId),
          where("recordedBy", "==", userId),
          limit(1000)
        );
      }
      
      const momoSnapshot = await getDocs(momoQ).catch(() => ({ docs: [] }));
      momoTransactions = momoSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Query bank transactions
      let bankQ = query(
        collection(db, "bank_transactions"),
        where("branchId", "==", branchId),
        limit(1000)
      );
      
      if (!isAdmin && userId) {
        bankQ = query(
          collection(db, "bank_transactions"),
          where("branchId", "==", branchId),
          where("recordedBy", "==", userId),
          limit(1000)
        );
      }
      
      const bankSnapshot = await getDocs(bankQ).catch(() => ({ docs: [] }));
      bankTransactions = bankSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Filter by date range in memory
      const filterByDate = (t) => {
        if (!t.date) return false;
        let tDate;
        if (typeof t.date === 'string') {
          // Handle YYYY-MM-DD format strings correctly
          const dateParts = t.date.split("-");
          if (dateParts.length === 3) {
            // Create date in local timezone to match start/end dates
            tDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
          } else {
            tDate = new Date(t.date);
          }
        } else if (t.date.toDate) {
          tDate = t.date.toDate();
        } else {
          tDate = new Date(t.date);
        }
        
        // Normalize times to start of day for comparison
        const tDateNormalized = new Date(tDate.getFullYear(), tDate.getMonth(), tDate.getDate());
        const startNormalized = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const endNormalized = new Date(end.getFullYear(), end.getMonth(), end.getDate());
        
        return tDateNormalized >= startNormalized && tDateNormalized <= endNormalized;
      };
      
      momoTransactions = momoTransactions.filter(filterByDate);
      bankTransactions = bankTransactions.filter(filterByDate);
      
      console.log(`Filtered ${period} transactions:`, {
        momo: momoTransactions.length,
        bank: bankTransactions.length,
        dateRange: { start: start.toISOString(), end: end.toISOString() }
      });
    }
    
    return { momo: momoTransactions, bank: bankTransactions };
  } catch (error) {
    console.error(`Error querying ${period} transactions:`, error);
    return { momo: [], bank: [] };
  }
};

function getGreeting() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return "Good morning";
  if (h >= 12 && h < 17) return "Good afternoon";
  if (h >= 17 && h < 21) return "Good evening";
  return "Good night";
}

function getRoleLabel(role) {
  const labels = {
    it_admin: "IT Admin",
    admin: "Admin",
    branch_manager: "Branch Manager",
    normal_user: "Normal User",
    agent_user: "Agent",
  };
  return labels[role] || (role ? String(role).replace(/_/g, " ") : "User");
}

export default function Dashboard() {
  const { userData, selectedBranchId, selectedBusinessId } = useAuth();
  const [branchName, setBranchName] = useState("");
  const [liveTime, setLiveTime] = useState(() => new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const [showTopUpModal, setShowTopUpModal] = useState(false);
  const [quickActionsOpen, setQuickActionsOpen] = useState(false);
  
  // MoMo Transaction Stats by Provider
  const [momoStats, setMomoStats] = useState({
    today: { byProvider: {}, total: { cashIn: 0, cashOut: 0, count: 0 } },
    week: { byProvider: {}, total: { cashIn: 0, cashOut: 0, count: 0 } },
    month: { byProvider: {}, total: { cashIn: 0, cashOut: 0, count: 0 } },
    year: { byProvider: {}, total: { cashIn: 0, cashOut: 0, count: 0 } },
  });
  const [momoTransactionsByPeriod, setMomoTransactionsByPeriod] = useState({
    today: [],
    week: [],
    month: [],
    year: [],
  });

  // Global filter for dashboard views (charts, recent transactions, etc.)
  const [filterPeriod, setFilterPeriod] = useState("today"); // today | week | month | custom
  const [customRange, setCustomRange] = useState({ start: "", end: "" });
  
  // Bank Transaction Stats
  const [bankStats, setBankStats] = useState({
    today: { count: 0, total: 0 },
    week: { count: 0, total: 0 },
    year: { count: 0, total: 0 },
  });
  
  // Bank Transactions by Month (for table)
  const [bankTransactionsByMonth, setBankTransactionsByMonth] = useState([]);
  
  // Commission Stats
  const [commissionStats, setCommissionStats] = useState({
    bank: { month: 0, year: 0, byBank: {} },
    momo: {
      today: { byProvider: {}, total: 0 },
      week: { byProvider: {}, total: 0 },
      month: { byProvider: {}, total: 0 },
      year: { byProvider: {}, total: 0 },
    },
  });
  
  // SIM Sales Stats
  const [simSalesStats, setSimSalesStats] = useState({
    today: { count: 0, total: 0 },
    week: { count: 0, total: 0 },
    month: { count: 0, total: 0 },
    year: { count: 0, total: 0 },
  });
  
  // Disbursement & Expense Stats
  const [disbursementStats, setDisbursementStats] = useState({
    totalDisbursed: 0,
    totalSpent: 0,
    balance: 0,
  });
  
  // General Daily Commission
  const [generalCommission, setGeneralCommission] = useState({
    merchantSims: [],
    bankCommissions: [],
  });
  // Effective commission configuration summary for this branch
  const [commissionConfigSummary, setCommissionConfigSummary] = useState(null);
  const [recentActivities, setRecentActivities] = useState([]);
  const [lastMonthMomoTotal, setLastMonthMomoTotal] = useState(0);
  const [pettyCashStats, setPettyCashStats] = useState({ allocated: 0, spent: 0, balance: 0 });
  const [momoMonthlySummaryChartData, setMomoMonthlySummaryChartData] = useState([]);
  const [activityLogChartData, setActivityLogChartData] = useState([]);
  const [calendarView, setCalendarView] = useState(() => {
    const d = new Date();
    return { month: d.getMonth(), year: d.getFullYear() };
  });
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [daysWithMomoTransactions, setDaysWithMomoTransactions] = useState(new Set());
  const [isDark, setIsDark] = useState(() => {
    if (typeof document === "undefined") return false;
    const stored = localStorage.getItem("momo_theme");
    if (stored === "dark") return true;
    if (stored === "light") return false;
    return document.documentElement.classList.contains("dark");
  });
  useEffect(() => {
    const handler = () => setIsDark(document.documentElement.classList.contains("dark"));
    window.addEventListener("momo-theme-change", handler);
    return () => window.removeEventListener("momo-theme-change", handler);
  }, []);
  // Current balances for Top-Up modal (SIM e-cash etc.)
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

  useEffect(() => {
    const branchId = selectedBranchId || userData?.branchId;
    if (branchId) {
      branchService.getById(branchId).then((b) => setBranchName(b?.branchName || "")).catch(() => setBranchName(""));
    } else {
      setBranchName("");
    }
  }, [selectedBranchId, userData?.branchId]);

  useEffect(() => {
    if (userData) {
      loadDashboardData();
      loadCommissionConfigSummary();
      loadCurrentBalancesForTopUp();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userData, userData?.branchId, selectedBranchId]);

  // Helpers for filter-aware MoMo data (charts, recent transactions)
  const getActiveMomoTransactions = () => {
    if (!momoTransactionsByPeriod) return [];

    if (filterPeriod === "today") return momoTransactionsByPeriod.today || [];
    if (filterPeriod === "week") return momoTransactionsByPeriod.week || [];
    if (filterPeriod === "month") return momoTransactionsByPeriod.month || [];

    if (filterPeriod === "custom" && customRange.start && customRange.end) {
      const start = new Date(customRange.start);
      start.setHours(0, 0, 0, 0);
      const end = new Date(customRange.end);
      end.setHours(23, 59, 59, 999);

      const inRange = (t) => {
        if (!t.date) return false;
        let d;
        if (typeof t.date === "string") {
          d = new Date(t.date);
        } else if (t.date.toDate) {
          d = t.date.toDate();
        } else {
          return false;
        }
        return d >= start && d <= end;
      };

      // Use year data as the superset for custom ranges
      return (momoTransactionsByPeriod.year || []).filter(inRange);
    }

    // Default: use year data
    return momoTransactionsByPeriod.year || [];
  };

  const loadDashboardData = async () => {
    const branchId = selectedBranchId || userData?.branchId;
    if (!branchId) {
      setLoading(false);
      return;
    }

    try {
      const now = new Date();
      const [
        todayTransactions,
        weekTransactions,
        monthTransactions,
        yearTransactions,
        bankCommissions,
        simSales,
        expenses,
        disbursements,
        generalCommissions,
        reconciliations,
        floats,
      ] = await Promise.all([
        queryTransactionsByRange(branchId, "today", userData?.userId, userData?.role),
        queryTransactionsByRange(branchId, "week", userData?.userId, userData?.role),
        queryTransactionsByRange(branchId, "month", userData?.userId, userData?.role),
        queryTransactionsByRange(branchId, "year", userData?.userId, userData?.role),
        loadBankCommissions(branchId, userData?.userId, userData?.role),
        loadSimSales(branchId, userData?.userId, userData?.role),
        expenseService.getByBranch(branchId),
        loadDisbursements(branchId),
        generalDailyCommissionService.getByBranch(branchId, 30),
        loadReconciliations(branchId, userData?.userId, userData?.role),
        loadFloats(branchId),
      ]);

      // Process MoMo transactions
      processMoMoTransactions(todayTransactions.momo, "today");
      processMoMoTransactions(weekTransactions.momo, "week");
      processMoMoTransactions(monthTransactions.momo, "month");
      processMoMoTransactions(yearTransactions.momo, "year");

      // Store raw MoMo transactions for filters/charts/recents
      setMomoTransactionsByPeriod({
        today: todayTransactions.momo || [],
        week: weekTransactions.momo || [],
        month: monthTransactions.momo || [],
        year: yearTransactions.momo || [],
      });

      // Process bank transactions
      processBankTransactions(todayTransactions.bank, "today");
      processBankTransactions(weekTransactions.bank, "week");
      processBankTransactions(yearTransactions.bank, "year");
      
      // Process bank transactions by month for table
      processBankTransactionsByMonth(monthTransactions.bank);

      // Process commissions - calculate from transactions using commissionEarned
      processCommissions(bankCommissions, {
        today: todayTransactions,
        week: weekTransactions,
        month: monthTransactions,
        year: yearTransactions,
      });

      // Process SIM sales
      processSimSales(simSales);

      // Process disbursements and expenses
      processDisbursements(disbursements, expenses);
      processPettyCashStats(disbursements, expenses);
      const lastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      const lastMonthMomo = (yearTransactions.momo || []).filter((t) => {
        let d;
        if (typeof t.date === "string") d = new Date(t.date);
        else if (t.date?.toDate) d = t.date.toDate();
        else d = new Date(t.date);
        return d >= lastMonth && d <= lastMonthEnd;
      });
      const lastMonthSum = lastMonthMomo.reduce(
        (s, t) => s + parseFloat(t.amount || 0),
        0
      );
      setLastMonthMomoTotal(lastMonthSum);
      const monthLabels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      const currentYear = now.getFullYear();
      const momoByMonth = {};
      for (let m = 0; m < 12; m++) {
        const key = `${currentYear}-${String(m + 1).padStart(2, "0")}`;
        momoByMonth[key] = { month: monthLabels[m], volume: 0 };
      }
      (yearTransactions.momo || []).forEach((t) => {
        let d;
        if (typeof t.date === "string") d = new Date(t.date);
        else if (t.date?.toDate) d = t.date.toDate();
        else d = new Date(t.date);
        if (d.getFullYear() !== currentYear) return;
        const key = `${currentYear}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (momoByMonth[key]) momoByMonth[key].volume += parseFloat(t.amount || 0);
      });
      const monthsSoFar = now.getMonth() + 1;
      setMomoMonthlySummaryChartData(
        Object.keys(momoByMonth)
          .sort()
          .slice(0, monthsSoFar)
          .map((k) => momoByMonth[k])
      );
      const txByMonth = {};
      for (let m = 0; m < 12; m++) {
        const key = `${currentYear}-${String(m + 1).padStart(2, "0")}`;
        txByMonth[key] = { month: monthLabels[m], count: 0, total: 0 };
      }
      (yearTransactions.momo || []).forEach((t) => {
        let d;
        if (typeof t.date === "string") d = new Date(t.date);
        else if (t.date?.toDate) d = t.date.toDate();
        else d = new Date(t.date);
        if (d.getFullYear() !== currentYear) return;
        const key = `${currentYear}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        if (txByMonth[key]) {
          txByMonth[key].count += 1;
          txByMonth[key].total += parseFloat(t.amount || 0);
        }
      });
      setActivityLogChartData(
        Object.keys(txByMonth)
          .sort()
          .slice(0, monthsSoFar)
          .map((k) => txByMonth[k])
      );

      const daysWithMomo = new Set();
      (monthTransactions.momo || []).forEach((t) => {
        let d;
        if (typeof t.date === "string") d = new Date(t.date);
        else if (t.date?.toDate) d = t.date.toDate();
        else d = new Date(t.date);
        if (d.getMonth() === now.getMonth() && d.getFullYear() === currentYear) daysWithMomo.add(d.getDate());
      });
      setDaysWithMomoTransactions(daysWithMomo);

      // Process general commissions
      processGeneralCommissions(generalCommissions);

      // Process recent activities (always scoped to current user)
      processRecentActivities(
        todayTransactions.momo.concat(todayTransactions.bank),
        reconciliations,
        floats,
        userData
      );
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadCurrentBalancesForTopUp = async () => {
    try {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) return;

      const today = new Date();
      const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userData?.userId);
      if (!float) {
        return;
      }

      const transactions = await transactionService.getTodayTransactions(
        branchId,
        userData.userId,
        userData.role
      );

      let physicalCash = parseFloat(float.openingPhysicalCash || 0);
      const merchantSimBalances = {};
      if (float.openingMerchantSimEcash && typeof float.openingMerchantSimEcash === "object") {
        Object.keys(float.openingMerchantSimEcash).forEach((simId) => {
          merchantSimBalances[simId] = parseFloat(float.openingMerchantSimEcash[simId] || 0);
        });
      }
      const merchantSimPhysicalCash = {};
      const hasPhysicalFloat = {};
      if (
        float.openingMerchantSimPhysicalCash &&
        typeof float.openingMerchantSimPhysicalCash === "object"
      ) {
        Object.keys(float.openingMerchantSimPhysicalCash).forEach((simId) => {
          merchantSimPhysicalCash[simId] = parseFloat(
            float.openingMerchantSimPhysicalCash[simId] || 0
          );
          hasPhysicalFloat[simId] = true;
        });
      }

      const bankBalances = {};
      if (float.openingBankBalances && typeof float.openingBankBalances === "object") {
        Object.keys(float.openingBankBalances).forEach((name) => {
          bankBalances[name] = parseFloat(float.openingBankBalances[name] || 0);
        });
      }

      let mtnEcash = parseFloat(float.openingMtnEcash || 0);
      let vodafoneEcash = parseFloat(float.openingVodafoneEcash || 0);
      let airtelTigoEcash = parseFloat(float.openingAirtelTigoEcash || 0);
      let telecelEcash = parseFloat(float.openingTelecelEcash || 0);

      if (transactions?.momo && Array.isArray(transactions.momo)) {
        transactions.momo.forEach((t) => {
          const amount = parseFloat(t.amount || 0);
          if (isNaN(amount) || amount <= 0) return;

          if (t.transactionType === "cash_in" || t.transactionType === "deposit") {
            if (t.merchantSimId && hasPhysicalFloat[t.merchantSimId]) {
              if (merchantSimPhysicalCash[t.merchantSimId] === undefined) {
                merchantSimPhysicalCash[t.merchantSimId] = parseFloat(
                  float.openingMerchantSimPhysicalCash?.[t.merchantSimId] || 0
                );
              }
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
            const useSimFloat =
              t.physicalCashSource === "sim_float" ||
              (t.physicalCashSource !== "branch_opening" &&
                t.merchantSimId &&
                hasPhysicalFloat[t.merchantSimId]);
            if (
              useSimFloat &&
              t.merchantSimId &&
              (merchantSimPhysicalCash.hasOwnProperty(t.merchantSimId) ||
                hasPhysicalFloat[t.merchantSimId])
            ) {
              if (merchantSimPhysicalCash[t.merchantSimId] === undefined) {
                merchantSimPhysicalCash[t.merchantSimId] = parseFloat(
                  float.openingMerchantSimPhysicalCash?.[t.merchantSimId] || 0
                );
              }
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

      if (transactions?.bank && Array.isArray(transactions.bank)) {
        transactions.bank.forEach((t) => {
          const amount = parseFloat(t.amount || 0);
          if (isNaN(amount) || amount <= 0) return;
          if (t.transactionType === "deposit") {
            physicalCash += amount;
          } else if (t.transactionType === "withdrawal") {
            physicalCash -= amount;
          }
        });
      }

      try {
        const todayString = today.toISOString().split("T")[0];
        let simSalesQuery = query(
          collection(db, "sim_sales"),
          where("branchId", "==", branchId),
          where("date", "==", todayString)
        );
        if (
          userData.role !== "admin" &&
          userData.role !== "branch_manager" &&
          userData.role !== "it_admin" &&
          userData.userId
        ) {
          simSalesQuery = query(
            collection(db, "sim_sales"),
            where("branchId", "==", branchId),
            where("date", "==", todayString),
            where("recordedBy", "==", userData.userId)
          );
        }
        const simSalesSnapshot = await getDocs(simSalesQuery).catch(() => ({ docs: [] }));
        const simSales = simSalesSnapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

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
              if (sale.merchantSimId && merchantSimBalances.hasOwnProperty(sale.merchantSimId)) {
                merchantSimBalances[sale.merchantSimId] -= price;
              } else {
                if (sale.provider === "MTN") mtnEcash -= price;
                else if (sale.provider === "Vodafone") vodafoneEcash -= price;
                else if (sale.provider === "AirtelTigo") airtelTigoEcash -= price;
              }
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
        console.error("Error loading SIM sales for dashboard balances:", error);
      }

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
          } else if (
            topUp.topUpType === "sim_to_sim" &&
            topUp.fromMerchantSimId &&
            topUp.toMerchantSimId
          ) {
            const amt = parseFloat(topUp.amount || 0);
            if (merchantSimBalances.hasOwnProperty(topUp.fromMerchantSimId)) {
              merchantSimBalances[topUp.fromMerchantSimId] -= amt;
            }
            if (merchantSimBalances.hasOwnProperty(topUp.toMerchantSimId)) {
              merchantSimBalances[topUp.toMerchantSimId] += amt;
            }
          } else if (topUp.topUpType === "bank_to_sim" && topUp.merchantSimId) {
            if (merchantSimBalances.hasOwnProperty(topUp.merchantSimId)) {
              merchantSimBalances[topUp.merchantSimId] += amount;
            } else {
              merchantSimBalances[topUp.merchantSimId] = amount;
            }
            if (topUp.bankName) bankBalances[topUp.bankName] = (bankBalances[topUp.bankName] ?? 0) - amount;
          } else if (topUp.topUpType === "sim_to_bank" && topUp.fromMerchantSimId) {
            const amt = parseFloat(topUp.amount || 0);
            if (merchantSimBalances.hasOwnProperty(topUp.fromMerchantSimId)) {
              merchantSimBalances[topUp.fromMerchantSimId] -= amt;
            }
            if (topUp.bankName) bankBalances[topUp.bankName] = (bankBalances[topUp.bankName] ?? 0) + amt;
          }
        });
      } catch (error) {
        console.error("Error loading top-ups for dashboard balances:", error);
      }

      setCurrentBalances({
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
      console.error("Error loading balances for dashboard:", error);
    }
  };

  const loadCommissionConfigSummary = async () => {
    const branchId = selectedBranchId || userData?.branchId;
    const businessId = selectedBusinessId || userData?.businessId;
    if (!branchId || !businessId) {
      setCommissionConfigSummary(null);
      return;
    }
    try {
      const doc = await commissionConfigService.getByBranch(branchId);
      const cfg = doc?.activeConfig || null;
      setCommissionConfigSummary(cfg);
    } catch (error) {
      console.error("Error loading commission config for dashboard:", error);
      setCommissionConfigSummary(null);
    }
  };

  const processMoMoTransactions = (transactions, period) => {
    const byProvider = {};
    let totalCashIn = 0;
    let totalCashOut = 0;
    let totalCommission = 0;
    let count = 0;
    
    // Use a Set to track processed transaction IDs to avoid duplicates
    const processedIds = new Set();

    transactions.forEach((t) => {
      // Use transactionId if available, otherwise use id, otherwise skip duplicate check
      const transactionId = t.transactionId || t.id || `${t.date}_${t.time}_${t.amount}_${t.provider}`;
      
      // Skip if already processed (avoid duplicates)
      if (processedIds.has(transactionId)) {
        return;
      }
      processedIds.add(transactionId);

        const provider = t.provider || "Unknown";
        const type = t.transactionType || "unknown";
      const amount = parseFloat(t.amount || 0);
      const commission = parseFloat(t.commissionEarned || 0);
      const charges = parseFloat(t.charges || 0); // Cash-out charges
      
      // Include both commission (from cash-in) and charges (from cash-out)
      const totalCommissionValue = commission + charges;

      if (!byProvider[provider]) {
        byProvider[provider] = { cashIn: 0, cashOut: 0, count: 0, commission: 0 };
      }

      if (type === "cash_in") {
        byProvider[provider].cashIn += amount;
        totalCashIn += amount;
      } else if (type === "cash_out") {
        byProvider[provider].cashOut += amount;
        totalCashOut += amount;
      }
      byProvider[provider].commission += totalCommissionValue;
      totalCommission += totalCommissionValue;
      byProvider[provider].count++;
      count++;
    });

    setMomoStats((prev) => ({
      ...prev,
      [period]: {
        byProvider,
        total: { cashIn: totalCashIn, cashOut: totalCashOut, count, commission: totalCommission },
      },
    }));
  };

  const processBankTransactions = (transactions, period) => {
    const total = transactions.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
    setBankStats((prev) => ({
      ...prev,
      [period]: { count: transactions.length, total },
    }));
  };

  const processBankTransactionsByMonth = (transactions) => {
    // Group transactions by month and bank
    const monthMap = {};
    
    console.log("Processing bank transactions for table:", transactions?.length || 0, "transactions");
    
    if (!transactions || transactions.length === 0) {
      console.log("No bank transactions to process");
      setBankTransactionsByMonth([]);
      return;
    }
    
    transactions.forEach((t) => {
      if (!t.date) {
        console.log("Transaction missing date:", t);
        return;
      }
      
      // Parse date - handle string dates like "2025-12-02"
      let tDate;
      if (typeof t.date === "string") {
        // If it's a YYYY-MM-DD format, parse it correctly
        const dateParts = t.date.split("-");
        if (dateParts.length === 3) {
          tDate = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
        } else {
          tDate = new Date(t.date);
        }
      } else if (t.date.toDate) {
        tDate = t.date.toDate();
      } else {
        tDate = new Date(t.date);
      }
      
      // Validate date
      if (isNaN(tDate.getTime())) {
        console.log("Invalid date for transaction:", t.date, t);
        return;
      }
      
      // Get month key (YYYY-MM)
      const monthKey = `${tDate.getFullYear()}-${String(tDate.getMonth() + 1).padStart(2, "0")}`;
      const monthLabel = tDate.toLocaleDateString("en-US", { month: "long", year: "numeric" });
      
      if (!monthMap[monthKey]) {
        monthMap[monthKey] = {
          month: monthLabel,
          monthKey,
          banks: {},
          transactions: [],
        };
      }
      
      const bankName = t.bankName || "Unknown";
      if (!monthMap[monthKey].banks[bankName]) {
        monthMap[monthKey].banks[bankName] = {
          name: bankName,
          transactions: [],
          total: 0,
        };
      }
      
      const amount = parseFloat(t.amount || 0);
      monthMap[monthKey].banks[bankName].transactions.push(t);
      monthMap[monthKey].banks[bankName].total += amount;
      monthMap[monthKey].transactions.push(t);
    });
    
    // Convert to array and sort by month (newest first)
    const monthArray = Object.values(monthMap).sort((a, b) => {
      return b.monthKey.localeCompare(a.monthKey);
    });
    
    console.log("Processed bank transactions by month:", monthArray.length, "months", monthArray);
    
    setBankTransactionsByMonth(monthArray);
  };

  const processCommissions = (bankCommissions, allTransactions) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    // Process bank commissions (monthly and yearly) - group by bank name
    const bankCommissionsByBank = {};
    bankCommissions.forEach((c) => {
      const bankName = c.bankName || "Unknown";
      const date = c.date?.toDate ? c.date.toDate() : new Date(c.date);
      const amount = parseFloat(c.commissionAmount || 0);

      if (!bankCommissionsByBank[bankName]) {
        bankCommissionsByBank[bankName] = { month: 0, year: 0 };
      }

      if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
        bankCommissionsByBank[bankName].month += amount;
      }
      if (date.getFullYear() === now.getFullYear()) {
        bankCommissionsByBank[bankName].year += amount;
      }
    });

    const bankMonth = Object.values(bankCommissionsByBank).reduce((sum, b) => sum + b.month, 0);
    const bankYear = Object.values(bankCommissionsByBank).reduce((sum, b) => sum + b.year, 0);

    // Process MoMo commissions from transactions (using commissionEarned field)
    const momoByPeriod = { today: {}, week: {}, month: {}, year: {} };
    
    // Combine all transaction periods
    const allMoMoTransactions = [
      ...(allTransactions.today?.momo || []),
      ...(allTransactions.week?.momo || []),
      ...(allTransactions.month?.momo || []),
      ...(allTransactions.year?.momo || []),
    ];

    // Remove duplicates by transactionId (use id as fallback)
    const uniqueTransactions = {};
    allMoMoTransactions.forEach((t) => {
      const id = t.transactionId || t.id || `${t.date}_${t.time}_${t.amount}_${t.provider}_${t.customerNumber}`;
      if (id && !uniqueTransactions[id]) {
        uniqueTransactions[id] = t;
      }
    });

    Object.values(uniqueTransactions).forEach((t) => {
      const date = typeof t.date === 'string' ? new Date(t.date) : (t.date?.toDate ? t.date.toDate() : new Date(t.date));
      const provider = t.provider || "Unknown";
      const commission = parseFloat(t.commissionEarned || 0);
      const charges = parseFloat(t.charges || 0); // Cash-out charges
      
      // Include both commission (from cash-in) and charges (from cash-out)
      const totalCommission = commission + charges;

      if (totalCommission <= 0) return;

      // Today
      if (date.toDateString() === now.toDateString()) {
        if (!momoByPeriod.today[provider]) momoByPeriod.today[provider] = 0;
        momoByPeriod.today[provider] += totalCommission;
      }

      // Week
      if (date >= weekStart) {
        if (!momoByPeriod.week[provider]) momoByPeriod.week[provider] = 0;
        momoByPeriod.week[provider] += totalCommission;
      }

      // Month
      if (date >= monthStart) {
        if (!momoByPeriod.month[provider]) momoByPeriod.month[provider] = 0;
        momoByPeriod.month[provider] += totalCommission;
      }

      // Year
      if (date >= yearStart) {
        if (!momoByPeriod.year[provider]) momoByPeriod.year[provider] = 0;
        momoByPeriod.year[provider] += totalCommission;
      }
    });

    setCommissionStats({
      bank: { month: bankMonth, year: bankYear, byBank: bankCommissionsByBank },
      momo: {
        today: { byProvider: momoByPeriod.today, total: Object.values(momoByPeriod.today).reduce((a, b) => a + b, 0) },
        week: { byProvider: momoByPeriod.week, total: Object.values(momoByPeriod.week).reduce((a, b) => a + b, 0) },
        month: { byProvider: momoByPeriod.month, total: Object.values(momoByPeriod.month).reduce((a, b) => a + b, 0) },
        year: { byProvider: momoByPeriod.year, total: Object.values(momoByPeriod.year).reduce((a, b) => a + b, 0) },
      },
    });
  };

  const processSimSales = (sales) => {
    const now = new Date();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const yearStart = new Date(now.getFullYear(), 0, 1);

    const stats = { today: { count: 0, total: 0 }, week: { count: 0, total: 0 }, month: { count: 0, total: 0 }, year: { count: 0, total: 0 } };

    sales.forEach((sale) => {
      const date = sale.date?.toDate ? sale.date.toDate() : new Date(sale.date);
      const amount = parseFloat(sale.amount || 0);

      if (date.toDateString() === now.toDateString()) {
        stats.today.count++;
        stats.today.total += amount;
      }
      if (date >= weekStart) {
        stats.week.count++;
        stats.week.total += amount;
      }
      if (date >= monthStart) {
        stats.month.count++;
        stats.month.total += amount;
      }
      if (date >= yearStart) {
        stats.year.count++;
        stats.year.total += amount;
      }
    });

    setSimSalesStats(stats);
  };

  const processDisbursements = (disbursements, expenses) => {
    // Get the latest disbursement amount (most recent)
    const latestDisbursement = disbursements.length > 0 
      ? disbursements.sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0);
          return dateB - dateA; // Descending order
        })[0]
      : null;

    const totalDisbursed = latestDisbursement ? parseFloat(latestDisbursement.amountReceived || 0) : 0;
    
    // Calculate total spent from expenses - sum all amountPaid
    // Ensure expenses is an array
    if (!Array.isArray(expenses)) {
      console.warn("Expenses is not an array:", expenses);
      expenses = [];
    }
    
    // Filter expenses to only include those with valid amountPaid
    const validExpenses = expenses.filter(e => {
      if (!e) return false;
      const amountPaid = parseFloat(e.amountPaid || 0);
      const isValid = !isNaN(amountPaid) && amountPaid > 0;
      if (!isValid && e.amountPaid) {
        console.log("Invalid expense amountPaid:", e.amountPaid, "parsed:", amountPaid);
      }
      return isValid;
    });
    
    const totalSpent = validExpenses.reduce((sum, e) => {
      const amountPaid = parseFloat(e.amountPaid || 0);
      return sum + amountPaid;
    }, 0);
    
    // Balance = latest disbursement - total spent
    const balance = totalDisbursed - totalSpent;

    console.log("Disbursement Stats:", {
      totalDisbursed,
      totalSpent,
      balance,
      latestDisbursement: latestDisbursement?.amountReceived,
      expensesCount: expenses?.length || 0,
      validExpensesCount: validExpenses.length,
      expenses: expenses?.slice(0, 5).map(e => ({ 
        expenseId: e.expenseId, 
        amountPaid: e.amountPaid, 
        amountPaidType: typeof e.amountPaid,
        parsed: parseFloat(e.amountPaid || 0)
      })), // Log first 5 for debugging
      allExpenses: expenses, // Log all expenses for debugging
    });

    setDisbursementStats({
      totalDisbursed,
      totalSpent,
      balance,
    });
  };

  const processPettyCashStats = (disbursements, expenses) => {
    const pettyCashDisbursements = (disbursements || []).filter((d) => d.type === "petty_cash");
    const latest = pettyCashDisbursements.sort((a, b) => {
      const dateA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (typeof a.createdAt === "string" ? new Date(a.createdAt).getTime() : 0);
      const dateB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (typeof b.createdAt === "string" ? new Date(b.createdAt).getTime() : 0);
      return dateB - dateA;
    })[0];
    const allocated = latest ? parseFloat(latest.amountReceived || 0) : 0;
    const disbursementDate = latest?.createdAt?.toDate ? latest.createdAt.toDate() : latest?.createdAt ? new Date(latest.createdAt) : new Date(0);
    const validExpenses = (expenses || []).filter((e) => {
      const expDate = e.date?.toDate ? e.date.toDate() : e.date ? new Date(e.date) : null;
      return expDate && expDate >= disbursementDate;
    });
    const spent = validExpenses.reduce((sum, e) => sum + parseFloat(e.amountPaid || 0), 0);
    setPettyCashStats({ allocated, spent, balance: Math.max(0, allocated - spent) });
  };

  const processGeneralCommissions = (commissions) => {
    const merchantSims = [];
    const bankCommissions = [];

    commissions.forEach((c) => {
      if (c.merchantSimId) {
        merchantSims.push(c);
      } else if (c.bankName) {
        bankCommissions.push(c);
      }
    });

    // Sort merchant SIMs by commission amount (descending), then by name
    merchantSims.sort((a, b) => {
      const amountA = parseFloat(a.commissionAmount || 0);
      const amountB = parseFloat(b.commissionAmount || 0);
      if (amountB !== amountA) {
        return amountB - amountA; // Descending by amount
      }
      const nameA = (a.merchantSimName || a.merchantSimId || "").toLowerCase();
      const nameB = (b.merchantSimName || b.merchantSimId || "").toLowerCase();
      return nameA.localeCompare(nameB); // Alphabetical by name
    });

    // Sort bank commissions by commission amount (descending), then by bank name
    bankCommissions.sort((a, b) => {
      const amountA = parseFloat(a.commissionAmount || 0);
      const amountB = parseFloat(b.commissionAmount || 0);
      if (amountB !== amountA) {
        return amountB - amountA; // Descending by amount
      }
      const nameA = (a.bankName || "").toLowerCase();
      const nameB = (b.bankName || "").toLowerCase();
      return nameA.localeCompare(nameB); // Alphabetical by name
    });

    setGeneralCommission({ merchantSims, bankCommissions });
  };

  const processRecentActivities = (transactions, reconciliations, floats, currentUser) => {
    const activities = [];

    // Helper function to format timestamp
    const formatTimestamp = (timestamp) => {
      if (!timestamp) return "N/A";
      let date;
      if (timestamp.toDate) {
        date = timestamp.toDate();
      } else if (typeof timestamp === "string") {
        date = new Date(timestamp);
      } else {
        date = new Date(timestamp);
      }
      return date.toLocaleString();
    };

    const currentUserId = currentUser?.userId;
    const currentUserName = currentUser?.name || currentUser?.email;

    // Add transactions (only for current user)
    transactions.slice(0, 10).forEach((t) => {
      const timestamp = t.createdAt || t.date;
      const recordedBy = t.recordedByName || t.recordedBy;

      // Always restrict recent activities to the logged-in user,
      // regardless of role (admin/branch manager/IT admin included)
      if (
        currentUserId &&
        recordedBy &&
        recordedBy !== currentUserId &&
        recordedBy !== currentUserName
      ) {
        return;
      }

      activities.push({
        type: "transaction",
        title: `${t.provider || t.bankName} - ${t.transactionType}`,
        description: `Amount: GHC ${parseFloat(t.amount || 0).toLocaleString()}`,
        timestamp: formatTimestamp(timestamp),
        timestampRaw: timestamp, // Keep raw for sorting
        recordedBy,
      });
    });

    // Add reconciliations (only for current user)
    reconciliations.slice(0, 5).forEach((r) => {
      const timestamp = r.createdAt || r.date;
      const recordedBy = r.reconciledByName || r.reconciledBy;

      if (
        currentUserId &&
        recordedBy &&
        recordedBy !== currentUserId &&
        recordedBy !== currentUserName
      ) {
        return;
      }

      activities.push({
        type: "reconciliation",
        title: "Daily Reconciliation",
        description: `Status: ${r.status || "pending"}`,
        timestamp: formatTimestamp(timestamp),
        timestampRaw: timestamp, // Keep raw for sorting
        recordedBy,
      });
    });

    // Add floats (only for current user)
    floats.slice(0, 5).forEach((f) => {
      const timestamp = f.createdAt || f.date;
      const recordedBy = f.recordedByName || f.recordedBy;

      if (
        currentUserId &&
        recordedBy &&
        recordedBy !== currentUserId &&
        recordedBy !== currentUserName
      ) {
        return;
      }

      activities.push({
        type: "float",
        title: f.status === "closed" ? "Float Closed" : "Opening Float",
        description: `Date: ${f.date?.toDate ? f.date.toDate().toLocaleDateString() : new Date(f.date).toLocaleDateString()}`,
        timestamp: formatTimestamp(timestamp),
        timestampRaw: timestamp, // Keep raw for sorting
        recordedBy,
      });
    });

    // Sort by timestamp (using raw timestamp for comparison)
    activities.sort((a, b) => {
      const timeA = a.timestampRaw?.toDate ? a.timestampRaw.toDate().getTime() : new Date(a.timestampRaw || 0).getTime();
      const timeB = b.timestampRaw?.toDate ? b.timestampRaw.toDate().getTime() : new Date(b.timestampRaw || 0).getTime();
      return timeB - timeA;
    });

    setRecentActivities(activities.slice(0, 20));
  };

  // Helper functions to load data
  const loadBankCommissions = async (branchId, userId, userRole) => {
    try {
      const q = query(collection(db, "bank_commissions"), where("branchId", "==", branchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error loading bank commissions:", error);
      return [];
    }
  };

  const loadMoMoCommissions = async (branchId, userId, userRole) => {
    try {
      const q = query(collection(db, "momo_ecash_commissions"), where("branchId", "==", branchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error loading MoMo commissions:", error);
      return [];
    }
  };

  const loadSimSales = async (branchId, userId, userRole) => {
    try {
      const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
      let q = query(collection(db, "sim_sales"), where("branchId", "==", branchId));
      
      if (!isAdmin && userId) {
        q = query(q, where("recordedBy", "==", userId));
      }
      
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error loading SIM sales:", error);
      return [];
    }
  };

  const loadDisbursements = async (branchId) => {
    try {
      const q = query(collection(db, "disbursements"), where("branchId", "==", branchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      console.error("Error loading disbursements:", error);
      return [];
    }
  };

  const loadReconciliations = async (branchId, userId, userRole) => {
    try {
      const isAdmin = userRole === "admin" || userRole === "branch_manager" || userRole === "it_admin";
      
      // Try with orderBy first
      try {
        let q = query(collection(db, "daily_reconciliation"), where("branchId", "==", branchId), orderBy("createdAt", "desc"), limit(10));
        
        if (!isAdmin && userId) {
          q = query(collection(db, "daily_reconciliation"), where("branchId", "==", branchId), where("reconciledBy", "==", userId), orderBy("createdAt", "desc"), limit(10));
        }
        
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy
        if (orderByError.code === "failed-precondition" || orderByError.code === 9) {
          console.warn("Firestore index required for: daily_reconciliation getByBranch (with orderBy)");
          console.warn("Falling back to query without orderBy");
        }
        
        // Query without orderBy
        let q = query(collection(db, "daily_reconciliation"), where("branchId", "==", branchId), limit(100));
        
        if (!isAdmin && userId) {
          q = query(collection(db, "daily_reconciliation"), where("branchId", "==", branchId), where("reconciledBy", "==", userId), limit(100));
        }
        
        const snapshot = await getDocs(q);
        let reconciliations = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort in memory by createdAt (handle both Timestamp and string)
        reconciliations.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0);
          return timeB - timeA; // Descending order
        });
        
        return reconciliations.slice(0, 10);
      }
    } catch (error) {
      console.error("Error loading reconciliations:", error);
      return [];
    }
  };

  const loadFloats = async (branchId) => {
    try {
      // Try with orderBy first
      try {
        const q = query(collection(db, "daily_float"), where("branchId", "==", branchId), orderBy("createdAt", "desc"), limit(10));
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      } catch (orderByError) {
        // If orderBy fails (missing index), try without orderBy
        if (orderByError.code === "failed-precondition" || orderByError.code === 9) {
          console.warn("Firestore index required for: daily_float getByBranch (with orderBy)");
          console.warn("Falling back to query without orderBy");
        }
        
        // Query without orderBy
        const q = query(collection(db, "daily_float"), where("branchId", "==", branchId), limit(100));
        const snapshot = await getDocs(q);
        let floats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        
        // Sort in memory by createdAt (handle both Timestamp and string)
        floats.sort((a, b) => {
          const timeA = a.createdAt?.toDate ? a.createdAt.toDate().getTime() : (typeof a.createdAt === 'string' ? new Date(a.createdAt).getTime() : 0);
          const timeB = b.createdAt?.toDate ? b.createdAt.toDate().getTime() : (typeof b.createdAt === 'string' ? new Date(b.createdAt).getTime() : 0);
          return timeB - timeA; // Descending order
        });
        
        return floats.slice(0, 10);
      }
    } catch (error) {
      console.error("Error loading floats:", error);
      return [];
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto"></div>
          <p className="mt-4 text-muted-foreground">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  const displayName = userData?.name || userData?.email || "User";
  const roleLabel = getRoleLabel(userData?.role);

  return (
    <div className="min-h-full space-y-8 pb-8 bg-background -m-4 lg:-m-6 p-4 lg:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="rounded-xl border border-border bg-card px-5 py-4 shadow-sm min-w-0 flex-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            {getGreeting()}, {displayName}
            <span className="text-primary font-semibold ml-1.5">({roleLabel})</span>
          </h1>
          <p className="text-muted-foreground mt-2 text-base">
            {branchName ? (
              <span className="inline-flex items-center gap-1.5">
                <span className="font-medium text-foreground/90">Branch:</span>
                {branchName}
              </span>
            ) : (
              "Dashboard"
            )}
          </p>
          <p className="text-muted-foreground mt-1.5 text-sm font-medium tabular-nums inline-flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary/70 shrink-0" />
            {liveTime.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
          </p>
        </div>
        <Button
          variant="default"
          onClick={() => setShowTopUpModal(true)}
          className="flex items-center gap-2 shrink-0"
        >
          <ArrowUpCircle className="h-4 w-4" />
          Top-Up Float/Cash
        </Button>
      </div>

      <div>
        <h2 className="text-xl font-semibold mb-4 text-gray-900 dark:text-foreground">Key Performance Indicators</h2>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className={isDark ? "bg-card border-border shadow-sm" : "!bg-gradient-to-br from-sky-50 to-sky-100/80 border-sky-200/80 shadow-sm"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn("text-xs font-medium uppercase tracking-wide", isDark ? "text-foreground" : "text-sky-900")}>
                Total Cash In Today
              </CardTitle>
              <Activity className={cn("h-4 w-4", isDark ? "text-muted-foreground" : "text-sky-600")} />
          </CardHeader>
          <CardContent>
              <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : "text-sky-900")}>
                GHC {momoStats.today.total.cashIn.toLocaleString()}
                </div>
              <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-sky-700")}>
                From {momoStats.today.total.count} transaction
                {momoStats.today.total.count === 1 ? "" : "s"}
              </p>
              </CardContent>
            </Card>

          {/* Total Cash Out Today */}
          <Card className={isDark ? "bg-card border-border shadow-sm" : "!bg-gradient-to-br from-rose-50 to-rose-100/80 border-rose-200/80 shadow-sm"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn("text-xs font-medium uppercase tracking-wide", isDark ? "text-foreground" : "text-rose-900")}>
                Total Cash Out Today
              </CardTitle>
              <CreditCard className={cn("h-4 w-4", isDark ? "text-muted-foreground" : "text-rose-600")} />
          </CardHeader>
          <CardContent>
              <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : "text-rose-900")}>
                GHC {momoStats.today.total.cashOut.toLocaleString()}
              </div>
              <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-rose-700")}>MoMo payouts today</p>
          </CardContent>
        </Card>

          {/* Total Transactions Today */}
          <Card className={isDark ? "bg-card border-border shadow-sm" : "!bg-gradient-to-br from-slate-100 to-slate-200/60 border-slate-200/80 shadow-sm"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn("text-xs font-medium uppercase tracking-wide", isDark ? "text-foreground" : "text-slate-800")}>
                Total Transactions Today
              </CardTitle>
              <Activity className={cn("h-4 w-4", isDark ? "text-muted-foreground" : "text-slate-600")} />
          </CardHeader>
          <CardContent>
              <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : "text-slate-900")}>
                {momoStats.today.total.count}
              </div>
              <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-slate-600")}>
                MoMo transactions processed
              </p>
          </CardContent>
        </Card>

          {/* Today's Total Commission */}
          <Card className={isDark ? "bg-card border-border shadow-sm" : "!bg-gradient-to-br from-emerald-50 to-emerald-100/80 border-emerald-200/80 shadow-sm"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn("text-xs font-medium uppercase tracking-wide", isDark ? "text-foreground" : "text-emerald-900")}>
                Today's Commission
              </CardTitle>
              <Wallet className={cn("h-4 w-4", isDark ? "text-muted-foreground" : "text-emerald-600")} />
          </CardHeader>
          <CardContent>
              <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : "text-emerald-900")}>
                GHC {momoStats.today.total.commission.toLocaleString()}
              </div>
              <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-emerald-700")}>
                Earned from MoMo fees today
            </p>
          </CardContent>
        </Card>

          {/* This Month's Commission */}
          <Card className={isDark ? "bg-card border-border shadow-sm" : "!bg-gradient-to-br from-violet-50 to-violet-100/80 border-violet-200/80 shadow-sm"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn("text-xs font-medium uppercase tracking-wide", isDark ? "text-foreground" : "text-violet-900")}>
                This Month's Commission
              </CardTitle>
              <Wallet className={cn("h-4 w-4", isDark ? "text-muted-foreground" : "text-violet-600")} />
          </CardHeader>
          <CardContent>
              <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : "text-violet-900")}>
                GHC {momoStats.month.total.commission.toLocaleString()}
              </div>
              <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-violet-700")}>
                {new Date().toLocaleDateString("en-US", {
                  month: "long",
                  year: "numeric",
                })}
            </p>
          </CardContent>
        </Card>

          {/* Account Balance (Petty Cash) */}
          <Card className={isDark ? "bg-card border-border shadow-sm" : "!bg-gradient-to-br from-amber-50 to-amber-100/80 border-amber-200/80 shadow-sm"}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className={cn("text-xs font-medium uppercase tracking-wide", isDark ? "text-foreground" : "text-amber-900")}>
                Account Balance
              </CardTitle>
              <Wallet className={cn("h-4 w-4", isDark ? "text-muted-foreground" : "text-amber-600")} />
          </CardHeader>
          <CardContent>
              <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : "text-amber-900")}>
                GHC {disbursementStats.balance.toLocaleString()}
              </div>
              <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-amber-700")}>
                Petty cash balance after expenses
              </p>
          </CardContent>
        </Card>
        </div>
      </div>

      {/* Bank Transactions & SIM Sales Section - Combined */}
      <div>
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-7">
          {/* Bank Transactions Cards */}
          {["today", "week", "year"].map((period, idx) => {
            const periodLabels = {
              today: "Bank Today",
              week: "Bank This Week",
              year: "Bank This Year"
            };
            const periodSubtitles = {
              today: "Bank transactions processed today",
              week: "Weekly banking activity summary",
              year: "Annual banking transaction overview"
            };
            const bankColors = [
              { bg: "from-emerald-50 to-emerald-100/80 border-emerald-200/80", title: "text-emerald-900", sub: "text-emerald-700", icon: "text-emerald-600" },
              { bg: "from-teal-50 to-teal-100/80 border-teal-200/80", title: "text-teal-900", sub: "text-teal-700", icon: "text-teal-600" },
              { bg: "from-green-50 to-green-100/80 border-green-200/80", title: "text-green-900", sub: "text-green-700", icon: "text-green-600" },
            ];
            const c = bankColors[idx % bankColors.length];
            return (
              <Card key={`bank-${period}`} className={isDark ? "bg-card border-border shadow-sm" : `!bg-gradient-to-br ${c.bg} shadow-sm`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className={cn("text-xs font-semibold uppercase tracking-wide", isDark ? "text-foreground" : c.title)}>
                      {periodLabels[period]}
                    </CardTitle>
                    <p className={cn("text-[10px] mt-0.5", isDark ? "text-muted-foreground" : c.sub)}>
                      {periodSubtitles[period]}
                    </p>
                  </div>
                  <CreditCard className={cn("h-4 w-4", isDark ? "text-muted-foreground" : c.icon)} />
          </CardHeader>
          <CardContent>
                  <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : c.title)}>{bankStats[period].count}</div>
                  <p className={cn("text-xs font-medium mt-1", isDark ? "text-muted-foreground" : c.sub)}>
                    Transaction Count
                  </p>
                  <p className={cn("text-[10px] mt-0.5", isDark ? "text-muted-foreground" : c.sub)}>
                    Total: GHC {bankStats[period].total.toLocaleString()}
                  </p>
          </CardContent>
        </Card>
            );
          })}

          {/* SIM Sales Cards */}
          {["today", "week", "month", "year"].map((period, idx) => {
            const periodLabels = {
              today: "SIM Today",
              week: "SIM This Week",
              month: "SIM This Month",
              year: "SIM This Year"
            };
            const periodSubtitles = {
              today: "SIM cards sold today",
              week: "Weekly SIM sales summary",
              month: "Monthly SIM sales overview",
              year: "Annual SIM sales total"
            };
            const simColors = [
              { bg: "from-sky-50 to-sky-100/80 border-sky-200/80", title: "text-sky-900", sub: "text-sky-700", icon: "text-sky-600" },
              { bg: "from-indigo-50 to-indigo-100/80 border-indigo-200/80", title: "text-indigo-900", sub: "text-indigo-700", icon: "text-indigo-600" },
              { bg: "from-purple-50 to-purple-100/80 border-purple-200/80", title: "text-purple-900", sub: "text-purple-700", icon: "text-purple-600" },
              { bg: "from-fuchsia-50 to-fuchsia-100/80 border-fuchsia-200/80", title: "text-fuchsia-900", sub: "text-fuchsia-700", icon: "text-fuchsia-600" },
            ];
            const c = simColors[idx % simColors.length];
            return (
              <Card key={`sim-${period}`} className={isDark ? "bg-card border-border shadow-sm" : `!bg-gradient-to-br ${c.bg} shadow-sm`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div>
                    <CardTitle className={cn("text-xs font-semibold uppercase tracking-wide", isDark ? "text-foreground" : c.title)}>
                      {periodLabels[period]}
                    </CardTitle>
                    <p className={cn("text-[10px] mt-0.5", isDark ? "text-muted-foreground" : c.sub)}>
                      {periodSubtitles[period]}
                    </p>
                  </div>
                  <Wallet className={cn("h-4 w-4", isDark ? "text-muted-foreground" : c.icon)} />
          </CardHeader>
          <CardContent>
                  <div className={cn("text-2xl font-bold", isDark ? "text-foreground" : c.title)}>{simSalesStats[period].count}</div>
                  <p className={cn("text-xs font-medium mt-1", isDark ? "text-muted-foreground" : c.sub)}>
                    SIM Cards Sold
                  </p>
                  <p className={cn("text-[10px] mt-0.5", isDark ? "text-muted-foreground" : c.sub)}>
                    Revenue: GHC {simSalesStats[period].total.toLocaleString()}
                  </p>
          </CardContent>
        </Card>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
        <Card className={cn("lg:col-span-2 overflow-hidden border shadow-md", isDark ? "bg-card border-border" : "!bg-gradient-to-br from-white to-slate-50/80 border-slate-200/80")}>
          <CardHeader className={cn("pb-2 border-b", isDark ? "border-border bg-muted/40" : "border-slate-200/60 bg-violet-500/5")}>
            <CardTitle className={cn("text-base font-semibold flex items-center gap-2", isDark ? "text-foreground" : "text-slate-800")}>
              <Activity className={cn("h-5 w-5", isDark ? "text-muted-foreground" : "text-violet-600")} />
              Recent Activity
            </CardTitle>
            <p className={cn("text-xs mt-0.5", isDark ? "text-muted-foreground" : "text-slate-500")}>Last 5 activities</p>
          </CardHeader>
          <CardContent className="p-0">
            {recentActivities.length === 0 ? (
              <div className="p-8 text-center">
                <p className={cn("text-sm", isDark ? "text-muted-foreground" : "text-slate-500")}>No recent activity</p>
              </div>
            ) : (
              <ul className={cn("divide-y", isDark ? "divide-border" : "divide-slate-100")}>
                {recentActivities.slice(0, 5).map((activity, idx) => {
                  const isTransaction = activity.type === "transaction";
                  const isReconciliation = activity.type === "reconciliation";
                  const isFloat = activity.type === "float";
                  const accent = isTransaction
                    ? "border-l-blue-500"
                    : isReconciliation
                      ? "border-l-emerald-500"
                      : "border-l-violet-500";
                  const iconBg = isTransaction ? "bg-blue-500" : isReconciliation ? "bg-emerald-500" : "bg-violet-500";
                  const timeStr =
                    activity.timestampRaw?.toDate != null
                      ? activity.timestampRaw.toDate().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
                      : activity.timestamp
                        ? (typeof activity.timestamp === "string" && activity.timestamp.includes(",")
                          ? activity.timestamp.split(",")[1]?.trim() || activity.timestamp
                          : activity.timestamp)
                        : "—";
                  return (
                    <li key={idx} className={cn("border-l-4 pl-4 pr-4 py-3 transition-colors", accent, isDark ? "hover:bg-muted/40" : "hover:bg-slate-50/60")}>
                      <div className="flex items-start gap-3">
                        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white", iconBg)}>
                          {isTransaction && <Activity className="h-4 w-4" />}
                          {isReconciliation && <FileText className="h-4 w-4" />}
                          {isFloat && <Wallet className="h-4 w-4" />}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={cn("text-sm font-semibold", isDark ? "text-foreground" : "text-slate-800")}>{activity.title}</p>
                          {activity.description && (
                            <p className={cn("text-xs mt-0.5", isDark ? "text-muted-foreground" : "text-slate-600")}>{activity.description}</p>
                          )}
                          {activity.recordedBy && (
                            <p className={cn("text-[11px] mt-1", isDark ? "text-muted-foreground" : "text-slate-500")}>By {activity.recordedBy}</p>
                          )}
                        </div>
                        <span className={cn("text-xs font-medium tabular-nums shrink-0", isDark ? "text-muted-foreground" : "text-slate-500")}>{timeStr}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border border-border shadow-sm rounded-xl overflow-hidden">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-1">Today</p>
            <div className="flex items-center justify-between mb-3">
              <p className="text-lg font-bold text-foreground">
                {selectedDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
              </p>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
                  onClick={() =>
                    setCalendarView((prev) => {
                      const m = prev.month - 1;
                      if (m < 0) return { month: 11, year: prev.year - 1 };
                      return { month: m, year: prev.year };
                    })
                  }
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 rounded-full text-muted-foreground hover:bg-muted"
                  onClick={() =>
                    setCalendarView((prev) => {
                      const m = prev.month + 1;
                      if (m > 11) return { month: 0, year: prev.year + 1 };
                      return { month: m, year: prev.year };
                    })
                  }
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-7 gap-0.5 text-center text-[10px] font-medium text-muted-foreground mb-1">
              {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                <span key={d}>{d}</span>
              ))}
            </div>
            {(() => {
              const { month, year } = calendarView;
              const first = new Date(year, month, 1);
              const last = new Date(year, month + 1, 0);
              const startPad = (first.getDay() + 6) % 7;
              const daysInMonth = last.getDate();
              const prevMonthLast = new Date(year, month, 0).getDate();
              const isCurrentMonth = month === new Date().getMonth() && year === new Date().getFullYear();
              const todayDate = new Date().getDate();
              const selectedDay = selectedDate.getDate();
              const selectedMonth = selectedDate.getMonth();
              const selectedYear = selectedDate.getFullYear();
              const cells = [];
              for (let i = 0; i < startPad; i++) {
                const d = prevMonthLast - startPad + 1 + i;
                cells.push(
                  <button
                    key={`prev-${i}`}
                    type="button"
                    className="aspect-square flex flex-col items-center justify-center rounded-lg text-muted-foreground/70 text-xs"
                  >
                    {d}
                  </button>
                );
              }
              for (let d = 1; d <= daysInMonth; d++) {
                const isSelected =
                  d === selectedDay && month === selectedMonth && year === selectedYear;
                const isToday = isCurrentMonth && d === todayDate;
                const hasTransaction = isCurrentMonth && daysWithMomoTransactions.has(d);
                cells.push(
                  <button
                    key={d}
                    type="button"
                    onClick={() => setSelectedDate(new Date(year, month, d))}
                    className={cn(
                      "aspect-square flex flex-col items-center justify-center rounded-lg text-xs font-medium transition-colors",
                      isSelected
                        ? "bg-primary text-primary-foreground"
                        : isToday
                          ? "text-foreground font-semibold"
                          : "text-foreground/80 hover:bg-muted"
                    )}
                  >
                    <span>{d}</span>
                    {hasTransaction && (
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full mt-0.5",
                          isSelected ? "bg-white" : "bg-blue-500"
                        )}
                      />
                    )}
                  </button>
                );
              }
              const totalCells = cells.length;
              const remaining = totalCells % 7 === 0 ? 0 : 7 - (totalCells % 7);
              for (let i = 0; i < remaining; i++) {
                cells.push(
                  <div key={`next-${i}`} className="aspect-square text-gray-400 text-xs" />
                );
              }
              return <div className="grid grid-cols-7 gap-0.5">{cells}</div>;
            })()}
            <p className="text-[10px] text-gray-500 mt-2">Blue dots: days with MoMo transactions</p>
          </CardContent>
        </Card>
      </div>

      {/* Dashboard graphs: MoMo Monthly Summary (bar), Petty Cash, MoMo + Bank transactions (line) */}
      <div className="mb-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 1. MoMo Monthly Summary – bar chart */}
        <Card className="border-border shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="pb-1">
            <CardTitle className="text-base font-semibold text-foreground">MoMo Monthly Summary</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Volume by month (current year)</p>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              {momoMonthlySummaryChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={momoMonthlySummaryChartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e5e7eb"} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} stroke={isDark ? "#9ca3af" : "#9ca3af"} />
                    <YAxis tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} stroke={isDark ? "#9ca3af" : "#9ca3af"} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v)} />
                    <Tooltip contentStyle={{ fontSize: 12, background: isDark ? "#1f2937" : "#fff", color: isDark ? "#f3f4f6" : "#111", border: isDark ? "1px solid #374151" : "1px solid #e5e7eb" }} formatter={(v) => [`GHC ${Number(v).toLocaleString()}`, "Volume"]} />
                    <Bar dataKey="volume" fill="#22c55e" radius={[4, 4, 0, 0]} name="Volume" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No MoMo data this year</div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Based on aggregated MoMo transaction volume for {new Date().getFullYear()}</p>
          </CardContent>
        </Card>

        {/* 2. Petty Cash Spending & Balance – progress bar (same logic as stat card: processDisbursements) */}
        <Card className="border-border shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <div>
              <CardTitle className="text-base font-semibold text-foreground">Petty Cash Spending & Balance</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">Current period</p>
            </div>
            <Link to="/disbursement">
              <Button variant="ghost" size="icon" className="h-9 w-9 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted">
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            <div className="h-3 w-full rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full rounded-l-full bg-emerald-500 flex-1 min-w-0"
                style={{
                  width: disbursementStats.totalDisbursed > 0 ? `${Math.min(100, (disbursementStats.totalSpent / disbursementStats.totalDisbursed) * 100)}%` : "0%",
                  background: "repeating-linear-gradient(45deg, transparent, transparent 4px, rgba(255,255,255,0.2) 4px, rgba(255,255,255,0.2) 8px)",
                  backgroundColor: "#22c55e",
                }}
              />
            </div>
            <div className="flex justify-between mt-2">
              <span className="text-sm font-semibold text-foreground">GHC {disbursementStats.totalSpent.toLocaleString()}</span>
              <span className="text-sm text-muted-foreground">GHC {disbursementStats.totalDisbursed.toLocaleString()}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Balance: GHC {disbursementStats.balance.toLocaleString()}</p>
          </CardContent>
        </Card>

        {/* 3. Yearly MoMo transactions – area chart: count + total by month */}
        <Card className="border-border shadow-sm rounded-xl overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold text-foreground">MoMo Transactions</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Number of transactions and total volume by month (current year)</p>
          </CardHeader>
          <CardContent>
            <div className="h-[180px] w-full">
              {activityLogChartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={activityLogChartData} margin={{ top: 4, right: 24, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#2dd4bf" stopOpacity={0.4} />
                        <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="activityTotalFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? "#374151" : "#e5e7eb"} />
                    <XAxis dataKey="month" tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} stroke={isDark ? "#9ca3af" : "#9ca3af"} />
                    <YAxis yAxisId="left" tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} stroke={isDark ? "#9ca3af" : "#9ca3af"} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10, fill: isDark ? "#9ca3af" : "#6b7280" }} stroke={isDark ? "#9ca3af" : "#9ca3af"} tickFormatter={(v) => (v >= 1e6 ? `${(v / 1e6).toFixed(1)}M` : v >= 1e3 ? `${(v / 1e3).toFixed(0)}k` : v)} />
                    <Tooltip contentStyle={{ fontSize: 12, background: isDark ? "#1f2937" : "#fff", color: isDark ? "#f3f4f6" : "#111", border: isDark ? "1px solid #374151" : "1px solid #e5e7eb" }} formatter={(v, name) => [name === "Count" ? v : `GHC ${Number(v).toLocaleString()}`, name]} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area yAxisId="left" type="monotone" dataKey="count" stroke="#14b8a6" strokeWidth={2} fill="url(#activityFill)" name="Count" />
                    <Area yAxisId="right" type="monotone" dataKey="total" stroke="#3b82f6" strokeWidth={2} fill="url(#activityTotalFill)" name="Total (GHC)" />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No MoMo transactions this year</div>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground mt-2">Based on MoMo transactions for {new Date().getFullYear()} — count (left), total volume GHC (right)</p>
          </CardContent>
        </Card>
      </div>

      {/* MoMo Transactions Section - HIDDEN */}
      {/* <div>
        <h2 className="text-xl font-semibold mb-4">MoMo Transactions</h2>
        ... Filter Bar and Charts Section ...
      </div> */}

      {/* Daily Transactions (hide when no data) - COMMENTED OUT */}
        {/* {momoStats.today.total.count > 0 && (
          <div className="mb-6">
            <h3 className="text-lg font-semibold mb-2">Daily Transactions</h3>
            <Card className="border border-gray-200 shadow-sm rounded-lg overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 hover:bg-gray-50 border-b border-gray-200">
                      <TableHead className="font-semibold text-gray-900">Date</TableHead>
                      <TableHead className="font-semibold text-gray-900">Cash In (GHC)</TableHead>
                      <TableHead className="font-semibold text-gray-900">Cash Out (GHC)</TableHead>
                      <TableHead className="font-semibold text-gray-900">Count</TableHead>
                      <TableHead className="font-semibold text-gray-900">Commission (GHC)</TableHead>
                      <TableHead className="font-semibold text-gray-900">Provider Breakdown</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow className="hover:bg-gray-50 bg-white">
                      <TableCell className="font-medium text-gray-900">
                        {new Date().toLocaleDateString("en-US", {
                          weekday: "short",
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        })}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        GHC {momoStats.today.total.cashIn.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        GHC {momoStats.today.total.cashOut.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        {momoStats.today.total.count}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        GHC {momoStats.today.total.commission.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-gray-700">
                        <div className="space-y-1">
                          {Object.entries(momoStats.today.byProvider).map(
                            ([provider, stats]) => (
                              <div
                                key={provider}
                                className="flex justify-between text-xs text-gray-600"
                              >
                                <span>{provider}</span>
                                <span>
                                  {stats.count} ({(stats.cashIn + stats.cashOut).toLocaleString()} GHC) – Comm:{" "}
                                  {stats.commission.toLocaleString()}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
          </CardContent>
        </Card>
      </div>
        )} */}

      {/* Monthly Summary */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-foreground">Monthly Summary</h3>
        <Card className="border-border shadow-sm rounded-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-2 border-border">
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Month</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Cash In</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Cash Out</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Count</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">
                      Total Commission (GHC)
                    </TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Per Provider</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-muted/50 transition-colors border-b border-border bg-card">
                    <TableCell className="font-semibold text-foreground py-4 px-6">
                      {new Date().toLocaleDateString("en-US", {
                        month: "long",
                        year: "numeric",
                      })}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      GHC {momoStats.month.total.cashIn.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      GHC {momoStats.month.total.cashOut.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      {momoStats.month.total.count}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      GHC {momoStats.month.total.commission.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-muted-foreground py-4 px-6">
                      <div className="space-y-1">
                        {Object.entries(momoStats.month.byProvider).map(
                          ([provider, stats]) => (
                            <div
                              key={provider}
                              className="flex justify-between text-xs text-muted-foreground"
                            >
                              <span>{provider}</span>
                              <span>
                                {stats.count} ({(stats.cashIn + stats.cashOut).toLocaleString()} GHC) – Comm:{" "}
                                {stats.commission.toLocaleString()}
                              </span>
                </div>
                          )
                        )}
                        {Object.keys(momoStats.month.byProvider).length === 0 && (
                          <span className="text-xs text-muted-foreground">No data</span>
                        )}
            </div>
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Yearly Summary */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-foreground">Yearly Summary</h3>
        <Card className="border-border shadow-sm rounded-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-2 border-border">
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Year</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Cash In</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Cash Out</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Count</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">
                      Total Commission (GHC)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow className="hover:bg-muted/50 transition-colors border-b border-border bg-card">
                    <TableCell className="font-semibold text-foreground py-4 px-6">
                      {new Date().getFullYear()}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      GHC {momoStats.year.total.cashIn.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      GHC {momoStats.year.total.cashOut.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      {momoStats.year.total.count}
                    </TableCell>
                    <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                      GHC {momoStats.year.total.commission.toLocaleString()}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Provider Summary */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold mb-3 text-foreground">Provider Summary</h3>
        <Card className="border-border shadow-sm rounded-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-2 border-border">
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Provider</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Count</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Cash In</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total Cash Out</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">
                      Total Commission (GHC)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(momoStats.year.byProvider).length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-12"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <p className="text-sm font-medium">No provider data available</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    Object.entries(momoStats.year.byProvider).map(
                      ([provider, stats], idx) => (
                        <TableRow
                          key={provider}
                          className={`hover:bg-muted/50 transition-colors border-b border-border ${
                            idx % 2 === 0 ? "bg-card" : "bg-muted/30"
                          }`}
                        >
                          <TableCell className="font-semibold text-foreground py-4 px-6">
                            {provider}
                          </TableCell>
                          <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                            {stats.count}
                          </TableCell>
                          <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                            GHC {stats.cashIn.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                            GHC {stats.cashOut.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-foreground text-right font-semibold py-4 px-6">
                            GHC {stats.commission.toLocaleString()}
                          </TableCell>
                        </TableRow>
                      )
                    )
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Transactions - HIDDEN */}
      {/* Recent Transactions section commented out */}

      {/* Bank Transactions Table */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4 text-foreground">Bank Transactions</h2>
        <Card className="border-border shadow-sm rounded-lg overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50 border-b-2 border-border">
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Month</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Bank Name</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Date</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Time</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6">Type</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Amount (GHC)</TableHead>
                    <TableHead className="font-semibold text-foreground text-sm uppercase tracking-wider py-4 px-6 text-right">Total (GHC)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {bankTransactionsByMonth.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-center text-muted-foreground py-12"
                      >
                        <div className="flex flex-col items-center justify-center">
                          <p className="text-sm font-medium">No bank transactions found</p>
                          <p className="text-xs text-muted-foreground/80 mt-1">Bank transactions will appear here once recorded</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                  bankTransactionsByMonth.map((monthData) => {
                    const bankEntries = Object.values(monthData.banks);
                    let rowIndex = 0;
                    
                    return bankEntries.flatMap((bank, bankIdx) => {
                      const bankTransactions = bank.transactions.sort((a, b) => {
                        // Sort by date and time
                        const dateA = typeof a.date === "string" ? new Date(a.date) : a.date?.toDate ? a.date.toDate() : new Date(0);
                        const dateB = typeof b.date === "string" ? new Date(b.date) : b.date?.toDate ? b.date.toDate() : new Date(0);
                        if (dateA.getTime() !== dateB.getTime()) {
                          return dateB.getTime() - dateA.getTime();
                        }
                        return (b.time || "").localeCompare(a.time || "");
                      });
                      
                      return bankTransactions.map((t, tIdx) => {
                        const isFirstRow = bankIdx === 0 && tIdx === 0;
                        const isFirstBankRow = tIdx === 0;
                        
                        // Parse date
                        let tDate;
                        if (typeof t.date === "string") {
                          tDate = new Date(t.date);
                        } else if (t.date?.toDate) {
                          tDate = t.date.toDate();
                        } else {
                          tDate = new Date();
                        }
                        
                        const dateLabel = tDate.toLocaleDateString("en-US", {
                          day: "2-digit",
                          month: "short",
                          year: "numeric",
                        });
                        const timeLabel = t.time || "N/A";
                        const typeLabel = t.transactionType === "deposit" ? "Deposit" : t.transactionType === "withdrawal" ? "Withdrawal" : t.transactionType || "N/A";
                        const amount = parseFloat(t.amount || 0);
                        
                        return (
                          <TableRow
                            key={`${monthData.monthKey}-${bank.name}-${t.transactionId || t.id || tIdx}`}
                            className={`hover:bg-muted/50 transition-colors border-b border-border ${
                              rowIndex++ % 2 === 0 ? "bg-card" : "bg-muted/30"
                            }`}
                          >
                            {isFirstRow && (
                              <TableCell
                                rowSpan={monthData.transactions.length}
                                className="font-semibold text-foreground align-top py-4 px-6 border-r border-border bg-muted/50"
                              >
                                {monthData.month}
                              </TableCell>
                            )}
                            {isFirstBankRow && (
                              <TableCell
                                rowSpan={bank.transactions.length}
                                className="font-semibold text-foreground align-top py-4 px-6 border-r border-border"
                              >
                                {bank.name}
                              </TableCell>
                            )}
                            <TableCell className="text-foreground text-sm py-4 px-6 font-medium">
                              {dateLabel}
                            </TableCell>
                            <TableCell className="text-muted-foreground text-sm py-4 px-6">
                              {timeLabel}
                            </TableCell>
                            <TableCell className="py-4 px-6">
                              <Badge 
                                variant={typeLabel === "Deposit" ? "default" : "secondary"}
                                className={typeLabel === "Deposit" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 dark:bg-emerald-500/30" : "bg-red-500/20 text-red-700 dark:text-red-300 dark:bg-red-500/30"}
                              >
                                {typeLabel}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-foreground text-sm py-4 px-6 text-right font-semibold">
                              GHC {amount.toLocaleString()}
                            </TableCell>
                            {isFirstBankRow && (
                              <TableCell
                                rowSpan={bank.transactions.length}
                                className="font-bold text-foreground align-top py-4 px-6 text-right bg-muted/50 border-l border-border"
                              >
                                GHC {bank.total.toLocaleString()}
                              </TableCell>
                            )}
                          </TableRow>
                        );
                      });
                    });
                  })
                )}
              </TableBody>
            </Table>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Commissions Section */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Commissions</h2>
        <div className="grid gap-6 md:grid-cols-2">
          {/* Pie Chart - Commission Distribution by Provider/Bank */}
          <Card className="border-border shadow-sm">
          <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">Commission Distribution</CardTitle>
          </CardHeader>
          <CardContent>
              {(() => {
                // Prepare data for pie chart - combine all commissions
                const pieData = [];
                
                // Add bank commissions (yearly)
                if (commissionStats.bank.byBank && Object.keys(commissionStats.bank.byBank).length > 0) {
                  Object.entries(commissionStats.bank.byBank).forEach(([bankName, data]) => {
                    if (data.year > 0) {
                      pieData.push({
                        name: `${bankName} (Bank)`,
                        value: data.year,
                        type: "Bank"
                      });
                    }
                  });
                } else if (commissionStats.bank.year > 0) {
                  pieData.push({
                    name: "All Banks",
                    value: commissionStats.bank.year,
                    type: "Bank"
                  });
                }
                
                // Add MoMo commissions (yearly - includes all periods)
                Object.entries(commissionStats.momo.year.byProvider).forEach(([provider, amount]) => {
                  if (amount > 0) {
                    pieData.push({
                      name: `${provider} (MoMo)`,
                      value: amount,
                      type: "MoMo"
                    });
                  }
                });

                const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16'];

                if (pieData.length === 0) {
                  return (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <p>No commission data available</p>
                    </div>
                  );
                }

                return (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                        data={pieData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                        {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                      <Tooltip formatter={(value) => `GHC ${value.toLocaleString()}`} />
              </PieChart>
            </ResponsiveContainer>
                );
              })()}
          </CardContent>
        </Card>

          {/* Bar Chart - Commissions by Period */}
          <Card className="border-border shadow-sm">
          <CardHeader>
              <CardTitle className="text-lg font-semibold text-foreground">Commissions by Period</CardTitle>
          </CardHeader>
          <CardContent>
              {(() => {
                // Format period labels
                const getPeriodLabel = (p) => {
                  const now = new Date();
                  switch (p) {
                    case "today":
                      return now.toLocaleDateString('en-US', { weekday: 'long' });
                    case "week":
                      return "This Week";
                    case "month":
                      return now.toLocaleDateString('en-US', { month: 'long' });
                    case "year":
                      return now.getFullYear().toString();
                    default:
                      return p;
                  }
                };

                // Prepare data for bar chart
                const barData = ["today", "week", "month", "year"].map(period => {
                  const periodLabel = getPeriodLabel(period);
                  const data = { period: periodLabel };
                  
                  // Add bank commissions (only for month and year)
                  if (period === "month") {
                    if (commissionStats.bank.byBank && Object.keys(commissionStats.bank.byBank).length > 0) {
                      Object.entries(commissionStats.bank.byBank).forEach(([bankName, bankData]) => {
                        data[`${bankName} (Bank)`] = bankData.month;
                      });
                    } else {
                      data["All Banks"] = commissionStats.bank.month;
                    }
                  } else if (period === "year") {
                    if (commissionStats.bank.byBank && Object.keys(commissionStats.bank.byBank).length > 0) {
                      Object.entries(commissionStats.bank.byBank).forEach(([bankName, bankData]) => {
                        data[`${bankName} (Bank)`] = bankData.year;
                      });
                    } else {
                      data["All Banks"] = commissionStats.bank.year;
                    }
                  }
                  
                  // Add MoMo commissions for all periods
                  Object.entries(commissionStats.momo[period].byProvider).forEach(([provider, amount]) => {
                    data[`${provider} (MoMo)`] = amount;
                  });
                  
                  return data;
                });

                // Get all unique keys (providers/banks) for legend
                const allKeys = new Set();
                barData.forEach(d => {
                  Object.keys(d).forEach(key => {
                    if (key !== "period") allKeys.add(key);
                  });
                });

                if (allKeys.size === 0) {
                  return (
                    <div className="flex items-center justify-center h-64 text-muted-foreground">
                      <p>No commission data available</p>
                    </div>
                  );
                }

                const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#f97316', '#6366f1'];
                const colorMap = {};
                Array.from(allKeys).forEach((key, idx) => {
                  colorMap[key] = COLORS[idx % COLORS.length];
                });

                return (
            <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={barData}>
                <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" />
                <YAxis />
                      <Tooltip formatter={(value) => `GHC ${value.toLocaleString()}`} />
                <Legend />
                      {Array.from(allKeys).map((key) => (
                        <Bar key={key} dataKey={key} fill={colorMap[key]} name={key} />
                      ))}
              </BarChart>
            </ResponsiveContainer>
                );
              })()}
          </CardContent>
        </Card>
                    </div>
                    </div>

      {/* General Daily Commission */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-foreground">General Daily Commission</h2>
        <Card className="border-border shadow-sm">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50 border-b border-border">
                  <TableHead className="font-semibold text-foreground">Type</TableHead>
                  <TableHead className="font-semibold text-foreground">Name/ID</TableHead>
                  <TableHead className="font-semibold text-foreground text-right">Commission Amount (GHC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {generalCommission.merchantSims.map((c, idx) => (
                  <TableRow key={`merchant-${idx}`} className={`hover:bg-muted/50 ${idx % 2 === 0 ? "bg-card" : "bg-muted/30"}`}>
                    <TableCell className="font-medium text-foreground">Merchant SIM</TableCell>
                    <TableCell className="text-muted-foreground">{c.merchantSimName || c.merchantSimId}</TableCell>
                    <TableCell className="text-right font-bold text-foreground">GHC {parseFloat(c.commissionAmount || 0).toLocaleString()}</TableCell>
                  </TableRow>
                ))}
                {generalCommission.bankCommissions.map((c, idx) => {
                  const rowIdx = generalCommission.merchantSims.length + idx;
                  return (
                    <TableRow key={`bank-${idx}`} className={`hover:bg-muted/50 ${rowIdx % 2 === 0 ? "bg-card" : "bg-muted/30"}`}>
                      <TableCell className="font-medium text-foreground">Bank</TableCell>
                      <TableCell className="text-muted-foreground">{c.bankName}</TableCell>
                      <TableCell className="text-right font-bold text-foreground">GHC {parseFloat(c.commissionAmount || 0).toLocaleString()}</TableCell>
                    </TableRow>
                  );
                })}
                {generalCommission.merchantSims.length === 0 && generalCommission.bankCommissions.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={3} className="text-center text-muted-foreground py-8">No commission data available</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
            </div>

      {/* Expenses Section – light: initial white/gray; dark: theme-aware card + light text */}
      <div>
        <h2 className="text-xl font-semibold mb-4 text-foreground">Expenses & Disbursements</h2>
        <Card className="border border-gray-200 dark:border-border shadow-sm bg-white dark:bg-card">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-gray-50 dark:bg-muted/50 hover:bg-gray-50 dark:hover:bg-muted/50 border-b border-gray-200 dark:border-border">
                  <TableHead className="font-semibold text-gray-900 dark:text-foreground">Category</TableHead>
                  <TableHead className="font-semibold text-gray-900 dark:text-foreground text-right">Amount (GHC)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow className="hover:bg-gray-50 dark:hover:bg-muted/30 bg-white dark:bg-card border-b border-gray-100 dark:border-border">
                  <TableCell className="font-medium text-gray-900 dark:text-foreground">Total Disbursed</TableCell>
                  <TableCell className="text-right font-bold text-gray-900 dark:text-foreground">GHC {disbursementStats.totalDisbursed.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-gray-50 dark:hover:bg-muted/30 bg-gray-100 dark:bg-muted/60 border-b border-gray-100 dark:border-border">
                  <TableCell className="font-medium text-gray-900 dark:text-foreground">Total Spent</TableCell>
                  <TableCell className="text-right font-bold text-gray-900 dark:text-foreground">GHC {disbursementStats.totalSpent.toLocaleString()}</TableCell>
                </TableRow>
                <TableRow className="hover:bg-gray-50 dark:hover:bg-muted/30 bg-white dark:bg-card">
                  <TableCell className="font-medium text-gray-900 dark:text-foreground">Balance Left</TableCell>
                  <TableCell className="text-right font-bold text-gray-900 dark:text-foreground">GHC {disbursementStats.balance.toLocaleString()}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>

      {/* Floating quick actions */}
      {quickActionsOpen && (
        <div
          className="fixed inset-0 z-40"
          aria-hidden="true"
          onClick={() => setQuickActionsOpen(false)}
        />
      )}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end">
        {quickActionsOpen && (
          <div className="absolute bottom-14 right-0 w-56 rounded-lg border border-border bg-card py-1 shadow-lg">
            <p className="px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Quick actions</p>
            <Link to="/transactions" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
              <Receipt className="h-4 w-4" />
              Record transaction
            </Link>
            <Link to="/float" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
              <Wallet className="h-4 w-4" />
              Float
            </Link>
            <Link to="/reconciliation" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
              <FileCheck className="h-4 w-4" />
              Reconciliation
            </Link>
            <Link to="/reports" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
              <BarChart3 className="h-4 w-4" />
              Reports
            </Link>
            <button type="button" onClick={() => { setQuickActionsOpen(false); setShowTopUpModal(true); }} className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left">
              <ArrowUpCircle className="h-4 w-4" />
              Top-up float
            </button>
            {(userData?.role === "it_admin" || userData?.role === "admin" || userData?.role === "branch_manager") && (
              <>
                <Link to="/disbursement" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                  <CreditCard className="h-4 w-4" />
                  Disbursement
                </Link>
                <Link to="/users" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                  <Users className="h-4 w-4" />
                  Users
                </Link>
                <Link to="/branches" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                  <MapPin className="h-4 w-4" />
                  Branches
                </Link>
              </>
            )}
            {userData?.role === "it_admin" && (
              <>
                <Link to="/businesses" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                  <Building2 className="h-4 w-4" />
                  Businesses
                </Link>
                <Link to="/activity-logs" onClick={() => setQuickActionsOpen(false)} className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-accent">
                  <Activity className="h-4 w-4" />
                  Activity logs
                </Link>
              </>
            )}
          </div>
        )}
        <Button
          size="icon"
          className="h-14 w-14 rounded-full shadow-lg"
          onClick={() => setQuickActionsOpen((o) => !o)}
          aria-label="Quick actions"
        >
          <Plus className="h-7 w-7" />
        </Button>
      </div>

      {showTopUpModal && (
        <TopUpModal
          branchId={selectedBranchId || userData?.branchId}
          businessId={selectedBusinessId || userData?.businessId}
          userId={userData?.userId}
          userName={userData?.name || userData?.email}
          currentBalances={currentBalances}
          onClose={() => setShowTopUpModal(false)}
          onSuccess={() => {
            loadCurrentBalancesForTopUp();
            loadDashboardData();
          }}
        />
      )}
    </div>
  );
}
