import React, { useEffect, useState } from "react";
import { api, formatApiError, shortDate } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Megaphone, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const SEVERITY = ["info", "success", "warn", "alert"];
const SEVERITY_STYLE = {
  info: "bg-blue-50 text-blue-800 border-blue-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warn: "bg-amber-50 text-amber-800 border-amber-200",
  alert: "bg-red-50 text-red-800 border-red-200",
};

export default function AdminAnnouncements() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ title: "", body: "", severity: "info" });

  const load = async () => { try { const { data } = await api.get("/admin/announcements"); setItems(data); } catch {} };
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.title.trim() || !form.body.trim()) { toast.error("Title + body required"); return; }
    try {
      await api.post("/admin/announcements", form);
      toast.success("Announcement published + broadcast"); setOpen(false); setForm({ title: "", body: "", severity: "info" }); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const del = async (a) => {
    if (!window.confirm("Delete this announcement?")) return;
    try { await api.delete(`/admin/announcements/${a.announcement_id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Announcements</h1>
          <p className="text-sm text-muted-foreground mt-2">Broadcasts create an in-app notification for every active user.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="new-announcement-button"><Plus className="w-4 h-4 mr-2" /> New announcement</Button></DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Broadcast</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} className="rounded-sm mt-1" data-testid="announcement-title" /></div>
              <div><Label>Body</Label><Textarea rows={5} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} className="rounded-sm mt-1" data-testid="announcement-body" /></div>
              <div><Label>Severity</Label>
                <Select value={form.severity} onValueChange={(v) => setForm({ ...form, severity: v })}>
                  <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{SEVERITY.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter><Button onClick={submit} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="announcement-submit">Publish</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
      <div className="space-y-3">
        {items.length === 0 ? <div className="border border-border rounded-sm p-10 text-center text-sm text-muted-foreground">No announcements yet.</div> : items.map((a) => (
          <div key={a.announcement_id} className="border border-border bg-card rounded-sm p-5 flex gap-4 items-start">
            <Megaphone className="w-5 h-5 mt-0.5 opacity-70" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block border px-2 py-0.5 text-[10px] rounded-full uppercase tracking-widest ${SEVERITY_STYLE[a.severity] || "bg-muted"}`}>{a.severity}</span>
                <span className="text-xs text-muted-foreground">{shortDate(a.created_at)} · by {a.created_by}</span>
              </div>
              <div className="font-display text-xl tracking-tight">{a.title}</div>
              <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{a.body}</div>
            </div>
            <button onClick={() => del(a)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" data-testid={`delete-announcement-${a.announcement_id}`}><Trash2 className="w-4 h-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
