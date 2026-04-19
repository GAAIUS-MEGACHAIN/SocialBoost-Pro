import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { api, formatApiError, shortDate } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE = {
  open: "bg-blue-50 text-blue-800 border-blue-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  answered: "bg-emerald-50 text-emerald-800 border-emerald-200",
  closed: "bg-muted text-muted-foreground border-border",
};

export default function AdminTickets() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [filter, setFilter] = useState("");
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");

  const loadList = async () => {
    try {
      const { data } = await api.get(`/admin/tickets${filter ? `?status=${encodeURIComponent(filter)}` : ""}`);
      setTickets(data);
    } catch {}
  };
  const loadDetail = async (id) => {
    try { const { data } = await api.get(`/tickets/${id}`); setDetail(data); }
    catch { toast.error("Ticket not found"); navigate("/admin/tickets"); }
  };

  useEffect(() => {
    if (ticketId) loadDetail(ticketId);
    else { setDetail(null); loadList(); }
    // eslint-disable-next-line
  }, [ticketId, filter]);

  const send = async () => {
    if (!reply.trim()) return;
    try {
      const { data } = await api.post(`/tickets/${detail.ticket_id}/reply`, { message: reply });
      setDetail(data); setReply("");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const setStatus = async (status) => {
    try {
      const { data } = await api.patch(`/admin/tickets/${detail.ticket_id}`, { status });
      setDetail(data); toast.success(`Status: ${status}`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (detail) {
    return (
      <div className="max-w-3xl space-y-6">
        <Link to="/admin/tickets" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"><ArrowLeft className="w-3 h-3" /> Back to tickets</Link>
        <div className="border border-border bg-card rounded-sm p-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">{detail.category}</span>
              </div>
              <div className="font-display text-3xl tracking-tight mt-2">{detail.subject}</div>
              <div className="text-xs text-muted-foreground mt-1">{detail.user_name} · {detail.user_email}</div>
            </div>
            <Select value={detail.status} onValueChange={setStatus}>
              <SelectTrigger className="rounded-sm h-9 w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="open">Open</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="answered">Answered</SelectItem>
                <SelectItem value="closed">Closed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="mt-6 space-y-4">
            {detail.messages.map((m) => {
              const isStaff = m.sender_role !== "user";
              return (
                <div key={m.message_id} className={`p-4 border rounded-sm ${isStaff ? "bg-foreground text-background border-foreground" : "bg-muted/50 border-border"}`}>
                  <div className="flex justify-between text-[11px] uppercase tracking-widest opacity-70">
                    <span>{isStaff ? "Support" : m.sender_name}</span>
                    <span>{shortDate(m.created_at)}</span>
                  </div>
                  <div className="mt-2 whitespace-pre-wrap text-sm">{m.message}</div>
                </div>
              );
            })}
          </div>
          {detail.status !== "closed" && (
            <div className="mt-6 space-y-3">
              <Label className="text-xs uppercase tracking-wider">Admin reply</Label>
              <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} className="rounded-sm" data-testid="admin-ticket-reply-input" />
              <Button onClick={send} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="admin-ticket-reply-send">Send reply</Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Tickets</h1>
        </div>
        <Select value={filter || "__all"} onValueChange={(v) => setFilter(v === "__all" ? "" : v)}>
          <SelectTrigger className="rounded-sm h-10 w-48"><SelectValue placeholder="All statuses" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all">All statuses</SelectItem>
            <SelectItem value="open">Open</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="answered">Answered</SelectItem>
            <SelectItem value="closed">Closed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {tickets.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">No tickets.</div>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.ticket_id}>
                <Link to={`/admin/tickets/${t.ticket_id}`} className="flex items-center gap-4 p-5 hover:bg-muted/40">
                  <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_BADGE[t.status] || "bg-muted"}`}>{t.status}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.user_name} · {t.user_email} · {t.category}</div>
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-nowrap">{shortDate(t.updated_at)}</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
