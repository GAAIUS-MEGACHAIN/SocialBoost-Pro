import React, { useEffect, useState } from "react";
import { api, money, shortDate } from "../../lib/api";

export default function AdminTransactions() {
  const [txs, setTxs] = useState([]);
  useEffect(() => { (async () => { try { const { data } = await api.get("/admin/transactions"); setTxs(data); } catch {} })(); }, []);
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Transactions</h1>
      </div>
      <div className="border border-border bg-card rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Date</th>
                <th className="px-5 py-3">User</th>
                <th className="px-5 py-3">Provider</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Note</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.tx_id} className="border-b border-border">
                  <td className="px-5 py-3 text-muted-foreground">{shortDate(t.created_at)}</td>
                  <td className="px-5 py-3 font-mono text-[11px]">{(t.user_id || "").slice(-8)}</td>
                  <td className="px-5 py-3 uppercase text-xs tracking-widest">{t.provider}</td>
                  <td className={`px-5 py-3 font-mono ${t.amount > 0 ? "text-emerald-600" : "text-foreground"}`}>{t.amount > 0 ? "+" : ""}{money(t.amount)}</td>
                  <td className="px-5 py-3 text-xs">{t.status}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground max-w-[320px] truncate">{t.metadata?.note || t.metadata?.service_name || t.metadata?.purpose || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
