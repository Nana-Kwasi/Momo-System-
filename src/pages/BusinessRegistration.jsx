import React, { useState, useEffect } from "react";
import { agentBusinessService } from "../services/firestoreService";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Select } from "../components/ui/select";
import { Badge } from "../components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../components/ui/table";

export default function BusinessRegistration() {
  const { userData } = useAuth();
  const [businesses, setBusinesses] = useState([]);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    businessName: "",
    businessAbbreviation: "",
    ownerName: "",
    ownerPhone: "",
    ownerEmail: "",
    ghanaCardNumber: "",
    businessRegistrationNumber: "",
    physicalAddress: "",
    region: "",
    city: "",
    digitalAddress: "",
    agentCodes: {
      mtnAgentCode: "",
      vodafoneAgentCode: "",
      airtelTigoAgentCode: "",
      telecelAgentCode: "",
    },
    bankAgentCodes: {
      ecobankAgentCode: "",
      fidelityAgentCode: "",
      firstBankAgentCode: "",
      gcbAgentCode: "",
    },
    status: "active",
  });

  useEffect(() => {
    loadBusinesses();
  }, []);

  const loadBusinesses = async () => {
    try {
      const data = await agentBusinessService.getAll();
      setBusinesses(data);
    } catch (error) {
      console.error("Error loading businesses:", error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      await agentBusinessService.create({
        ...formData,
        createdBy: userData?.userId,
      });
      alert("Business registered successfully!");
      setFormData({
        businessName: "",
        businessAbbreviation: "",
        ownerName: "",
        ownerPhone: "",
        ownerEmail: "",
        ghanaCardNumber: "",
        businessRegistrationNumber: "",
        physicalAddress: "",
        region: "",
        city: "",
        digitalAddress: "",
        agentCodes: {
          mtnAgentCode: "",
          vodafoneAgentCode: "",
          airtelTigoAgentCode: "",
          telecelAgentCode: "",
        },
        bankAgentCodes: {
          ecobankAgentCode: "",
          fidelityAgentCode: "",
          firstBankAgentCode: "",
          gcbAgentCode: "",
        },
        status: "active",
      });
      loadBusinesses();
    } catch (error) {
      alert("Error registering business: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agent Business Registration</h1>
        <p className="text-muted-foreground">Register and manage agent businesses</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Register New Business</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="businessName">Business Name *</Label>
                <Input
                  id="businessName"
                  value={formData.businessName}
                  onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessAbbreviation">Business Abbreviation * (Max 4 chars)</Label>
                <Input
                  id="businessAbbreviation"
                  value={formData.businessAbbreviation}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      businessAbbreviation: e.target.value.toUpperCase().slice(0, 4),
                    })
                  }
                  maxLength={4}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerName">Owner Full Name *</Label>
                <Input
                  id="ownerName"
                  value={formData.ownerName}
                  onChange={(e) => setFormData({ ...formData, ownerName: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ghanaCardNumber">Ghana Card Number *</Label>
                <Input
                  id="ghanaCardNumber"
                  value={formData.ghanaCardNumber}
                  onChange={(e) => setFormData({ ...formData, ghanaCardNumber: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="ownerPhone">Owner Phone *</Label>
                <Input
                  id="ownerPhone"
                  type="tel"
                  value={formData.ownerPhone}
                  onChange={(e) => setFormData({ ...formData, ownerPhone: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ownerEmail">Owner Email *</Label>
                <Input
                  id="ownerEmail"
                  type="email"
                  value={formData.ownerEmail}
                  onChange={(e) => setFormData({ ...formData, ownerEmail: e.target.value })}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="businessRegistrationNumber">Business Registration Number</Label>
              <Input
                id="businessRegistrationNumber"
                value={formData.businessRegistrationNumber}
                onChange={(e) =>
                  setFormData({ ...formData, businessRegistrationNumber: e.target.value })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="physicalAddress">Physical Address *</Label>
              <Input
                id="physicalAddress"
                value={formData.physicalAddress}
                onChange={(e) => setFormData({ ...formData, physicalAddress: e.target.value })}
                required
              />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="region">Region *</Label>
                <Input
                  id="region"
                  value={formData.region}
                  onChange={(e) => setFormData({ ...formData, region: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="city">City *</Label>
                <Input
                  id="city"
                  value={formData.city}
                  onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="digitalAddress">Digital Address (GPS)</Label>
                <Input
                  id="digitalAddress"
                  value={formData.digitalAddress}
                  onChange={(e) => setFormData({ ...formData, digitalAddress: e.target.value })}
                />
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Mobile Money Agent Codes</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="mtnAgentCode">MTN Agent Code</Label>
                  <Input
                    id="mtnAgentCode"
                    value={formData.agentCodes.mtnAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentCodes: { ...formData.agentCodes, mtnAgentCode: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="vodafoneAgentCode">Vodafone Agent Code</Label>
                  <Input
                    id="vodafoneAgentCode"
                    value={formData.agentCodes.vodafoneAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentCodes: { ...formData.agentCodes, vodafoneAgentCode: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="airtelTigoAgentCode">AirtelTigo Agent Code</Label>
                  <Input
                    id="airtelTigoAgentCode"
                    value={formData.agentCodes.airtelTigoAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentCodes: {
                          ...formData.agentCodes,
                          airtelTigoAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="telecelAgentCode">Telecel Agent Code</Label>
                  <Input
                    id="telecelAgentCode"
                    value={formData.agentCodes.telecelAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentCodes: { ...formData.agentCodes, telecelAgentCode: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Bank Agent Codes</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="ecobankAgentCode">Ecobank Agent Code</Label>
                  <Input
                    id="ecobankAgentCode"
                    value={formData.bankAgentCodes.ecobankAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          ecobankAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fidelityAgentCode">Fidelity Agent Code</Label>
                  <Input
                    id="fidelityAgentCode"
                    value={formData.bankAgentCodes.fidelityAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          fidelityAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="firstBankAgentCode">First Bank Agent Code</Label>
                  <Input
                    id="firstBankAgentCode"
                    value={formData.bankAgentCodes.firstBankAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          firstBankAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="gcbAgentCode">GCB Agent Code</Label>
                  <Input
                    id="gcbAgentCode"
                    value={formData.bankAgentCodes.gcbAgentCode}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        bankAgentCodes: {
                          ...formData.bankAgentCodes,
                          gcbAgentCode: e.target.value,
                        },
                      })
                    }
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => window.location.reload()}>
                Cancel
              </Button>
              <Button type="submit" disabled={loading}>
                {loading ? "Registering..." : "Register Business"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>All Businesses</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business Name</TableHead>
                <TableHead>Abbreviation</TableHead>
                <TableHead>Owner</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {businesses.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center">
                    No businesses registered
                  </TableCell>
                </TableRow>
              ) : (
                businesses.map((business) => (
                  <TableRow key={business.id}>
                    <TableCell className="font-medium">{business.businessName}</TableCell>
                    <TableCell>{business.businessAbbreviation}</TableCell>
                    <TableCell>{business.ownerName}</TableCell>
                    <TableCell>{business.ownerPhone}</TableCell>
                    <TableCell>
                      <Badge
                        variant={
                          business.status === "active"
                            ? "default"
                            : business.status === "suspended"
                            ? "destructive"
                            : "secondary"
                        }
                      >
                        {business.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

