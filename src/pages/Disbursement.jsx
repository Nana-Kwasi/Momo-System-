import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { disbursementService, expenseService } from "../services/firestoreService";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function Disbursement() {
  const { userData, selectedBranchId, selectedBusinessId } = useAuth();
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({
    amountReceived: "",
    pettyCashBalance: "",
  });
  const [currentBalance, setCurrentBalance] = useState(0);

  // Calculate current petty cash balance from expenses
  useEffect(() => {
    const loadCurrentBalance = async () => {
      const branchId = selectedBranchId || userData?.branchId;
      if (!branchId) return;

      try {
        // Get latest disbursement
        const latestDisbursement = await disbursementService.getLatestByBranch(branchId);
        if (!latestDisbursement) {
          setCurrentBalance(0);
          return;
        }

        // Get all expenses since last disbursement
        const expenses = await expenseService.getByBranch(branchId);
        const disbursementDate = latestDisbursement.createdAt?.toDate ? 
          latestDisbursement.createdAt.toDate() : 
          new Date(latestDisbursement.createdAt);

        // Filter expenses after disbursement and sum amount paid
        const totalPaid = expenses
          .filter(exp => {
            const expDate = exp.createdAt?.toDate ? exp.createdAt.toDate() : new Date(exp.createdAt);
            return expDate >= disbursementDate;
          })
          .reduce((sum, exp) => sum + parseFloat(exp.amountPaid || 0), 0);

        const received = parseFloat(latestDisbursement.amountReceived || 0);
        const balance = received - totalPaid;
        setCurrentBalance(balance);
      } catch (error) {
        console.error("Error loading balance:", error);
        setCurrentBalance(0);
      }
    };

    if (showPettyCashModal) {
      loadCurrentBalance();
    }
  }, [showPettyCashModal, selectedBranchId, userData?.branchId]);

  const handlePettyCashSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const branchId = selectedBranchId || userData?.branchId;
      const businessId = selectedBusinessId || userData?.businessId;
      
      if (!branchId || !businessId) {
        const missing = [];
        if (!businessId) missing.push("Business ID");
        if (!branchId) missing.push("Branch ID");
        alert(`Error: ${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} missing. Please ensure you're properly assigned to a business and branch.`);
        setLoading(false);
        return;
      }

      await disbursementService.create({
        businessId,
        branchId,
        type: "petty_cash",
        amountReceived: parseFloat(pettyCashForm.amountReceived || 0),
        pettyCashBalance: currentBalance, // Use calculated balance
        recordedBy: userData?.userId,
        recordedByName: userData?.name || userData?.email,
        date: new Date().toISOString().split("T")[0],
      });

      alert("Petty Cash disbursement recorded successfully!");
      setPettyCashForm({
        amountReceived: "",
        pettyCashBalance: "",
      });
      setShowPettyCashModal(false);
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Disbursement Management</h1>
        <p className="text-muted-foreground">Manage expense disbursements</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Button
          onClick={() => setShowPettyCashModal(true)}
          className="h-32 text-lg"
          variant="outline"
        >
          Petty Cash
        </Button>
        {/* More buttons will be added here later */}
      </div>

      {showPettyCashModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Petty Cash Disbursement</CardTitle>
              <p className="text-sm text-muted-foreground">
                Record money disbursed for expenses
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handlePettyCashSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="amountReceived">Amount Received (GHS) *</Label>
                  <Input
                    id="amountReceived"
                    type="number"
                    step="0.01"
                    value={pettyCashForm.amountReceived}
                    onChange={(e) => setPettyCashForm({ ...pettyCashForm, amountReceived: e.target.value })}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Total money disbursed into expenses
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pettyCashBalance">Petty Cash Balance (GHS)</Label>
                  <Input
                    id="pettyCashBalance"
                    type="number"
                    step="0.01"
                    value={currentBalance.toFixed(2)}
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Current balance after expenses (updated automatically)
                  </p>
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowPettyCashModal(false);
                      setPettyCashForm({
                        amountReceived: "",
                        pettyCashBalance: "",
                      });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Recording..." : "Record Disbursement"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

