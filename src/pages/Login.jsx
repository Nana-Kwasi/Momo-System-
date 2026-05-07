import React, { useState, useEffect, useRef } from "react";
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
import TermsModal from "../components/TermsModal";
import { systemSettingsService, otpService, otpDisableService, sendSMS, generateOTP } from "../services/firestoreService";

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
  const [showTerms, setShowTerms] = useState(false);
  const [loginContent, setLoginContent] = useState({ privacyPolicy: "", termsAndConditions: "" });

  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpCode, setOtpCode] = useState("");
  const [otpTimer, setOtpTimer] = useState(300);
  const [canResendOtp, setCanResendOtp] = useState(false);
  const [otpError, setOtpError] = useState("");
  const [userDataForLogin, setUserDataForLogin] = useState(null);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [showDisableOtpModal, setShowDisableOtpModal] = useState(false);
  const [disableOtpForm, setDisableOtpForm] = useState({ name: "", email: "", reason: "" });
  const [disableOtpMessage, setDisableOtpMessage] = useState("");
  const [isSubmittingDisableOtp, setIsSubmittingDisableOtp] = useState(false);
  const passwordRef = useRef(null);

  useEffect(() => {
    systemSettingsService.get().then((s) => {
      if (s) setLoginContent({ privacyPolicy: s.privacyPolicy ?? "", termsAndConditions: s.termsAndConditions ?? "" });
    });
  }, []);

  useEffect(() => {
    if (pendingRoleFlow && userData) {
      handleRoleBasedFlow();
      setPendingRoleFlow(null);
    }
  }, [userData, pendingRoleFlow]);

  useEffect(() => {
    if (!showOtpModal || otpTimer <= 0) return;
    const t = setInterval(() => setOtpTimer((s) => (s <= 0 ? 0 : s - 1)), 1000);
    return () => clearInterval(t);
  }, [showOtpModal, otpTimer]);

  useEffect(() => {
    if (otpTimer === 0) setCanResendOtp(true);
  }, [otpTimer]);

  const sendOTP = async (userData, userDocId, emailAddr) => {
    const phone = userData?.contact || userData?.telephone || userData?.phone || "";
    if (!phone.trim()) throw new Error("No phone on your account. Ask admin to add contact/telephone in User Management.");
    const otp = generateOTP();
    await otpService.saveOTP(emailAddr, otp, phone);
    await sendSMS(phone, `Your MoMo Agency login code is ${otp}. Valid for 5 minutes.`);
  };

  const verifyOTP = async () => {
    if (!userDataForLogin?.email || !otpCode.trim()) {
      setOtpError("Enter the 6-digit code");
      return;
    }
    setOtpError("");
    const docs = await otpService.getByEmail(userDataForLogin.email);
    const now = new Date();
    const match = docs.find(
      (d) =>
        d.otp === otpCode.trim() &&
        !d.used &&
        d.expiresAt?.toDate?.() &&
        now <= d.expiresAt.toDate()
    );
    if (!match) {
      const expired = docs.some(
        (d) => d.otp === otpCode.trim() && d.expiresAt?.toDate?.() && now > d.expiresAt.toDate()
      );
      setOtpError(expired ? "OTP expired" : "Invalid OTP");
      return;
    }
    await otpService.markUsed(match.id);
    setShowOtpModal(false);
    setOtpCode("");
    if (!passwordRef.current) return;
    const result = await login(userDataForLogin.email, passwordRef.current, { skipOtp: true });
    passwordRef.current = null;
    if (result?.requiresPasswordChange) {
      setShowPasswordChange(true);
      return;
    }
    setPendingRoleFlow(true);
  };

  const resendOTP = () => {
    if (!userDataForLogin || !canResendOtp) return;
    setCanResendOtp(false);
    setOtpTimer(300);
    setOtpError("");
    setIsSendingOtp(true);
    sendOTP(userDataForLogin.userData, userDataForLogin.userDocId, userDataForLogin.email)
      .then(() => setOtpError(""))
      .catch((err) => setOtpError(err.message || "Resend failed"))
      .finally(() => setIsSendingOtp(false));
  };

  const completeLoginWithoutOtp = async () => {
    if (!userDataForLogin?.email || !passwordRef.current) return;
    setShowOtpModal(false);
    setShowDisableOtpModal(false);
    try {
      const result = await login(userDataForLogin.email, passwordRef.current, { skipOtp: true });
      passwordRef.current = null;
      if (result?.requiresPasswordChange) {
        setShowPasswordChange(true);
        return;
      }
      setPendingRoleFlow(true);
    } catch (err) {
      setError(err.message || "Login failed. Try again.");
    }
  };

  const handleOtpDisableRequest = async () => {
    const { name, email: formEmail, reason } = disableOtpForm;
    if (!name.trim() || !formEmail.trim() || !reason.trim()) {
      setDisableOtpMessage("Please fill in all fields (name, email, reason).");
      return;
    }
    const emailNorm = formEmail.toLowerCase().trim();
    const loginEmail = (userDataForLogin?.email || "").toLowerCase().trim();
    if (emailNorm !== loginEmail) {
      setDisableOtpMessage("Email must match the account you are logging into.");
      return;
    }
    setIsSubmittingDisableOtp(true);
    setDisableOtpMessage("");
    try {
      await otpDisableService.add(emailNorm, reason.trim(), name.trim());
      setDisableOtpMessage("OTP disabled for 24 hours. Signing you in...");
      setTimeout(completeLoginWithoutOtp, 1500);
    } catch (err) {
      setDisableOtpMessage(err.message || "Failed to disable OTP. Try again.");
    } finally {
      setIsSubmittingDisableOtp(false);
    }
  };

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

      if (result.requiresOtp) {
        passwordRef.current = password;
        const payload = { userData: result.userData, userDocId: result.userDocId, email: result.email };
        setUserDataForLogin(payload);
        setLoading(false);
        setOtpTimer(300);
        setCanResendOtp(false);
        setOtpCode("");
        setShowOtpModal(true);
        setOtpError("");
        setIsSendingOtp(true);
        sendOTP(result.userData, result.userDocId, result.email)
          .then(() => setOtpError(""))
          .catch((err) => setOtpError(err.message || "Could not send SMS. Try Resend or check Settings → SMS Sender ID."))
          .finally(() => setIsSendingOtp(false));
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
      if (userData.businessId && userData.branchId) {
        setSession(userData.businessId, userData.branchId);
        navigate("/dashboard");
      } else if (userData.businessId) {
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
          <div className="w-full lg:w-1/2 flex items-center justify-center bg-gradient-to-br from-slate-50 via-blue-50/50 to-indigo-100/80 p-6">
            <Card className="w-full max-w-md shadow-xl border-2 rounded-2xl">
              <CardHeader className="space-y-2 pb-2">
                <CardTitle className="text-2xl font-bold text-center">MoMo Agency System</CardTitle>
                <CardDescription className="text-center">
                  Sign in to your account
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <form onSubmit={handleSubmit} className="space-y-5">
                  {error && (
                    <div className="p-3.5 text-sm font-medium text-red-700 bg-red-50 border border-red-200 rounded-lg">
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
                <button
                  onClick={() => setShowTerms(true)}
                  className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  Terms & Conditions
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
          canAddNew={userData?.role === "it_admin" || userData?.role === "branch_manager" || userData?.role === "admin"}
          onAddNew={() => {
            setShowBranchSelection(false);
            navigate("/branches", { state: { openAddBranch: true, businessId: selectedBusinessId } });
          }}
        />
      )}

      {showPrivacyPolicy && (
        <PrivacyPolicyModal content={loginContent.privacyPolicy} onClose={() => setShowPrivacyPolicy(false)} />
      )}
      {showTerms && (
        <TermsModal content={loginContent.termsAndConditions} onClose={() => setShowTerms(false)} />
      )}

      {showOtpModal && userDataForLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Enter verification code</CardTitle>
              <CardDescription>
                {isSendingOtp ? "Sending code..." : "We sent a 6-digit code to your phone."}
                {userDataForLogin?.userData && (() => {
                  const p = userDataForLogin.userData.contact || userDataForLogin.userData.telephone || userDataForLogin.userData.phone || "";
                  const last = p.replace(/\D/g, "").slice(-4);
                  return last ? ` (***${last})` : "";
                })()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {otpError && (
                <p className="text-sm text-red-600 break-words">{otpError}</p>
              )}
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  maxLength={6}
                  className="text-center text-lg tracking-widest"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {otpTimer > 0
                  ? `Resend in ${Math.floor(otpTimer / 60)}:${String(otpTimer % 60).padStart(2, "0")}`
                  : "You can resend the code."}
              </p>
              <div className="flex gap-2">
                <Button type="button" onClick={verifyOTP} className="flex-1" disabled={otpCode.length !== 6}>
                  Verify
                </Button>
                <Button type="button" variant="outline" onClick={resendOTP} disabled={!canResendOtp || isSendingOtp}>
                  {isSendingOtp ? "Sending..." : "Resend"}
                </Button>
              </div>
              {otpTimer <= 240 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="w-full text-muted-foreground text-sm"
                  onClick={() => {
                    setDisableOtpForm({
                      name: userDataForLogin?.userData?.name || "",
                      email: userDataForLogin?.email || "",
                      reason: "",
                    });
                    setDisableOtpMessage("");
                    setShowDisableOtpModal(true);
                  }}
                >
                  Not getting OTP? Disable OTP temporarily (24h)
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {showDisableOtpModal && userDataForLogin && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">Disable OTP temporarily</CardTitle>
              <CardDescription>OTP will be skipped for 24 hours. You can sign in with just email and password. Provide a reason below.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {disableOtpMessage && (
                <p className={`text-sm ${disableOtpMessage.includes("Signing") ? "text-green-600" : "text-red-600"}`}>{disableOtpMessage}</p>
              )}
              <div className="space-y-2">
                <Label>Your name</Label>
                <Input
                  placeholder="Full name"
                  value={disableOtpForm.name}
                  onChange={(e) => setDisableOtpForm((f) => ({ ...f, name: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={disableOtpForm.email}
                  onChange={(e) => setDisableOtpForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="Same as login email"
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={disableOtpForm.reason}
                  onChange={(e) => setDisableOtpForm((f) => ({ ...f, reason: e.target.value }))}
                >
                  <option value="">Select reason *</option>
                  <option value="SMS_NOT_RECEIVED">SMS not received</option>
                  <option value="PHONE_NOT_ACCESSIBLE">Phone not accessible</option>
                  <option value="LOW_CREDIT">SMS credit/network issue</option>
                  <option value="EMERGENCY_ACCESS">Emergency access needed</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>
              <div className="flex gap-2">
                <Button type="button" onClick={handleOtpDisableRequest} disabled={isSubmittingDisableOtp} className="flex-1">
                  {isSubmittingDisableOtp ? "Processing..." : "Submit & sign in"}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setShowDisableOtpModal(false); setDisableOtpMessage(""); }}>
                  Cancel
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

    </>
  );
}
