import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, formatApiError, money, shortDate } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, ExternalLink, AtSign } from "lucide-react";
import { FaInstagram, FaFacebook, FaTiktok, FaXTwitter, FaYoutube, FaLinkedin, FaTelegram, FaSpotify, FaDiscord, FaTwitch, FaPinterest, FaSnapchat, FaWhatsapp, FaGlobe, FaMobile, FaAt } from "react-icons/fa6";
import { toast } from "sonner";

const ICONS = {
  instagram: FaInstagram, tiktok: FaTiktok, facebook: FaFacebook, twitter: FaXTwitter, youtube: FaYoutube,
  linkedin: FaLinkedin, telegram: FaTelegram, spotify: FaSpotify, discord: FaDiscord, twitch: FaTwitch,
  pinterest: FaPinterest, snapchat: FaSnapchat, whatsapp: FaWhatsapp, threads: FaAt, website: FaGlobe, app: FaMobile,
};
const PLATFORMS = Object.keys(ICONS);

export default function MyAccounts() {
  const [accounts, setAccounts] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ platform: "instagram", handle: "", link: "", label: "" });

  const load = async () => { try { const { data } = await api.get("/me/accounts"); setAccounts(data); } catch {} };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!form.handle.trim()) { toast.error("Handle required"); return; }
    try { await api.post("/me/accounts", form); toast.success("Added"); setOpen(false); setForm({ platform: "instagram", handle: "", link: "", label: "" }); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const del = async (a) => {
    if (!window.confirm(`Remove ${a.handle}?`)) return;
    try { await api.delete(`/me/accounts/${a.account_id}`); toast.success("Removed"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Tracking</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">My accounts</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">Save your social handles to monitor per-account order activity, spend, and API usage in one place.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="add-account-button"><Plus className="w-4 h-4 mr-2" /> Add account</Button></DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Track a social account</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Platform</Label>
                <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                  <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>{PLATFORMS.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Handle / username</Label><Input value={form.handle} onChange={(e) => setForm({ ...form, handle: e.target.value })} className="rounded-sm mt-1" placeholder="@yourhandle" data-testid="account-handle" /></div>
              <div><Label>Profile URL (optional)</Label><Input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} className="rounded-sm mt-1" placeholder="https://instagram.com/yourhandle" /></div>
              <div><Label>Label (optional)</Label><Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} className="rounded-sm mt-1" placeholder="e.g. client A — growth account" /></div>
            </div>
            <DialogFooter><Button onClick={add} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="account-save">Add</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {accounts.length === 0 ? (
        <div className="border border-border rounded-sm p-12 text-center">
          <AtSign className="w-8 h-8 mx-auto opacity-40" />
          <div className="mt-3 text-sm text-muted-foreground">No tracked accounts yet. Add one to start monitoring spend and activity per handle.</div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((a) => {
            const Icon = ICONS[a.platform] || FaGlobe;
            const orders = a.stats?.orders || 0;
            const spend = a.stats?.spend || 0;
            return (
              <div key={a.account_id} className="border border-border bg-card rounded-sm p-6">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 border border-border rounded-sm flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-widest text-muted-foreground capitalize">{a.platform}</div>
                      <div className="font-mono text-sm mt-0.5 truncate max-w-[180px]">{a.handle}</div>
                    </div>
                  </div>
                  <button onClick={() => del(a)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" data-testid={`delete-account-${a.account_id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
                {a.label && <div className="mt-3 text-xs text-muted-foreground">{a.label}</div>}
                <div className="grid grid-cols-2 gap-3 mt-5 pt-5 border-t border-border">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Orders</div>
                    <div className="font-display text-2xl tracking-tighter mt-1">{orders}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Spend</div>
                    <div className="font-display text-2xl tracking-tighter mt-1">{money(spend)}</div>
                  </div>
                </div>
                <div className="mt-5 flex gap-2">
                  <Link to={`/services/${a.platform}`} className="flex-1"><Button size="sm" variant="outline" className="w-full rounded-sm">Services</Button></Link>
                  <Link to={`/new-order?platform=${a.platform}&link=${encodeURIComponent(a.link || a.handle)}`} className="flex-1"><Button size="sm" className="w-full rounded-sm bg-foreground text-background hover:bg-signal">Order</Button></Link>
                  {a.link && <a href={a.link} target="_blank" rel="noreferrer" className="p-2 border border-border rounded-sm hover:border-foreground" title="Open"><ExternalLink className="w-3.5 h-3.5" /></a>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
