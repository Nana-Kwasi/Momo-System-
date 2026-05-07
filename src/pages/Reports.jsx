import React, { useState,useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  transactionService,
  dailyFloatService,
  reconciliationService,
  branchService,
  userService,
  activityLogService,
  commissionService,
  expenseService,
  commissionConfigService,
  agentBusinessService,
} from "../services/firestoreService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { FileText, Download, Mail, Printer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export default function Reports() {
  const { userData, selectedBranchId, selectedBusinessId } = useAuth();
  const [reportType, setReportType] = useState("daily");
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

  const [commissionConfigSummary, setCommissionConfigSummary] = useState(null);

  const reportTypes = {
    daily: [
      { id: "daily_transaction", label: "Daily Transaction Report" },
      { id: "daily_float", label: "Daily Float Report" },
      { id: "daily_commission", label: "Daily Commission Report" },
      { id: "daily_reconciliation", label: "Daily Reconciliation Report" },
    ],
    weekly: [
      { id: "weekly_performance", label: "Weekly Performance Report" },
      { id: "weekly_float", label: "Weekly Float Analysis" },
      { id: "weekly_commission", label: "Weekly Commission Statement" },
    ],
    monthly: [
      { id: "monthly_summary", label: "Monthly Business Summary" },
      { id: "monthly_provider", label: "Monthly Provider Performance" },
      { id: "monthly_reconciliation", label: "Monthly Reconciliation Summary" },
      { id: "monthly_expense", label: "Monthly Expense Report" },
      { id: "monthly_commission", label: "Monthly Commission Receivables" },
    ],
    custom: [
      { id: "date_range", label: "Date Range Report" },
      { id: "branch_comparison", label: "Branch Comparison Report" },
      { id: "user_performance", label: "User Performance Report" },
      { id: "provider_analysis", label: "Provider Analysis Report" },
      { id: "financial_summary", label: "Financial Summary Report" },
      { id: "audit_trail", label: "Audit Trail Report" },
    ],
  };

  const isAdminLike =
    userData?.role === "admin" ||
    userData?.role === "branch_manager" ||
    userData?.role === "it_admin";

  const parseDate = (value) => {
    if (!value) return null;
    if (typeof value === "string") {
      const d = new Date(value);
      return isNaN(d.getTime()) ? null : d;
    }
    if (value.toDate) return value.toDate();
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  };

  const inRange = (d, from, to) => {
    if (!d) return false;
    return d >= from && d <= to;
  };

  const loadFloatsForRange = async (branchId, from, to) => {
    const floats = await dailyFloatService.getByBranch(branchId, 200);
    const filtered = (floats || []).filter((f) => {
      const d = parseDate(f.date);
      return inRange(d, from, to);
    });
    return filtered;
  };

  const loadReconciliationsForRange = async (branchId, from, to) => {
    const recs = await reconciliationService.getByBranch(branchId, 200);
    const filtered = (recs || []).filter((r) => {
      const d = parseDate(r.date);
      return inRange(d, from, to);
    });
    return filtered;
  };

  const generateReport = async (reportId) => {
    setLoading(true);
    setSelectedReport(reportId);
    try {
      let data = null;

      // Resolve IDs with fallbacks and log them for diagnostics
      const branchId = selectedBranchId || userData?.branchId;
      const businessId = selectedBusinessId || userData?.businessId;

      console.log("[Reports] generateReport", {
        reportId,
        branchId,
        businessId,
        userId: userData?.userId,
        role: userData?.role,
        date: selectedDate,
        dateRange,
      });

      if (reportId === "daily_transaction") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }

        // Use the selected date (not only today)
        const date = selectedDate || new Date().toISOString().split("T")[0];

        // Admin / Branch Manager / IT Admin → full branch; Normal users → only their own
        const transactions = await transactionService.getTransactionsByDateRange(
          branchId,
          date,
          date,
          isAdminLike ? null : userData.userId,
          userData.role
        );
        const totalCommissions = transactions.momo.reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);
        data = {
          title: "Daily Transaction Report",
          date: selectedDate,
          transactions: {
            momo: transactions.momo,
            bank: transactions.bank,
          },
          summary: {
            totalTransactions: transactions.momo.length + transactions.bank.length,
            totalValue: transactions.momo.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) +
                        transactions.bank.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0),
            totalCommissions,
          },
        };
      } else if (reportId === "daily_float") {
        const today = new Date(selectedDate);
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userData?.userId);
        data = {
          title: "Daily Float Report",
          date: selectedDate,
          float,
        };
      } else if (reportId === "daily_reconciliation") {
        const today = new Date(selectedDate);
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        // Only branch managers can see all reconciliations, others see only their own
        const isBranchManager = userData?.role === "branch_manager";
        const reconciliation = await reconciliationService.getByBranchAndDate(
          branchId, 
          today,
          isBranchManager ? null : userData.userId,
          userData.role
        );
        data = {
          title: "Daily Reconciliation Report",
          date: selectedDate,
          reconciliation,
        };
      } else if (reportId === "date_range") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const tx = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );

        const floats = await loadFloatsForRange(branchId, from, to);
        const recs = await loadReconciliationsForRange(branchId, from, to);

        const allMoMo = tx.momo || [];
        const allBank = tx.bank || [];

        const totalValue =
          allMoMo.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) +
          allBank.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        const totalCommissions = allMoMo.reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        data = {
          title: "Date Range Transaction Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          transactions: {
            momo: allMoMo,
            bank: allBank,
          },
          floats,
          reconciliations: recs,
          summary: {
            totalTransactions: allMoMo.length + allBank.length,
            totalValue,
            totalCommissions,
          },
        };
      } else if (reportId === "branch_comparison") {
        if (!isAdminLike) {
          data = {
            title: "Branch Comparison Report",
            date: `${dateRange.from} → ${dateRange.to}`,
            message: "Only Admin, IT Admin and Branch Manager can view branch comparison. You can still use the Date Range Report for your own branch.",
          };
        } else {
          if (!businessId) throw new Error("Business ID is missing. Please ensure you have a business assigned.");
          if (!dateRange.from || !dateRange.to) {
            throw new Error("Please select From and To dates.");
          }

          const branches = await branchService.getByBusinessId(businessId);
          const summaries = [];

          for (const b of branches) {
            const tx = await transactionService.getTransactionsByDateRange(
              b.branchId,
              dateRange.from,
              dateRange.to,
              null,
              userData.role
            );

            const allMoMo = tx.momo || [];
            const allBank = tx.bank || [];
            const totalValue =
              allMoMo.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) +
              allBank.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

            summaries.push({
              branchId: b.branchId,
              branchName: b.branchName || b.branchId,
              totalTransactions: allMoMo.length + allBank.length,
              totalValue,
            });
          }

          data = {
            title: "Branch Comparison Report",
            date: `${dateRange.from} → ${dateRange.to}`,
            branchSummaries: summaries,
          };
        }
      } else if (reportId === "user_performance") {
        if (!branchId) throw new Error("Branch ID is missing.");
        if (!businessId && isAdminLike) throw new Error("Business ID is missing for user performance. Please ensure you have a business assigned.");
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        // One pass: load all transactions for range (admin gets all; normal user gets own)
        const txAll = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );
        const allTx = [...(txAll.momo || []), ...(txAll.bank || [])];

        // Group by recordedBy / recordedByName
        const map = {};
        allTx.forEach((t) => {
          const uid = t.recordedBy || t.recordedByName || "Unknown";
          if (!map[uid]) {
            map[uid] = {
              userId: t.recordedBy || uid,
              userName: t.recordedByName || uid,
              totalTransactions: 0,
              totalValue: 0,
            };
          }
          const amount = parseFloat(t.amount || 0) || 0;
          map[uid].totalTransactions += 1;
          map[uid].totalValue += amount;
        });

        let summaries = Object.values(map);

        // If admin-like and we know the user list, enrich names where possible
        if (isAdminLike) {
          const users = await userService.getAll(businessId, branchId);
          const byId = {};
          users.forEach((u) => {
            byId[u.userId] = u;
          });
          summaries = summaries.map((s) => {
            const match = byId[s.userId];
            return match
              ? { ...s, userName: match.name || match.email || s.userName }
              : s;
          });
        } else {
          // Non-admin: only current user
          summaries = summaries.filter(
            (s) => s.userId === userData.userId || s.userName === userData.name
          );
        }

        data = {
          title: "User Performance Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          userSummaries: summaries,
        };
      } else if (reportId === "provider_analysis") {
        const branchId = selectedBranchId || userData.branchId;
        if (!branchId) throw new Error("Branch ID is missing.");
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const tx = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );

        const byProvider = {};

        (tx.momo || []).forEach((t) => {
          const key = t.provider || "Unknown";
          if (!byProvider[key]) byProvider[key] = { count: 0, total: 0 };
          byProvider[key].count += 1;
          byProvider[key].total += parseFloat(t.amount || 0) || 0;
        });

        (tx.bank || []).forEach((t) => {
          const key = t.bankName || "Bank";
          if (!byProvider[key]) byProvider[key] = { count: 0, total: 0 };
          byProvider[key].count += 1;
          byProvider[key].total += parseFloat(t.amount || 0) || 0;
        });

        data = {
          title: "Provider Analysis Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          providerSummary: byProvider,
        };
      } else if (reportId === "financial_summary") {
        const branchId = selectedBranchId || userData.branchId;
        if (!branchId) throw new Error("Branch ID is missing.");
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const tx = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );

        const momoTotal = (tx.momo || []).reduce(
          (sum, t) => sum + (parseFloat(t.amount) || 0),
          0
        );
        const bankTotal = (tx.bank || []).reduce(
          (sum, t) => sum + (parseFloat(t.amount) || 0),
          0
        );
        const commissionTotal = (tx.momo || []).reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        data = {
          title: "Financial Summary Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          summary: {
            totalTransactions: (tx.momo || []).length + (tx.bank || []).length,
            momoTotal,
            bankTotal,
            totalValue: momoTotal + bankTotal,
            totalCommissions: commissionTotal,
          },
        };
      } else if (reportId === "audit_trail") {
        const branchId = selectedBranchId || userData.branchId;
        if (!branchId) throw new Error("Branch ID is missing.");
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const logs = await activityLogService.getAll({
          branchId,
          dateFrom: dateRange.from,
          dateTo: dateRange.to,
          userId: isAdminLike ? undefined : userData.userId,
        });

        const byAction = {};
        logs.forEach((l) => {
          const key = l.actionType || l.action || "unknown";
          if (!byAction[key]) byAction[key] = 0;
          byAction[key] += 1;
        });

        data = {
          title: "Audit Trail Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          auditSummary: byAction,
          auditLogs: logs.slice(0, 200),
        };
      } else if (reportId === "daily_commission") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        const date = selectedDate || new Date().toISOString().split("T")[0];
        const todayDate = new Date(date);

        const transactions = await transactionService.getTransactionsByDateRange(
          branchId,
          date,
          date,
          isAdminLike ? null : userData.userId,
          userData.role
        );
        const momoCommissions = await commissionService.getAll({ branchId, date: todayDate, type: "momo" });
        const bankCommissions = await commissionService.getAll({ branchId, date: todayDate, type: "bank" });

        const transactionCommissions = (transactions.momo || []).reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        const manualMoMoCommissions = momoCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionEarned || 0)), 0);
        const manualBankCommissions = bankCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount || 0)), 0);

        data = {
          title: "Daily Commission Report",
          date: selectedDate,
          summary: {
            transactionCommissions,
            manualMoMoCommissions,
            manualBankCommissions,
            totalCommissions: transactionCommissions + manualMoMoCommissions + manualBankCommissions,
          },
          transactions: {
            momo: transactions.momo,
            bank: transactions.bank,
          },
          momoCommissions,
          bankCommissions,
        };
      } else if (reportId === "weekly_performance") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const tx = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );

        const allMoMo = tx.momo || [];
        const allBank = tx.bank || [];

        const totalValue = allMoMo.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) +
                          allBank.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        const totalCommissions = allMoMo.reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        data = {
          title: "Weekly Performance Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          transactions: {
            momo: allMoMo,
            bank: allBank,
          },
          summary: {
            totalTransactions: allMoMo.length + allBank.length,
            totalValue,
            totalCommissions,
          },
        };
      } else if (reportId === "weekly_float") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const floats = await loadFloatsForRange(branchId, from, to);

        data = {
          title: "Weekly Float Analysis",
          date: `${dateRange.from} → ${dateRange.to}`,
          floats,
        };
      } else if (reportId === "weekly_commission") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const transactions = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );
        const momoCommissions = await commissionService.getAll({ branchId, dateFrom: dateRange.from, dateTo: dateRange.to, type: "momo" });
        const bankCommissions = await commissionService.getAll({ branchId, dateFrom: dateRange.from, dateTo: dateRange.to, type: "bank" });

        const transactionCommissions = (transactions.momo || []).reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        const manualMoMoCommissions = momoCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionEarned || 0)), 0);
        const manualBankCommissions = bankCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount || 0)), 0);

        data = {
          title: "Weekly Commission Statement",
          date: `${dateRange.from} → ${dateRange.to}`,
          summary: {
            transactionCommissions,
            manualMoMoCommissions,
            manualBankCommissions,
            totalCommissions: transactionCommissions + manualMoMoCommissions + manualBankCommissions,
          },
          transactions: {
            momo: transactions.momo,
            bank: transactions.bank,
          },
          momoCommissions,
          bankCommissions,
        };
      } else if (reportId === "monthly_summary") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const tx = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );
        const floats = await loadFloatsForRange(branchId, from, to);
        const recs = await loadReconciliationsForRange(branchId, from, to);

        const allMoMo = tx.momo || [];
        const allBank = tx.bank || [];

        const totalValue = allMoMo.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0) +
                          allBank.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);

        const totalCommissions = allMoMo.reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        data = {
          title: "Monthly Business Summary",
          date: `${dateRange.from} → ${dateRange.to}`,
          transactions: {
            momo: allMoMo,
            bank: allBank,
          },
          floats,
          reconciliations: recs,
          summary: {
            totalTransactions: allMoMo.length + allBank.length,
            totalValue,
            totalCommissions,
          },
        };
      } else if (reportId === "monthly_provider") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const tx = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );

        const byProvider = {};

        (tx.momo || []).forEach((t) => {
          const key = t.provider || "Unknown";
          if (!byProvider[key]) {
            byProvider[key] = { count: 0, total: 0, commissions: 0 };
          }
          byProvider[key].count += 1;
          byProvider[key].total += parseFloat(t.amount || 0) || 0;
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          byProvider[key].commissions += commission + charges;
        });

        (tx.bank || []).forEach((t) => {
          const key = t.bankName || "Bank";
          if (!byProvider[key]) {
            byProvider[key] = { count: 0, total: 0, commissions: 0 };
          }
          byProvider[key].count += 1;
          byProvider[key].total += parseFloat(t.amount || 0) || 0;
        });

        data = {
          title: "Monthly Provider Performance",
          date: `${dateRange.from} → ${dateRange.to}`,
          providerSummary: byProvider,
        };
      } else if (reportId === "monthly_reconciliation") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const recs = await loadReconciliationsForRange(branchId, from, to);

        data = {
          title: "Monthly Reconciliation Summary",
          date: `${dateRange.from} → ${dateRange.to}`,
          reconciliations: recs,
        };
      } else if (reportId === "monthly_expense") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const from = parseDate(dateRange.from);
        const to = parseDate(dateRange.to);
        if (!from || !to) throw new Error("Invalid date range.");

        const expenses = await expenseService.getByBranch(branchId);
        const filtered = (expenses || []).filter((e) => {
          const d = parseDate(e.date);
          return inRange(d, from, to);
        });

        const totalExpenses = filtered.reduce((sum, e) => sum + (parseFloat(e.amount || 0)), 0);

        data = {
          title: "Monthly Expense Report",
          date: `${dateRange.from} → ${dateRange.to}`,
          expenses: filtered,
          summary: {
            totalExpenses,
            count: filtered.length,
          },
        };
      } else if (reportId === "monthly_commission") {
        if (!branchId) {
          throw new Error("Branch ID is missing. Please ensure you're assigned to a branch (select a branch in the header).");
        }
        if (!dateRange.from || !dateRange.to) {
          throw new Error("Please select From and To dates.");
        }

        const transactions = await transactionService.getTransactionsByDateRange(
          branchId,
          dateRange.from,
          dateRange.to,
          isAdminLike ? null : userData.userId,
          userData.role
        );
        const momoCommissions = await commissionService.getAll({ branchId, dateFrom: dateRange.from, dateTo: dateRange.to, type: "momo" });
        const bankCommissions = await commissionService.getAll({ branchId, dateFrom: dateRange.from, dateTo: dateRange.to, type: "bank" });

        const transactionCommissions = (transactions.momo || []).reduce((sum, t) => {
          const commission = parseFloat(t.commissionEarned || 0);
          const charges = parseFloat(t.charges || 0);
          return sum + commission + charges;
        }, 0);

        const manualMoMoCommissions = momoCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionEarned || 0)), 0);
        const manualBankCommissions = bankCommissions.reduce((sum, c) => sum + (parseFloat(c.commissionAmount || 0)), 0);

        data = {
          title: "Monthly Commission Receivables",
          date: `${dateRange.from} → ${dateRange.to}`,
          summary: {
            transactionCommissions,
            manualMoMoCommissions,
            manualBankCommissions,
            totalCommissions: transactionCommissions + manualMoMoCommissions + manualBankCommissions,
          },
          transactions: {
            momo: transactions.momo,
            bank: transactions.bank,
          },
          momoCommissions,
          bankCommissions,
        };
      } else {
        data = {
          title: reportTypes[reportType].find((r) => r.id === reportId)?.label || "Report",
          message: "Report type not yet implemented.",
        };
      }

      setReportData(data);
    } catch (error) {
      alert("Error generating report: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadConfig = async () => {
      const branchId = selectedBranchId || userData?.branchId;
      const businessId = selectedBusinessId || userData?.businessId;
      if (!branchId || !businessId) {
        setCommissionConfigSummary(null);
        return;
      }
      try {
        const doc = await commissionConfigService.getByBranch(branchId);
        setCommissionConfigSummary(doc?.activeConfig || null);
      } catch (e) {
        console.error("Error loading commission config for reports:", e);
        setCommissionConfigSummary(null);
      }
    };
    if (userData) {
      loadConfig();
    }
  }, [userData, selectedBranchId, selectedBusinessId]);

  const exportReport = async (format) => {
    if (!reportData) {
      alert("Please generate a report first");
      return;
    }

    // Basic implementations for PDF, Excel, and CSV exports
    const rows = [];

    if (reportData.transactions) {
      const allTx = [
        ...(reportData.transactions.momo || []),
        ...(reportData.transactions.bank || []),
      ];
      rows.push([
        "Date", "Time", "Type", "Provider/Bank", "Merchant SIM", "Customer", "Customer Number", "Amount (GHS)",
        "Commission (GHS)", "Charges (GHS)", "Receipt #", "Reference", "Physical Before", "Physical After",
        "E-Cash Before", "E-Cash After", "Remarks", "Recorded By",
      ]);
      allTx.forEach((t) => {
        rows.push([
          typeof t.date === "string" ? t.date : t.date?.toDate ? t.date.toDate().toLocaleDateString() : "",
          t.time || "",
          t.transactionType || "",
          t.provider || t.bankName || "",
          t.merchantSimName || "",
          t.customerName || "",
          t.customerNumber || "",
          parseFloat(t.amount || 0).toFixed(2),
          parseFloat(t.commissionEarned || 0).toFixed(2),
          parseFloat(t.charges || 0).toFixed(2),
          t.receiptNumber || "",
          t.transactionReference || "",
          t.physicalCashBefore != null ? parseFloat(t.physicalCashBefore).toFixed(2) : "",
          t.physicalCashAfter != null ? parseFloat(t.physicalCashAfter).toFixed(2) : "",
          t.ecashBefore != null ? parseFloat(t.ecashBefore).toFixed(2) : "",
          t.ecashAfter != null ? parseFloat(t.ecashAfter).toFixed(2) : "",
          (t.remarks || "").substring(0, 200),
          t.recordedByName || t.recordedBy || "",
        ]);
      });
    } else if (reportData.branchSummaries) {
      // Branch Comparison Report
      rows.push(["Branch Name", "Total Transactions", "Total Value (GHS)"]);
      reportData.branchSummaries.forEach((b) => {
        rows.push([b.branchName, b.totalTransactions.toString(), b.totalValue.toFixed(2)]);
      });
    } else if (reportData.userSummaries) {
      // User Performance Report
      rows.push(["User Name", "Total Transactions", "Total Value (GHS)"]);
      reportData.userSummaries.forEach((u) => {
        rows.push([u.userName, u.totalTransactions.toString(), u.totalValue.toFixed(2)]);
      });
    } else if (reportData.providerSummary) {
      // Provider Analysis Report (check if it has commissions field)
      const hasCommissions = Object.values(reportData.providerSummary).some(stats => stats.commissions !== undefined);
      if (hasCommissions) {
        rows.push(["Provider/Bank", "Transaction Count", "Total Value (GHS)", "Commissions (GHS)"]);
        Object.entries(reportData.providerSummary).forEach(([provider, stats]) => {
          rows.push([provider, stats.count.toString(), stats.total.toFixed(2), (stats.commissions || 0).toFixed(2)]);
        });
      } else {
        rows.push(["Provider/Bank", "Transaction Count", "Total Value (GHS)"]);
        Object.entries(reportData.providerSummary).forEach(([provider, stats]) => {
          rows.push([provider, stats.count.toString(), stats.total.toFixed(2)]);
        });
      }
    } else if (reportData.auditSummary) {
      // Audit Trail Report
      rows.push(["Action Type", "Count"]);
      Object.entries(reportData.auditSummary).forEach(([action, count]) => {
        rows.push([action.replace(/_/g, " "), count.toString()]);
      });
      if (reportData.auditLogs && reportData.auditLogs.length > 0) {
        rows.push([]); // Empty row separator
        rows.push(["Timestamp", "User", "Action", "Details", "Status"]);
        reportData.auditLogs.slice(0, 200).forEach((log) => {
          rows.push([
            log.timestamp?.toDate
              ? log.timestamp.toDate().toLocaleString()
              : typeof log.timestamp === "string"
              ? new Date(log.timestamp).toLocaleString()
              : "",
            log.userName || log.userId || "System",
            log.actionType || log.action || "Unknown",
            (log.details || log.description || log.message || "").substring(0, 100),
            log.status || "success",
          ]);
        });
      }
    } else if (reportData.summary) {
      // Financial Summary Report / Commission Reports / Expense Reports
      rows.push(["Metric", "Value"]);
      if (reportData.summary.totalTransactions !== undefined) {
        rows.push(["Total Transactions", reportData.summary.totalTransactions?.toString() || "0"]);
      }
      if (reportData.summary.momoTotal !== undefined) {
        rows.push(["MoMo Total (GHS)", (reportData.summary.momoTotal || 0).toFixed(2)]);
      }
      if (reportData.summary.bankTotal !== undefined) {
        rows.push(["Bank Total (GHS)", (reportData.summary.bankTotal || 0).toFixed(2)]);
      }
      if (reportData.summary.totalValue !== undefined) {
        rows.push(["Total Value (GHS)", (reportData.summary.totalValue || 0).toFixed(2)]);
      }
      if (reportData.summary.totalCommissions !== undefined) {
        rows.push(["Total Commissions (GHS)", (reportData.summary.totalCommissions || 0).toFixed(2)]);
      }
      if (reportData.summary.transactionCommissions !== undefined) {
        rows.push(["Transaction Commissions (GHS)", (reportData.summary.transactionCommissions || 0).toFixed(2)]);
      }
      if (reportData.summary.manualMoMoCommissions !== undefined) {
        rows.push(["Manual MoMo Commissions (GHS)", (reportData.summary.manualMoMoCommissions || 0).toFixed(2)]);
      }
      if (reportData.summary.manualBankCommissions !== undefined) {
        rows.push(["Manual Bank Commissions (GHS)", (reportData.summary.manualBankCommissions || 0).toFixed(2)]);
      }
      if (reportData.summary.totalExpenses !== undefined) {
        rows.push(["Total Expenses (GHS)", (reportData.summary.totalExpenses || 0).toFixed(2)]);
        rows.push(["Expense Count", (reportData.summary.count || 0).toString()]);
      }
    } else if (reportData.expenses) {
      rows.push([
        "Date", "Category", "Description", "Quantity", "Unit Price", "Amount (GHS)", "Amount Paid", "Amount Received",
        "Payment Method", "Paid To", "Remarks", "Recorded By", "Branch",
      ]);
      reportData.expenses.forEach((e) => {
        rows.push([
          parseDate(e.date)?.toLocaleDateString() || (typeof e.date === "string" ? e.date : ""),
          e.expenseCategory || e.category || "",
          e.description || "",
          e.quantity != null ? e.quantity : "",
          e.unitPrice != null ? parseFloat(e.unitPrice).toFixed(2) : "",
          parseFloat(e.amountPaid || e.amount || 0).toFixed(2),
          parseFloat(e.amountPaid || 0).toFixed(2),
          parseFloat(e.amountReceived || 0).toFixed(2),
          e.paymentMethod || "",
          e.paidTo || "",
          (e.remarks || "").substring(0, 200),
          e.recordedByName || e.recordedBy || "",
          e.branchName || e.branchId || "",
        ]);
      });
    } else {
      // Fallback: generic key-value export
      rows.push(["Field", "Value"]);
      Object.entries(reportData).forEach(([key, value]) => {
        if (typeof value === "object" && value !== null) return;
        rows.push([key, String(value ?? "")]);
      });
    }

    if (format === "csv" || format === "excel") {
      const csv = rows.map((r) =>
        r
          .map((cell) => {
            const c = String(cell ?? "");
            if (c.includes(",") || c.includes('"') || c.includes("\n")) {
              return `"${c.replace(/"/g, '""')}"`;
            }
            return c;
          })
          .join(",")
      ).join("\n");

      const blob = new Blob([csv], {
        type:
          format === "excel"
            ? "application/vnd.ms-excel"
            : "text/csv;charset=utf-8;",
      });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `report_${(reportData.title || "report")
        .toLowerCase()
        .replace(/\s+/g, "_")}.${format === "excel" ? "xls" : "csv"}`;
      a.click();
      return;
    }

    if (format === "pdf") {
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        alert("Popup blocked. Please allow popups to export as PDF.");
        return;
      }
      let logoUrl = "";
      if (selectedBusinessId) {
        try {
          const biz = await agentBusinessService.getById(selectedBusinessId);
          logoUrl = biz?.logoUrl || "";
        } catch (_) {}
      }
      if (!logoUrl) logoUrl = `${window.location.origin}/logo1.jpg`;
      const title = reportData.title || "Report";
      const date = reportData.date || new Date().toLocaleString();
      const tableHtml = `
        <table border="1" cellspacing="0" cellpadding="4" style="border-collapse:collapse;width:100%;font-size:12px;">
          ${rows
            .map(
              (r, idx) =>
                `<tr style="${
                  idx === 0 ? "font-weight:bold;background:#f3f4f6;" : ""
                }">${r.map((c) => `<td>${c}</td>`).join("")}</tr>`
            )
            .join("")}
        </table>
      `;
      const logoHtml = logoUrl
        ? `<div style="margin-bottom:12px;"><img src="${logoUrl}" alt="Logo" style="max-height:48px;width:auto;" /></div>`
        : "";
      win.document.write(`
        <html>
          <head>
            <title>${title}</title>
          </head>
          <body style="font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding:16px;">
            ${logoHtml}
            <h2>${title}</h2>
            <p><strong>Date:</strong> ${date}</p>
            ${tableHtml}
          </body>
        </html>
      `);
      win.document.close();
      win.focus();
      win.print();
      return;
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="page-title">Reports</h1>
        <p className="page-description">Generate and export business reports</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">Current Commission Settings (this branch)</CardTitle>
        </CardHeader>
        <CardContent className="text-xs space-y-3">
          {commissionConfigSummary ? (
            <>
              <div className="grid gap-3 md:grid-cols-3">
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground uppercase tracking-wide">MoMo Cash-In</p>
                  <p>Rate: {commissionConfigSummary.momo?.cashInRatePercent ?? 1}%</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground uppercase tracking-wide">MoMo Cash-Out (Network)</p>
                  <p>
                    {commissionConfigSummary.momo?.cashOutNetworkRatePercent ?? 1}% capped at{" "}
                    GHS {commissionConfigSummary.momo?.cashOutNetworkCapCommission ?? 20}
                  </p>
                  <p>Our share: {commissionConfigSummary.momo?.cashOutNetworkSharePercent ?? 40}%</p>
                </div>
                <div className="space-y-1">
                  <p className="font-medium text-muted-foreground uppercase tracking-wide">Airtime & Bundles</p>
                  <p>Airtime: {commissionConfigSummary.airtime?.ratePercent ?? 1}%</p>
                  <p>Bundles: {commissionConfigSummary.bundle?.ratePercent ?? 1}%</p>
                </div>
              </div>
            </>
          ) : (
            <p className="text-xs text-muted-foreground">
              No saved commission settings for this branch yet. Reports reflect the default system commission rules.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Report Configuration</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reportType">Report Category</Label>
              <Select
                id="reportType"
                value={reportType}
                onChange={(e) => {
                  setReportType(e.target.value);
                  setSelectedReport(null);
                  setReportData(null);
                }}
              >
                <option value="daily">Daily Reports</option>
                <option value="weekly">Weekly Reports</option>
                <option value="monthly">Monthly Reports</option>
                <option value="custom">Custom Reports</option>
              </Select>
            </div>
            {reportType === "daily" ? (
              <div className="space-y-2">
                <Label htmlFor="selectedDate">Date</Label>
                <Input
                  id="selectedDate"
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                />
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label htmlFor="fromDate">From Date</Label>
                  <Input
                    id="fromDate"
                    type="date"
                    value={dateRange.from}
                    onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="toDate">To Date</Label>
                  <Input
                    id="toDate"
                    type="date"
                    value={dateRange.to}
                    onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
                  />
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {reportTypes[reportType].map((report) => (
          <Card key={report.id}>
            <CardHeader>
              <CardTitle className="text-lg">{report.label}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <Button
                variant="default"
                className="w-full"
                onClick={() => generateReport(report.id)}
                disabled={loading}
              >
                <FileText className="h-4 w-4 mr-2" />
                {loading && selectedReport === report.id ? "Generating..." : "Generate Report"}
              </Button>
              {reportData && selectedReport === report.id && (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => exportReport("pdf")}>
                    <Download className="h-4 w-4 mr-2" />
                    PDF
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => exportReport("excel")}>
                    <Download className="h-4 w-4 mr-2" />
                    Excel
                  </Button>
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => exportReport("csv")}>
                    <Download className="h-4 w-4 mr-2" />
                    CSV
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {reportData && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle>{reportData.title}</CardTitle>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => window.print()}>
                  <Printer className="h-4 w-4 mr-2" />
                  Print
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (!reportData) {
                      alert("Generate a report first");
                      return;
                    }
                    const subject = encodeURIComponent(reportData.title || "Report");
                    const body = encodeURIComponent(
                      `Report: ${reportData.title || ""}\nDate: ${
                        reportData.date || ""
                      }\n\nSummary:\n${JSON.stringify(reportData.summary || reportData, null, 2)
                        .slice(0, 2000)}`
                    );
                    window.location.href = `mailto:?subject=${subject}&body=${body}`;
                  }}
                >
                  <Mail className="h-4 w-4 mr-2" />
                  Email
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {reportData.message ? (
              <p className="text-muted-foreground">{reportData.message}</p>
            ) : reportData.summary ? (
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-4">
                  {reportData.summary.totalTransactions !== undefined && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Total Transactions</p>
                      <p className="text-2xl font-bold">{reportData.summary.totalTransactions}</p>
                    </div>
                  )}
                  {reportData.summary.totalValue !== undefined && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Total Value</p>
                      <p className="text-2xl font-bold">GHS {reportData.summary.totalValue.toLocaleString()}</p>
                    </div>
                  )}
                  {reportData.summary.totalCommissions !== undefined && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Total Commissions</p>
                      <p className="text-2xl font-bold">GHS {reportData.summary.totalCommissions.toLocaleString()}</p>
                    </div>
                  )}
                  {reportData.summary.transactionCommissions !== undefined && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Transaction Commissions</p>
                      <p className="text-2xl font-bold">GHS {reportData.summary.transactionCommissions.toLocaleString()}</p>
                    </div>
                  )}
                  {reportData.summary.manualMoMoCommissions !== undefined && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Manual MoMo Commissions</p>
                      <p className="text-2xl font-bold">GHS {reportData.summary.manualMoMoCommissions.toLocaleString()}</p>
                    </div>
                  )}
                  {reportData.summary.manualBankCommissions !== undefined && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Manual Bank Commissions</p>
                      <p className="text-2xl font-bold">GHS {reportData.summary.manualBankCommissions.toLocaleString()}</p>
                    </div>
                  )}
                  {reportData.summary.totalExpenses !== undefined && (
                    <>
                      <div className="p-4 border rounded-md">
                        <p className="text-sm text-muted-foreground">Total Expenses</p>
                        <p className="text-2xl font-bold">GHS {reportData.summary.totalExpenses.toLocaleString()}</p>
                      </div>
                      <div className="p-4 border rounded-md">
                        <p className="text-sm text-muted-foreground">Expense Count</p>
                        <p className="text-2xl font-bold">{reportData.summary.count || 0}</p>
                      </div>
                    </>
                  )}
                </div>
            {reportData.transactions && (
                  <div>
                    <h3 className="font-semibold mb-2">Transactions</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Time</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Provider/Bank</TableHead>
                          <TableHead>Merchant SIM</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Commission</TableHead>
                          <TableHead>Charges</TableHead>
                          <TableHead>Receipt #</TableHead>
                          <TableHead>Reference</TableHead>
                          <TableHead>Recorded By</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(reportData.transactions.momo || []), ...(reportData.transactions.bank || [])]
                          .slice(0, 100)
                          .map((t) => (
                            <TableRow key={t.id}>
                              <TableCell>{typeof t.date === "string" ? t.date : t.date?.toDate ? t.date.toDate().toLocaleDateString() : "N/A"}</TableCell>
                              <TableCell>{t.time || "N/A"}</TableCell>
                              <TableCell><Badge variant="outline">{t.transactionType || "N/A"}</Badge></TableCell>
                              <TableCell>{t.provider || t.bankName || "N/A"}</TableCell>
                              <TableCell>{t.merchantSimName || "—"}</TableCell>
                              <TableCell>{t.customerName || t.customerNumber || "N/A"}</TableCell>
                              <TableCell>GHS {parseFloat(t.amount || 0).toLocaleString()}</TableCell>
                              <TableCell>GHS {parseFloat(t.commissionEarned || 0).toLocaleString()}</TableCell>
                              <TableCell>GHS {parseFloat(t.charges || 0).toLocaleString()}</TableCell>
                              <TableCell>{t.receiptNumber || "—"}</TableCell>
                              <TableCell>{t.transactionReference || "—"}</TableCell>
                              <TableCell>{t.recordedByName || t.recordedBy || "—"}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
            )}
            {reportData.floats && reportData.floats.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Floats (Opening/Closing)</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Opening Physical</TableHead>
                      <TableHead>Closing Physical</TableHead>
                      <TableHead>Recorded By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.floats.map((f, idx) => (
                      <TableRow key={f.floatId || idx}>
                        <TableCell>
                          {parseDate(f.date)?.toLocaleDateString() ||
                            (typeof f.date === "string" ? f.date : "N/A")}
                        </TableCell>
                        <TableCell>{f.status || (f.closingPhysicalCash ? "closed" : "open")}</TableCell>
                        <TableCell>
                          GHS{" "}
                          {parseFloat(f.openingPhysicalCash || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          {f.closingPhysicalCash
                            ? `GHS ${parseFloat(f.closingPhysicalCash || 0).toLocaleString()}`
                            : "—"}
                        </TableCell>
                        <TableCell>{f.recordedByName || f.recordedBy || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {reportData.reconciliations && reportData.reconciliations.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Reconciliations</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total Variance</TableHead>
                      <TableHead>Reconciled By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.reconciliations.map((r, idx) => (
                      <TableRow key={r.reconciliationId || idx}>
                        <TableCell>
                          {parseDate(r.date)?.toLocaleDateString() ||
                            (typeof r.date === "string" ? r.date : "N/A")}
                        </TableCell>
                        <TableCell className="capitalize">{r.status || "pending"}</TableCell>
                        <TableCell>
                          GHS {parseFloat(r.totalVariance || 0).toLocaleString()}
                        </TableCell>
                        <TableCell>{r.reconciledByName || r.reconciledBy || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {(reportData.momoCommissions || reportData.bankCommissions) && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Manual Commissions</h3>
                {reportData.momoCommissions && reportData.momoCommissions.length > 0 && (
                  <div className="mb-4">
                    <h4 className="font-medium mb-2">MoMo E-Cash Commissions</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Provider</TableHead>
                          <TableHead>Merchant SIM</TableHead>
                          <TableHead>Commission Earned (GHS)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.momoCommissions.slice(0, 50).map((c, idx) => (
                          <TableRow key={c.id || idx}>
                            <TableCell>
                              {parseDate(c.date)?.toLocaleDateString() ||
                                (typeof c.date === "string" ? c.date : "N/A")}
                            </TableCell>
                            <TableCell>{c.provider || "N/A"}</TableCell>
                            <TableCell>{c.merchantSimName || "N/A"}</TableCell>
                            <TableCell>GHS {parseFloat(c.commissionEarned || 0).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {reportData.bankCommissions && reportData.bankCommissions.length > 0 && (
                  <div>
                    <h4 className="font-medium mb-2">Bank Commissions</h4>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Date</TableHead>
                          <TableHead>Bank</TableHead>
                          <TableHead>Commission Amount (GHS)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.bankCommissions.slice(0, 50).map((c, idx) => (
                          <TableRow key={c.id || idx}>
                            <TableCell>
                              {parseDate(c.date)?.toLocaleDateString() ||
                                (typeof c.date === "string" ? c.date : "N/A")}
                            </TableCell>
                            <TableCell>{c.bankName || "N/A"}</TableCell>
                            <TableCell>GHS {parseFloat(c.commissionAmount || 0).toLocaleString()}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}
            {reportData.expenses && reportData.expenses.length > 0 && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Expenses</h3>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Amount (GHS)</TableHead>
                      <TableHead>Payment Method</TableHead>
                      <TableHead>Paid To</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.expenses.slice(0, 100).map((e, idx) => (
                      <TableRow key={e.id || e.expenseId || idx}>
                        <TableCell>
                          {parseDate(e.date)?.toLocaleDateString() ||
                            (typeof e.date === "string" ? e.date : "N/A")}
                        </TableCell>
                        <TableCell>{e.category || "N/A"}</TableCell>
                        <TableCell>{e.description || "N/A"}</TableCell>
                        <TableCell>GHS {parseFloat(e.amount || 0).toLocaleString()}</TableCell>
                        <TableCell>{e.paymentMethod || "N/A"}</TableCell>
                        <TableCell>{e.paidTo || "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
            {reportData.float && (
              <div className="mt-6">
                <h3 className="font-semibold mb-2">Daily Float</h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 border rounded-md">
                    <p className="text-sm text-muted-foreground">Opening Physical Cash</p>
                    <p className="text-xl font-bold">GHS {parseFloat(reportData.float.openingPhysicalCash || 0).toLocaleString()}</p>
                  </div>
                  {reportData.float.closingPhysicalCash && (
                    <div className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground">Closing Physical Cash</p>
                      <p className="text-xl font-bold">GHS {parseFloat(reportData.float.closingPhysicalCash || 0).toLocaleString()}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
              </div>
            ) : reportData.branchSummaries ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Date Range: {reportData.date}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Branch Name</TableHead>
                      <TableHead>Total Transactions</TableHead>
                      <TableHead>Total Value (GHS)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.branchSummaries.map((b, idx) => (
                      <TableRow key={b.branchId || idx}>
                        <TableCell className="font-medium">{b.branchName}</TableCell>
                        <TableCell>{b.totalTransactions}</TableCell>
                        <TableCell>GHS {b.totalValue.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : reportData.userSummaries ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Date Range: {reportData.date}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User Name</TableHead>
                      <TableHead>Total Transactions</TableHead>
                      <TableHead>Total Value (GHS)</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {reportData.userSummaries.map((u, idx) => (
                      <TableRow key={u.userId || idx}>
                        <TableCell className="font-medium">{u.userName}</TableCell>
                        <TableCell>{u.totalTransactions}</TableCell>
                        <TableCell>GHS {u.totalValue.toLocaleString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : reportData.providerSummary ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Date Range: {reportData.date}</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Provider/Bank</TableHead>
                      <TableHead>Transaction Count</TableHead>
                      <TableHead>Total Value (GHS)</TableHead>
                      {Object.values(reportData.providerSummary).some(stats => stats.commissions !== undefined) && (
                        <TableHead>Commissions (GHS)</TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(reportData.providerSummary).map(([provider, stats], idx) => (
                      <TableRow key={provider || idx}>
                        <TableCell className="font-medium">{provider}</TableCell>
                        <TableCell>{stats.count}</TableCell>
                        <TableCell>GHS {stats.total.toLocaleString()}</TableCell>
                        {stats.commissions !== undefined && (
                          <TableCell>GHS {(stats.commissions || 0).toLocaleString()}</TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : reportData.auditSummary ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Date Range: {reportData.date}</p>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4">
                  {Object.entries(reportData.auditSummary).map(([action, count], idx) => (
                    <div key={action || idx} className="p-4 border rounded-md">
                      <p className="text-sm text-muted-foreground capitalize">{action.replace(/_/g, " ")}</p>
                      <p className="text-2xl font-bold">{count}</p>
                    </div>
                  ))}
                </div>
                {reportData.auditLogs && reportData.auditLogs.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-2">Recent Activity Logs ({reportData.auditLogs.length} entries)</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>User</TableHead>
                          <TableHead>Action</TableHead>
                          <TableHead>Details</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {reportData.auditLogs.slice(0, 50).map((log, idx) => (
                          <TableRow key={log.id || idx}>
                            <TableCell>
                              {log.timestamp?.toDate
                                ? log.timestamp.toDate().toLocaleString()
                                : typeof log.timestamp === "string"
                                ? new Date(log.timestamp).toLocaleString()
                                : "N/A"}
                            </TableCell>
                            <TableCell>{log.userName || log.userId || "System"}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{log.actionType || log.action || "Unknown"}</Badge>
                            </TableCell>
                            <TableCell className="max-w-md truncate">
                              {log.details || log.description || log.message || "N/A"}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant={
                                  log.status === "success"
                                    ? "default"
                                    : log.status === "failed"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {log.status || "success"}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Date: {reportData.date || "N/A"}</p>
                <pre className="bg-muted p-4 rounded-md overflow-auto text-xs">
                  {JSON.stringify(reportData, null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
