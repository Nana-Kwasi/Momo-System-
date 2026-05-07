import React, { useState, useEffect } from "react";
import { agentBusinessService } from "../services/firestoreService";
import { Button } from "./ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./ui/card";
import { Badge } from "./ui/badge";

export default function BusinessSelectionModal({ onSelect, onCancel }) {
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");

  useEffect(() => {
    loadBusinesses();
  }, []);

  const loadBusinesses = async () => {
    try {
      const data = await agentBusinessService.getAll();
      setBusinesses(data.filter(b => b.status === "active"));
    } catch (error) {
      console.error("Error loading businesses:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = () => {
    if (selectedBusinessId) {
      onSelect(selectedBusinessId);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
        <Card className="w-full max-w-2xl">
          <CardContent className="pt-6">
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
              <p className="mt-4 text-muted-foreground">Loading businesses...</p>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Select Business</CardTitle>
          <CardDescription>
            Choose which mobile money business you want to access
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 max-h-[400px] overflow-y-auto">
            {businesses.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No active businesses found
              </p>
            ) : (
              businesses.map((business) => (
                <div
                  key={business.businessId}
                  onClick={() => setSelectedBusinessId(business.businessId)}
                  className={`p-4 border rounded-md cursor-pointer transition-colors ${
                    selectedBusinessId === business.businessId
                      ? "border-primary bg-primary/5"
                      : "hover:bg-accent"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="font-semibold">{business.businessName}</h3>
                      <p className="text-sm text-muted-foreground">
                        {business.businessAbbreviation} • {business.ownerName}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {business.city}, {business.region}
                      </p>
                    </div>
                    <Badge variant={business.status === "active" ? "default" : "secondary"}>
                      {business.status}
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
            <Button onClick={handleSelect} disabled={!selectedBusinessId}>
              Continue
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

