import React, { useEffect, useState } from "react";
import { api, formatApiError, shortDate } from "../../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Trash2, Pencil, Download } from "lucide-react";
import { toast } from "sonner";

export default function AdminSuppliers() {
  const [suppliers, setSuppliers] = useState([]);
  const [open, setOpen] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [form, setForm] = useState({ name: "", api_url: "", api_key: "", notes: "" });
  const [importing, setImporting] = useState(null);

  const load = async () => { try { const { data } = await api.get("/admin/suppliers"); setSuppliers(data); } catch {} };
  useEffect(() => { load(); }, []);

  const save = async () => {
    try {
      if (editRow) {
        await api.patch(`/admin/suppliers/${editRow.supplier_id}`, form);
        toast.success("Supplier updated");
      } else {
        await api.post("/admin/suppliers", form);
        toast.success("Supplier added");
      }
      setOpen(false); setEditRow(null); setForm({ name: "", api_url: "", api_key: "", notes: "" }); load();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const del = async (s) => {
    if (!window.confirm(`Delete ${s.name}?`)) return;
    try { await api.delete(`/admin/suppliers/${s.supplier_id}`); toast.success("Deleted"); load(); }
    catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
  };
  const edit = (s) => { setEditRow(s); setForm({ name: s.name, api_url: s.api_url, api_key: s.api_key, notes: s.notes || "" }); setOpen(true); };
  const newOne = () => { setEditRow(null); setForm({ name: "", api_url: "", api_key: "", notes: "" }); setOpen(true); };

  const importServices = async (s) => {
    if (!window.confirm(`Import all services from ${s.name}? (applies 2× markup by default)`)) return;
    setImporting(s.supplier_id);
    try {
      const { data } = await api.post(`/admin/suppliers/${s.supplier_id}/import-services`, { markup: 2.0 });
      toast.success(`Imported ${data.imported}, updated ${data.updated}${data.note ? ` · ${data.note}` : ""}`);
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail)); }
    finally { setImporting(null); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Admin</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Suppliers</h1>
          <p className="text-sm text-muted-foreground mt-2 max-w-2xl">Connect any SMM panel that follows the standard API format (POST with <span className="font-mono">key</span> &amp; <span className="font-mono">action=services/add/status</span>).</p>
        </div>
        <Button onClick={newOne} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="admin-add-supplier-button"><Plus className="w-4 h-4 mr-2" /> New supplier</Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {suppliers.map((s) => (
          <div key={s.supplier_id} className="border border-border bg-card rounded-sm p-6">
            <div className="flex items-start justify-between">
              <div>
                <div className="font-display text-2xl tracking-tight">{s.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground mt-1">{s.is_mock ? "Internal mock" : "External API"}</div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => edit(s)} className="p-1.5 hover:bg-muted rounded-sm" data-testid={`edit-supplier-${s.supplier_id}`}><Pencil className="w-4 h-4" /></button>
                {!s.is_mock && <button onClick={() => del(s)} className="p-1.5 hover:bg-red-50 hover:text-red-700 rounded-sm" data-testid={`delete-supplier-${s.supplier_id}`}><Trash2 className="w-4 h-4" /></button>}
              </div>
            </div>
            <div className="mt-6 space-y-2 text-sm">
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">API URL</span><span className="font-mono text-xs truncate max-w-[200px]">{s.api_url}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">API Key</span><span className="font-mono text-xs truncate max-w-[200px]">{"•".repeat(Math.min(14, (s.api_key || "").length))}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Status</span><span className="uppercase text-xs tracking-widest">{s.status}</span></div>
              <div className="flex justify-between gap-2"><span className="text-muted-foreground">Added</span><span className="text-xs">{shortDate(s.created_at)}</span></div>
            </div>
            {s.notes && <div className="mt-4 text-xs text-muted-foreground">{s.notes}</div>}
            <Button
              onClick={() => importServices(s)}
              disabled={importing === s.supplier_id}
              variant="outline"
              className="w-full mt-5 rounded-sm border-foreground/30 hover:border-foreground"
              data-testid={`import-services-${s.supplier_id}`}
            >
              <Download className={`w-4 h-4 mr-2 ${importing === s.supplier_id ? "animate-pulse" : ""}`} />
              {importing === s.supplier_id ? "Importing…" : "Import services (action=services)"}
            </Button>
          </div>
        ))}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-sm">
          <DialogHeader><DialogTitle className="font-display text-2xl tracking-tight">{editRow ? "Edit" : "New"} supplier</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="rounded-sm mt-1" data-testid="supplier-form-name" /></div>
            <div><Label>API URL</Label><Input value={form.api_url} onChange={(e) => setForm({ ...form, api_url: e.target.value })} className="rounded-sm mt-1" placeholder="https://panelprovider.com/api/v2" data-testid="supplier-form-url" /></div>
            <div><Label>API Key</Label><Input value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} className="rounded-sm mt-1" data-testid="supplier-form-key" /></div>
            <div><Label>Notes</Label><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="rounded-sm mt-1" /></div>
          </div>
          <DialogFooter><Button onClick={save} className="rounded-sm bg-signal hover:bg-foreground text-white" data-testid="supplier-form-save">{editRow ? "Save" : "Add"}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
