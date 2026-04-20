import React, { useEffect, useState } from "react";
import { api, money, shortDate, STATUS_STYLES } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RefreshCw, Search, Download, RotateCcw, XCircle } from "lucide-react";
import { toast } from "sonner";

const STATUSES = ["All", "Pending", "In Progress", "Processing", "Completed", "Partial", "Canceled"];

export default function OrdersList() {
  const [orders, setOrders] = useState([]);
  const [status, setStatus] = useState("All");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  const load = async () => {
    try {
      const { data } = await api.get("/orders");
      setOrders(data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = orders.filter((o) => {
    if (status !== "All" && o.status !== status) return false;
    if (q && !`${o.order_id} ${o.service_name} ${o.link}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  const progress = (o) => {
    const done = Math.max(0, o.quantity - (o.remains || 0));
    return Math.min(100, Math.round((done / Math.max(1, o.quantity)) * 100));
  };

  const syncOne = async (order_id) => {
    try {
      const { data } = await api.post(`/orders/${order_id}/sync`);
      setOrders((prev) => prev.map((o) => (o.order_id === data.order_id ? data : o)));
      toast.success("Order synced");
    } catch {
      toast.error("Sync failed");
    }
  };

  const syncAll = async () => {
    setSyncing(true);
    try {
      await api.post("/orders/sync-all");
      await load();
      toast.success("All active orders synced");
    } catch {} finally { setSyncing(false); }
  };

  const requestRefill = async (o) => {
    const reason = window.prompt("Reason for refill (optional):") || "";
    try {
      await api.post(`/orders/${o.order_id}/refill`, { reason });
      toast.success("Refill requested");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  const cancelOrd = async (o) => {
    if (!window.confirm(`Cancel order ${o.order_id.slice(-8).toUpperCase()}? Amount will be refunded.`)) return;
    try {
      const { data } = await api.post(`/orders/${o.order_id}/cancel`);
      toast.success(`Canceled · refunded ${money(data.refunded)}`);
      await load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
  };

  const exportCsv = () => {
    // Use session cookie; open in new tab for download
    window.location.href = `${API_BASE}/orders/export`;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Tracking</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Orders</h1>
        </div>
        <div className="flex gap-2">
          <Button onClick={exportCsv} variant="outline" className="rounded-sm" data-testid="orders-export-csv"><Download className="w-4 h-4 mr-2" /> Export CSV</Button>
          <Button onClick={syncAll} disabled={syncing} variant="outline" className="rounded-sm" data-testid="orders-sync-all-button">
            <RefreshCw className={`w-4 h-4 mr-2 ${syncing ? "animate-spin" : ""}`} /> Sync all
          </Button>
        </div>
      </div>

      <div className="flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1 md:max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Search order ID, service, link…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9 rounded-sm h-10" data-testid="orders-search-input" />
        </div>
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {STATUSES.map((s) => (
            <button key={s} onClick={() => setStatus(s)} data-testid={`orders-filter-${s.replace(/\s/g, "-").toLowerCase()}`} className={`px-3 py-2 text-xs rounded-sm border whitespace-nowrap ${status === s ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}>{s}</button>
          ))}
        </div>
      </div>

      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No orders.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Order</th>
                  <th className="px-5 py-3">Service</th>
                  <th className="px-5 py-3">Link</th>
                  <th className="px-5 py-3">Qty</th>
                  <th className="px-5 py-3">Charge</th>
                  <th className="px-5 py-3">Progress</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Placed</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => (
                  <tr key={o.order_id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-[12px]">{o.order_id.slice(-8).toUpperCase()}</td>
                    <td className="px-5 py-3 max-w-[220px] truncate">{o.service_name}</td>
                    <td className="px-5 py-3 max-w-[200px] truncate">
                      <a href={o.link} target="_blank" rel="noreferrer" className="text-klein hover:text-signal underline underline-offset-2">{o.link}</a>
                    </td>
                    <td className="px-5 py-3 font-mono">{o.quantity.toLocaleString()}</td>
                    <td className="px-5 py-3">{money(o.charge)}</td>
                    <td className="px-5 py-3 min-w-[120px]">
                      <div className="h-1 w-24 bg-muted">
                        <div className="h-full bg-signal" style={{ width: `${progress(o)}%` }} />
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-1 font-mono">{progress(o)}%</div>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_STYLES[o.status] || "bg-muted"}`}>{o.status}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{shortDate(o.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-0.5">
                        <button onClick={() => syncOne(o.order_id)} className="p-1.5 hover:bg-muted rounded-sm" title="Sync" data-testid={`sync-order-${o.order_id}`}>
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        {["Completed", "Partial"].includes(o.status) && (
                          <button onClick={() => requestRefill(o)} className="p-1.5 hover:bg-muted rounded-sm" title="Refill" data-testid={`refill-order-${o.order_id}`}>
                            <RotateCcw className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {["Pending", "In Progress"].includes(o.status) && (
                          <button onClick={() => cancelOrd(o)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" title="Cancel" data-testid={`cancel-order-${o.order_id}`}>
                            <XCircle className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
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
