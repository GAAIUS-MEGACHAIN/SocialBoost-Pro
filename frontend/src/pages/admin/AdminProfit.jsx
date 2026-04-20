import React, { useEffect, useState } from "react";
import { api, money } from "../../lib/api";

export default function AdminProfit() {
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => { try { const res = await api.get("/admin/profit"); setData(res.data); } catch {} })();
  }, []);

  if (!data) return <div className="text-sm text-muted-foreground">Loading profit data…</div>;

  const t = data.totals;
  const marginPct = t.revenue > 0 ? ((t.profit / t.revenue) * 100).toFixed(1) : "0.0";

  return (
    <div className="space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Profit dashboard</h1>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "Revenue", v: money(t.revenue) },
          { l: "Cost", v: money(t.cost) },
          { l: "Profit", v: money(t.profit), accent: true },
          { l: "Margin", v: `${marginPct}%` },
        ].map((c, i) => (
          <div key={i} className={`border rounded-sm p-6 ${c.accent ? "bg-foreground text-background border-foreground" : "border-border bg-card"}`}>
            <div className={`text-[10px] uppercase tracking-widest ${c.accent ? "opacity-60" : "text-muted-foreground"}`}>{c.l}</div>
            <div className="font-display text-4xl tracking-tighter mt-6">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-border bg-card rounded-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">By platform</div>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-5 py-2">Platform</th><th className="px-5 py-2">Orders</th><th className="px-5 py-2">Revenue</th><th className="px-5 py-2">Cost</th><th className="px-5 py-2">Profit</th></tr>
            </thead>
            <tbody>
              {data.by_platform.map((p) => (
                <tr key={p.platform} className="border-b border-border">
                  <td className="px-5 py-2 capitalize">{p.platform}</td>
                  <td className="px-5 py-2 font-mono">{p.orders}</td>
                  <td className="px-5 py-2 font-mono">{money(p.revenue)}</td>
                  <td className="px-5 py-2 font-mono text-muted-foreground">{money(p.cost)}</td>
                  <td className="px-5 py-2 font-mono text-emerald-600">{money(p.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="border border-border bg-card rounded-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">Top 15 services by profit</div>
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-5 py-2">Service</th><th className="px-5 py-2">Orders</th><th className="px-5 py-2">Profit</th></tr>
            </thead>
            <tbody>
              {data.top_services.map((s) => (
                <tr key={s.service_name} className="border-b border-border">
                  <td className="px-5 py-2 max-w-[260px] truncate">{s.service_name}</td>
                  <td className="px-5 py-2 font-mono">{s.orders}</td>
                  <td className="px-5 py-2 font-mono text-emerald-600">{money(s.profit)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
