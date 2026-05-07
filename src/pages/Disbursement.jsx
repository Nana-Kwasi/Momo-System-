import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import {
  disbursementService,
  expenseService,
  disbursementTypeService,
  activityLogService,
} from "../services/firestoreService";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";

export default function Disbursement() {
  const { userData, selectedBranchId, selectedBusinessId } = useAuth();

  // Core state
  const [loading, setLoading] = useState(false);

  // Petty cash modal
  const [showPettyCashModal, setShowPettyCashModal] = useState(false);
  const [pettyCashForm, setPettyCashForm] = useState({
    amountReceived: "",
    pettyCashBalance: "",
  });
  const [currentBalance, setCurrentBalance] = useState(0);

  // Custom disbursement types (dynamic buttons)
  const [disbursementTypes, setDisbursementTypes] = useState([]);
  const [showAddTypeModal, setShowAddTypeModal] = useState(false);
  const [newTypeForm, setNewTypeForm] = useState({
    name: "",
    description: "",
  });

  // Active custom disbursement modal
  const [activeType, setActiveType] = useState(null);
  const [customDisbursementForm, setCustomDisbursementForm] = useState({
    amount: "",
    reference: "",
    notes: "",
  });

  const branchId = selectedBranchId || userData?.branchId;
  const businessId = selectedBusinessId || userData?.businessId;

  // Load custom disbursement types for this branch
  useEffect(() => {
    const loadTypes = async () => {
      if (!branchId) return;
      try {
        const types = await disbursementTypeService.getByBranch(branchId);
        setDisbursementTypes(types);
      } catch (error) {
        console.error("Error loading disbursement types:", error);
      }
    };

    loadTypes();
  }, [branchId]);

  // Calculate current petty cash balance from expenses (when petty cash modal opens)
  useEffect(() => {
    const loadCurrentBalance = async () => {
      if (!branchId) return;

      try {
        // Get latest petty cash disbursement
        const latestDisbursement = await disbursementService.getLatestByBranch(
          branchId
        );
        if (!latestDisbursement || latestDisbursement.type !== "petty_cash") {
          setCurrentBalance(0);
          return;
        }

        // Get all expenses since last petty cash disbursement
        const expenses = await expenseService.getByBranch(branchId);
        const disbursementDate = latestDisbursement.createdAt?.toDate
          ? latestDisbursement.createdAt.toDate()
          : new Date(latestDisbursement.createdAt);

        const totalPaid = expenses
          .filter((exp) => {
            const expDate = exp.createdAt?.toDate
              ? exp.createdAt.toDate()
              : new Date(exp.createdAt);
            return expDate >= disbursementDate;
          })
          .reduce((sum, exp) => sum + parseFloat(exp.amountPaid || 0), 0);

        const received = parseFloat(latestDisbursement.amountReceived || 0);
        const balance = received - totalPaid;
        setCurrentBalance(balance);
      } catch (error) {
        console.error("Error loading petty cash balance:", error);
        setCurrentBalance(0);
      }
    };

    if (showPettyCashModal) {
      loadCurrentBalance();
    }
  }, [showPettyCashModal, branchId]);

  const ensureBranchAndBusiness = () => {
    if (!branchId || !businessId) {
      const missing = [];
      if (!businessId) missing.push("Business ID");
      if (!branchId) missing.push("Branch ID");
      alert(
        `Error: ${missing.join(
          " and "
        )} ${
          missing.length > 1 ? "are" : "is"
        } missing. Please ensure you're properly assigned to a business and branch.`
      );
      return false;
    }
    return true;
  };

  const handlePettyCashSubmit = async (e) => {
    e.preventDefault();
    if (!ensureBranchAndBusiness()) return;
    setLoading(true);
    try {
      await disbursementService.create({
        businessId,
        branchId,
        type: "petty_cash",
        typeName: "Petty Cash",
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
      
      // Log petty cash disbursement (best-effort)
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId,
          branchId,
          actionType: "petty_cash_disbursement",
          details: `Petty cash disbursement of GHS ${pettyCashForm.amountReceived || "0.00"} recorded. Current balance: GHS ${currentBalance.toFixed(
            2
          )}.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log petty cash disbursement activity:", logError);
      }
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTypeSubmit = async (e) => {
    e.preventDefault();
    if (!ensureBranchAndBusiness()) return;
    if (!newTypeForm.name.trim()) {
      alert("Please provide a name for the disbursement type.");
      return;
    }
    setLoading(true);
    try {
      await disbursementTypeService.create({
        businessId,
        branchId,
        name: newTypeForm.name.trim(),
        description: newTypeForm.description.trim(),
      });
      setNewTypeForm({ name: "", description: "" });
      setShowAddTypeModal(false);

      // Reload types
      const types = await disbursementTypeService.getByBranch(branchId);
      setDisbursementTypes(types);
    } catch (error) {
      alert("Error adding disbursement type: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCustomDisbursementSubmit = async (e) => {
    e.preventDefault();
    if (!ensureBranchAndBusiness()) return;
    if (!activeType) return;
    setLoading(true);
    try {
      await disbursementService.create({
        businessId,
        branchId,
        type: activeType.typeId || activeType.name,
        typeName: activeType.name,
        amountReceived: parseFloat(customDisbursementForm.amount || 0),
        reference: customDisbursementForm.reference.trim(),
        notes: customDisbursementForm.notes.trim(),
        recordedBy: userData?.userId,
        recordedByName: userData?.name || userData?.email,
        date: new Date().toISOString().split("T")[0],
      });

      alert(`Disbursement for "${activeType.name}" recorded successfully!`);
      setCustomDisbursementForm({
        amount: "",
        reference: "",
        notes: "",
      });
      setActiveType(null);
      
      // Log custom disbursement (best-effort)
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId,
          branchId,
          actionType: "custom_disbursement",
          details: `Disbursement of GHS ${customDisbursementForm.amount || "0.00"} for "${
            activeType.name
          }" recorded. Reference: ${customDisbursementForm.reference || "N/A"}.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log custom disbursement activity:", logError);
      }
    } catch (error) {
      alert("Error recording disbursement: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="mb-6">
        <h1 className="page-title">Disbursement Management</h1>
        <p className="text-muted-foreground">
          Manage different types of money disbursed for your branch
        </p>
      </div>

      {/* Disbursement type buttons */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {/* Fixed Petty Cash button */}
        <Button
          onClick={() => setShowPettyCashModal(true)}
          className="h-32 text-lg"
          variant="outline"
        >
          Petty Cash
        </Button>

        {/* Dynamic custom disbursement types */}
        {disbursementTypes.map((type) => (
          <Button
            key={type.typeId || type.id}
            onClick={() => {
              setActiveType(type);
              setCustomDisbursementForm({
                amount: "",
                reference: "",
                notes: "",
              });
            }}
            className="h-32 text-lg"
            variant="outline"
          >
            {type.name}
          </Button>
        ))}

        {/* Add new type button */}
        <Button
          onClick={() => setShowAddTypeModal(true)}
          className="h-32 text-lg border-dashed"
          variant="outline"
        >
          + Add Disbursement Type
        </Button>
      </div>

      {/* Petty Cash Modal */}
      {showPettyCashModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Petty Cash Disbursement</CardTitle>
              <p className="text-sm text-muted-foreground">
                Record money disbursed into petty cash for expenses.
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
                    onChange={(e) =>
                      setPettyCashForm({
                        ...pettyCashForm,
                        amountReceived: e.target.value,
                      })
                    }
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Total money disbursed into petty cash for expenses.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pettyCashBalance">
                    Current Petty Cash Balance (GHS)
                  </Label>
                  <Input
                    id="pettyCashBalance"
                    type="number"
                    step="0.01"
                    value={currentBalance.toFixed(2)}
                    readOnly
                    className="bg-muted"
                  />
                  <p className="text-xs text-muted-foreground">
                    Balance after expenses since last petty cash disbursement.
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

      {/* Add Disbursement Type Modal */}
      {showAddTypeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>Add Disbursement Type</CardTitle>
              <p className="text-sm text-muted-foreground">
                Create a custom disbursement button (e.g., Rent, Fuel, Salaries,
                Other Projects).
              </p>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddTypeSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="typeName">Name *</Label>
                  <Input
                    id="typeName"
                    value={newTypeForm.name}
                    onChange={(e) =>
                      setNewTypeForm((prev) => ({
                        ...prev,
                        name: e.target.value,
                      }))
                    }
                    placeholder="e.g., Rent, Fuel, Salaries"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="typeDescription">Description (optional)</Label>
                  <Input
                    id="typeDescription"
                    value={newTypeForm.description}
                    onChange={(e) =>
                      setNewTypeForm((prev) => ({
                        ...prev,
                        description: e.target.value,
                      }))
                    }
                    placeholder="Short note about what this disbursement type is for"
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setShowAddTypeModal(false);
                      setNewTypeForm({ name: "", description: "" });
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    {loading ? "Saving..." : "Save Type"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Custom Disbursement Modal */}
      {activeType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md">
            <CardHeader>
              <CardTitle>{activeType.name} Disbursement</CardTitle>
              {activeType.description && (
                <p className="text-sm text-muted-foreground">
                  {activeType.description}
                </p>
              )}
            </CardHeader>
            <CardContent>
              <form
                onSubmit={handleCustomDisbursementSubmit}
                className="space-y-4"
              >
                <div className="space-y-2">
                  <Label htmlFor="customAmount">Amount (GHS) *</Label>
                  <Input
                    id="customAmount"
                    type="number"
                    step="0.01"
                    value={customDisbursementForm.amount}
                    onChange={(e) =>
                      setCustomDisbursementForm((prev) => ({
                        ...prev,
                        amount: e.target.value,
                      }))
                    }
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customReference">
                    Reference / Document Number (optional)
                  </Label>
                  <Input
                    id="customReference"
                    value={customDisbursementForm.reference}
                    onChange={(e) =>
                      setCustomDisbursementForm((prev) => ({
                        ...prev,
                        reference: e.target.value,
                      }))
                    }
                    placeholder="e.g., Cheque number, bank transfer Ref, etc."
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customNotes">Notes / Purpose</Label>
                  <Input
                    id="customNotes"
                    value={customDisbursementForm.notes}
                    onChange={(e) =>
                      setCustomDisbursementForm((prev) => ({
                        ...prev,
                        notes: e.target.value,
                      }))
                    }
                    placeholder="Short explanation of what this disbursement is for"
                  />
                </div>

                <div className="flex justify-end gap-4 pt-4">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setActiveType(null);
                      setCustomDisbursementForm({
                        amount: "",
                        reference: "",
                        notes: "",
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

