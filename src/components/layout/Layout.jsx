import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Sidebar from "./Sidebar";
import { Button } from "../ui/button";
import { Menu } from "lucide-react";

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex h-screen bg-background">
      <Sidebar isOpen={sidebarOpen} setIsOpen={setSidebarOpen} />
      <div className="flex-1 flex flex-col min-w-0 lg:ml-64">
        <header className="h-14 lg:h-16 border-b border-border bg-card/80 backdrop-blur-sm flex items-center px-4 lg:px-6 shrink-0 shadow-sm">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden rounded-lg h-10 w-10"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="flex-1" />
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6 bg-background">
          <div className="page-container">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
