import React, { useState } from "react";
import { api, formatApiError, money } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Upload, Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function BulkUpload() {
  const { refresh } = useAuth();
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [uploading, setUploading] = useState(false);

  const sample = "service_id,link,quantity\nsvc_xxxxxxxxxxxx,https://instagram.com/your-handle,500\nsvc_yyyyyyyyyyyy,https://tiktok.com/@your-handle,1000\n";

  const downloadSample = () => {
    const blob = new Blob([sample], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "sample_bulk_orders.csv"; a.click(); URL.revokeObjectURL(url);
  };

  const submit = async () => {
    if (!file) { toast.error("Choose a CSV file first"); return; }
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const { data } = await api.post("/orders/bulk", form, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
      toast.success(`Placed ${data.placed} orders, charged ${money(data.total_charge)}`);
      await refresh();
    } catch (err) { toast.error(formatApiError(err.response?.data?.detail) || err.message); }
    finally { setUploading(false); }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Agencies</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Bulk CSV upload</h1>
        <p className="text-sm text-muted-foreground mt-2">Upload a CSV with <span className="font-mono">service_id, link, quantity</span> columns. We pre-validate every row, then atomically charge + place.</p>
      </div>
      <div className="border border-border bg-card rounded-sm p-8 space-y-5">
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={downloadSample} className="rounded-sm" data-testid="download-sample-csv"><Download className="w-4 h-4 mr-2" /> Sample CSV</Button>
        </div>
        <label className="block border-2 border-dashed border-border rounded-sm p-10 text-center cursor-pointer hover:border-foreground transition-colors" data-testid="bulk-upload-dropzone">
          <input type="file" accept=".csv" onChange={(e) => setFile(e.target.files?.[0] || null)} className="hidden" data-testid="bulk-upload-input" />
          <FileSpreadsheet className="w-8 h-8 mx-auto text-muted-foreground" />
          <div className="mt-3 text-sm">{file ? file.name : "Click to select a CSV file"}</div>
        </label>
        <Button onClick={submit} disabled={uploading || !file} className="rounded-sm bg-signal hover:bg-foreground text-white h-12 w-full" data-testid="bulk-upload-submit">
          <Upload className="w-4 h-4 mr-2" /> {uploading ? "Uploading…" : "Validate & place orders"}
        </Button>
      </div>

      {result && (
        <div className="border border-border bg-card rounded-sm p-6">
          <div className="font-display text-2xl tracking-tight">Result</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-4">
            <div className="border border-border rounded-sm p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Placed</div><div className="font-display text-3xl tracking-tighter">{result.placed}</div></div>
            <div className="border border-border rounded-sm p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Total charge</div><div className="font-display text-3xl tracking-tighter">{money(result.total_charge)}</div></div>
            <div className="border border-border rounded-sm p-4"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">Rows</div><div className="font-display text-3xl tracking-tighter">{result.results.length}</div></div>
          </div>
          <div className="mt-5 max-h-72 overflow-auto font-mono text-xs border border-border rounded-sm">
            <table className="w-full">
              <thead className="border-b border-border text-left text-muted-foreground"><tr>
                <th className="px-3 py-2">Service</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Order / Error</th>
              </tr></thead>
              <tbody>
                {result.results.map((r, i) => (
                  <tr key={i} className="border-b border-border">
                    <td className="px-3 py-2">{r.service_id || "—"}</td>
                    <td className={`px-3 py-2 ${r.status === "ok" ? "text-emerald-600" : "text-red-600"}`}>{r.status}</td>
                    <td className="px-3 py-2">{r.order_id || r.error}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
