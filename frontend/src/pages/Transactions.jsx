import React, { useEffect, useState } from "react";
import { api, money, shortDate } from "../lib/api";

export default function Transactions() {
  const [txs, setTxs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/wallet/transactions"); setTxs(data); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">History</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Transactions</h1>
      </div>
      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {loading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : txs.length === 0 ? (
          <div className="p-10 text-sm text-muted-foreground text-center">No transactions yet.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">Date</th>
                  <th className="px-5 py-3">Provider</th>
                  <th className="px-5 py-3">Amount</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Note</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.tx_id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-5 py-3 text-muted-foreground">{shortDate(t.created_at)}</td>
                    <td className="px-5 py-3 uppercase text-xs tracking-widest">{t.provider}</td>
                    <td className={`px-5 py-3 font-mono ${t.amount > 0 ? "text-emerald-600" : "text-foreground"}`}>
                      {t.amount > 0 ? "+" : ""}{money(t.amount)}
                    </td>
                    <td className="px-5 py-3 text-xs">{t.status}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground max-w-[300px] truncate">
                      {t.metadata?.note || t.metadata?.service_name || t.metadata?.purpose || "—"}
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
