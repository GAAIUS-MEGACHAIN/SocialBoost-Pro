import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { api, formatApiError, money } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowRight } from "lucide-react";

export default function NewOrder() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, refresh } = useAuth();
  const [services, setServices] = useState([]);
  const [platform, setPlatform] = useState("");
  const [category, setCategory] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [link, setLink] = useState("");
  const [quantity, setQuantity] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/services");
        setServices(data);
      } catch {}
    })();
  }, []);

  // Preset from ?service= or ?platform= query params once services load
  useEffect(() => {
    const sid = params.get("service");
    const plat = params.get("platform");
    const linkParam = params.get("link");
    if (linkParam) setLink(decodeURIComponent(linkParam));
    if (services.length === 0) return;
    if (sid) {
      const preset = services.find((s) => s.service_id === sid);
      if (preset) {
        setPlatform(preset.platform);
        setCategory(preset.category);
        setServiceId(preset.service_id);
        setQuantity(preset.min);
        return;
      }
    }
    if (plat) setPlatform(plat);
  }, [services, params]);

  const platforms = useMemo(() => [...new Set(services.map((s) => s.platform))], [services]);
  const categories = useMemo(() => {
    return [...new Set(services.filter((s) => !platform || s.platform === platform).map((s) => s.category))];
  }, [services, platform]);
  const filteredServices = useMemo(() => {
    return services.filter((s) => (!platform || s.platform === platform) && (!category || s.category === category));
  }, [services, platform, category]);

  const selected = services.find((s) => s.service_id === serviceId);
  const charge = selected ? (Number(selected.rate) * Number(quantity || 0)) / 1000 : 0;

  const submit = async (e) => {
    e.preventDefault();
    if (!selected) { toast.error("Select a service"); return; }
    if (!link.trim()) { toast.error("Enter a link"); return; }
    if (quantity < selected.min || quantity > selected.max) {
      toast.error(`Quantity must be ${selected.min}–${selected.max}`); return;
    }
    if ((user?.balance || 0) < charge) {
      toast.error(`Insufficient balance. Need ${money(charge)}`); return;
    }
    setSubmitting(true);
    try {
      await api.post("/orders", { service_id: serviceId, link, quantity: Number(quantity) });
      toast.success("Order placed successfully");
      await refresh();
      navigate("/orders");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally { setSubmitting(false); }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Place order</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">New order</h1>
      </div>

      <form onSubmit={submit} className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 border border-border bg-card rounded-sm p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-xs uppercase tracking-wider">Platform</Label>
              <Select value={platform} onValueChange={(v) => { setPlatform(v); setCategory(""); setServiceId(""); }}>
                <SelectTrigger className="rounded-sm h-11 mt-2" data-testid="order-platform-select"><SelectValue placeholder="Choose platform" /></SelectTrigger>
                <SelectContent>
                  {platforms.map((p) => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs uppercase tracking-wider">Category</Label>
              <Select value={category} onValueChange={(v) => { setCategory(v); setServiceId(""); }} disabled={!platform}>
                <SelectTrigger className="rounded-sm h-11 mt-2" data-testid="order-category-select"><SelectValue placeholder="Choose category" /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">Service</Label>
            <Select value={serviceId} onValueChange={(v) => { setServiceId(v); const s = services.find(x => x.service_id === v); if (s) setQuantity(s.min); }} disabled={!platform || !category}>
              <SelectTrigger className="rounded-sm h-11 mt-2" data-testid="order-service-select"><SelectValue placeholder="Choose service" /></SelectTrigger>
              <SelectContent>
                {filteredServices.map((s) => (
                  <SelectItem key={s.service_id} value={s.service_id}>
                    {s.name} — ${Number(s.rate).toFixed(2)}/1k
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">Target link</Label>
            <Input placeholder="https://instagram.com/yourhandle" required value={link} onChange={(e) => setLink(e.target.value)} className="rounded-sm h-11 mt-2" data-testid="order-link-input" />
          </div>

          <div>
            <Label className="text-xs uppercase tracking-wider">Quantity</Label>
            <Input type="number" required value={quantity} onChange={(e) => setQuantity(Number(e.target.value))} min={selected?.min} max={selected?.max} className="rounded-sm h-11 mt-2" data-testid="order-quantity-input" />
            {selected && <div className="text-[11px] text-muted-foreground mt-1.5 font-mono">Min {selected.min.toLocaleString()} · Max {selected.max.toLocaleString()}</div>}
          </div>
        </div>

        <div className="border border-border bg-foreground text-background rounded-sm p-6 h-fit md:sticky md:top-6">
          <div className="text-[10px] uppercase tracking-widest opacity-60">Summary</div>
          <div className="mt-6 space-y-4">
            <div>
              <div className="text-xs opacity-60">Service</div>
              <div className="text-sm mt-1 line-clamp-2" data-testid="order-summary-service">{selected?.name || "—"}</div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs opacity-60">Quantity</div>
                <div className="font-mono text-lg mt-1">{Number(quantity || 0).toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs opacity-60">Rate / 1k</div>
                <div className="font-mono text-lg mt-1">${Number(selected?.rate || 0).toFixed(2)}</div>
              </div>
            </div>
            <div className="border-t border-white/20 pt-4">
              <div className="text-xs opacity-60">Total charge</div>
              <div className="font-display text-5xl tracking-tighter mt-1 text-signal" data-testid="order-charge-total">{money(charge)}</div>
              <div className="text-xs opacity-60 mt-2">Balance: {money(user?.balance)}</div>
            </div>
            <Button type="submit" disabled={submitting || !selected} className="w-full rounded-sm bg-signal hover:bg-white hover:text-foreground text-white h-12" data-testid="order-submit-button">
              {submitting ? "Placing…" : <>Place order <ArrowRight className="w-4 h-4 ml-2" /></>}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
