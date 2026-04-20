import React, { useEffect, useState } from "react";
import { api, money, shortDate } from "../lib/api";
import { toast } from "sonner";

const STATUS_STYLES = {
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  processing: "bg-blue-50 text-blue-800 border-blue-200",
  completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  rejected: "bg-red-50 text-red-800 border-red-200",
};

export default function Refills() {
  const [refills, setRefills] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const { data } = await api.get("/refills"); setRefills(data); } catch {}
      finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">After-sales</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Refills</h1>
        <p className="text-sm text-muted-foreground mt-2">Request a refill on completed/partial orders if the service drops below expected count. Only services marked "refill-supported" are eligible.</p>
      </div>
      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {loading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : refills.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No refill requests yet. Go to Orders to request one.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Refill ID</th>
                <th className="px-5 py-3">Order</th>
                <th className="px-5 py-3">Reason</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Created</th>
              </tr>
            </thead>
            <tbody>
              {refills.map((r) => (
                <tr key={r.refill_id} className="border-b border-border">
                  <td className="px-5 py-3 font-mono text-[11px]">{r.refill_id.slice(-10).toUpperCase()}</td>
                  <td className="px-5 py-3 font-mono text-[11px]">{(r.order_id || "").slice(-8).toUpperCase()}</td>
                  <td className="px-5 py-3 max-w-[260px] truncate">{r.reason || "—"}</td>
                  <td className="px-5 py-3"><span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_STYLES[r.status] || "bg-muted"}`}>{r.status}</span></td>
                  <td className="px-5 py-3 text-muted-foreground">{shortDate(r.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
