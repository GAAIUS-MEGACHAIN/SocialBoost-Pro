import React, { useEffect, useState } from "react";
import { api, money, shortDate, STATUS_STYLES, formatApiError } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

const STATUSES = ["Pending", "In Progress", "Processing", "Completed", "Partial", "Canceled"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("");

  const load = async () => {
    try { const { data } = await api.get(`/admin/orders${filter ? `?status=${encodeURIComponent(filter)}` : ""}`); setOrders(data); } catch {}
  };
  useEffect(() => { load(); }, [filter]);

  const filtered = orders.filter((o) => !q || `${o.order_id} ${o.service_name} ${o.link} ${o.user_id}`.toLowerCase().includes(q.toLowerCase()));

  const updateStatus = async (order_id, status) => {
    try {
      await api.patch(`/admin/orders/${order_id}`, { status });
      toast.success("Updated");
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">All orders</h1>
      </div>
      <div className="flex gap-3 flex-wrap">
        <Input placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-sm h-10 max-w-sm" />
        <Select value={filter || "__all"} onValueChange={(v) => setFilter(v === "__all" ? "" : v)}>
          <SelectTrigger className="rounded-sm h-10 w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All statuses</SelectItem>
            {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border bg-card rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Qty</th>
                <th className="px-5 py-3">Charge</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Placed</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((o) => (
                <tr key={o.order_id} className="border-b border-border">
                  <td className="px-5 py-3 font-mono text-[12px]">{o.order_id.slice(-8).toUpperCase()}</td>
                  <td className="px-5 py-3 font-mono text-[11px] text-muted-foreground">{(o.user_id || "").slice(-8)}</td>
                  <td className="px-5 py-3 max-w-[240px] truncate">{o.service_name}</td>
                  <td className="px-5 py-3 font-mono">{(o.quantity || 0).toLocaleString()}</td>
                  <td className="px-5 py-3">{money(o.charge)}</td>
                  <td className="px-5 py-3">
                    <Select value={o.status} onValueChange={(v) => updateStatus(o.order_id, v)}>
                      <SelectTrigger className={`rounded-sm h-8 text-xs w-36 ${STATUS_STYLES[o.status] || ""}`}><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">{shortDate(o.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
