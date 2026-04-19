import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, money, shortDate, STATUS_STYLES } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { ArrowRight, Wallet, ListOrdered, CheckCircle2, Clock, RefreshCw } from "lucide-react";
import { toast } from "sonner";

export default function Dashboard() {
  const { user, refresh } = useAuth();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/orders");
      setOrders(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const stats = {
    total: orders.length,
    active: orders.filter((o) => ["Pending", "In Progress", "Processing"].includes(o.status)).length,
    completed: orders.filter((o) => o.status === "Completed").length,
    spent: orders.reduce((a, b) => a + Number(b.charge || 0), 0),
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      const { data } = await api.post("/orders/sync-all");
      toast.success(`Synced ${data.synced} orders`);
      await load();
    } catch {
      toast.error("Sync failed");
    } finally { setSyncing(false); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Welcome back</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1" data-testid="dashboard-title">Hello, {user?.name?.split(" ")[0]}</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={syncAll} disabled={syncing} className="rounded-sm" data-testid="dashboard-sync-button">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sync
          </Button>
          <Link to="/new-order">
            <Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="dashboard-new-order-cta">
              New Order <ArrowRight className="w-4 h-4 ml-2" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Wallet balance", value: money(user?.balance), icon: Wallet, accent: true },
          { label: "Total orders", value: stats.total, icon: ListOrdered },
          { label: "Active", value: stats.active, icon: Clock },
          { label: "Completed", value: stats.completed, icon: CheckCircle2 },
        ].map((s, i) => {
          const Icon = s.icon;
          return (
            <div key={i} className={`border border-border bg-card rounded-sm p-6 ${s.accent ? "bg-foreground text-background border-foreground" : ""}`}>
              <div className="flex items-start justify-between">
                <div className={`text-[10px] uppercase tracking-widest ${s.accent ? "text-background/70" : "text-muted-foreground"}`}>{s.label}</div>
                <Icon className="w-4 h-4 opacity-60" />
              </div>
              <div className="mt-8 font-display text-4xl tracking-tighter">{s.value}</div>
            </div>
          );
        })}
      </div>

      {/* Recent orders */}
      <div className="border border-border bg-card rounded-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">/ Activity</div>
            <div className="font-display text-2xl tracking-tight">Recent orders</div>
          </div>
          <Link to="/orders" className="text-sm underline underline-offset-4 hover:text-signal">View all</Link>
        </div>
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : orders.length === 0 ? (
          <div className="p-10 text-center">
            <div className="text-muted-foreground text-sm">No orders yet.</div>
            <Link to="/new-order"><Button className="mt-4 rounded-sm bg-signal hover:bg-foreground text-white">Place your first order</Button></Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-6 py-3">Order</th>
                  <th className="px-6 py-3">Service</th>
                  <th className="px-6 py-3">Qty</th>
                  <th className="px-6 py-3">Charge</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3">Placed</th>
                </tr>
              </thead>
              <tbody>
                {orders.slice(0, 8).map((o) => (
                  <tr key={o.order_id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-6 py-3 font-mono text-[12px]">{o.order_id.slice(-8).toUpperCase()}</td>
                    <td className="px-6 py-3">{o.service_name}</td>
                    <td className="px-6 py-3">{o.quantity.toLocaleString()}</td>
                    <td className="px-6 py-3">{money(o.charge)}</td>
                    <td className="px-6 py-3">
                      <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_STYLES[o.status] || "bg-muted"}`}>
                        {o.status}
                      </span>
                    </td>
                    <td className="px-6 py-3 text-muted-foreground">{shortDate(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
