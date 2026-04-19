import React, { useEffect, useState } from "react";
import { api, formatApiError } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { toast } from "sonner";

const PLATFORMS = ["instagram", "tiktok", "facebook", "twitter", "youtube"];
const CATEGORIES = ["Followers", "Likes", "Views", "Comments", "Shares", "Subscribers"];

const emptyForm = {
  platform: "instagram", category: "Followers", name: "", description: "",
  type: "Default", rate: 1.00, supplier_rate: 0.50, min: 100, max: 10000, active: true,
  supplier_id: "sup_mock_default", supplier_service_id: "",
};

export default function AdminServices() {
  const [services, setServices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [q, setQ] = useState("");

  const load = async () => {
    try {
      const [s, sup] = await Promise.all([api.get("/admin/services"), api.get("/admin/suppliers")]);
      setServices(s.data); setSuppliers(sup.data);
    } catch {}
  };
  useEffect(() => { load(); }, []);

  const filtered = services.filter((s) => !q || `${s.name} ${s.platform} ${s.category}`.toLowerCase().includes(q.toLowerCase()));

  const save = async () => {
    try {
      if (editRow) {
        await api.patch(`/admin/services/${editRow.service_id}`, form);
        toast.success("Service updated");
      } else {
        await api.post("/admin/services", form);
        toast.success("Service created");
      }
      setOpen(false); setEditRow(null); setForm(emptyForm); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const del = async (s) => {
    if (!window.confirm(`Delete service "${s.name}"?`)) return;
    try { await api.delete(`/admin/services/${s.service_id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };

  const edit = (s) => { setEditRow(s); setForm({ ...emptyForm, ...s }); setOpen(true); };

  const newOne = () => { setEditRow(null); setForm(emptyForm); setOpen(true); };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Services</h1>
        </div>
        <Button onClick={newOne} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="admin-add-service-button"><Plus className="w-4 h-4 mr-2" /> New service</Button>
      </div>

      <Input placeholder="Search services…" value={q} onChange={(e) => setQ(e.target.value)} className="rounded-sm h-10 max-w-sm" />

      <div className="border border-border bg-card rounded-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Platform</th>
                <th className="px-5 py-3">Category</th>
                <th className="px-5 py-3">Rate</th>
                <th className="px-5 py-3">Cost</th>
                <th className="px-5 py-3">Range</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.service_id} className="border-b border-border hover:bg-muted/40">
                  <td className="px-5 py-3 max-w-[280px] truncate">{s.name}</td>
                  <td className="px-5 py-3 capitalize">{s.platform}</td>
                  <td className="px-5 py-3">{s.category}</td>
                  <td className="px-5 py-3 font-mono">${Number(s.rate).toFixed(2)}</td>
                  <td className="px-5 py-3 font-mono text-muted-foreground">${Number(s.supplier_rate).toFixed(2)}</td>
                  <td className="px-5 py-3 text-xs font-mono">{s.min}–{s.max}</td>
                  <td className="px-5 py-3 text-xs">{s.active ? "Active" : "Inactive"}</td>
                  <td className="px-5 py-3">
                    <div className="flex gap-1">
                      <button onClick={() => edit(s)} className="p-1.5 hover:bg-muted rounded-sm" data-testid={`edit-service-${s.service_id}`}><Pencil className="w-3.5 h-3.5" /></button>
                      <button onClick={() => del(s)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" data-testid={`delete-service-${s.service_id}`}><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm max-w-2xl">
          <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">{editRow ? "Edit" : "New"} service</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm mt-1" data-testid="service-form-name" /></div>
            <div className="col-span-2"><Label>Description</Label><Textarea value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} className="rounded-sm mt-1" /></div>
            <div><Label>Platform</Label>
              <Select value={form.platform} onValueChange={(v) => setForm({ ...form, platform: v })}>
                <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{PLATFORMS.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Category</Label>
              <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                <SelectTrigger className="rounded-sm mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Type</Label><Input value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="rounded-sm mt-1" /></div>
            <div><Label>Rate (per 1000)</Label><Input type="number" step="0.01" value={form.rate} onChange={(e) => setForm({ ...form, rate: Number(e.target.value) })} className="rounded-sm mt-1" /></div>
            <div><Label>Supplier cost / 1000</Label><Input type="number" step="0.01" value={form.supplier_rate} onChange={(e) => setForm({ ...form, supplier_rate: Number(e.target.value) })} className="rounded-sm mt-1" /></div>
            <div><Label>Min</Label><Input type="number" value={form.min} onChange={(e) => setForm({ ...form, min: Number(e.target.value) })} className="rounded-sm mt-1" /></div>
            <div><Label>Max</Label><Input type="number" value={form.max} onChange={(e) => setForm({ ...form, max: Number(e.target.value) })} className="rounded-sm mt-1" /></div>
            <div><Label>Supplier</Label>
              <Select value={form.supplier_id || ""} onValueChange={(v) => setForm({ ...form, supplier_id: v })}>
                <SelectTrigger className="rounded-sm mt-1"><SelectValue placeholder="Select supplier" /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.supplier_id} value={s.supplier_id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div><Label>Supplier service ID</Label><Input value={form.supplier_service_id || ""} onChange={(e) => setForm({ ...form, supplier_service_id: e.target.value })} className="rounded-sm mt-1" /></div>
            <div className="col-span-2 flex items-center gap-2"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> <Label className="mb-0">Active</Label></div>
          </div>
          <DialogFooter><Button onClick={save} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="service-form-save">{editRow ? "Save" : "Create"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
