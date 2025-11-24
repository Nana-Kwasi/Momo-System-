import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { transactionService, dailyFloatService, branchService, reconciliationService } from "../services/firestoreService";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  DollarSign,
  TrendingUp,
  Activity,
  AlertCircle,
  Wallet,
  CreditCard,
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from "recharts";

const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"];

export default function Dashboard() {
  const { userData } = useAuth();
  const [stats, setStats] = useState({
    totalTransactions: 0,
    totalValue: 0,
    totalCommissions: 0,
    physicalCash: 0,
    mtnEcash: 0,
    vodafoneEcash: 0,
    airtelTigoEcash: 0,
    telecelEcash: 0,
    totalFloat: 0,
    floatUtilization: 0,
  });
  const [providerStats, setProviderStats] = useState([]);
  const [transactionTypeStats, setTransactionTypeStats] = useState([]);
  const [hourlyData, setHourlyData] = useState([]);
  const [recentTransactions, setRecentTransactions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [branchData, setBranchData] = useState(null);

  useEffect(() => {
    loadDashboardData();
  }, [userData?.branchId]);

  const loadDashboardData = async () => {
    if (!userData?.branchId) {
      setLoading(false);
      return;
    }

    try {
      const today = new Date();
      const isAdmin = userData?.role === "admin" || userData?.role === "branch_manager" || userData?.role === "it_admin";
      
      const [todayData, todayFloat] = await Promise.all([
        transactionService.getTodayTransactions(userData.branchId, userData.userId, userData.role),
        // Normal users shouldn't see branch-level float data
        isAdmin ? dailyFloatService.getByBranchAndDate(userData.branchId, today) : Promise.resolve(null),
      ]);
      
      let branch = null;
      // Normal users shouldn't see branch details
      if (isAdmin && userData?.branchId) {
        branch = await branchService.getById(userData.branchId);
      }

      setBranchData(branch);

      const momoTransactions = todayData?.momo || [];
      const bankTransactions = todayData?.bank || [];

      const momoTotal = momoTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      const bankTotal = bankTransactions.reduce((sum, t) => sum + (parseFloat(t.amount) || 0), 0);
      const totalValue = momoTotal + bankTotal;

      const commissions = momoTransactions.reduce((sum, t) => sum + (parseFloat(t.commissionEarned) || 0), 0);

      const providerBreakdown = {};
      const typeBreakdown = {};
      const hourlyBreakdown = {};

      momoTransactions.forEach((t) => {
        const amount = parseFloat(t.amount || 0);
        const provider = t.provider || "Unknown";
        const type = t.transactionType || "unknown";
        const hour = new Date(t.date?.toDate?.() || t.date).getHours();

        providerBreakdown[provider] = providerBreakdown[provider] || { count: 0, value: 0, commission: 0 };
        providerBreakdown[provider].count++;
        providerBreakdown[provider].value += amount;
        providerBreakdown[provider].commission += parseFloat(t.commissionEarned || 0);

        typeBreakdown[type] = typeBreakdown[type] || 0;
        typeBreakdown[type]++;

        hourlyBreakdown[hour] = hourlyBreakdown[hour] || 0;
        hourlyBreakdown[hour]++;
      });

      const providerData = Object.entries(providerBreakdown).map(([name, data]) => ({
        name,
        transactions: data.count,
        value: data.value,
        commission: data.commission,
      }));

      const typeData = Object.entries(typeBreakdown).map(([name, value]) => ({
        name: name.replace("_", " ").toUpperCase(),
        value,
      }));

      const hourlyChartData = Array.from({ length: 24 }, (_, i) => ({
        hour: `${i}:00`,
        transactions: hourlyBreakdown[i] || 0,
      }));

      // For normal users, calculate balances from their own transactions only
      let physicalCash = 0;
      let mtnEcash = 0;
      let vodafoneEcash = 0;
      let airtelTigoEcash = 0;
      let telecelEcash = 0;
      
      if (isAdmin && todayFloat) {
        // Admins see branch-level float data
        physicalCash = parseFloat(todayFloat?.closingPhysicalCash || todayFloat?.openingPhysicalCash || 0);
        mtnEcash = parseFloat(todayFloat?.closingMtnEcash || todayFloat?.openingMtnEcash || 0);
        vodafoneEcash = parseFloat(todayFloat?.closingVodafoneEcash || todayFloat?.openingVodafoneEcash || 0);
        airtelTigoEcash = parseFloat(todayFloat?.closingAirtelTigoEcash || todayFloat?.openingAirtelTigoEcash || 0);
        telecelEcash = parseFloat(todayFloat?.closingTelecelEcash || todayFloat?.openingTelecelEcash || 0);
      } else {
        // Normal users: calculate from their transactions (this is approximate, not actual float)
        // They should only see their transaction impact, not branch float
        physicalCash = 0; // Normal users don't see physical cash balance
        mtnEcash = 0;
        vodafoneEcash = 0;
        airtelTigoEcash = 0;
        telecelEcash = 0;
      }

      const totalFloat = parseFloat(physicalCash) + parseFloat(mtnEcash) + parseFloat(vodafoneEcash) + 
                        parseFloat(airtelTigoEcash) + parseFloat(telecelEcash);
      const floatLimit = parseFloat(branch?.floatLimit || 0);
      const floatUtilization = floatLimit > 0 ? (totalFloat / floatLimit) * 100 : 0;

      const newAlerts = [];
      // Only show float alerts to admins
      if (isAdmin) {
        if (floatUtilization > 80) {
          newAlerts.push({ type: "warning", message: "Float utilization above 80%", severity: "high" });
        }
        if (floatUtilization < 20) {
          newAlerts.push({ type: "info", message: "Float utilization below 20%", severity: "low" });
        }
        if (todayFloat?.status === "flagged") {
          newAlerts.push({ type: "error", message: "Float variance flagged - requires approval", severity: "high" });
        }
      }

      // Normal users shouldn't see branch-level reconciliation data
      // Even admins/IT admins should only see their own reconciliation (privacy)
      const reconciliation = isAdmin 
        ? await reconciliationService.getByBranchAndDate(userData.branchId, today, userData.userId, userData.role)
        : null;
      if (reconciliation && reconciliation.status === "escalated") {
        newAlerts.push({ type: "error", message: "Reconciliation escalated - requires attention", severity: "high" });
      }

      setStats({
        totalTransactions: momoTransactions.length + bankTransactions.length,
        totalValue,
        totalCommissions: commissions,
        physicalCash: parseFloat(physicalCash),
        mtnEcash: parseFloat(mtnEcash),
        vodafoneEcash: parseFloat(vodafoneEcash),
        airtelTigoEcash: parseFloat(airtelTigoEcash),
        telecelEcash: parseFloat(telecelEcash),
        totalFloat,
        floatUtilization,
      });

      setProviderStats(providerData);
      setTransactionTypeStats(typeData);
      setHourlyData(hourlyChartData);
      setAlerts(newAlerts);

      const allTransactions = [
        ...momoTransactions.map(t => ({ ...t, type: 'momo' })),
        ...bankTransactions.map(t => ({ ...t, type: 'bank' }))
      ].sort((a, b) => {
        const dateA = a.date?.toDate?.() || new Date(a.date);
        const dateB = b.date?.toDate?.() || new Date(b.date);
        return dateB - dateA;
      }).slice(0, 20);

      setRecentTransactions(allTransactions);
    } catch (error) {
      console.error("Error loading dashboard:", error);
    } finally {
      setLoading(false);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Welcome back, {userData?.name}</p>
      </div>

      {alerts.length > 0 && (
        <div className="space-y-2">
          {alerts.map((alert, idx) => (
            <Card key={idx} className={`border-l-4 ${
              alert.severity === "high" ? "border-red-500 bg-red-50" : 
              alert.type === "warning" ? "border-yellow-500 bg-yellow-50" : 
              "border-blue-500 bg-blue-50"
            }`}>
              <CardContent className="pt-4">
                <div className="flex items-center gap-2">
                  {alert.severity === "high" ? (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-yellow-600" />
                  )}
                  <p className="text-sm font-medium">{alert.message}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Transactions</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.totalTransactions}</div>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Value</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">GHS {stats.totalValue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Commissions</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">GHS {stats.totalCommissions.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">Today</p>
          </CardContent>
        </Card>

        {(userData?.role === "admin" || userData?.role === "branch_manager" || userData?.role === "it_admin") && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Float Utilization</CardTitle>
              <Wallet className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.floatUtilization.toFixed(1)}%</div>
              <p className="text-xs text-muted-foreground">
                {stats.totalFloat.toLocaleString()} / {branchData?.floatLimit || 0} GHS
              </p>
            </CardContent>
          </Card>
        )}
      </div>

      {(userData?.role === "admin" || userData?.role === "branch_manager" || userData?.role === "it_admin") && (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Physical Cash</CardTitle>
              <DollarSign className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">GHS {stats.physicalCash.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">MTN E-Cash</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">GHS {stats.mtnEcash.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Vodafone E-Cash</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">GHS {stats.vodafoneEcash.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">AirtelTigo E-Cash</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">GHS {stats.airtelTigoEcash.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current balance</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Telecel E-Cash</CardTitle>
              <CreditCard className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">GHS {stats.telecelEcash.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">Current balance</p>
            </CardContent>
          </Card>
        </div>
      )}

      {providerStats.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Provider Breakdown (Today)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-4">
              {providerStats.map((provider) => (
                <div key={provider.name} className="p-4 border rounded-md">
                  <p className="font-semibold">{provider.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {provider.transactions} transactions
                  </p>
                  <p className="text-lg font-bold">GHS {provider.value.toLocaleString()}</p>
                  <p className="text-xs text-green-600">
                    Commission: GHS {provider.commission.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Hourly Transaction Volume</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="hour" />
                <YAxis />
                <Tooltip />
                <Area type="monotone" dataKey="transactions" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Transaction Types</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={transactionTypeStats}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {transactionTypeStats.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Provider Performance</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providerStats}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="transactions" fill="#3b82f6" name="Transactions" />
                <Bar dataKey="commission" fill="#10b981" name="Commission (GHS)" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent Transactions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {recentTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No transactions today
                </p>
              ) : (
                recentTransactions.map((transaction) => (
                  <div
                    key={transaction.id}
                    className="flex items-center justify-between p-2 border rounded-md"
                  >
                    <div className="flex-1">
                      <p className="text-sm font-medium">
                        {transaction.customerName || transaction.customerNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {transaction.provider || transaction.bankName} • {transaction.transactionType}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold">
                        GHS {parseFloat(transaction.amount || 0).toLocaleString()}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {transaction.type}
                      </Badge>
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
