import React, { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext";
import { agentBusinessService, branchService, commissionConfigService } from "../services/firestoreService";
import { Card, CardHeader, CardTitle, CardContent } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";

const defaultConfig = {
  momo: {
    cashInRatePercent: 1,
    cashOutNetworkRatePercent: 1,
    cashOutNetworkCapCommission: 20,
    cashOutNetworkSharePercent: 40,
  },
  airtime: {
    ratePercent: 1,
  },
  bundle: {
    ratePercent: 1,
  },
};

const cloneConfig = (cfg) => JSON.parse(JSON.stringify(cfg || {}));

export default function CommissionSettings() {
  const { userData } = useAuth();
  const role = userData?.role;

  const [businesses, setBusinesses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [businessId, setBusinessId] = useState(userData?.businessId || "");
  const [branchId, setBranchId] = useState(userData?.branchId || "");

  const [activeConfig, setActiveConfig] = useState(null);
  const [pendingConfig, setPendingConfig] = useState(null);
  const [draftConfig, setDraftConfig] = useState(cloneConfig(defaultConfig));
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const isBranchManager = role === "branch_manager";

  useEffect(() => {
    const loadInitial = async () => {
      if (role === "it_admin" || role === "admin") {
        try {
          const list = await agentBusinessService.getAll();
          setBusinesses(list);
        } catch (e) {
          console.error("Error loading businesses for commission settings:", e);
        }
      }
      if (isBranchManager && userData?.businessId && userData?.branchId) {
        setBusinessId(userData.businessId);
        setBranchId(userData.branchId);
      }
    };
    loadInitial();
  }, [role, isBranchManager, userData]);

  useEffect(() => {
    const loadBranches = async () => {
      if (!businessId) {
        setBranches([]);
        return;
      }
      try {
        const list = await branchService.getByBusinessId(businessId);
        setBranches(list);
      } catch (e) {
        console.error("Error loading branches for commission settings:", e);
      }
    };
    if (role === "it_admin" || role === "admin") {
      loadBranches();
    }
  }, [businessId, role]);

  useEffect(() => {
    const loadConfig = async () => {
      if (!businessId || !branchId) {
        setActiveConfig(null);
        setPendingConfig(null);
        setDraftConfig(cloneConfig(defaultConfig));
        return;
      }
      try {
        setLoading(true);
        const doc = await commissionConfigService.getByBranch(branchId);
        const active = doc?.activeConfig || null;
        const pending = doc?.pendingConfig || null;
        setActiveConfig(active);
        setPendingConfig(pending);
        setDraftConfig(
          cloneConfig(
            pending ||
              active || {
                ...defaultConfig,
              }
          )
        );
      } catch (e) {
        console.error("Error loading commission config for branch:", e);
        setActiveConfig(null);
        setPendingConfig(null);
        setDraftConfig(cloneConfig(defaultConfig));
      } finally {
        setLoading(false);
      }
    };
    if (businessId && branchId) {
      loadConfig();
    }
  }, [businessId, branchId]);

  const handleNumericChange = (path, value) => {
    const num = value === "" ? "" : Number(value);
    setDraftConfig((prev) => {
      const next = cloneConfig(prev || defaultConfig);
      const segments = path.split(".");
      let obj = next;
      for (let i = 0; i < segments.length - 1; i++) {
        const key = segments[i];
        if (obj[key] == null) obj[key] = {};
        obj = obj[key];
      }
      obj[segments[segments.length - 1]] = num;
      return next;
    });
  };

  // Special charges on cash-out removed – no UI or persistence
  // const handleTierChange = (index, field, value) => { ... };

  const handleSave = async () => {
    if (!businessId || !branchId) {
      alert("Select business and branch first.");
      return;
    }
    try {
      setSaving(true);
      const autoApprove = isBranchManager;
      await commissionConfigService.saveForBranch({
        businessId,
        branchId,
        config: draftConfig,
        user: userData,
        autoApprove,
      });
      const updated = await commissionConfigService.getByBranch(branchId);
      setActiveConfig(updated?.activeConfig || null);
      setPendingConfig(updated?.pendingConfig || null);
      alert(autoApprove ? "Commission settings saved and applied." : "Commission settings saved and sent for Branch Manager approval.");
    } catch (e) {
      console.error("Error saving commission config:", e);
      alert("Failed to save commission settings: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    if (!branchId) return;
    try {
      setSaving(true);
      const updated = await commissionConfigService.approvePending({
        branchId,
        approver: userData,
      });
      setActiveConfig(updated?.activeConfig || null);
      setPendingConfig(updated?.pendingConfig || null);
      setDraftConfig(cloneConfig(updated?.activeConfig || defaultConfig));
      alert("Pending commission settings approved and applied.");
    } catch (e) {
      console.error("Error approving commission config:", e);
      alert("Failed to approve commission settings: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDiscard = async () => {
    if (!branchId) return;
    try {
      setSaving(true);
      const updated = await commissionConfigService.discardPending({ branchId });
      setPendingConfig(updated?.pendingConfig || null);
      setDraftConfig(cloneConfig(updated?.activeConfig || defaultConfig));
      alert("Pending commission settings discarded.");
    } catch (e) {
      console.error("Error discarding commission config:", e);
      alert("Failed to discard pending commission settings: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  const currentConfig = draftConfig || defaultConfig;

  const canApprovePending =
    isBranchManager && pendingConfig && branchId && businessId;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="page-title">Commission Settings</h1>
          <p className="text-muted-foreground">
            Configure MoMo, airtime and bundle commission rates per branch.
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Scope</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {(role === "it_admin" || role === "admin") && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Business *</Label>
                <Select
                  value={businessId}
                  onChange={(e) => {
                    setBusinessId(e.target.value);
                    setBranchId("");
                  }}
                >
                  <option value="">Select business</option>
                  {businesses.map((b) => (
                    <option key={b.businessId} value={b.businessId}>
                      {b.businessName}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Branch *</Label>
                <Select
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  disabled={!businessId}
                >
                  <option value="">Select branch</option>
                  {branches.map((br) => (
                    <option key={br.branchId} value={br.branchId}>
                      {br.branchName || br.branchCode}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          )}

          {isBranchManager && (
            <div className="flex flex-wrap gap-4 text-sm">
              <div>
                <span className="font-medium">Business:</span>{" "}
                <span>{userData?.businessName || userData?.businessId}</span>
              </div>
              <div>
                <span className="font-medium">Branch:</span>{" "}
                <span>{userData?.branchName || userData?.branchId}</span>
              </div>
            </div>
          )}

          {pendingConfig && (
            <div className="mt-2 rounded-md border border-yellow-400 bg-yellow-50 px-3 py-2 text-sm flex items-center justify-between gap-2">
              <div>
                <p className="font-medium text-yellow-800">
                  Pending changes waiting for Branch Manager approval
                </p>
                <p className="text-xs text-yellow-800/80">
                  These settings will only take effect after approval. Until then,
                  active settings (or defaults) continue to apply on all screens.
                </p>
              </div>
              {canApprovePending && (
                <div className="flex gap-2">
                  <Button size="sm" variant="default" onClick={handleApprove} disabled={saving}>
                    Approve
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive border-destructive"
                    onClick={handleDiscard}
                    disabled={saving}
                  >
                    Discard
                  </Button>
                </div>
              )}
            </div>
          )}

          {activeConfig && (
            <div className="flex flex-wrap gap-2 items-center text-xs text-muted-foreground">
              <span>Current active settings:</span>
              <Badge variant="outline">From commission config</Badge>
            </div>
          )}
          {!activeConfig && !pendingConfig && (
            <p className="text-xs text-muted-foreground">
              No saved commission settings for this branch yet. Using system defaults
              (current hardcoded behaviour) until you save.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>MoMo Commissions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Cash-In Commission Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={currentConfig.momo?.cashInRatePercent ?? ""}
                onChange={(e) =>
                  handleNumericChange("momo.cashInRatePercent", e.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cash-Out Network Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={currentConfig.momo?.cashOutNetworkRatePercent ?? ""}
                onChange={(e) =>
                  handleNumericChange("momo.cashOutNetworkRatePercent", e.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Cash-Out Network Cap (GHS)</Label>
              <Input
                type="number"
                step="0.01"
                value={currentConfig.momo?.cashOutNetworkCapCommission ?? ""}
                onChange={(e) =>
                  handleNumericChange(
                    "momo.cashOutNetworkCapCommission",
                    e.target.value
                  )
                }
              />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-1.5">
              <Label>Our Network Share (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={currentConfig.momo?.cashOutNetworkSharePercent ?? ""}
                onChange={(e) =>
                  handleNumericChange(
                    "momo.cashOutNetworkSharePercent",
                    e.target.value
                  )
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Airtime & Bundles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Airtime Commission Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={currentConfig.airtime?.ratePercent ?? ""}
                onChange={(e) =>
                  handleNumericChange("airtime.ratePercent", e.target.value)
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Bundle Commission Rate (%)</Label>
              <Input
                type="number"
                step="0.01"
                value={currentConfig.bundle?.ratePercent ?? ""}
                onChange={(e) =>
                  handleNumericChange("bundle.ratePercent", e.target.value)
                }
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setDraftConfig(
              cloneConfig(
                pendingConfig || activeConfig || defaultConfig
              )
            );
          }}
          disabled={loading || saving}
        >
          Reset to current
        </Button>
        <Button type="button" onClick={handleSave} disabled={loading || saving || !businessId || !branchId}>
          {saving ? "Saving..." : isBranchManager ? "Save & Apply" : "Save (request approval)"}
        </Button>
      </div>
    </div>
  );
}

