import React, { useEffect, useState } from "react";
import { api, formatApiError, money, shortDate } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Wallet, Ban, ShieldCheck, Pencil } from "lucide-react";
import { toast } from "sonner";

export default function AdminUsers() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState(null);
  const [form, setForm] = useState({ name: "", email: "", password: "", role: "user", balance: 0 });
  const [adjustUser, setAdjustUser] = useState(null);
  const [adjustAmount, setAdjustAmount] = useState(0);
  const [adjustNote, setAdjustNote] = useState("");

  const load = async () => {
    try {
      const [u, r] = await Promise.all([api.get("/admin/users"), api.get("/admin/roles")]);
      setUsers(u.data); setRoles(r.data);
    } catch {} finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const filtered = users.filter((u) => !q || `${u.name} ${u.email} ${u.role}`.toLowerCase().includes(q.toLowerCase()));

  const create = async () => {
    try {
      await api.post("/admin/users", form);
      toast.success("User created"); setOpen(false); setForm({ name: "", email: "", password: "", role: "user", balance: 0 });
      load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const updateUser = async () => {
    try {
      await api.patch(`/admin/users/${editUser.user_id}`, {
        name: editUser.name, role: editUser.role, balance: Number(editUser.balance), status: editUser.status,
      });
      toast.success("Updated");
      setEditUser(null); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const del = async (u) => {
    if (!window.confirm(`Delete ${u.email}?`)) return;
    try { await api.delete(`/admin/users/${u.user_id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const toggleSuspend = async (u) => {
    const newStatus = u.status === "suspended" ? "active" : "suspended";
    try { await api.patch(`/admin/users/${u.user_id}`, { status: newStatus }); toast.success(`${u.email} ${newStatus}`); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const doAdjust = async () => {
    try {
      await api.post(`/admin/users/${adjustUser.user_id}/adjust-balance`, { amount: Number(adjustAmount), note: adjustNote });
      toast.success("Balance adjusted");
      setAdjustUser(null); setAdjustAmount(0); setAdjustNote(""); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Users</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="admin-add-user-button"><Plus className="w-4 h-4 mr-2" /> New user</Button>
          </DialogTrigger>
          <DialogContent className="rounded-sm">
            <DialogHeader><DialogTitle className="font-display tracking-tight text-2xl">Create user</DialogTitle></DialogHeader>
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm mt-1" data-testid="new-user-name" /></div>
              <div><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="rounded-sm mt-1" data-testid="new-user-email" /></div>
              <div><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="rounded-sm mt-1" data-testid="new-user-password" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Role</Label>
                  <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                    <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{roles.map((r) => <SelectItem key={r.role_id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Initial balance</Label><Input type="number" value={form.balance} onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} className="rounded-sm mt-1" /></div>
              </div>
            </div>
            <DialogFooter><Button onClick={create} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="create-user-submit">Create</Button></DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Input placeholder="Search users…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-sm h-10 max-w-sm" data-testid="admin-users-search" />

      <div className="border border-border bg-card rounded-sm overflow-hidden">
        {loading ? <div className="p-6 text-sm text-muted-foreground">Loading…</div> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="px-5 py-3">User</th>
                  <th className="px-5 py-3">Role</th>
                  <th className="px-5 py-3">Balance</th>
                  <th className="px-5 py-3">Provider</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3">Joined</th>
                  <th className="px-5 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u) => (
                  <tr key={u.user_id} className="border-b border-border hover:bg-muted/40">
                    <td className="px-5 py-3">
                      <div className="font-medium">{u.name}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="px-5 py-3"><span className="uppercase text-[11px] tracking-widest font-mono">{u.role}</span></td>
                    <td className="px-5 py-3 font-mono">{money(u.balance)}</td>
                    <td className="px-5 py-3 text-xs uppercase tracking-widest text-muted-foreground">{u.auth_provider}</td>
                    <td className="px-5 py-3">
                      <span className={`inline-block border px-2 py-0.5 text-[11px] rounded-full ${u.status === "active" ? "bg-emerald-50 text-emerald-800 border-emerald-200" : "bg-red-50 text-red-800 border-red-200"}`}>{u.status}</span>
                    </td>
                    <td className="px-5 py-3 text-muted-foreground">{shortDate(u.created_at)}</td>
                    <td className="px-5 py-3">
                      <div className="flex gap-1">
                        <button onClick={() => setAdjustUser(u)} className="p-1.5 hover:bg-muted rounded-sm" title="Adjust balance" data-testid={`adjust-balance-${u.user_id}`}><Wallet className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setEditUser({ ...u })} className="p-1.5 hover:bg-muted rounded-sm" title="Edit" data-testid={`edit-user-${u.user_id}`}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => toggleSuspend(u)} className="p-1.5 hover:bg-muted rounded-sm" title="Suspend/Activate" data-testid={`suspend-user-${u.user_id}`}>
                          {u.status === "suspended" ? <ShieldCheck className="w-3.5 h-3.5" /> : <Ban className="w-3.5 h-3.5" />}
                        </button>
                        <button onClick={() => del(u)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" title="Delete" data-testid={`delete-user-${u.user_id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit dialog */}
      <Dialog open={!!editUser} onOpenChange={(v) => !v && setEditUser(null)}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Edit user</DialogTitle></DialogHeader>
          {editUser && (
            <div className="space-y-4">
              <div><Label>Name</Label><Input value={editUser.name} onChange={(e) => setEditUser({ ...editUser, name: e.target.value })} className="rounded-sm mt-1" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Role</Label>
                  <Select value={editUser.role} onValueChange={(v) => setEditUser({ ...editUser, role: v })}>
                    <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>{roles.map((r) => <SelectItem key={r.role_id} value={r.name}>{r.name}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div><Label>Balance</Label><Input type="number" value={editUser.balance} onChange={(e) => setEditUser({ ...editUser, balance: e.target.value })} className="rounded-sm mt-1" /></div>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editUser.status} onValueChange={(v) => setEditUser({ ...editUser, status: v })}>
                  <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="suspended">Suspended</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter><Button onClick={updateUser} className="rounded-sm bg-signal hover:bg-foreground text-white">Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjust balance dialog */}
      <Dialog open={!!adjustUser} onOpenChange={(v) => !v && setAdjustUser(null)}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">Adjust balance</DialogTitle></DialogHeader>
          {adjustUser && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">{adjustUser.email} · current {money(adjustUser.balance)}</div>
              <div><Label>Amount (use negative to deduct)</Label><Input type="number" step="0.01" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} className="rounded-sm mt-1" data-testid="adjust-balance-amount" /></div>
              <div><Label>Note</Label><Input value={adjustNote} onChange={(e) => setAdjustNote(e.target.value)} className="rounded-sm mt-1" placeholder="Reason…" /></div>
            </div>
          )}
          <DialogFooter><Button onClick={doAdjust} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="adjust-balance-submit">Apply</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
