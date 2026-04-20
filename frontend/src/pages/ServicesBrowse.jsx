import React, { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { api, money4 } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FaInstagram, FaFacebook, FaTiktok, FaXTwitter, FaYoutube, FaLinkedin, FaTelegram, FaSpotify, FaDiscord, FaTwitch, FaPinterest, FaSnapchat, FaWhatsapp, FaGlobe, FaMobile, FaAt } from "react-icons/fa6";
import { Search, Filter, Heart } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_META = {
  instagram: { label: "Instagram", icon: FaInstagram, color: "text-pink-600" },
  tiktok: { label: "TikTok", icon: FaTiktok, color: "text-black" },
  facebook: { label: "Facebook", icon: FaFacebook, color: "text-blue-700" },
  twitter: { label: "X / Twitter", icon: FaXTwitter, color: "text-black" },
  youtube: { label: "YouTube", icon: FaYoutube, color: "text-red-600" },
  linkedin: { label: "LinkedIn", icon: FaInstagram, color: "text-blue-900" },
  telegram: { label: "Telegram", icon: FaInstagram, color: "text-sky-600" },
  spotify: { label: "Spotify", icon: FaInstagram, color: "text-emerald-700" },
  discord: { label: "Discord", icon: FaInstagram, color: "text-indigo-700" },
  twitch: { label: "Twitch", icon: FaInstagram, color: "text-purple-700" },
  pinterest: { label: "Pinterest", icon: FaInstagram, color: "text-red-700" },
  snapchat: { label: "Snapchat", icon: FaInstagram, color: "text-yellow-500" },
  whatsapp: { label: "WhatsApp", icon: FaInstagram, color: "text-emerald-600" },
  threads: { label: "Threads", icon: FaInstagram, color: "text-black" },
  website: { label: "Website", icon: FaInstagram, color: "text-slate-700" },
  app: { label: "App", icon: FaInstagram, color: "text-slate-700" },
};

export default function ServicesBrowse() {
  const [services, setServices] = useState([]);
  const [platform, setPlatform] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [favorites, setFavorites] = useState([]);

  useEffect(() => {
    (async () => {
      try {
        const [s, f] = await Promise.all([api.get("/services"), api.get("/favorites").catch(() => ({ data: [] }))]);
        setServices(s.data);
        setFavorites(f.data.map((x) => x.service_id));
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  const toggleFavorite = async (service_id) => {
    try {
      if (favorites.includes(service_id)) {
        await api.delete(`/favorites/${service_id}`);
        setFavorites(favorites.filter((x) => x !== service_id));
      } else {
        await api.post("/favorites", { service_id });
        setFavorites([...favorites, service_id]);
        toast.success("Added to favorites");
      }
    } catch {}
  };

  const filtered = useMemo(() => {
    return services.filter((s) => {
      if (platform !== "all" && s.platform !== platform) return false;
      if (search && !`${s.name} ${s.category}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [services, platform, search]);

  const platforms = ["all", ...new Set(services.map((s) => s.platform))];

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground">Catalog</div>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Services</h1>
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…" className="pl-9 rounded-sm h-10" data-testid="services-search-input" />
          </div>
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar">
        {platforms.map((p) => {
          const meta = PLATFORM_META[p];
          return (
            <button
              key={p}
              onClick={() => setPlatform(p)}
              data-testid={`platform-filter-${p}`}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-sm border text-sm whitespace-nowrap transition-colors ${
                platform === p ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"
              }`}
            >
              {meta ? <meta.icon className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
              {p === "all" ? "All platforms" : meta?.label || p}
            </button>
          );
        })}
      </div>

      {/* Platform quick-access tiles */}
      {platform === "all" && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
          {[...new Set(services.map((s) => s.platform))].map((p) => {
            const meta = PLATFORM_META[p];
            const Icon = meta?.icon;
            const count = services.filter((s) => s.platform === p).length;
            return (
              <Link key={p} to={`/services/${p}`} className="border border-border bg-card rounded-sm p-4 hover:border-foreground hover:-translate-y-0.5 transition-all" data-testid={`platform-tile-${p}`}>
                <div className="flex items-center gap-2">
                  {Icon && <Icon className="w-5 h-5" />}
                  <div className="text-sm font-medium capitalize">{meta?.label || p}</div>
                </div>
                <div className="mt-2 font-mono text-[11px] text-muted-foreground">{count} services →</div>
              </Link>
            );
          })}
        </div>
      )}

      {loading ? (
        <div className="text-sm text-muted-foreground">Loading services…</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((s) => {
            const meta = PLATFORM_META[s.platform];
            const Icon = meta?.icon;
            return (
              <div key={s.service_id} className="border border-border bg-card rounded-sm p-6 hover:-translate-y-0.5 hover:border-foreground transition-all group">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    {Icon && <Icon className="w-4 h-4" />} {meta?.label || s.platform}
                    <span className="opacity-50">/</span>
                    <span>{s.category}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => toggleFavorite(s.service_id)} className="p-1 hover:text-signal" title="Favorite" data-testid={`favorite-${s.service_id}`}>
                      <Heart className={`w-4 h-4 ${favorites.includes(s.service_id) ? "fill-signal text-signal" : "text-muted-foreground"}`} />
                    </button>
                    <span className="font-mono text-[10px] text-muted-foreground">{s.type}</span>
                  </div>
                </div>
                <div className="font-display text-xl mt-6 tracking-tight leading-tight">{s.name}</div>
                {s.description && <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{s.description}</div>}
                <div className="flex items-end justify-between mt-8">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Rate / 1000</div>
                    <div className="font-display text-2xl tracking-tighter">${Number(s.rate).toFixed(2)}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Range</div>
                    <div className="text-sm font-mono">{s.min.toLocaleString()}–{s.max.toLocaleString()}</div>
                  </div>
                </div>
                <Link to={`/new-order?service=${s.service_id}`} className="block mt-6">
                  <Button className="w-full rounded-sm bg-foreground text-background hover:bg-signal h-10" data-testid={`order-service-${s.service_id}`}>Order now</Button>
                </Link>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-sm text-muted-foreground text-center py-12 border border-border rounded-sm">
              No services match your filters.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
