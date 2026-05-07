import React, { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { agentBusinessService, businessScreenAccessService } from "../../services/firestoreService";
import {
  LayoutDashboard,
  Building2,
  Users,
  MapPin,
  DollarSign,
  FileCheck,
  Receipt,
  BarChart3,
  Activity,
  LogOut,
  X,
  Wallet,
  Percent,
  Settings,
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../utils/cn";

const menuItems = {
  it_admin: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Building2, label: "Businesses", path: "/businesses" },
    { icon: Users, label: "Users", path: "/users" },
    { icon: MapPin, label: "Branches", path: "/branches" },
    { icon: Percent, label: "Commission Settings", path: "/commission-settings" },
    { icon: Activity, label: "Activity Logs", path: "/activity-logs" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: Wallet, label: "Disbursement", path: "/disbursement" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Building2, label: "Business", path: "/businesses" },
    { icon: Users, label: "Users", path: "/users" },
    { icon: MapPin, label: "Branches", path: "/branches" },
    { icon: Percent, label: "Commission Settings", path: "/commission-settings" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: Wallet, label: "Disbursement", path: "/disbursement" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ],
  branch_manager: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Users, label: "Users", path: "/users" },
    { icon: MapPin, label: "Branches", path: "/branches" },
    { icon: Percent, label: "Commission Settings", path: "/commission-settings" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: FileCheck, label: "Recon Approvals", path: "/reconciliation-approvals" },
    { icon: Wallet, label: "Disbursement", path: "/disbursement" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ],
  agent_user: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ],
  normal_user: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
    { icon: Settings, label: "Settings", path: "/settings" },
  ],
};

function pathToScreenId(path) {
  return path.replace(/^\//, "") || "dashboard";
}

export default function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userData, logout, selectedBusinessId } = useAuth();
  const [business, setBusiness] = useState(null);
  const [businessAllowedScreens, setBusinessAllowedScreens] = useState(null);

  const effectiveBusinessId = selectedBusinessId || userData?.businessId;

  useEffect(() => {
    if (effectiveBusinessId) {
      agentBusinessService.getById(effectiveBusinessId).then(setBusiness).catch(() => setBusiness(null));
    } else {
      setBusiness(null);
    }
  }, [effectiveBusinessId]);

  useEffect(() => {
    const role = userData?.role || "normal_user";
    const bid = selectedBusinessId || userData?.businessId;
    if (role === "it_admin" || !bid) {
      setBusinessAllowedScreens(null);
      return;
    }
    businessScreenAccessService.get(bid).then((screens) => setBusinessAllowedScreens(screens || [])).catch(() => setBusinessAllowedScreens(null));
  }, [userData?.role, selectedBusinessId, userData?.businessId]);

  const role = userData?.role || "normal_user";
  let items = menuItems[role] || menuItems.normal_user;
  if (businessAllowedScreens && businessAllowedScreens.length > 0) {
    items = items.filter(
      (item) => businessAllowedScreens.includes(pathToScreenId(item.path)) || item.path === "/settings"
    );
  }
  const displayName = business?.businessName || "momo-agency system";

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden transition-opacity"
          onClick={() => setIsOpen(false)}
          aria-hidden="true"
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 flex flex-col bg-background border-r border-border shadow-xl transition-transform duration-300 ease-out lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-border min-h-[4.5rem]">
            <div className="flex-1 min-w-0 flex items-center">
              <Link to="/dashboard" className="flex items-center gap-3 min-w-0">
                <div className="h-14 w-14 rounded-full bg-muted flex items-center justify-center overflow-hidden ring-2 ring-primary/10">
                  {business?.logoUrl ? (
                    <img src={business.logoUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <img src="/logo1.jpg" alt="" className="h-full w-full object-cover" />
                  )}
                </div>
                <span className="hidden sm:flex flex-col min-w-0">
                  <span className="text-base font-semibold text-foreground leading-tight">MAS</span>
                  <span className="text-xs text-muted-foreground truncate leading-tight">momo-agency system</span>
                </span>
              </Link>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden shrink-0 text-muted-foreground hover:text-foreground hover:bg-accent h-9 w-9 rounded-lg"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className={cn("h-5 w-5 shrink-0", isActive ? "text-primary-foreground" : "text-muted-foreground")} />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-3 border-t border-border">
            <div className="mb-2 px-3 py-2.5 rounded-lg bg-muted/80">
              <p className="font-medium text-sm text-foreground truncate">{userData?.name}</p>
              <p className="text-xs text-muted-foreground truncate">{userData?.email}</p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start gap-2 text-muted-foreground hover:bg-accent hover:text-foreground rounded-lg h-10 font-medium"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Logout
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}
