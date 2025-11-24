import React, { useState, useEffect } from "react";
import { branchService } from "../services/firestoreService";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";
import { Plus } from "lucide-react";

export default function BranchSelectionModal({ businessId, onSelect, onCancel, onAddNew, canAddNew = false }) {
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState("");

  useEffect(() => {
    if (businessId) {
      loadBranches();
    }
  }, [businessId]);

  const loadBranches = async () => {
    try {
      const data = await branchService.getByBusinessId(businessId);
      setBranches(data.filter(b => b.status === "active"));
    } catch (error) {
      console.error("Error loading branches:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (selectedBranchId) {
      onSelect(selectedBranchId);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading branches...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Select Branch</CardTitle>
          <CardDescription>
            Choose which branch you want to access
          </CardDescription>
        </CardHeader>
        <CardContent>
          {canAddNew && (
            <div className="mb-4">
              <Button variant="outline" onClick={onAddNew} className="w-full">
                <Plus className="h-4 w-4 mr-2" />
                Add New Branch
              </Button>
            </div>
          )}
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {branches.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No active branches found
              </p>
            ) : (
              branches.map((branch) => (
                <div
                  key={branch.branchId}
                  onClick={() => setSelectedBranchId(branch.branchId)}
                  className={`p-4 border rounded-md cursor-pointer transition-colors ${
                    selectedBranchId === branch.branchId
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{branch.branchName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {branch.branchCode} • {branch.branchManager}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {branch.city}, {branch.region}
                      </p>
                    </div>
                    <Badge variant={branch.status === "active" ? "default" : "secondary"}>
                      {branch.status}
                    </Badge>
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="flex justify-end gap-4 mt-6">
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button onClick={handleSelect} disabled={!selectedBranchId}>
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

