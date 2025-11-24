import React from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
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
} from "lucide-react";
import { Button } from "../ui/button";
import { cn } from "../../utils/cn";

const menuItems = {
  it_admin: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Building2, label: "Businesses", path: "/businesses" },
    { icon: Users, label: "Users", path: "/users" },
    { icon: MapPin, label: "Branches", path: "/branches" },
    { icon: Activity, label: "Activity Logs", path: "/activity-logs" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
  ],
  admin: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Users, label: "Users", path: "/users" },
    { icon: MapPin, label: "Branches", path: "/branches" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
  ],
  branch_manager: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Users, label: "Users", path: "/users" },
    { icon: MapPin, label: "Branches", path: "/branches" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
  ],
  agent_user: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
  ],
  normal_user: [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" },
    { icon: Receipt, label: "Transactions", path: "/transactions" },
    { icon: DollarSign, label: "Float", path: "/float" },
    { icon: FileCheck, label: "Reconciliation", path: "/reconciliation" },
    { icon: BarChart3, label: "Reports", path: "/reports" },
  ],
};

export default function Sidebar({ isOpen, setIsOpen }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { userData, logout } = useAuth();

  const role = userData?.role || "normal_user";
  const items = menuItems[role] || menuItems.normal_user;

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed top-0 left-0 z-50 h-full w-64 bg-card border-r transition-transform duration-300 lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-xl font-bold">MoMo Agency</h2>
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.path;
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2 rounded-md transition-colors",
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                  onClick={() => setIsOpen(false)}
                >
                  <Icon className="h-5 w-5" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="p-4 border-t">
            <div className="mb-2 px-3 py-2 text-sm">
              <p className="font-medium">{userData?.name}</p>
              <p className="text-muted-foreground text-xs">{userData?.email}</p>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start"
              onClick={handleLogout}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Logout
            </Button>
          </div>
        </div>
      </aside>
    </>
  );
}

