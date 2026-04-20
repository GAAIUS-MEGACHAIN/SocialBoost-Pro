import React from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, ShoppingCart, ListOrdered, Wallet, Receipt, Shield, Package, LogOut, User as UserIcon, Cog, Users as UsersIcon, Server, LifeBuoy, MessageSquare, Heart, RefreshCw, FileSpreadsheet, Key, Megaphone, TrendingUp,
} from "lucide-react";
import { money } from "../../lib/api";
import NotificationBell from "./NotificationBell";

const ClientNav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, testid: "nav-dashboard" },
  { to: "/services", label: "Services", icon: Package, testid: "nav-services" },
  { to: "/favorites", label: "Favorites", icon: Heart, testid: "nav-favorites" },
  { to: "/new-order", label: "New Order", icon: ShoppingCart, testid: "nav-new-order" },
  { to: "/bulk-upload", label: "Bulk Upload", icon: FileSpreadsheet, testid: "nav-bulk-upload" },
  { to: "/orders", label: "Orders", icon: ListOrdered, testid: "nav-orders" },
  { to: "/refills", label: "Refills", icon: RefreshCw, testid: "nav-refills" },
  { to: "/add-funds", label: "Add Funds", icon: Wallet, testid: "nav-add-funds" },
  { to: "/transactions", label: "Transactions", icon: Receipt, testid: "nav-transactions" },
  { to: "/profile", label: "Profile & API", icon: Key, testid: "nav-profile" },
  { to: "/support", label: "Support", icon: LifeBuoy, testid: "nav-support" },
];

const AdminNav = [
  { to: "/admin", label: "Overview", icon: LayoutDashboard, end: true, testid: "nav-admin-overview" },
  { to: "/admin/profit", label: "Profit", icon: TrendingUp, testid: "nav-admin-profit" },
  { to: "/admin/users", label: "Users", icon: UsersIcon, testid: "nav-admin-users" },
  { to: "/admin/roles", label: "Roles", icon: Shield, testid: "nav-admin-roles" },
  { to: "/admin/services", label: "Services", icon: Package, testid: "nav-admin-services" },
  { to: "/admin/suppliers", label: "Suppliers", icon: Server, testid: "nav-admin-suppliers" },
  { to: "/admin/orders", label: "All Orders", icon: ListOrdered, testid: "nav-admin-orders" },
  { to: "/admin/refills", label: "Refills", icon: RefreshCw, testid: "nav-admin-refills" },
  { to: "/admin/transactions", label: "Transactions", icon: Receipt, testid: "nav-admin-transactions" },
  { to: "/admin/tickets", label: "Tickets", icon: MessageSquare, testid: "nav-admin-tickets" },
  { to: "/admin/announcements", label: "Announcements", icon: Megaphone, testid: "nav-admin-announcements" },
];

export default function DashboardLayout({ admin = false }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const nav = admin ? AdminNav : ClientNav;

  const doLogout = async () => {
    await logout();
    navigate("/");
  };

  const isAdminOrManager = user && ["admin", "manager"].includes(user.role);

  return (
    <div className="min-h-screen bg-background flex">
      <aside className="hidden md:flex w-64 border-r border-border flex-col sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <Link to="/" className="flex items-center gap-2 font-display font-semibold text-xl" data-testid="dashboard-logo">
            <span className="w-2.5 h-2.5 bg-signal" /> SocialBoost<span className="text-signal">.</span>Pro
          </Link>
        </div>
        <div className="p-4 border-b border-border">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Wallet balance</div>
          <div className="font-display text-3xl mt-1 tracking-tighter" data-testid="sidebar-balance">{money(user?.balance)}</div>
          <Link to="/add-funds">
            <Button size="sm" className="mt-3 w-full rounded-sm bg-signal hover:bg-foreground text-white h-9" data-testid="sidebar-add-funds-button">
              Add Funds
            </Button>
          </Link>
        </div>
        <nav className="flex-1 p-3 space-y-0.5 overflow-y-auto">
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground px-3 pt-3 pb-2">{admin ? "Admin panel" : "Menu"}</div>
          {nav.map(({ to, label, icon: Icon, end, testid }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              data-testid={testid}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm transition-colors ${
                  isActive
                    ? "bg-foreground text-background"
                    : "text-foreground hover:bg-muted"
                }`
              }
            >
              <Icon className="w-4 h-4" /> {label}
            </NavLink>
          ))}
          {isAdminOrManager && !admin && (
            <NavLink to="/admin" className="mt-3 flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm border border-border hover:border-foreground text-foreground" data-testid="nav-admin-panel">
              <Shield className="w-4 h-4" /> Admin Panel
            </NavLink>
          )}
          {admin && (
            <NavLink to="/dashboard" className="mt-3 flex items-center gap-3 px-3 py-2.5 text-sm rounded-sm border border-border hover:border-foreground text-foreground" data-testid="nav-client-panel">
              <LayoutDashboard className="w-4 h-4" /> Client Panel
            </NavLink>
          )}
        </nav>
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-sm bg-foreground text-background flex items-center justify-center font-mono text-sm">
              {(user?.name || "U").slice(0, 1).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" data-testid="sidebar-user-name">{user?.name}</div>
              <div className="text-[11px] text-muted-foreground truncate uppercase tracking-wider">{user?.role}</div>
            </div>
            <button onClick={doLogout} className="p-2 hover:bg-muted rounded-sm" data-testid="sidebar-logout-button" title="Sign out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Mobile top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 z-40 h-14 bg-background border-b border-border flex items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2 font-display font-semibold">
          <span className="w-2 h-2 bg-signal" /> SocialBoost.Pro
        </Link>
        <div className="flex items-center gap-2">
          <NotificationBell />
          <Link to="/add-funds">
            <Button size="sm" className="rounded-sm h-8 bg-signal text-white">{money(user?.balance)}</Button>
          </Link>
          <button onClick={doLogout} className="p-2 border border-border rounded-sm"><LogOut className="w-4 h-4" /></button>
        </div>
      </div>

      <main className="flex-1 pt-14 md:pt-0 min-w-0">
        {/* Desktop top bar with notification bell */}
        <div className="hidden md:flex items-center justify-end gap-3 px-6 py-3 border-b border-border">
          <NotificationBell />
        </div>
        {/* Mobile nav strip */}
        <div className="md:hidden overflow-x-auto no-scrollbar border-b border-border">
          <div className="flex gap-1 px-2 py-2 min-w-max">
            {nav.map(({ to, label, icon: Icon, end, testid }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                data-testid={`m-${testid}`}
                className={({ isActive }) =>
                  `inline-flex items-center gap-2 px-3 py-2 text-xs whitespace-nowrap rounded-sm ${
                    isActive ? "bg-foreground text-background" : "bg-muted"
                  }`
                }
              >
                <Icon className="w-3.5 h-3.5" /> {label}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="p-6 md:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
