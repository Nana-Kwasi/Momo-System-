import React, { useState } from "react";
import { useAuth } from "../context/AuthContext";
import { transactionService, dailyFloatService, reconciliationService } from "../services/firestoreService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { FileText, Download, Mail, Printer } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";
import { Badge } from "../components/ui/badge";

export default function Reports() {
  const { userData } = useAuth();
  const [reportType, setReportType] = useState("daily");
  const [selectedReport, setSelectedReport] = useState(null);
  const [reportData, setReportData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [dateRange, setDateRange] = useState({
    from: new Date().toISOString().split("T")[0],
    to: new Date().toISOString().split("T")[0],
  });
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split("T")[0]);

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

  const generateReport = async (reportId) => {
    setLoading(true);
    setSelectedReport(reportId);
    try {
      let data = null;

      if (reportId === "daily_transaction") {
        const transactions = await transactionService.getTodayTransactions(userData.branchId, userData.userId, userData.role);
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
            totalCommissions: transactions.momo.reduce((sum, t) => sum + (parseFloat(t.commissionEarned) || 0), 0),
          },
        };
      } else if (reportId === "daily_float") {
        const today = new Date(selectedDate);
        const float = await dailyFloatService.getByBranchAndDate(userData.branchId, today);
        data = {
          title: "Daily Float Report",
          date: selectedDate,
          float,
        };
      } else if (reportId === "daily_reconciliation") {
        const today = new Date(selectedDate);
        // Only branch managers can see all reconciliations, others see only their own
        const isBranchManager = userData?.role === "branch_manager";
        const reconciliation = await reconciliationService.getByBranchAndDate(
          userData.branchId, 
          today,
          isBranchManager ? null : userData.userId,
          userData.role
        );
        data = {
          title: "Daily Reconciliation Report",
          date: selectedDate,
          reconciliation,
        };
      } else {
        data = {
          title: reportTypes[reportType].find(r => r.id === reportId)?.label || "Report",
          message: "Report generation in progress. This report type will be fully implemented.",
        };
      }

      setReportData(data);
    } catch (error) {
      alert("Error generating report: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const exportReport = (format) => {
    if (!reportData) {
      alert("Please generate a report first");
      return;
    }
    alert(`Exporting report as ${format.toUpperCase()}... (Export functionality will be implemented)`);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Reports</h1>
        <p className="text-muted-foreground">Generate and export business reports</p>
      </div>

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
                <Button variant="outline" size="sm">
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
                <div className="grid gap-4 md:grid-cols-3">
                  <div className="p-4 border rounded-md">
                    <p className="text-sm text-muted-foreground">Total Transactions</p>
                    <p className="text-2xl font-bold">{reportData.summary.totalTransactions}</p>
                  </div>
                  <div className="p-4 border rounded-md">
                    <p className="text-sm text-muted-foreground">Total Value</p>
                    <p className="text-2xl font-bold">GHS {reportData.summary.totalValue.toLocaleString()}</p>
                  </div>
                  <div className="p-4 border rounded-md">
                    <p className="text-sm text-muted-foreground">Total Commissions</p>
                    <p className="text-2xl font-bold">GHS {reportData.summary.totalCommissions.toLocaleString()}</p>
                  </div>
                </div>
                {reportData.transactions && (
                  <div>
                    <h3 className="font-semibold mb-2">Transactions</h3>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Time</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Provider/Bank</TableHead>
                          <TableHead>Customer</TableHead>
                          <TableHead>Amount</TableHead>
                          <TableHead>Commission</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {[...(reportData.transactions.momo || []), ...(reportData.transactions.bank || [])]
                          .slice(0, 50)
                          .map((t) => (
                            <TableRow key={t.id}>
                              <TableCell>{t.time || "N/A"}</TableCell>
                              <TableCell>
                                <Badge variant="outline">{t.transactionType || "N/A"}</Badge>
                              </TableCell>
                              <TableCell>{t.provider || t.bankName || "N/A"}</TableCell>
                              <TableCell>{t.customerName || t.customerNumber || "N/A"}</TableCell>
                              <TableCell>GHS {parseFloat(t.amount || 0).toLocaleString()}</TableCell>
                              <TableCell>GHS {parseFloat(t.commissionEarned || 0).toLocaleString()}</TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">Date: {reportData.date}</p>
                <pre className="bg-muted p-4 rounded-md overflow-auto">
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
