import React, { useEffect, useState } from "react";
import { api, money } from "../../lib/api";
import { Users, ShoppingCart, Package, Server, TrendingUp, Wallet } from "lucide-react";

export default function AdminOverview() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => { try { const { data } = await api.get("/admin/stats"); setStats(data); } catch {} })();
  }, []);

  const cards = [
    { label: "Total users", value: stats?.users?.total ?? "—", sub: `${stats?.users?.active ?? 0} active`, icon: Users },
    { label: "Orders", value: stats?.orders?.total ?? "—", sub: `${stats?.orders?.pending ?? 0} active`, icon: ShoppingCart },
    { label: "Services", value: stats?.services ?? "—", sub: "in catalog", icon: Package },
    { label: "Suppliers", value: stats?.suppliers ?? "—", sub: "connected", icon: Server },
    { label: "Revenue", value: money(stats?.revenue ?? 0), sub: "topups (Stripe)", icon: Wallet, accent: true },
    { label: "Spend", value: money(stats?.spend ?? 0), sub: "order charges", icon: TrendingUp },
  ];

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Overview</h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {cards.map((c, i) => {
          const Icon = c.icon;
          return (
            <div key={i} className={`border rounded-sm p-6 ${c.accent ? "bg-foreground text-background border-foreground" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between">
                <div className={`text-[10px] uppercase tracking-widest ${c.accent ? "opacity-60" : "text-muted-foreground"}`}>{c.label}</div>
                <Icon className="w-4 h-4 opacity-60" />
              </div>
              <div className="font-display text-3xl mt-6 tracking-tighter">{c.value}</div>
              <div className={`mt-1 text-[11px] ${c.accent ? "opacity-70" : "text-muted-foreground"}`}>{c.sub}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
