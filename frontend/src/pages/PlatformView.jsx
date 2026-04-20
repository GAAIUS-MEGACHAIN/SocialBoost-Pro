import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { api, money, shortDate } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FaInstagram, FaFacebook, FaTiktok, FaXTwitter, FaYoutube, FaLinkedin, FaTelegram, FaSpotify, FaDiscord, FaTwitch, FaPinterest, FaSnapchat, FaWhatsapp, FaGlobe, FaMobile, FaAt } from "react-icons/fa6";
import { Heart, Search, ArrowRight, TrendingUp, ShoppingCart, Clock, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const PLATFORM_META = {
  instagram: { label: "Instagram", icon: FaInstagram, gradient: "from-fuchsia-600 to-pink-500", handle: "@username" },
  tiktok:    { label: "TikTok",    icon: FaTiktok,    gradient: "from-foreground to-foreground", handle: "@username" },
  facebook:  { label: "Facebook",  icon: FaFacebook,  gradient: "from-blue-700 to-blue-600", handle: "page URL" },
  twitter:   { label: "X (Twitter)", icon: FaXTwitter, gradient: "from-foreground to-foreground", handle: "@username" },
  youtube:   { label: "YouTube",   icon: FaYoutube,   gradient: "from-red-700 to-red-500", handle: "channel URL" },
  linkedin:  { label: "LinkedIn",  icon: FaLinkedin,  gradient: "from-sky-800 to-sky-600", handle: "profile URL" },
  telegram:  { label: "Telegram",  icon: FaTelegram,  gradient: "from-sky-600 to-sky-400", handle: "channel link" },
  spotify:   { label: "Spotify",   icon: FaSpotify,   gradient: "from-emerald-700 to-emerald-500", handle: "track/artist URL" },
  discord:   { label: "Discord",   icon: FaDiscord,   gradient: "from-indigo-700 to-indigo-500", handle: "invite link" },
  twitch:    { label: "Twitch",    icon: FaTwitch,    gradient: "from-purple-700 to-purple-500", handle: "channel URL" },
  pinterest: { label: "Pinterest", icon: FaPinterest, gradient: "from-red-700 to-red-500", handle: "profile URL" },
  snapchat:  { label: "Snapchat",  icon: FaSnapchat,  gradient: "from-yellow-500 to-yellow-400", handle: "@username" },
  whatsapp:  { label: "WhatsApp",  icon: FaWhatsapp,  gradient: "from-emerald-700 to-emerald-500", handle: "channel link" },
  threads:   { label: "Threads",   icon: FaAt,        gradient: "from-foreground to-foreground", handle: "@username" },
  website:   { label: "Website",   icon: FaGlobe,     gradient: "from-slate-800 to-slate-600", handle: "https://..." },
  app:       { label: "App",       icon: FaMobile,    gradient: "from-slate-800 to-slate-600", handle: "store URL" },
};

export default function PlatformView() {
  const { platform } = useParams();
  const navigate = useNavigate();
  const meta = PLATFORM_META[platform] || { label: platform, icon: FaGlobe, gradient: "from-foreground to-foreground", handle: "link" };
  const Icon = meta.icon;

  const [services, setServices] = useState([]);
  const [orders, setOrders] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [category, setCategory] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, o, f] = await Promise.all([
          api.get(`/services?platform=${platform}`),
          api.get("/orders").catch(() => ({ data: [] })),
          api.get("/favorites").catch(() => ({ data: [] })),
        ]);
        setServices(s.data);
        setOrders((o.data || []).filter((x) => x.platform === platform));
        setFavorites(f.data.map((x) => x.service_id));
      } catch {} finally { setLoading(false); }
    })();
  }, [platform]);

  const categories = useMemo(() => ["all", ...new Set(services.map((s) => s.category))], [services]);

  const filtered = useMemo(() => services.filter((s) => {
    if (category !== "all" && s.category !== category) return false;
    if (search && !`${s.name} ${s.type}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [services, category, search]);

  const stats = useMemo(() => {
    const active = orders.filter((o) => ["Pending", "In Progress", "Processing"].includes(o.status)).length;
    const completed = orders.filter((o) => o.status === "Completed").length;
    const spend = orders.reduce((a, o) => a + Number(o.charge || 0), 0);
    return { total: orders.length, active, completed, spend };
  }, [orders]);

  const topServices = useMemo(() => {
    const by = {};
    orders.forEach((o) => {
      by[o.service_name] = by[o.service_name] || { name: o.service_name, count: 0, spend: 0 };
      by[o.service_name].count += 1;
      by[o.service_name].spend += Number(o.charge || 0);
    });
    return Object.values(by).sort((a, b) => b.spend - a.spend).slice(0, 5);
  }, [orders]);

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

  return (
    <div className="space-y-8">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-sm border border-border bg-gradient-to-br ${meta.gradient} text-white p-8 md:p-12`}>
        <div className="absolute top-6 right-6 opacity-20"><Icon className="text-[12rem]" /></div>
        <div className="relative">
          <div className="text-[11px] uppercase tracking-widest opacity-80">/ Platform</div>
          <h1 className="font-display text-5xl md:text-7xl tracking-tighter mt-2 flex items-center gap-5">
            <Icon className="text-5xl md:text-6xl" /> {meta.label}
          </h1>
          <p className="mt-4 max-w-xl text-white/80 text-sm md:text-base">
            {filtered.length} services across {categories.length - 1} categories. Manage orders, track delivery in real-time, and request refills when needed.
          </p>
          <div className="flex flex-wrap gap-3 mt-6">
            <Link to={`/new-order?platform=${platform}`}><Button className="rounded-sm bg-white text-foreground hover:bg-signal hover:text-white h-11 px-6" data-testid={`platform-new-order-${platform}`}>Place {meta.label} order <ArrowRight className="w-4 h-4 ml-2" /></Button></Link>
            <Link to={`/orders?platform=${platform}`}><Button variant="outline" className="rounded-sm bg-transparent border-white/40 text-white hover:bg-white hover:text-foreground h-11 px-6">View my orders</Button></Link>
          </div>
        </div>
      </div>

      {/* Analytics strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { l: "My orders", v: stats.total, icon: ShoppingCart },
          { l: "Active", v: stats.active, icon: Clock },
          { l: "Completed", v: stats.completed, icon: CheckCircle2 },
          { l: `Spent on ${meta.label}`, v: money(stats.spend), icon: TrendingUp, accent: true },
        ].map((s, i) => {
          const SIcon = s.icon;
          return (
            <div key={i} className={`border rounded-sm p-5 ${s.accent ? "bg-foreground text-background border-foreground" : "border-border bg-card"}`}>
              <div className="flex items-start justify-between">
                <div className={`text-[10px] uppercase tracking-widest ${s.accent ? "opacity-60" : "text-muted-foreground"}`}>{s.l}</div>
                <SIcon className="w-4 h-4 opacity-60" />
              </div>
              <div className="font-display text-3xl tracking-tighter mt-5">{s.v}</div>
            </div>
          );
        })}
      </div>

      {/* Top services + recent orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 border border-border bg-card rounded-sm">
          <div className="px-5 py-3 border-b border-border flex items-center justify-between">
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground">/ Recent {meta.label} orders</div>
            <Link to={`/orders?platform=${platform}`} className="text-xs underline underline-offset-4 hover:text-signal">View all</Link>
          </div>
          {orders.length === 0 ? (
            <div className="p-8 text-center text-sm text-muted-foreground">No orders yet for this platform.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                  <tr><th className="px-5 py-2">Order</th><th className="px-5 py-2">Service</th><th className="px-5 py-2">Qty</th><th className="px-5 py-2">Charge</th><th className="px-5 py-2">Status</th></tr>
                </thead>
                <tbody>
                  {orders.slice(0, 6).map((o) => (
                    <tr key={o.order_id} className="border-b border-border">
                      <td className="px-5 py-2 font-mono text-[11px]">{o.order_id.slice(-8).toUpperCase()}</td>
                      <td className="px-5 py-2 max-w-[200px] truncate">{o.service_name}</td>
                      <td className="px-5 py-2 font-mono">{o.quantity.toLocaleString()}</td>
                      <td className="px-5 py-2">{money(o.charge)}</td>
                      <td className="px-5 py-2 text-xs">{o.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="border border-border bg-card rounded-sm">
          <div className="px-5 py-3 border-b border-border text-[10px] uppercase tracking-widest text-muted-foreground">/ Your top services</div>
          {topServices.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground text-center">—</div>
          ) : (
            <ul className="divide-y divide-border">
              {topServices.map((t, i) => (
                <li key={i} className="px-5 py-3">
                  <div className="text-sm font-medium truncate">{t.name}</div>
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>{t.count} orders</span>
                    <span className="font-mono">{money(t.spend)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Services catalog for this platform */}
      <div>
        <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground">Catalog</div>
            <div className="font-display text-3xl tracking-tighter">{meta.label} services</div>
          </div>
          <div className="relative w-full md:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search services…" className="pl-9 rounded-sm h-10" data-testid={`platform-${platform}-search`} />
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4">
          {categories.map((c) => (
            <button key={c} onClick={() => setCategory(c)} data-testid={`platform-${platform}-cat-${c}`} className={`inline-flex items-center px-4 py-2 rounded-sm border text-sm whitespace-nowrap ${category === c ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"}`}>
              {c === "all" ? "All categories" : c}
            </button>
          ))}
        </div>
        {loading ? (
          <div className="text-sm text-muted-foreground">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="border border-border rounded-sm p-10 text-center text-sm text-muted-foreground">No services for this filter.</div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((s) => (
              <div key={s.service_id} className="border border-border bg-card rounded-sm p-6 hover:-translate-y-0.5 hover:border-foreground transition-all">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
                    <Icon className="w-4 h-4" /> {s.category}
                  </div>
                  <button onClick={() => toggleFavorite(s.service_id)} className="p-1 hover:text-signal" title="Favorite" data-testid={`favorite-${s.service_id}`}>
                    <Heart className={`w-4 h-4 ${favorites.includes(s.service_id) ? "fill-signal text-signal" : "text-muted-foreground"}`} />
                  </button>
                </div>
                <div className="font-display text-lg tracking-tight mt-4 leading-tight">{s.name}</div>
                {s.description && <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{s.description}</div>}
                <div className="flex items-end justify-between mt-6">
                  <div>
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Rate / 1000</div>
                    <div className="font-display text-2xl tracking-tighter">${Number(s.rate).toFixed(2)}</div>
                  </div>
                  <div className="text-right text-xs font-mono">{s.min.toLocaleString()}–{s.max.toLocaleString()}</div>
                </div>
                <Link to={`/new-order?service=${s.service_id}`} className="block mt-5">
                  <Button className="w-full rounded-sm bg-foreground text-background hover:bg-signal h-10" data-testid={`platform-order-${s.service_id}`}>Order now</Button>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
