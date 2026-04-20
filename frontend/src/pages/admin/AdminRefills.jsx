import React, { useEffect, useState } from "react";
import { api, formatApiError, shortDate } from "../../lib/api";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export default function AdminRefills() {
  const [refills, setRefills] = useState([]);

  const load = async () => { try { const { data } = await api.get("/admin/refills"); setRefills(data); } catch {} };
  useEffect(() => { load(); }, []);

  const setStatus = async (id, status) => {
    try { await api.patch(`/admin/refills/${id}`, { status }); toast.success("Updated"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Refill requests</h1>
      </div>
      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {refills.length === 0 ? <div className="p-10 text-center text-sm text-muted-foreground">No refill requests.</div> : (
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr><th className="px-5 py-3">Refill</th><th className="px-5 py-3">Order</th><th className="px-5 py-3">User</th><th className="px-5 py-3">Reason</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Created</th></tr>
            </thead>
            <tbody>
              {refills.map((r) => (
                <tr key={r.refill_id} className="border-b border-border">
                  <td className="px-5 py-3 font-mono text-[11px]">{r.refill_id.slice(-10).toUpperCase()}</td>
                  <td className="px-5 py-3 font-mono text-[11px]">{(r.order_id || "").slice(-8).toUpperCase()}</td>
                  <td className="px-5 py-3 font-mono text-[11px]">{(r.user_id || "").slice(-8)}</td>
                  <td className="px-5 py-3 max-w-[240px] truncate">{r.reason || "—"}</td>
                  <td className="px-5 py-3">
                    <Select value={r.status} onValueChange={(v) => setStatus(r.refill_id, v)}>
                      <SelectTrigger className="rounded-sm h-8 w-36 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="processing">Processing</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </td>
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
