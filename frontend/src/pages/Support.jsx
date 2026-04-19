import React, { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, formatApiError, shortDate } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, MessageSquare, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

const STATUS_BADGE = {
  open: "bg-blue-50 text-blue-800 border-blue-200",
  pending: "bg-amber-50 text-amber-800 border-amber-200",
  answered: "bg-emerald-50 text-emerald-800 border-emerald-200",
  closed: "bg-muted text-muted-foreground border-border",
};
const CATEGORIES = ["General", "Orders", "Payments", "Account", "Other"];

export default function Support() {
  const { ticketId } = useParams();
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ subject: "", category: "General", message: "" });
  const [detail, setDetail] = useState(null);
  const [reply, setReply] = useState("");

  const loadList = async () => {
    try { const { data } = await api.get("/tickets"); setTickets(data); } catch {}
  };
  const loadDetail = async (id) => {
    try { const { data } = await api.get(`/tickets/${id}`); setDetail(data); } catch { toast.error("Ticket not found"); navigate("/support"); }
  };

  useEffect(() => {
    if (ticketId) loadDetail(ticketId);
    else { setDetail(null); loadList(); }
  }, [ticketId]);

  const create = async () => {
    if (!form.subject.trim() || !form.message.trim()) { toast.error("Fill subject and message"); return; }
    try {
      const { data } = await api.post("/tickets", form);
      toast.success("Ticket created");
      setOpen(false); setForm({ subject: "", category: "General", message: "" });
      navigate(`/support/${data.ticket_id}`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const sendReply = async () => {
    if (!reply.trim()) return;
    try {
      const { data } = await api.post(`/tickets/${detail.ticket_id}/reply`, { message: reply });
      setDetail(data); setReply("");
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  if (detail) {
    return (
      <div className="max-w-3xl space-y-6">
        <Link to="/support" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground"><ArrowLeft className="w-3 h-3" /> Back to tickets</Link>
        <div className="border border-border bg-card rounded-sm p-6">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_BADGE[detail.status]}`}>{detail.status}</span>
                <span className="text-xs uppercase tracking-widest text-muted-foreground">{detail.category}</span>
              </div>
              <div className="font-display text-3xl tracking-tight mt-2">{detail.subject}</div>
              <div className="text-xs text-muted-foreground mt-1 font-mono">{detail.ticket_id}</div>
            </div>
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
              <Label className="text-xs uppercase tracking-wider">Your reply</Label>
              <Textarea rows={4} value={reply} onChange={(e) => setReply(e.target.value)} className="rounded-sm" data-testid="ticket-reply-input" />
              <Button onClick={sendReply} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="ticket-reply-send">Send reply</Button>
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
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Help</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Support</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="open-new-ticket-button"><Plus className="w-4 h-4 mr-2" /> New ticket</Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Open a ticket</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Subject</Label><Input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} className="rounded-sm mt-1" data-testid="ticket-subject-input" /></div>
              <div><Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Message</Label><Textarea rows={5} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} className="rounded-sm mt-1" data-testid="ticket-message-input" /></div>
            </div>
            <DialogFooter><Button onClick={create} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="create-ticket-submit">Submit</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {tickets.length === 0 ? (
          <div className="p-10 text-center text-sm text-muted-foreground">
            <MessageSquare className="w-6 h-6 mx-auto mb-3 opacity-50" />
            You haven't opened any tickets yet.
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {tickets.map((t) => (
              <li key={t.ticket_id}>
                <Link to={`/support/${t.ticket_id}`} className="flex items-center gap-4 p-5 hover:bg-muted/40 transition-colors">
                  <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${STATUS_BADGE[t.status] || "bg-muted"}`}>{t.status}</span>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{t.subject}</div>
                    <div className="text-xs text-muted-foreground">{t.category} · {t.messages?.length || 0} messages</div>
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
