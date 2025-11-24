import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import PasswordChangeModal from "../components/PasswordChangeModal";
import BusinessSelectionModal from "../components/BusinessSelectionModal";
import BranchSelectionModal from "../components/BranchSelectionModal";
import PrivacyPolicyModal from "../components/PrivacyPolicyModal";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const { login, setSession, userData } = useAuth();
  const navigate = useNavigate();
  
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [showBusinessSelection, setShowBusinessSelection] = useState(false);
  const [showBranchSelection, setShowBranchSelection] = useState(false);
  const [selectedBusinessId, setSelectedBusinessId] = useState(null);
  const [pendingRoleFlow, setPendingRoleFlow] = useState(null);
  const [showPrivacyPolicy, setShowPrivacyPolicy] = useState(false);

  useEffect(() => {
    if (pendingRoleFlow && userData) {
      handleRoleBasedFlow();
      setPendingRoleFlow(null);
    }
  }, [userData, pendingRoleFlow]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const result = await login(email, password);
      
      if (result.requiresPasswordChange) {
        setShowPasswordChange(true);
        setLoading(false);
        return;
      }

      setPendingRoleFlow(true);
    } catch (err) {
      setError(err.message || "Failed to login");
      setLoading(false);
    }
  };

  const handleRoleBasedFlow = () => {
    if (!userData) {
      setError("User data not loaded");
      setLoading(false);
      return;
    }

    const role = userData.role;

    if (role === "agent_user" || role === "normal_user") {
      if (userData.businessId && userData.branchId) {
        setSession(userData.businessId, userData.branchId);
        navigate("/dashboard");
      } else {
        setError("User is not assigned to a business and branch");
      }
      setLoading(false);
    } else if (role === "branch_manager" || role === "admin") {
      if (userData.businessId) {
        setSelectedBusinessId(userData.businessId);
        setShowBranchSelection(true);
      } else {
        setError("Admin user is not assigned to a business");
      }
      setLoading(false);
    } else if (role === "it_admin") {
      setShowBusinessSelection(true);
      setLoading(false);
    } else {
      setError("Unknown user role");
      setLoading(false);
    }
  };

  const handlePasswordChanged = () => {
    setShowPasswordChange(false);
    setPendingRoleFlow(true);
  };

  const handleBusinessSelected = (businessId) => {
    setSelectedBusinessId(businessId);
    setShowBusinessSelection(false);
    setShowBranchSelection(true);
  };

  const handleBranchSelected = (branchId) => {
    setSession(selectedBusinessId, branchId);
    setShowBranchSelection(false);
    navigate("/dashboard");
  };

  return (
    <>
      <div className="min-h-screen flex flex-col">
        <div className="flex flex-1">
          {/* Left side - Image */}
          <div className="hidden lg:flex lg:w-1/2 bg-cover bg-center" style={{ backgroundImage: "url('/bac.jpg')" }}>
            <div className="w-full h-full bg-black bg-opacity-30 flex items-center justify-center">
              <div className="text-white text-center px-8">
                <h1 className="text-4xl font-bold mb-4">Welcome Back</h1>
                <p className="text-xl">MoMo Agency Management System</p>
              </div>
            </div>
          </div>

          {/* Right side - Login Card */}
          <div className="w-full lg:w-1/2 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
            <Card className="w-full max-w-md">
              <CardHeader className="space-y-1">
                <CardTitle className="text-2xl font-bold text-center">MoMo Agency System</CardTitle>
                <CardDescription className="text-center">
                  Sign in to your account
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSubmit} className="space-y-4">
                  {error && (
                    <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
                      {error}
                    </div>
                  )}
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="name@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? "Signing in..." : "Sign In"}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Footer */}
        <footer className="bg-white border-t border-gray-200 py-6 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
              <div className="text-sm text-muted-foreground text-center md:text-left">
                <p className="font-semibold text-foreground mb-1">MoMo Agency Management System</p>
                <p>© {new Date().getFullYear()} All rights reserved.</p>
              </div>
              
              <div className="flex flex-wrap items-center gap-4 justify-center">
                <Link
                  to="/about"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  About Us
                </Link>
                <Link
                  to="/contact"
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Contact
                </Link>
                <button
                  onClick={() => setShowPrivacyPolicy(true)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Privacy Policy
                </button>
                <span className="text-sm text-muted-foreground">|</span>
                <span className="text-sm text-muted-foreground">
                  Version 1.0.0
                </span>
              </div>
            </div>
            
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="text-xs text-muted-foreground text-center space-y-1">
                <p>Secure • Reliable • Efficient</p>
                <p>For support, contact: support@momoagency.com | +233 XX XXX XXXX</p>
              </div>
            </div>
          </div>
        </footer>
      </div>

      {showPasswordChange && (
        <PasswordChangeModal onPasswordChanged={handlePasswordChanged} />
      )}

      {showBusinessSelection && (
        <BusinessSelectionModal
          onSelect={handleBusinessSelected}
          onCancel={() => {
            setShowBusinessSelection(false);
            setError("Business selection cancelled");
          }}
        />
      )}

      {showBranchSelection && (
        <BranchSelectionModal
          businessId={selectedBusinessId}
          onSelect={handleBranchSelected}
          onCancel={() => {
            setShowBranchSelection(false);
            if (userData?.role === "it_admin") {
              setShowBusinessSelection(true);
            }
          }}
          canAddNew={userData?.role === "it_admin" || userData?.role === "branch_manager"}
          onAddNew={() => {
            setShowBranchSelection(false);
            navigate("/branches");
          }}
        />
      )}

      {showPrivacyPolicy && (
        <PrivacyPolicyModal onClose={() => setShowPrivacyPolicy(false)} />
      )}
    </>
  );
}
