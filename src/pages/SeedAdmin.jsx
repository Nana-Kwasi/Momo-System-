import React, { useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import seedITAdmin from "../scripts/seedAdmin";
import seedBusinessAndBranch from "../scripts/seedBusiness";

export default function SeedAdmin() {
  const [loading, setLoading] = useState(false);
  const [businessLoading, setBusinessLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [businessResult, setBusinessResult] = useState(null);
  const [error, setError] = useState(null);
  const [businessError, setBusinessError] = useState(null);

  const handleSeed = async () => {
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await seedITAdmin();
      setResult(response);
      console.log("Seed completed:", response);
    } catch (err) {
      setError(err.message);
      console.error("Seed error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedBusiness = async () => {
    setBusinessLoading(true);
    setBusinessError(null);
    setBusinessResult(null);

    try {
      const response = await seedBusinessAndBranch();
      setBusinessResult(response);
      console.log("Business seed completed:", response);
    } catch (err) {
      setBusinessError(err.message);
      console.error("Business seed error:", err);
    } finally {
      setBusinessLoading(false);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Seed IT Admin User</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              This will create an IT Admin user in Firebase Authentication and Firestore.
            </p>
            <div className="bg-gray-50 p-4 rounded-md space-y-1 text-sm">
              <p><strong>Email:</strong> franciskontoh4@gmail.com</p>
              <p><strong>Password:</strong> 0000000000</p>
              <p><strong>Role:</strong> it_admin</p>
            </div>
          </div>

          <Button onClick={handleSeed} disabled={loading} className="w-full">
            {loading ? "Seeding..." : "Seed IT Admin User"}
          </Button>

          {result && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-green-800 font-semibold">✅ Success!</p>
              <p className="text-sm text-green-700 mt-1">
                IT Admin user created successfully.
              </p>
              <p className="text-xs text-green-600 mt-2">
                UID: {result.uid}
              </p>
            </div>
          )}

          {error && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">❌ Error</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Seed Business and Branch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm text-gray-600">
              This will create "Francis Agency" business and its first branch (Head Office) in Firestore.
            </p>
            <div className="bg-gray-50 p-4 rounded-md space-y-1 text-sm">
              <p><strong>Business Name:</strong> Francis Agency</p>
              <p><strong>Business Abbreviation:</strong> FRAN</p>
              <p><strong>Branch Name:</strong> Head Office</p>
              <p><strong>Owner:</strong> Francis Kontoh</p>
            </div>
          </div>

          <Button onClick={handleSeedBusiness} disabled={businessLoading} className="w-full">
            {businessLoading ? "Seeding..." : "Seed Business and Branch"}
          </Button>

          {businessResult && (
            <div className="bg-green-50 border border-green-200 rounded-md p-4">
              <p className="text-green-800 font-semibold">✅ Success!</p>
              <p className="text-sm text-green-700 mt-1">
                Business and branch created successfully.
              </p>
              <div className="text-xs text-green-600 mt-2 space-y-1">
                <p><strong>Business ID:</strong> {businessResult.businessId}</p>
                <p><strong>Business Name:</strong> {businessResult.businessName}</p>
                <p><strong>Branch ID:</strong> {businessResult.branchId}</p>
                <p><strong>Branch Name:</strong> {businessResult.branchName}</p>
              </div>
            </div>
          )}

          {businessError && (
            <div className="bg-red-50 border border-red-200 rounded-md p-4">
              <p className="text-red-800 font-semibold">❌ Error</p>
              <p className="text-sm text-red-700 mt-1">{businessError}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

