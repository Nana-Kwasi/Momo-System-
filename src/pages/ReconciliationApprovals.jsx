import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { reconciliationService, activityLogService, dailyFloatService } from "../services/firestoreService";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "../components/ui/card";
import { Table, TableHeader, TableHead, TableRow, TableBody, TableCell } from "../components/ui/table";
import { Badge } from "../components/ui/badge";
import { Button } from "../components/ui/button";
import { AlertCircle, CheckCircle2, Eye, RefreshCw } from "lucide-react";

export default function ReconciliationApprovals() {
  const { userData, selectedBranchId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [reconciliations, setReconciliations] = useState([]);
  const [approvedReconciliations, setApprovedReconciliations] = useState([]);
  const [selected, setSelected] = useState(null);
  const [error, setError] = useState("");

  const branchId = selectedBranchId || userData?.branchId;

  useEffect(() => {
    if (userData?.role !== "branch_manager") return;
    if (!branchId) {
      setError("Branch ID is missing. Please ensure you're properly assigned to a branch.");
      return;
    }
    loadReconciliations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, userData?.role]);

  const loadReconciliations = async () => {
    try {
      setLoading(true);
      setError("");
      const items = await reconciliationService.getByBranch(branchId, 100) || [];
      const needingApproval = items.filter((r) => r.status === "pending" || r.status === "escalated");
      const approved = items.filter((r) => r.status === "approved");
      setReconciliations(needingApproval);
      setApprovedReconciliations(approved);
      if (needingApproval.length === 0) setSelected(null);
    } catch (err) {
      console.error("Error loading reconciliations:", err);
      setError("Failed to load reconciliations. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (rec) => {
    if (!rec?.reconciliationId) {
      alert("Reconciliation ID is missing. Cannot approve this record.");
      return;
    }
    if (!window.confirm("Approve this reconciliation and mark the related float as approved?")) return;
    const approvedBy = userData?.name || userData?.email || "Branch Manager";
    const approvedAt = new Date();
    try {
      setLoading(true);
      await reconciliationService.updateStatus(rec.reconciliationId, {
        status: "approved",
        approvedBy,
        approvedByUserId: userData?.userId || null,
        approvedAt,
      });
      const bid = rec.branchId || branchId;
      try {
        if (rec.floatId) {
          await dailyFloatService.update(rec.floatId, {
            status: "approved",
            approvedBy,
            approvedAt,
          });
        } else if (bid && rec.date) {
          const recDate = rec.date?.toDate ? rec.date.toDate() : (typeof rec.date === "string" ? new Date(rec.date) : rec.date);
          const floats = await dailyFloatService.getFloatsByBranchAndDate(bid, recDate);
          for (const f of floats) {
            if (f.floatId && f.status !== "approved") {
              await dailyFloatService.update(f.floatId, {
                status: "approved",
                approvedBy,
                approvedAt,
              });
            }
          }
        }
      } catch (floatErr) {
        console.error("Failed to update float status:", floatErr);
      }
      try {
        await activityLogService.log({
          userId: userData?.userId || null,
          userName: userData?.name || userData?.email || "Unknown User",
          businessId: rec.businessId || null,
          branchId: rec.branchId || selectedBranchId || userData?.branchId || null,
          actionType: "reconciliation_approved",
          details: `Reconciliation ${rec.reconciliationId} for date ${formatDate(rec.date)} approved by ${userData?.name || userData?.email}.`,
          status: "success",
        });
      } catch (logError) {
        console.error("Failed to log reconciliation approval activity:", logError);
      }
      await loadReconciliations();
    } catch (err) {
      console.error("Error approving reconciliation:", err);
      alert("Error approving reconciliation: " + err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatDate = (value) => {
    if (!value) return "N/A";
    try {
      if (value.toDate) {
        return value.toDate().toLocaleString();
      }
      if (typeof value === "string") {
        return new Date(value).toLocaleString();
      }
      return String(value);
    } catch {
      return String(value);
    }
  };

  const sumBalances = (obj = {}) => {
    return Object.values(obj).reduce((sum, v) => {
      const num = parseFloat(v || 0);
      return sum + (isNaN(num) ? 0 : num);
    }, 0);
  };

  if (userData?.role !== "branch_manager") {
    return (
      <div className="space-y-4">
        <h1 className="page-title">Reconciliation Approvals</h1>
        <p className="page-description">
          Only branch managers can approve reconciliations.
        </p>
      </div>
    );
  }

  const tableRowClass = "border-b border-border/60 hover:bg-muted/40 transition-colors";
  const thClass = "text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3 bg-muted/50";

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Reconciliation Approvals</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review daily reconciliations from your branch and approve them once verified.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadReconciliations} disabled={loading} className="shrink-0">
          <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5 shrink-0" />
              <span className="text-sm">{error}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6 lg:grid-cols-[2fr,1.4fr]">
        <Card className={loading ? "opacity-70 pointer-events-none" : ""}>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Pending / Escalated</CardTitle>
            <CardDescription>Reconciliations awaiting your approval</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/50">
                    <TableHead className={thClass}>Date</TableHead>
                    <TableHead className={thClass}>Reconciled By</TableHead>
                    <TableHead className={thClass}>Physical Cash</TableHead>
                    <TableHead className={thClass}>Merchant SIM</TableHead>
                    <TableHead className={thClass}>Variance</TableHead>
                    <TableHead className={thClass}>Status</TableHead>
                    <TableHead className={thClass}>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reconciliations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-8">
                        No reconciliations pending approval.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reconciliations.map((rec) => {
                      const isEscalated = rec.status === "escalated";
                      const isSelected = selected && selected.reconciliationId === rec.reconciliationId;
                      return (
                        <TableRow key={rec.reconciliationId || rec.id} className={`${tableRowClass} ${isSelected ? "bg-primary/5" : ""}`}>
                          <TableCell className="px-4 py-3 text-sm">{formatDate(rec.date)}</TableCell>
                          <TableCell className="px-4 py-3 text-sm">{rec.reconciledByName || rec.reconciledBy || "N/A"}</TableCell>
                          <TableCell className="px-4 py-3 text-xs">
                            <div>Sys: GHS {parseFloat(rec.systemPhysicalCash || 0).toFixed(2)}</div>
                            <div>Act: GHS {parseFloat(rec.actualPhysicalCash || 0).toFixed(2)}</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-xs">
                            <div>Sys: GHS {sumBalances(rec.systemMerchantSimEcash).toFixed(2)}</div>
                            <div>Act: GHS {sumBalances(rec.actualMerchantSimEcash).toFixed(2)}</div>
                          </TableCell>
                          <TableCell className="px-4 py-3 text-sm">
                            GHS {typeof rec.totalVariance === "number" ? rec.totalVariance.toLocaleString() : rec.totalVariance || "0.00"}
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <Badge variant={isEscalated ? "destructive" : "secondary"}>{isEscalated ? "Escalated" : "Pending"}</Badge>
                          </TableCell>
                          <TableCell className="px-4 py-3">
                            <div className="flex gap-2">
                              <Button variant="outline" size="sm" onClick={() => setSelected(rec)} title="View details">
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                              <Button variant="default" size="sm" onClick={() => handleApprove(rec)} title="Approve">
                                <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Details</CardTitle>
            <CardDescription>Selected reconciliation</CardDescription>
          </CardHeader>
          <CardContent>
            {!selected ? (
              <p className="text-sm text-muted-foreground">Select a row to view full details.</p>
            ) : (
              <div className="space-y-3 text-sm">
                <div>
                  <p className="font-medium text-muted-foreground">Date &amp; Time</p>
                  <p className="text-foreground">{formatDate(selected.date)}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-medium text-muted-foreground">Reconciled By</p>
                    <p className="text-foreground">{selected.reconciledByName || selected.reconciledBy || "N/A"}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Total Variance</p>
                    <p className="text-foreground">GHS {typeof selected.totalVariance === "number" ? selected.totalVariance.toLocaleString() : selected.totalVariance || "0.00"}</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-medium text-muted-foreground">Physical Cash (Sys)</p>
                    <p className="text-foreground">GHS {parseFloat(selected.systemPhysicalCash || 0).toFixed(2)}</p>
                  </div>
                  <div>
                    <p className="font-medium text-muted-foreground">Physical Cash (Actual)</p>
                    <p className="text-foreground">GHS {parseFloat(selected.actualPhysicalCash || 0).toFixed(2)}</p>
                  </div>
                </div>
                <div>
                  <p className="font-medium text-muted-foreground">Merchant SIM E‑Cash</p>
                  <div className="mt-1 space-y-1 text-xs">
                    {selected.systemMerchantSimEcash && Object.entries(selected.systemMerchantSimEcash).map(([simId, sysVal]) => {
                      const actVal = selected.actualMerchantSimEcash?.[simId] ?? "";
                      return (
                        <div key={simId} className="flex justify-between border-b border-muted/40 pb-0.5">
                          <span className="mr-2">{simId}</span>
                          <span>Sys: GHS {parseFloat(sysVal || 0).toFixed(2)} | Act: GHS {parseFloat(actVal || 0).toFixed(2)}</span>
                        </div>
                      );
                    })}
                    {(!selected.systemMerchantSimEcash || Object.keys(selected.systemMerchantSimEcash || {}).length === 0) && (
                      <p className="text-muted-foreground">No merchant SIM balances.</p>
                    )}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="font-medium text-muted-foreground">Status</p>
                    <p className="text-foreground capitalize">{selected.status}</p>
                  </div>
                  {selected.approvedBy && (
                    <div>
                      <p className="font-medium text-muted-foreground">Approved By</p>
                      <p className="text-foreground">{selected.approvedBy} {selected.approvedAt ? `— ${formatDate(selected.approvedAt)}` : ""}</p>
                    </div>
                  )}
                </div>
                {selected.varianceExplanation && (
                  <div>
                    <p className="font-medium text-muted-foreground">Variance Explanation</p>
                    <p className="text-foreground whitespace-pre-wrap">{selected.varianceExplanation}</p>
                  </div>
                )}
                {selected.actionTaken && (
                  <div>
                    <p className="font-medium text-muted-foreground">Action Taken</p>
                    <p className="text-foreground whitespace-pre-wrap">{selected.actionTaken}</p>
                  </div>
                )}
                {selected.managerComments && (
                  <div>
                    <p className="font-medium text-muted-foreground">Manager Comments</p>
                    <p className="text-foreground whitespace-pre-wrap">{selected.managerComments}</p>
                  </div>
                )}
                {selected.resolutionNotes && (
                  <div>
                    <p className="font-medium text-muted-foreground">Resolution Notes</p>
                    <p className="text-foreground whitespace-pre-wrap">{selected.resolutionNotes}</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {approvedReconciliations.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-600" />
              Approved Reconciliations
            </CardTitle>
            <CardDescription>History of approved reconciliations with approver and date</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-border bg-muted/50">
                    <TableHead className={thClass}>Date</TableHead>
                    <TableHead className={thClass}>Reconciled By</TableHead>
                    <TableHead className={thClass}>Physical Cash</TableHead>
                    <TableHead className={thClass}>Merchant SIM</TableHead>
                    <TableHead className={thClass}>Variance</TableHead>
                    <TableHead className={thClass}>Approved By</TableHead>
                    <TableHead className={thClass}>Approved At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {approvedReconciliations.map((rec) => (
                    <TableRow key={rec.reconciliationId || rec.id} className={tableRowClass}>
                      <TableCell className="px-4 py-3 text-sm">{formatDate(rec.date)}</TableCell>
                      <TableCell className="px-4 py-3 text-sm">{rec.reconciledByName || rec.reconciledBy || "N/A"}</TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        Sys: GHS {parseFloat(rec.systemPhysicalCash || 0).toFixed(2)} / Act: GHS {parseFloat(rec.actualPhysicalCash || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-xs">
                        Sys: GHS {sumBalances(rec.systemMerchantSimEcash).toFixed(2)} / Act: GHS {sumBalances(rec.actualMerchantSimEcash).toFixed(2)}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm">
                        GHS {typeof rec.totalVariance === "number" ? rec.totalVariance.toLocaleString() : rec.totalVariance || "0.00"}
                      </TableCell>
                      <TableCell className="px-4 py-3 text-sm font-medium">{rec.approvedBy || "—"}</TableCell>
                      <TableCell className="px-4 py-3 text-sm text-muted-foreground">{rec.approvedAt ? formatDate(rec.approvedAt) : "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


