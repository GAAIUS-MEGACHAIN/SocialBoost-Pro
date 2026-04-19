import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

const ALL_PERMS = [
  "users.read", "users.write", "users.delete",
  "orders.read", "orders.own", "orders.update",
  "services.read", "services.write",
  "suppliers.read", "suppliers.write",
  "wallet.own", "wallet.admin",
  "transactions.read", "*",
];

export default function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: "", permissions: [] });

  const load = async () => { try { const { data } = await api.get("/admin/roles"); setRoles(data); } catch {} };
  useEffect(() => { load(); }, []);

  const create = async () => {
    try { await api.post("/admin/roles", form); toast.success("Role created"); setOpen(false); setForm({ name: "", permissions: [] }); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const del = async (r) => {
    if (!window.confirm(`Delete role ${r.name}?`)) return;
    try { await api.delete(`/admin/roles/${r.role_id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const togglePerm = (p, set) => {
    set.permissions.includes(p)
      ? setForm({ ...set, permissions: set.permissions.filter((x) => x !== p) })
      : setForm({ ...set, permissions: [...set.permissions, p] });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Roles</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="admin-add-role-button"><Plus className="w-4 h-4 mr-2" /> New role</Button></DialogTrigger>
          <DialogContent className="rounded-sm max-w-lg">
            <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Create custom role</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Role name (lowercase)</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value.toLowerCase() })} className="rounded-sm mt-1" placeholder="e.g. reseller" data-testid="new-role-name" /></div>
              <div>
                <Label>Permissions</Label>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  {ALL_PERMS.map((p) => (
                    <label key={p} className={`flex items-center gap-2 border rounded-sm px-3 py-2 text-xs cursor-pointer ${form.permissions.includes(p) ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground"}`}>
                      <input type="checkbox" checked={form.permissions.includes(p)} onChange={() => togglePerm(p, form)} className="hidden" />
                      <span className="font-mono">{p}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <DialogFooter><Button onClick={create} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="create-role-submit">Create role</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {roles.map((r) => (
          <div key={r.role_id} className="border border-border bg-card rounded-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-2xl tracking-tight capitalize">{r.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{r.is_system ? "System role" : "Custom role"}</div>
              </div>
              {!r.is_system && <button onClick={() => del(r)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" data-testid={`delete-role-${r.role_id}`}><Trash2 className="w-4 h-4" /></button>}
            </div>
            <div className="mt-5 flex flex-wrap gap-1.5">
              {r.permissions.length === 0 ? <span className="text-xs text-muted-foreground">No explicit permissions</span> : r.permissions.map((p) => (
                <span key={p} className="font-mono text-[11px] border border-border px-2 py-0.5 rounded-sm">{p}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
