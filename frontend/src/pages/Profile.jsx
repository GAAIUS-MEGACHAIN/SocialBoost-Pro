import React, { useEffect, useState } from "react";
import { api, formatApiError, shortDate } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Plus, Copy, Trash2, Shield, Key } from "lucide-react";
import { toast } from "sonner";

export default function Profile() {
  const { user } = useAuth();
  const [keys, setKeys] = useState([]);
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [newKey, setNewKey] = useState(null);

  const load = async () => {
    try { const { data } = await api.get("/me/api-keys"); setKeys(data); } catch {}
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try {
      const { data } = await api.post("/me/api-keys", { label });
      setNewKey(data);
      setOpen(false); setLabel("");
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const revoke = async (k) => {
    if (!window.confirm(`Revoke key "${k.label}"?`)) return;
    try { await api.post(`/me/api-keys/${k.key_id}/revoke`); toast.success("Revoked"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const del = async (k) => {
    if (!window.confirm(`Delete key "${k.label}" permanently?`)) return;
    try { await api.delete(`/me/api-keys/${k.key_id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const copy = (text) => { navigator.clipboard.writeText(text); toast.success("Copied"); };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Account</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Profile & API</h1>
      </div>
      <Tabs defaultValue="profile">
        <TabsList className="rounded-sm">
          <TabsTrigger value="profile" data-testid="tab-profile"><Shield className="w-4 h-4 mr-2" /> Profile</TabsTrigger>
          <TabsTrigger value="api" data-testid="tab-api-keys"><Key className="w-4 h-4 mr-2" /> API keys</TabsTrigger>
        </TabsList>
        <TabsContent value="profile" className="mt-6">
          <div className="border border-border bg-card rounded-sm p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><Label>Name</Label><Input readOnly value={user?.name || ""} className="rounded-sm mt-1" /></div>
              <div><Label>Email</Label><Input readOnly value={user?.email || ""} className="rounded-sm mt-1" /></div>
              <div><Label>Role</Label><Input readOnly value={user?.role || ""} className="rounded-sm mt-1 capitalize" /></div>
              <div><Label>Auth provider</Label><Input readOnly value={user?.auth_provider || ""} className="rounded-sm mt-1" /></div>
              <div><Label>Balance</Label><Input readOnly value={`$${Number(user?.balance || 0).toFixed(2)}`} className="rounded-sm mt-1 font-mono" /></div>
              <div><Label>Status</Label><Input readOnly value={user?.status || ""} className="rounded-sm mt-1" /></div>
            </div>
            <div className="text-xs text-muted-foreground pt-2 border-t border-border">
              To change your email or name, open a support ticket from the Support page.
            </div>
          </div>
        </TabsContent>
        <TabsContent value="api" className="mt-6 space-y-6">
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="text-sm text-muted-foreground max-w-xl">
              Use API keys to integrate SocialBoost Pro with bots, resellers and custom apps. Standard SMM panel format — send <span className="font-mono">X-Api-Key</span> header or POST <span className="font-mono">key=...&action=services|add|status|balance</span>.
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="new-api-key-button"><Plus className="w-4 h-4 mr-2" /> New API key</Button>
              </DialogTrigger>
              <DialogContent className="rounded-sm">
                <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Create API key</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <Label>Label</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. reseller-bot" className="rounded-sm" data-testid="new-api-key-label" />
                </div>
                <DialogFooter><Button onClick={create} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="create-api-key-submit">Create</Button></DialogFooter>
              </DialogContent>
            </Dialog>
          </div>

          {newKey && (
            <div className="border border-signal bg-signal/5 rounded-sm p-5" data-testid="new-api-key-display">
              <div className="text-[10px] uppercase tracking-widest text-signal">Copy this key now — it will not be shown again</div>
              <div className="flex items-center gap-3 mt-3">
                <code className="font-mono text-xs md:text-sm flex-1 break-all bg-background px-3 py-2 border border-border rounded-sm">{newKey.key}</code>
                <Button onClick={() => copy(newKey.key)} size="sm" variant="outline" className="rounded-sm"><Copy className="w-4 h-4" /></Button>
              </div>
              <button onClick={() => setNewKey(null)} className="mt-3 text-xs underline text-muted-foreground">Dismiss</button>
            </div>
          )}

          <div className="border border-border bg-card rounded-sm overflow-hidden">
            {keys.length === 0 ? (
              <div className="p-10 text-center text-sm text-muted-foreground">No API keys yet.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3">Label</th>
                    <th className="px-5 py-3">Key</th>
                    <th className="px-5 py-3">Calls</th>
                    <th className="px-5 py-3">Last used</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {keys.map((k) => (
                    <tr key={k.key_id} className="border-b border-border">
                      <td className="px-5 py-3">{k.label}</td>
                      <td className="px-5 py-3 font-mono text-xs">{k.key_masked}</td>
                      <td className="px-5 py-3 font-mono">{k.calls || 0}</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{k.last_used_at ? shortDate(k.last_used_at) : "—"}</td>
                      <td className="px-5 py-3 text-xs">{k.active ? "Active" : "Revoked"}</td>
                      <td className="px-5 py-3">
                        <div className="flex gap-1">
                          {k.active && <button onClick={() => revoke(k)} className="p-1.5 hover:bg-muted rounded-sm" title="Revoke" data-testid={`revoke-key-${k.key_id}`}><Shield className="w-3.5 h-3.5" /></button>}
                          <button onClick={() => del(k)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" title="Delete" data-testid={`delete-key-${k.key_id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="border border-border rounded-sm p-6 bg-muted/40">
            <div className="font-display text-lg tracking-tight mb-3">API example</div>
            <pre className="font-mono text-[11px] md:text-xs overflow-auto bg-background border border-border rounded-sm p-4">
{`POST ${window.location.origin}/api/v2
Content-Type: application/x-www-form-urlencoded

key=YOUR_KEY&action=add&service=svc_xxx&link=https://instagram.com/u&quantity=500

# Other actions: services, status, balance`}
            </pre>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
