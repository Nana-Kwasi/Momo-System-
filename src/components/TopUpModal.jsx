import React, { useState, useEffect } from "react";
import { topUpService, dailyFloatService, activityLogService, bankService } from "../services/firestoreService";
import { merchantSimService } from "../services/merchantSimService";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Select } from "./ui/select";
import { X } from "lucide-react";

export default function TopUpModal({ 
  branchId, 
  businessId, 
  userId, 
  userName,
  currentBalances,
  onClose, 
  onSuccess 
}) {
  const [loading, setLoading] = useState(false);
  const [merchantSims, setMerchantSims] = useState([]);
  const [banks, setBanks] = useState([]);
  const [topUpType, setTopUpType] = useState("physical_cash");
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    time: new Date().toLocaleTimeString(),
    topUpType: "physical_cash",
    physicalCashAmount: "",
    merchantSimId: "",
    merchantSimName: "",
    ecashAmount: "",
    fromMerchantSimId: "",
    fromMerchantSimName: "",
    toMerchantSimId: "",
    toMerchantSimName: "",
    bankName: "",
    transferAmount: "",
    remarks: "",
  });

  useEffect(() => {
    if (branchId && businessId) {
      loadMerchantSims();
      bankService.getByBusinessId(businessId).then(setBanks).catch(() => setBanks([]));
    }
  }, [branchId, businessId]);

  const loadMerchantSims = async () => {
    try {
      const sims = await merchantSimService.getByBranch(branchId, businessId);
      setMerchantSims(sims.filter(s => s.status === "active"));
    } catch (error) {
      console.error("Error loading merchant SIMs:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (topUpType === "physical_cash") {
        const amount = parseFloat(formData.physicalCashAmount || 0);
        if (isNaN(amount) || amount <= 0) {
          alert("Please enter a valid physical cash amount");
          setLoading(false);
          return;
        }

        // Get today's float
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }

        // Update float's opening physical cash (this acts as the current balance base)
        // We'll track top-ups separately and add them when calculating balances
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "physical_cash",
          amount: amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });

        // Log activity
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `Physical cash top-up of GHS ${amount.toFixed(2)} added.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }

        alert(`Physical cash top-up of GHS ${amount.toFixed(2)} recorded successfully!`);
      } else if (topUpType === "merchant_sim_ecash") {
        const amount = parseFloat(formData.ecashAmount || 0);
        if (isNaN(amount) || amount <= 0) {
          alert("Please enter a valid e-cash amount");
          setLoading(false);
          return;
        }

        if (!formData.merchantSimId) {
          alert("Please select a merchant SIM");
          setLoading(false);
          return;
        }

        // Get today's float
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }

        await topUpService.create({
          businessId,
          branchId,
          topUpType: "merchant_sim_ecash",
          merchantSimId: formData.merchantSimId,
          merchantSimName: formData.merchantSimName,
          amount: amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });

        // Log activity
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `E-cash top-up of GHS ${amount.toFixed(2)} added to merchant SIM ${formData.merchantSimName || formData.merchantSimId}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }

        alert(`E-cash top-up of GHS ${amount.toFixed(2)} for ${formData.merchantSimName} recorded successfully!`);
      } else if (topUpType === "sim_to_sim") {
        const amount = parseFloat(formData.transferAmount || 0);
        if (isNaN(amount) || amount <= 0 || !formData.fromMerchantSimId || !formData.toMerchantSimId) {
          alert("Select From SIM, To SIM and enter a valid amount.");
          setLoading(false);
          return;
        }
        if (formData.fromMerchantSimId === formData.toMerchantSimId) {
          alert("From and To SIM must be different.");
          setLoading(false);
          return;
        }
        const fromBalance = currentBalances?.merchantSimEcash?.[formData.fromMerchantSimId] ?? 0;
        if (amount > fromBalance) {
          alert(`Amount cannot exceed e-cash balance (GHS ${fromBalance.toFixed(2)}) on the source SIM.`);
          setLoading(false);
          return;
        }
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "sim_to_sim",
          fromMerchantSimId: formData.fromMerchantSimId,
          fromMerchantSimName: formData.fromMerchantSimName,
          toMerchantSimId: formData.toMerchantSimId,
          toMerchantSimName: formData.toMerchantSimName,
          amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `E-cash transfer GHS ${amount.toFixed(2)} from ${formData.fromMerchantSimName} to ${formData.toMerchantSimName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }
        alert(`Transfer of GHS ${amount.toFixed(2)} from ${formData.fromMerchantSimName} to ${formData.toMerchantSimName} recorded!`);
      } else if (topUpType === "bank_to_sim") {
        const amount = parseFloat(formData.transferAmount || 0);
        if (isNaN(amount) || amount <= 0 || !formData.bankName || !formData.merchantSimId) {
          alert("Select bank, To SIM and enter a valid amount.");
          setLoading(false);
          return;
        }
        const bankBalance = currentBalances?.bankBalances?.[formData.bankName] ?? 0;
        if (amount > bankBalance) {
          alert(`Amount cannot exceed bank balance (GHS ${bankBalance.toFixed(2)}) for ${formData.bankName}.`);
          setLoading(false);
          return;
        }
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "bank_to_sim",
          bankName: formData.bankName,
          merchantSimId: formData.merchantSimId,
          merchantSimName: formData.merchantSimName,
          amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `Bank to SIM: GHS ${amount.toFixed(2)} from ${formData.bankName} to ${formData.merchantSimName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }
        alert(`Bank transfer of GHS ${amount.toFixed(2)} to ${formData.merchantSimName} recorded!`);
      } else if (topUpType === "sim_to_bank") {
        const amount = parseFloat(formData.transferAmount || 0);
        if (
          isNaN(amount) ||
          amount <= 0 ||
          !formData.fromMerchantSimId ||
          !formData.bankName
        ) {
          alert("Select SIM, bank and enter a valid amount.");
          setLoading(false);
          return;
        }
        const fromBalance =
          currentBalances?.merchantSimEcash?.[formData.fromMerchantSimId] ?? 0;
        if (amount > fromBalance) {
          alert(
            `Amount cannot exceed e-cash balance (GHS ${fromBalance.toFixed(
              2
            )}) on the source SIM.`
          );
          setLoading(false);
          return;
        }
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "sim_to_bank",
          fromMerchantSimId: formData.fromMerchantSimId,
          fromMerchantSimName: formData.fromMerchantSimName,
          bankName: formData.bankName,
          amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `SIM to bank: GHS ${amount.toFixed(
              2
            )} from ${formData.fromMerchantSimName} to ${formData.bankName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }
        alert(
          `SIM to bank transfer of GHS ${amount.toFixed(
            2
          )} from ${formData.fromMerchantSimName} to ${formData.bankName} recorded!`
        );
      } else if (topUpType === "sim_to_sim_physical") {
        const amount = parseFloat(formData.transferAmount || 0);
        if (isNaN(amount) || amount <= 0 || !formData.fromMerchantSimId || !formData.toMerchantSimId) {
          alert("Select From SIM, To SIM and enter a valid amount.");
          setLoading(false);
          return;
        }
        if (formData.fromMerchantSimId === formData.toMerchantSimId) {
          alert("From and To SIM must be different.");
          setLoading(false);
          return;
        }
        const fromBalance = currentBalances?.merchantSimPhysicalCash?.[formData.fromMerchantSimId] ?? 0;
        if (amount > fromBalance) {
          alert(`Amount cannot exceed physical balance (GHS ${fromBalance.toFixed(2)}) on the source SIM.`);
          setLoading(false);
          return;
        }
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "sim_to_sim_physical",
          fromMerchantSimId: formData.fromMerchantSimId,
          fromMerchantSimName: formData.fromMerchantSimName,
          toMerchantSimId: formData.toMerchantSimId,
          toMerchantSimName: formData.toMerchantSimName,
          amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `Physical transfer GHS ${amount.toFixed(2)} from ${formData.fromMerchantSimName} to ${formData.toMerchantSimName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }
        alert(`Physical transfer GHS ${amount.toFixed(2)} from ${formData.fromMerchantSimName} to ${formData.toMerchantSimName} recorded!`);
      } else if (topUpType === "bank_to_sim_physical") {
        const amount = parseFloat(formData.transferAmount || 0);
        if (isNaN(amount) || amount <= 0 || !formData.bankName || !formData.merchantSimId) {
          alert("Select bank, To SIM and enter a valid amount.");
          setLoading(false);
          return;
        }
        const bankBalance = currentBalances?.bankBalances?.[formData.bankName] ?? 0;
        if (amount > bankBalance) {
          alert(`Amount cannot exceed bank balance (GHS ${bankBalance.toFixed(2)}) for ${formData.bankName}.`);
          setLoading(false);
          return;
        }
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "bank_to_sim_physical",
          bankName: formData.bankName,
          merchantSimId: formData.merchantSimId,
          merchantSimName: formData.merchantSimName,
          amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `Bank to SIM physical: GHS ${amount.toFixed(2)} from ${formData.bankName} to ${formData.merchantSimName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }
        alert(`Bank to SIM physical GHS ${amount.toFixed(2)} to ${formData.merchantSimName} recorded!`);
      } else if (topUpType === "sim_to_bank_physical") {
        const amount = parseFloat(formData.transferAmount || 0);
        if (isNaN(amount) || amount <= 0 || !formData.fromMerchantSimId || !formData.bankName) {
          alert("Select SIM, bank and enter a valid amount.");
          setLoading(false);
          return;
        }
        const fromBalance = currentBalances?.merchantSimPhysicalCash?.[formData.fromMerchantSimId] ?? 0;
        if (amount > fromBalance) {
          alert(`Amount cannot exceed physical balance (GHS ${fromBalance.toFixed(2)}) on the source SIM.`);
          setLoading(false);
          return;
        }
        const today = new Date();
        const float = await dailyFloatService.getByBranchDateAndUser(branchId, today, userId);
        if (!float) {
          alert("No float found for today. Please create a float first.");
          setLoading(false);
          return;
        }
        await topUpService.create({
          businessId,
          branchId,
          topUpType: "sim_to_bank_physical",
          fromMerchantSimId: formData.fromMerchantSimId,
          fromMerchantSimName: formData.fromMerchantSimName,
          bankName: formData.bankName,
          amount,
          recordedBy: userId,
          recordedByName: userName,
          remarks: formData.remarks || "",
          date: formData.date,
          time: formData.time,
        });
        try {
          await activityLogService.log({
            userId,
            userName,
            businessId,
            branchId,
            actionType: "float_topup",
            details: `SIM to bank physical: GHS ${amount.toFixed(2)} from ${formData.fromMerchantSimName} to ${formData.bankName}.`,
            status: "success",
          });
        } catch (logError) {
          console.error("Failed to log top-up activity:", logError);
        }
        alert(`SIM to bank physical GHS ${amount.toFixed(2)} to ${formData.bankName} recorded!`);
      }

      if (onSuccess) {
        onSuccess();
      }
      onClose();
    } catch (error) {
      console.error("Error recording top-up:", error);
      alert("Error recording top-up: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleTopUpTypeChange = (type) => {
    setTopUpType(type);
    setFormData({
      ...formData,
      topUpType: type,
      merchantSimId: "",
      merchantSimName: "",
      fromMerchantSimId: "",
      fromMerchantSimName: "",
      toMerchantSimId: "",
      toMerchantSimName: "",
      bankName: "",
      transferAmount: "",
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-xl border-2">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 border-b border-border">
          <div>
            <CardTitle className="text-xl">Top-Up Float / Cash</CardTitle>
            <CardDescription className="mt-1">
              Add physical cash or e-cash to merchant SIMs
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="h-10 w-10 rounded-lg shrink-0"
          >
            <X className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="pt-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label>Top-Up Type *</Label>
              <Select
                value={topUpType}
                onChange={(e) => handleTopUpTypeChange(e.target.value)}
                required
              >
                <option value="physical_cash">Physical Cash</option>
                <option value="merchant_sim_ecash">Merchant SIM E-Cash</option>
                <option value="sim_to_sim">Transfer E-Cash (SIM to SIM)</option>
                <option value="bank_to_sim">Bank to Merchant SIM E-Cash</option>
                <option value="sim_to_bank">Merchant SIM E-Cash to Bank</option>
                <option value="sim_to_sim_physical">Transfer Physical (SIM to SIM)</option>
                <option value="bank_to_sim_physical">Bank to SIM Physical</option>
                <option value="sim_to_bank_physical">SIM to Bank Physical</option>
              </Select>
            </div>

            {topUpType === "physical_cash" && (
              <div className="space-y-2">
                <Label htmlFor="physicalCashAmount">
                  Physical Cash Amount (GHS) *
                </Label>
                <Input
                  id="physicalCashAmount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.physicalCashAmount}
                  onChange={(e) =>
                    setFormData({ ...formData, physicalCashAmount: e.target.value })
                  }
                  placeholder="0.00"
                  required
                />
                <p className="text-sm text-muted-foreground">
                  Current Physical Cash: GHS {currentBalances?.physicalCash?.toFixed(2) || "0.00"}
                </p>
              </div>
            )}

            {topUpType === "merchant_sim_ecash" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="merchantSim">Merchant SIM *</Label>
                  <Select
                    id="merchantSim"
                    value={formData.merchantSimId}
                    onChange={(e) => {
                      const selectedSim = merchantSims.find(
                        (s) => (s.merchantSimId || s.id) === e.target.value
                      );
                      setFormData({
                        ...formData,
                        merchantSimId: e.target.value,
                        merchantSimName: selectedSim?.simName || "",
                      });
                    }}
                    required
                  >
                    <option value="">Select Merchant SIM</option>
                    {merchantSims.map((sim) => (
                      <option
                        key={sim.merchantSimId || sim.id}
                        value={sim.merchantSimId || sim.id}
                      >
                        {sim.simName} ({sim.provider})
                      </option>
                    ))}
                  </Select>
                </div>

                {formData.merchantSimId && (
                  <div className="space-y-2">
                    <Label htmlFor="ecashAmount">
                      E-Cash Amount (GHS) *
                    </Label>
                    <Input
                      id="ecashAmount"
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formData.ecashAmount}
                      onChange={(e) =>
                        setFormData({ ...formData, ecashAmount: e.target.value })
                      }
                      placeholder="0.00"
                      required
                    />
                    <p className="text-sm text-muted-foreground">
                      Current E-Cash: GHS{" "}
                      {currentBalances?.merchantSimEcash?.[formData.merchantSimId]?.toFixed(2) ||
                        "0.00"}
                    </p>
                  </div>
                )}
              </>
            )}

            {topUpType === "sim_to_sim" && (
              <>
                <div className="space-y-2">
                  <Label>From Merchant SIM *</Label>
                  <Select
                    value={formData.fromMerchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, fromMerchantSimId: e.target.value, fromMerchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select source SIM</option>
                    {merchantSims.map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>
                        {sim.simName} ({sim.provider}) — GHS {currentBalances?.merchantSimEcash?.[sim.merchantSimId || sim.id]?.toFixed(2) ?? "0.00"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To Merchant SIM *</Label>
                  <Select
                    value={formData.toMerchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, toMerchantSimId: e.target.value, toMerchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select destination SIM</option>
                    {merchantSims.filter((s) => (s.merchantSimId || s.id) !== formData.fromMerchantSimId).map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>{sim.simName} ({sim.provider})</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.transferAmount}
                    onChange={(e) => setFormData({ ...formData, transferAmount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                  {formData.fromMerchantSimId && (
                    <p className="text-sm text-muted-foreground">
                      Max: GHS {currentBalances?.merchantSimEcash?.[formData.fromMerchantSimId]?.toFixed(2) ?? "0.00"}
                    </p>
                  )}
                </div>
              </>
            )}

            {topUpType === "bank_to_sim" && (
              <>
                <div className="space-y-2">
                  <Label>Bank *</Label>
                  <Select
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    required
                  >
                    <option value="">Select bank</option>
                    {banks.map((b) => {
                      const name = b.bankName;
                      const bal = currentBalances?.bankBalances?.[name] ?? 0;
                      return (
                        <option key={b.bankId || b.id} value={name}>
                          {name} — GHS {Number(bal).toFixed(2)}
                        </option>
                      );
                    })}
                  </Select>
                  {formData.bankName && (
                    <p className="text-sm text-muted-foreground">
                      Balance: GHS {(currentBalances?.bankBalances?.[formData.bankName] ?? 0).toFixed(2)}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>To Merchant SIM *</Label>
                  <Select
                    value={formData.merchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, merchantSimId: e.target.value, merchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select SIM</option>
                    {merchantSims.map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>{sim.simName} ({sim.provider})</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.transferAmount}
                    onChange={(e) => setFormData({ ...formData, transferAmount: e.target.value })}
                    placeholder="0.00"
                    required
                  />
                  {formData.bankName && (
                    <p className="text-sm text-muted-foreground">
                      Max: GHS {(currentBalances?.bankBalances?.[formData.bankName] ?? 0).toFixed(2)}
                    </p>
                  )}
                </div>
              </>
            )}

            {topUpType === "sim_to_bank" && (
              <>
                <div className="space-y-2">
                  <Label>From Merchant SIM *</Label>
                  <Select
                    value={formData.fromMerchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find(
                        (s) => (s.merchantSimId || s.id) === e.target.value
                      );
                      setFormData({
                        ...formData,
                        fromMerchantSimId: e.target.value,
                        fromMerchantSimName: sim?.simName || "",
                      });
                    }}
                    required
                  >
                    <option value="">Select SIM</option>
                    {merchantSims.map((sim) => (
                      <option
                        key={sim.merchantSimId || sim.id}
                        value={sim.merchantSimId || sim.id}
                      >
                        {sim.simName} ({sim.provider}) — E-Cash GHS{" "}
                        {currentBalances?.merchantSimEcash?.[
                          sim.merchantSimId || sim.id
                        ]?.toFixed(2) ?? "0.00"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bank *</Label>
                  <Select
                    value={formData.bankName}
                    onChange={(e) =>
                      setFormData({ ...formData, bankName: e.target.value })
                    }
                    required
                  >
                    <option value="">Select bank</option>
                    {banks.map((b) => (
                      <option
                        key={b.bankId || b.id}
                        value={b.bankName}
                      >
                        {b.bankName}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.transferAmount}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        transferAmount: e.target.value,
                      })
                    }
                    placeholder="0.00"
                    required
                  />
                  {formData.fromMerchantSimId && (
                    <p className="text-sm text-muted-foreground">
                      Max: GHS{" "}
                      {currentBalances?.merchantSimEcash?.[
                        formData.fromMerchantSimId
                      ]?.toFixed(2) ?? "0.00"}
                    </p>
                  )}
                </div>
              </>
            )}

            {topUpType === "sim_to_sim_physical" && (
              <>
                <div className="space-y-2">
                  <Label>From Merchant SIM (Physical) *</Label>
                  <Select
                    value={formData.fromMerchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, fromMerchantSimId: e.target.value, fromMerchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select source SIM</option>
                    {merchantSims.map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>
                        {sim.simName} ({sim.provider}) — GHS {currentBalances?.merchantSimPhysicalCash?.[sim.merchantSimId || sim.id]?.toFixed(2) ?? "0.00"}
                      </option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>To Merchant SIM *</Label>
                  <Select
                    value={formData.toMerchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, toMerchantSimId: e.target.value, toMerchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select destination SIM</option>
                    {merchantSims.filter((s) => (s.merchantSimId || s.id) !== formData.fromMerchantSimId).map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>{sim.simName} ({sim.provider}) — GHS {currentBalances?.merchantSimPhysicalCash?.[sim.merchantSimId || sim.id]?.toFixed(2) ?? "0.00"}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={formData.transferAmount} onChange={(e) => setFormData({ ...formData, transferAmount: e.target.value })} placeholder="0.00" required />
                  {formData.fromMerchantSimId && (
                    <p className="text-sm text-muted-foreground">Max: GHS {currentBalances?.merchantSimPhysicalCash?.[formData.fromMerchantSimId]?.toFixed(2) ?? "0.00"}</p>
                  )}
                </div>
              </>
            )}

            {topUpType === "bank_to_sim_physical" && (
              <>
                <div className="space-y-2">
                  <Label>Bank *</Label>
                  <Select value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} required>
                    <option value="">Select bank</option>
                    {banks.map((b) => {
                      const name = b.bankName;
                      const bal = currentBalances?.bankBalances?.[name] ?? 0;
                      return <option key={b.bankId || b.id} value={name}>{name} — GHS {Number(bal).toFixed(2)}</option>;
                    })}
                  </Select>
                  {formData.bankName && <p className="text-sm text-muted-foreground">Balance: GHS {(currentBalances?.bankBalances?.[formData.bankName] ?? 0).toFixed(2)}</p>}
                </div>
                <div className="space-y-2">
                  <Label>To Merchant SIM (Physical) *</Label>
                  <Select
                    value={formData.merchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, merchantSimId: e.target.value, merchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select SIM</option>
                    {merchantSims.map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>{sim.simName} ({sim.provider}) — GHS {currentBalances?.merchantSimPhysicalCash?.[sim.merchantSimId || sim.id]?.toFixed(2) ?? "0.00"}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={formData.transferAmount} onChange={(e) => setFormData({ ...formData, transferAmount: e.target.value })} placeholder="0.00" required />
                  {formData.bankName && <p className="text-sm text-muted-foreground">Max: GHS {(currentBalances?.bankBalances?.[formData.bankName] ?? 0).toFixed(2)}</p>}
                </div>
              </>
            )}

            {topUpType === "sim_to_bank_physical" && (
              <>
                <div className="space-y-2">
                  <Label>From Merchant SIM (Physical) *</Label>
                  <Select
                    value={formData.fromMerchantSimId}
                    onChange={(e) => {
                      const sim = merchantSims.find((s) => (s.merchantSimId || s.id) === e.target.value);
                      setFormData({ ...formData, fromMerchantSimId: e.target.value, fromMerchantSimName: sim?.simName || "" });
                    }}
                    required
                  >
                    <option value="">Select SIM</option>
                    {merchantSims.map((sim) => (
                      <option key={sim.merchantSimId || sim.id} value={sim.merchantSimId || sim.id}>{sim.simName} ({sim.provider}) — GHS {currentBalances?.merchantSimPhysicalCash?.[sim.merchantSimId || sim.id]?.toFixed(2) ?? "0.00"}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Bank *</Label>
                  <Select value={formData.bankName} onChange={(e) => setFormData({ ...formData, bankName: e.target.value })} required>
                    <option value="">Select bank</option>
                    {banks.map((b) => (
                      <option key={b.bankId || b.id} value={b.bankName}>{b.bankName} — GHS {(currentBalances?.bankBalances?.[b.bankName] ?? 0).toFixed(2)}</option>
                    ))}
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Amount (GHS) *</Label>
                  <Input type="number" step="0.01" min="0.01" value={formData.transferAmount} onChange={(e) => setFormData({ ...formData, transferAmount: e.target.value })} placeholder="0.00" required />
                  {formData.fromMerchantSimId && <p className="text-sm text-muted-foreground">Max: GHS {currentBalances?.merchantSimPhysicalCash?.[formData.fromMerchantSimId]?.toFixed(2) ?? "0.00"}</p>}
                </div>
              </>
            )}

            <div className="space-y-2">
              <Label htmlFor="remarks">Remarks (Optional)</Label>
              <Input
                id="remarks"
                value={formData.remarks}
                onChange={(e) =>
                  setFormData({ ...formData, remarks: e.target.value })
                }
                placeholder="Enter any notes about this top-up"
              />
            </div>

            <div className="flex gap-3 pt-4">
              <Button
                type="submit"
                disabled={loading}
                className="flex-1"
              >
                {loading ? "Processing..." : "Record Top-Up"}
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

