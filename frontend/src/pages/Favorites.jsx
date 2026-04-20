import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Heart, HeartOff } from "lucide-react";
import { toast } from "sonner";

export default function Favorites() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try { const { data } = await api.get("/favorites"); setItems(data); } catch {}
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const remove = async (sid) => {
    try { await api.delete(`/favorites/${sid}`); toast.success("Removed"); load(); } catch {}
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Quick order</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Favorites</h1>
      </div>
      {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : items.length === 0 ? (
        <div className="border border-border rounded-sm p-10 text-center text-sm text-muted-foreground">
          <Heart className="w-6 h-6 mx-auto mb-3 opacity-50" />
          Star services from the Services catalog to add them here.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((s) => (
            <div key={s.service_id} className="border border-border bg-card rounded-sm p-6">
              <div className="flex items-start justify-between">
                <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{s.platform} / {s.category}</div>
                <button onClick={() => remove(s.service_id)} className="p-1 hover:text-red-600" title="Remove"><HeartOff className="w-4 h-4" /></button>
              </div>
              <div className="font-display text-xl tracking-tight mt-4">{s.name}</div>
              <div className="flex items-end justify-between mt-6">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Rate / 1000</div>
                  <div className="font-display text-2xl tracking-tighter">${Number(s.rate).toFixed(2)}</div>
                </div>
                <Link to={`/new-order?service=${s.service_id}`}>
                  <Button size="sm" className="rounded-sm bg-foreground text-background hover:bg-signal">Order now</Button>
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
