import React, { useState, useEffect } from "react";
import { useAuth } from "../context/AuthContext";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../components/ui/tabs";
import {
  agentBusinessService,
  branchService,
  userService,
  systemSettingsService,
  businessScreenAccessService,
  userScreenAccessService,
  supportTicketService,
  contactMessageService,
  reportBugService,
} from "../services/firestoreService";
import {
  Moon,
  Sun,
  FileText,
  HelpCircle,
  Mail,
  MessageSquare,
  Bug,
  Lock,
  Users,
  Building2,
  ChevronDown,
  Send,
} from "lucide-react";
import PasswordChangeModal from "../components/PasswordChangeModal";
import { SCREEN_OPTIONS } from "../constants/screens";

const THEME_KEY = "momo_theme";
function getStoredTheme() {
  return localStorage.getItem(THEME_KEY) || "light";
}
function setStoredTheme(theme) {
  localStorage.setItem(THEME_KEY, theme);
  document.documentElement.classList.toggle("dark", theme === "dark");
}

export default function Settings() {
  const { userData } = useAuth();
  const role = userData?.role || "normal_user";
  const isITAdmin = role === "it_admin";
  const isAdminOrBM = role === "admin" || role === "branch_manager";

  const [activeTab, setActiveTab] = useState("general");
  const [systemSettings, setSystemSettings] = useState({});
  const [theme, setTheme] = useState(getStoredTheme);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [businesses, setBusinesses] = useState([]);
  const [branches, setBranches] = useState([]);
  const [branchUsers, setBranchUsers] = useState([]);
  const [selectedBusinessId, setSelectedBusinessId] = useState("");
  const [selectedBranchId, setSelectedBranchId] = useState("");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [businessScreens, setBusinessScreens] = useState([]);
  const [userScreens, setUserScreens] = useState([]);

  const [privacyContent, setPrivacyContent] = useState("");
  const [termsContent, setTermsContent] = useState("");
  const [faqContent, setFaqContent] = useState("");
  const [itAdminEmail, setItAdminEmail] = useState("");
  const [savingContent, setSavingContent] = useState(false);

  const [tickets, setTickets] = useState([]);
  const [contactMessages, setContactMessages] = useState([]);
  const [reportBugs, setReportBugs] = useState([]);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [contactMessage, setContactMessage] = useState("");
  const [reportBugMessage, setReportBugMessage] = useState("");
  const [responseText, setResponseText] = useState("");
  const [respondingToId, setRespondingToId] = useState(null);
  const [respondingType, setRespondingType] = useState(null);
  const [contactSupportOpen, setContactSupportOpen] = useState(false);
  const [contactVia, setContactVia] = useState("in_app");

  useEffect(() => {
    document.documentElement.classList.toggle("dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    systemSettingsService.get().then((s) => {
      setSystemSettings(s || {});
      setPrivacyContent(s?.privacyPolicy ?? "");
      setTermsContent(s?.termsAndConditions ?? "");
      setItAdminEmail(s?.itAdminEmail ?? "");
    });
  }, []);

  useEffect(() => {
    if (isITAdmin) agentBusinessService.getAll().then(setBusinesses).catch(() => setBusinesses([]));
  }, [isITAdmin]);

  const businessIdForBranches = isITAdmin ? selectedBusinessId : userData?.businessId || selectedBusinessId;

  useEffect(() => {
    if (!businessIdForBranches) {
      setBranches([]);
      if (!isITAdmin) setSelectedBranchId("");
      return;
    }
    branchService.getByBusinessId(businessIdForBranches).then(setBranches).catch(() => setBranches([]));
  }, [businessIdForBranches, isITAdmin]);

  useEffect(() => {
    if (isAdminOrBM && userData?.branchId && branches.length > 0 && !selectedBranchId) {
      setSelectedBranchId(userData.branchId);
    }
  }, [isAdminOrBM, userData?.branchId, branches.length, selectedBranchId]);

  useEffect(() => {
    if (isITAdmin && selectedBusinessId) businessScreenAccessService.get(selectedBusinessId).then(setBusinessScreens);
  }, [isITAdmin, selectedBusinessId]);

  useEffect(() => {
    if (!selectedBranchId) {
      setBranchUsers([]);
      setSelectedUserId("");
      return;
    }
    userService.getAll(null, selectedBranchId).then(setBranchUsers).catch(() => setBranchUsers([]));
  }, [selectedBranchId]);

  useEffect(() => {
    if ((isAdminOrBM || isITAdmin) && selectedUserId && selectedBranchId) {
      userScreenAccessService.get(selectedUserId, selectedBranchId).then((s) => setUserScreens(s ?? []));
    }
  }, [isAdminOrBM, isITAdmin, selectedUserId, selectedBranchId]);

  useEffect(() => {
    if (isITAdmin) {
      supportTicketService.getAllForAdmin().then(setTickets);
      contactMessageService.getAllForAdmin().then(setContactMessages);
      reportBugService.getAllForAdmin().then(setReportBugs);
    }
  }, [isITAdmin]);

  const loadMyTickets = () => {
    if (userData?.userId) supportTicketService.getByUser(userData.userId).then(setTickets);
  };
  useEffect(() => {
    if (!isITAdmin && userData?.userId) loadMyTickets();
  }, [userData?.userId, isITAdmin]);

  const handleSaveContent = async () => {
    setSavingContent(true);
    try {
      await systemSettingsService.update({
        privacyPolicy: privacyContent,
        termsAndConditions: termsContent,
        itAdminEmail: itAdminEmail.trim() || undefined,
      });
      setSystemSettings((s) => ({ ...s, privacyPolicy: privacyContent, termsAndConditions: termsContent, itAdminEmail: itAdminEmail.trim() }));
    } finally {
      setSavingContent(false);
    }
  };

  const handlePublishFaqItem = async () => {
    const text = faqContent.trim();
    if (!text) return;
    setSavingContent(true);
    try {
      const nextItems = [...(systemSettings.faqItems || []), text];
      await systemSettingsService.update({ faqItems: nextItems });
      setSystemSettings((s) => ({ ...s, faqItems: nextItems }));
      setFaqContent("");
    } finally {
      setSavingContent(false);
    }
  };

  const handleBusinessScreensSave = async () => {
    if (!selectedBusinessId) return;
    await businessScreenAccessService.set(selectedBusinessId, businessScreens);
  };

  const handleUserScreensSave = async () => {
    if (!selectedUserId || !selectedBranchId) return;
    await userScreenAccessService.set(selectedUserId, selectedBranchId, userScreens);
  };

  const toggleScreen = (screenId, isBusiness) => {
    if (isBusiness) setBusinessScreens((prev) => (prev.includes(screenId) ? prev.filter((s) => s !== screenId) : [...prev, screenId]));
    else setUserScreens((prev) => (prev.includes(screenId) ? prev.filter((s) => s !== screenId) : [...prev, screenId]));
  };

  const handleSubmitTicket = async (e) => {
    e.preventDefault();
    if (!ticketSubject.trim() || !ticketMessage.trim()) return;
    await supportTicketService.create({
      fromUserId: userData?.userId,
      fromEmail: userData?.email,
      fromName: userData?.name,
      subject: ticketSubject.trim(),
      message: ticketMessage.trim(),
      type: "ticket",
    });
    setTicketSubject("");
    setTicketMessage("");
    loadMyTickets();
  };

  const handleContactSupport = async (e) => {
    e.preventDefault();
    if (contactVia === "mail" && itAdminEmail) {
      window.location.href = `mailto:${itAdminEmail}`;
      setContactSupportOpen(false);
      return;
    }
    if (!contactMessage.trim()) return;
    await contactMessageService.create({
      fromUserId: userData?.userId,
      fromEmail: userData?.email,
      fromName: userData?.name,
      message: contactMessage.trim(),
    });
    setContactMessage("");
    setContactSupportOpen(false);
  };

  const handleReportBug = async (e) => {
    e.preventDefault();
    if (!reportBugMessage.trim()) return;
    await reportBugService.create({
      fromUserId: userData?.userId,
      fromEmail: userData?.email,
      fromName: userData?.name,
      message: reportBugMessage.trim(),
    });
    setReportBugMessage("");
  };

  const handleRespond = async () => {
    if (!respondingToId || !responseText.trim()) return;
    try {
      if (respondingType === "ticket") await supportTicketService.respond(respondingToId, responseText.trim(), userData?.name || userData?.email);
      if (respondingType === "contact") await contactMessageService.respond(respondingToId, responseText.trim(), userData?.name || userData?.email);
      if (respondingType === "bug") await reportBugService.respond(respondingToId, responseText.trim(), userData?.name || userData?.email);
      setRespondingToId(null);
      setResponseText("");
      supportTicketService.getAllForAdmin().then(setTickets);
      contactMessageService.getAllForAdmin().then(setContactMessages);
      reportBugService.getAllForAdmin().then(setReportBugs);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your account and system preferences</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="inline-flex h-12 w-full max-w-lg rounded-full border border-border bg-muted/70 p-1.5 gap-1 grid grid-cols-2 lg:grid-cols-4">
          <TabsTrigger
            value="general"
            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary/20 data-[state=active]:ring-offset-2 data-[state=active]:ring-offset-background"
          >
            General
          </TabsTrigger>
          {(isITAdmin || isAdminOrBM) && (
            <TabsTrigger
              value="access"
              className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary/20 data-[state=active]:ring-offset-2 data-[state=active]:ring-offset-background"
            >
              Screen Access
            </TabsTrigger>
          )}
          {isITAdmin && (
            <TabsTrigger
              value="content"
              className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary/20 data-[state=active]:ring-offset-2 data-[state=active]:ring-offset-background"
            >
              Content & Support
            </TabsTrigger>
          )}
          <TabsTrigger
            value="support"
            className="rounded-full px-4 py-2 text-sm font-medium transition-all data-[state=inactive]:text-muted-foreground data-[state=inactive]:hover:text-foreground data-[state=inactive]:hover:bg-muted data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-md data-[state=active]:ring-2 data-[state=active]:ring-primary/20 data-[state=active]:ring-offset-2 data-[state=active]:ring-offset-background"
          >
            Support & FAQ
          </TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-4 mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Moon className="h-5 w-5" />
                Dark / Light Mode
              </CardTitle>
              <CardDescription>Choose your preferred theme</CardDescription>
            </CardHeader>
            <CardContent className="flex gap-2">
              <Button variant={theme === "light" ? "default" : "outline"} size="sm" onClick={() => { setTheme("light"); setStoredTheme("light"); window.dispatchEvent(new CustomEvent("momo-theme-change", { detail: "light" })); }}>
                <Sun className="h-4 w-4 mr-1" /> Light
              </Button>
              <Button variant={theme === "dark" ? "default" : "outline"} size="sm" onClick={() => { setTheme("dark"); setStoredTheme("dark"); window.dispatchEvent(new CustomEvent("momo-theme-change", { detail: "dark" })); }}>
                <Moon className="h-4 w-4 mr-1" /> Dark
              </Button>
            </CardContent>
          </Card>

          {!isITAdmin && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="h-5 w-5" />
                  Change Password
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Button onClick={() => setShowPasswordModal(true)}>Change Password</Button>
              </CardContent>
            </Card>
          )}

          {!isITAdmin && (
            <Card>
              <CardHeader>
                <CardTitle>Privacy Policy & Terms</CardTitle>
                <CardDescription>View the latest privacy policy and terms</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto rounded border p-3">{systemSettings?.privacyPolicy || "No content set."}</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto rounded border p-3">{systemSettings?.termsAndConditions || "No content set."}</div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {(isITAdmin || isAdminOrBM) && (
          <TabsContent value="access" className="space-y-4 mt-4">
            {isITAdmin && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5" />
                    Business Screen Access (subscription)
                  </CardTitle>
                  <CardDescription>Tick to grant access, untick to remove. Choose which screens this business can access.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label>Business</Label>
                    <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedBusinessId} onChange={(e) => setSelectedBusinessId(e.target.value)}>
                      <option value="">Select business</option>
                      {businesses.map((b) => <option key={b.businessId} value={b.businessId}>{b.businessName || b.businessId}</option>)}
                    </select>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {SCREEN_OPTIONS.map((opt) => (
                      <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                        <input type="checkbox" checked={businessScreens.includes(opt.id)} onChange={() => toggleScreen(opt.id, true)} />
                        <span className="text-sm">{opt.label}</span>
                      </label>
                    ))}
                  </div>
                  <Button onClick={handleBusinessScreensSave} disabled={!selectedBusinessId}>Save business access</Button>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  User Screen Access (branch)
                </CardTitle>
                <CardDescription>Tick to grant access, untick to remove. Set which screens each user can access in a branch.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {isITAdmin && (
                  <div>
                    <Label>Business</Label>
                    <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedBusinessId} onChange={(e) => setSelectedBusinessId(e.target.value)}>
                      <option value="">Select business</option>
                      {businesses.map((b) => <option key={b.businessId} value={b.businessId}>{b.businessName || b.businessId}</option>)}
                    </select>
                  </div>
                )}
                <div>
                  <Label>Branch</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedBranchId} onChange={(e) => setSelectedBranchId(e.target.value)}>
                    <option value="">Select branch</option>
                    {branches.map((b) => <option key={b.branchId} value={b.branchId}>{b.branchName || b.branchCode}</option>)}
                  </select>
                </div>
                <div>
                  <Label>User</Label>
                  <select className="w-full mt-1 rounded-md border border-input bg-background px-3 py-2 text-sm" value={selectedUserId} onChange={(e) => setSelectedUserId(e.target.value)}>
                    <option value="">Select user</option>
                    {branchUsers.map((u) => <option key={u.userId || u.id} value={u.userId || u.id}>{u.name || u.email}</option>)}
                  </select>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SCREEN_OPTIONS.map((opt) => (
                    <label key={opt.id} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={userScreens.includes(opt.id)} onChange={() => toggleScreen(opt.id, false)} />
                      <span className="text-sm">{opt.label}</span>
                    </label>
                  ))}
                </div>
                <Button onClick={handleUserScreensSave} disabled={!selectedUserId || !selectedBranchId}>Save user access</Button>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        {isITAdmin && (
          <TabsContent value="content" className="space-y-4 mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Privacy Policy & Terms (publish to login screen)
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Privacy Policy</Label>
                  <textarea className="w-full mt-1 min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={privacyContent} onChange={(e) => setPrivacyContent(e.target.value)} placeholder="Privacy policy content" />
                </div>
                <div>
                  <Label>Terms & Conditions</Label>
                  <textarea className="w-full mt-1 min-h-[120px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={termsContent} onChange={(e) => setTermsContent(e.target.value)} placeholder="Terms content" />
                </div>
                <Button onClick={handleSaveContent} disabled={savingContent}>Publish</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <HelpCircle className="h-5 w-5" />
                  FAQ (updates for all users)
                </CardTitle>
                <CardDescription>Add one FAQ at a time. Publish adds it as a new card on Support &amp; FAQ and clears the box for the next.</CardDescription>
              </CardHeader>
              <CardContent>
                <textarea className="w-full min-h-[100px] rounded-md border border-input bg-background px-3 py-2 text-sm" value={faqContent} onChange={(e) => setFaqContent(e.target.value)} placeholder="e.g. Login with email and password" />
                <Button className="mt-2" onClick={handlePublishFaqItem} disabled={savingContent || !faqContent.trim()}>Publish FAQ</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  IT Admin contact email
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Input type="email" value={itAdminEmail} onChange={(e) => setItAdminEmail(e.target.value)} placeholder="admin@example.com" />
                <Button className="mt-2" onClick={handleSaveContent} disabled={savingContent}>Save</Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageSquare className="h-5 w-5" />
                  Contact Support messages
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {contactMessages.length === 0 && <p className="text-sm text-muted-foreground">No messages</p>}
                  {contactMessages.map((m) => (
                    <div key={m.id} className="border rounded p-2 text-sm">
                      <p><strong>{m.fromName || m.fromEmail}</strong> — {m.createdAt?.toDate?.()?.toLocaleString?.()}</p>
                      <p className="text-muted-foreground">{m.message}</p>
                      {m.response ? <p className="mt-1 text-green-700">Reply: {m.response}</p> : respondingToId === m.id && respondingType === "contact" ? (
                        <div className="mt-2 flex gap-2">
                          <input className="flex-1 rounded border px-2 py-1 text-sm" value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Your response" />
                          <Button size="sm" onClick={handleRespond}>Send</Button>
                        </div>
                      ) : <Button size="sm" className="mt-1" onClick={() => { setRespondingToId(m.id); setRespondingType("contact"); setResponseText(""); }}>Respond</Button>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Submit Ticket messages</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {tickets.length === 0 && <p className="text-sm text-muted-foreground">No tickets</p>}
                  {tickets.map((t) => (
                    <div key={t.id} className="border rounded p-2 text-sm">
                      <p><strong>{t.fromName || t.fromEmail}</strong> — {t.subject} — {t.createdAt?.toDate?.()?.toLocaleString?.()}</p>
                      <p className="text-muted-foreground">{t.message}</p>
                      {t.response ? <p className="mt-1 text-green-700">Reply: {t.response}</p> : respondingToId === t.id && respondingType === "ticket" ? (
                        <div className="mt-2 flex gap-2">
                          <input className="flex-1 rounded border px-2 py-1 text-sm" value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Your response" />
                          <Button size="sm" onClick={handleRespond}>Send</Button>
                        </div>
                      ) : <Button size="sm" className="mt-1" onClick={() => { setRespondingToId(t.id); setRespondingType("ticket"); setResponseText(""); }}>Respond</Button>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  Report Bug / in-app support
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {reportBugs.length === 0 && <p className="text-sm text-muted-foreground">No reports</p>}
                  {reportBugs.map((r) => (
                    <div key={r.id} className="border rounded p-2 text-sm">
                      <p><strong>{r.fromName || r.fromEmail}</strong> — {r.createdAt?.toDate?.()?.toLocaleString?.()}</p>
                      <p className="text-muted-foreground">{r.message}</p>
                      {r.response ? <p className="mt-1 text-green-700">Reply: {r.response}</p> : respondingToId === r.id && respondingType === "bug" ? (
                        <div className="mt-2 flex gap-2">
                          <input className="flex-1 rounded border px-2 py-1 text-sm" value={responseText} onChange={(e) => setResponseText(e.target.value)} placeholder="Your response" />
                          <Button size="sm" onClick={handleRespond}>Send</Button>
                        </div>
                      ) : <Button size="sm" className="mt-1" onClick={() => { setRespondingToId(r.id); setRespondingType("bug"); setResponseText(""); }}>Respond</Button>}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        )}

        <TabsContent value="support" className="space-y-4 mt-4">
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Support</h3>
            {isITAdmin ? (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <MessageSquare className="h-5 w-5" />
                    Support inbox
                  </CardTitle>
                  <CardDescription>View and respond to Contact Support, Submit Ticket, and Report Bug messages.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button onClick={() => setActiveTab("content")}>Open Content & Support</Button>
                </CardContent>
              </Card>
            ) : (
              <>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Mail className="h-5 w-5" />
                      Contact Support
                    </CardTitle>
                    <CardDescription>In-app message or email to IT Admin</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {!contactSupportOpen ? (
                      <Button onClick={() => setContactSupportOpen(true)} className="flex items-center gap-2">
                        <ChevronDown className="h-4 w-4" />
                        Contact Support
                      </Button>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <Button variant={contactVia === "in_app" ? "default" : "outline"} size="sm" onClick={() => setContactVia("in_app")}>In-app</Button>
                          <Button variant={contactVia === "mail" ? "default" : "outline"} size="sm" onClick={() => setContactVia("mail")}>Email</Button>
                        </div>
                        {contactVia === "in_app" && (
                          <form onSubmit={handleContactSupport}>
                            <Label>Message</Label>
                            <textarea className="w-full mt-1 min-h-[80px] rounded-md border px-3 py-2 text-sm" value={contactMessage} onChange={(e) => setContactMessage(e.target.value)} required />
                            <div className="flex gap-2 mt-2">
                              <Button type="submit">Send</Button>
                              <Button type="button" variant="outline" onClick={() => setContactSupportOpen(false)}>Cancel</Button>
                            </div>
                          </form>
                        )}
                        {contactVia === "mail" && <Button onClick={handleContactSupport}>Open Gmail</Button>}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5" />
                      Submit Ticket
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <form onSubmit={handleSubmitTicket} className="space-y-2">
                      <Label>Subject</Label>
                      <Input value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} placeholder="Subject" required />
                      <Label>Message</Label>
                      <textarea className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm" value={ticketMessage} onChange={(e) => setTicketMessage(e.target.value)} required />
                      <Button type="submit">Submit Ticket</Button>
                    </form>
                    <div className="mt-4 space-y-2">
                      <p className="font-medium">Your tickets</p>
                      {tickets.filter((t) => t.fromUserId === userData?.userId).length === 0 && <p className="text-sm text-muted-foreground">No tickets yet</p>}
                      {tickets.filter((t) => t.fromUserId === userData?.userId).map((t) => (
                        <div key={t.id} className="border rounded p-2 text-sm">
                          <p><strong>{t.subject}</strong> — {t.createdAt?.toDate?.()?.toLocaleString?.()}</p>
                          <p className="text-muted-foreground">{t.message}</p>
                          {t.response && <p className="text-green-700 mt-1">Response: {t.response}</p>}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Bug className="h-5 w-5" />
                      Report Bug
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <form onSubmit={handleReportBug} className="space-y-2">
                      <Label>Describe the issue</Label>
                      <textarea className="w-full min-h-[80px] rounded-md border px-3 py-2 text-sm" value={reportBugMessage} onChange={(e) => setReportBugMessage(e.target.value)} required />
                      <Button type="submit">Submit</Button>
                    </form>
                  </CardContent>
                </Card>
              </>
            )}
          </div>

          <div className="space-y-4">
            <h3 className="text-lg font-semibold">FAQ</h3>
            {(() => {
              const items = systemSettings?.faqItems || [];
              const legacyFaq = systemSettings?.faq?.trim();
              const legacyBlocks = legacyFaq ? legacyFaq.split(/\n\n+/).filter((b) => b.trim()) : [];
              const displayItems = items.length > 0 ? items : legacyBlocks;
              if (displayItems.length === 0) {
                return (
                  <Card>
                    <CardContent className="pt-6">
                      <p className="text-sm text-muted-foreground">No FAQ content yet.</p>
                    </CardContent>
                  </Card>
                );
              }
              return displayItems.map((block, i) => (
                <Card key={i}>
                  <CardContent className="pt-6">
                    <div className="text-sm text-muted-foreground whitespace-pre-wrap">{typeof block === "string" ? block : String(block)}</div>
                  </CardContent>
                </Card>
              ));
            })()}
          </div>

        </TabsContent>
      </Tabs>

      {showPasswordModal && <PasswordChangeModal fromSettings onPasswordChanged={() => setShowPasswordModal(false)} />}
    </div>
  );
}
