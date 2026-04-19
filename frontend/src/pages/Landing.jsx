import React from "react";
import { Link } from "react-router-dom";
import { FaInstagram, FaFacebook, FaTiktok, FaXTwitter, FaYoutube } from "react-icons/fa6";
import { ArrowRight, Shield, Zap, BarChart3, Layers3, Globe2, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";

const Platforms = [
  { icon: FaInstagram, label: "Instagram" },
  { icon: FaTiktok, label: "TikTok" },
  { icon: FaFacebook, label: "Facebook" },
  { icon: FaXTwitter, label: "X / Twitter" },
  { icon: FaYoutube, label: "YouTube" },
];

function Ticker() {
  const items = [
    "INSTAGRAM GROWTH",
    "TIKTOK VIRALITY",
    "X AMPLIFICATION",
    "FACEBOOK REACH",
    "YOUTUBE VIEWS",
    "COMMENTS · LIKES · FOLLOWERS",
  ];
  const row = [...items, ...items];
  return (
    <div className="border-y border-border bg-foreground text-background py-5 overflow-hidden ticker-mask">
      <div className="flex gap-16 whitespace-nowrap animate-marquee font-display text-2xl md:text-3xl tracking-tight">
        {row.map((t, i) => (
          <span key={i} className="inline-flex items-center gap-6">
            {t}
            <span className="w-2 h-2 bg-signal inline-block" />
          </span>
        ))}
      </div>
    </div>
  );
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground font-sans">
      {/* Nav */}
      <header className="border-b border-border sticky top-0 bg-background/90 backdrop-blur z-40">
        <div className="mx-auto max-w-7xl px-6 md:px-10 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2 font-display font-semibold text-xl tracking-tight" data-testid="nav-logo">
            <span className="w-2.5 h-2.5 bg-signal" />
            SocialBoost<span className="text-signal">.</span>Pro
          </Link>
          <nav className="hidden md:flex items-center gap-8 text-sm">
            <a href="#services" className="hover:text-signal transition-colors">Services</a>
            <a href="#pricing" className="hover:text-signal transition-colors">Pricing</a>
            <a href="#how" className="hover:text-signal transition-colors">How it works</a>
            <a href="#faq" className="hover:text-signal transition-colors">FAQ</a>
          </nav>
          <div className="flex items-center gap-3">
            <Link to="/login" className="text-sm hover:underline" data-testid="nav-login-link">Sign in</Link>
            <Link to="/register" data-testid="nav-register-link">
              <Button className="rounded-sm bg-signal hover:bg-foreground text-white h-9 px-4">Get Started <ArrowRight className="w-4 h-4 ml-1" /></Button>
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="relative">
        <div className="mx-auto max-w-7xl px-6 md:px-10 pt-16 md:pt-24 pb-10">
          <div className="grid grid-cols-12 gap-8">
            <div className="col-span-12 lg:col-span-8">
              <div className="flex items-center gap-3 mb-8">
                <span className="inline-flex items-center gap-2 text-xs uppercase tracking-[0.22em] border border-border rounded-full px-3 py-1 font-medium">
                  <span className="w-1.5 h-1.5 bg-signal rounded-full animate-pulse" /> Command center for SMM
                </span>
              </div>
              <h1 className="hero-headline font-display">
                Grow every feed.
                <br />
                <span className="text-signal">One panel.</span>
              </h1>
              <p className="text-lg md:text-xl mt-8 max-w-2xl text-muted-foreground">
                Order Instagram followers, TikTok views, X amplifications and Facebook reach from a single, scalable dashboard — wired to real suppliers, priced for resale.
              </p>
              <div className="flex flex-wrap gap-4 mt-10">
                <Link to="/register" data-testid="hero-cta-register">
                  <Button className="rounded-sm bg-signal hover:bg-foreground text-white h-14 px-8 text-base">Open your panel <ArrowRight className="ml-2 w-5 h-5" /></Button>
                </Link>
                <a href="#services">
                  <Button variant="outline" className="rounded-sm h-14 px-8 text-base border-foreground/30 hover:border-foreground">Explore services</Button>
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-x-10 gap-y-4 mt-12 text-sm text-muted-foreground">
                <div><span className="font-display text-foreground text-2xl">50M+</span> Orders delivered</div>
                <div><span className="font-display text-foreground text-2xl">9</span> Categories</div>
                <div><span className="font-display text-foreground text-2xl">5</span> Platforms</div>
                <div><span className="font-display text-foreground text-2xl">24/7</span> Live sync</div>
              </div>
            </div>
            <div className="col-span-12 lg:col-span-4">
              <div className="border border-border bg-card rounded-sm p-6 h-full relative overflow-hidden">
                <div className="text-xs uppercase tracking-widest text-muted-foreground">Live ticker</div>
                <div className="mt-4 font-mono text-[13px] space-y-2">
                  {[
                    ["ORD-9F8D", "+2,340", "INSTAGRAM", "PROCESSING"],
                    ["ORD-7C21", "+18,900", "TIKTOK", "COMPLETED"],
                    ["ORD-4B77", "+580", "X", "IN PROGRESS"],
                    ["ORD-AE31", "+7,210", "YOUTUBE", "PROCESSING"],
                    ["ORD-11D0", "+950", "FACEBOOK", "PENDING"],
                  ].map(([id, qty, plat, stat]) => (
                    <div key={id} className="flex justify-between border-b border-border py-1.5">
                      <span className="text-muted-foreground">{id}</span>
                      <span>{qty}</span>
                      <span className="text-muted-foreground">{plat}</span>
                      <span className={stat === "COMPLETED" ? "text-emerald-600" : stat === "PROCESSING" ? "text-indigo-600" : stat === "PENDING" ? "text-amber-600" : "text-blue-600"}>{stat}</span>
                    </div>
                  ))}
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <div className="text-xs uppercase tracking-widest text-muted-foreground">System load</div>
                  <div className="font-display text-signal text-4xl">98%</div>
                </div>
                <div className="mt-2 h-1 bg-muted overflow-hidden">
                  <div className="h-full w-[98%] bg-signal" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <Ticker />
      </section>

      {/* SERVICES bento */}
      <section id="services" className="mx-auto max-w-7xl px-6 md:px-10 py-24 md:py-32">
        <div className="grid grid-cols-12 gap-8 items-end mb-12">
          <div className="col-span-12 md:col-span-7">
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">— 01 / Catalog</div>
            <h2 className="font-display text-5xl md:text-6xl font-semibold leading-none tracking-tighter">Every platform.<br /><span className="text-signal">Every action.</span></h2>
          </div>
          <div className="col-span-12 md:col-span-5 text-muted-foreground">
            Plug multiple suppliers into a generic, standard SMM API layer and let clients order across Instagram, TikTok, Facebook, X and YouTube — with automatic supplier routing.
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          {Platforms.map((p, idx) => {
            const Icon = p.icon;
            const large = idx === 0;
            return (
              <div
                key={p.label}
                className={`border border-border rounded-sm p-8 bg-card relative overflow-hidden group hover:-translate-y-0.5 transition-all ${large ? "md:col-span-5 md:row-span-2" : "md:col-span-4"}`}
              >
                <div className="flex items-start justify-between">
                  <Icon className="text-4xl" />
                  <span className="font-mono text-[11px] text-muted-foreground">0{idx + 1}</span>
                </div>
                <div className="mt-14 font-display text-3xl md:text-4xl tracking-tight">{p.label}</div>
                <div className="mt-3 text-sm text-muted-foreground">Followers · Likes · Views · Comments</div>
                <div className="absolute bottom-0 left-0 h-0.5 w-0 bg-signal group-hover:w-full transition-all duration-500" />
              </div>
            );
          })}
          <div className="md:col-span-3 border border-foreground bg-foreground text-background rounded-sm p-8 flex flex-col justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest opacity-60">/ Admin</div>
              <div className="font-display text-3xl mt-14">Any API.<br />Any supplier.</div>
            </div>
            <div className="text-sm opacity-80 mt-8">Drop in an API URL + key. We import services automatically.</div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="how" className="border-y border-border bg-muted/40">
        <div className="mx-auto max-w-7xl px-6 md:px-10 py-20 grid grid-cols-1 md:grid-cols-4 gap-10">
          {[
            { icon: Zap, t: "Real-time sync", d: "Orders pull status directly from supplier endpoints — no stale data." },
            { icon: Shield, t: "Custom roles", d: "Create unlimited roles beyond Admin / Manager / User with granular permissions." },
            { icon: CreditCard, t: "Stripe + PayPal", d: "Accept cards via Stripe and PayPal — balances credit automatically." },
            { icon: Layers3, t: "Modular suppliers", d: "Generic standard SMM API adapter — add a new panel in 30 seconds." },
          ].map(({ icon: Icon, t, d }) => (
            <div key={t}>
              <Icon className="w-6 h-6 mb-5" />
              <div className="font-display text-xl">{t}</div>
              <div className="mt-2 text-sm text-muted-foreground leading-relaxed">{d}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="mx-auto max-w-7xl px-6 md:px-10 py-24 md:py-32">
        <div className="text-xs uppercase tracking-widest text-muted-foreground mb-4">— 02 / Wallet</div>
        <h2 className="font-display text-5xl md:text-6xl font-semibold tracking-tighter">Prepaid. <span className="text-signal">Transparent.</span></h2>
        <p className="mt-6 max-w-2xl text-muted-foreground">Top up your wallet once, spend it across any service. No hidden fees, no subscriptions, no surprises.</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          {[
            { amt: "$25", t: "Starter", d: "Test the waters across a few services", feat: ["Access to 16+ services", "All 5 platforms", "Email support"] },
            { amt: "$100", t: "Agency", d: "For creators & social teams scaling fast", feat: ["Priority order routing", "Bulk-order API", "Live chat support"], hot: true },
            { amt: "$500+", t: "Reseller", d: "White-label profit margins for panels", feat: ["Custom supplier markup", "Sub-accounts & roles", "Dedicated account mgr"] },
          ].map((p) => (
            <div key={p.t} className={`border rounded-sm p-8 bg-card flex flex-col ${p.hot ? "border-foreground" : "border-border"}`}>
              {p.hot && <div className="text-[11px] font-mono uppercase tracking-widest text-signal mb-4">/ Most popular</div>}
              <div className="font-display text-xl">{p.t}</div>
              <div className="font-display text-5xl mt-6 tracking-tighter">{p.amt}</div>
              <div className="mt-2 text-sm text-muted-foreground">{p.d}</div>
              <ul className="mt-8 space-y-2 text-sm">
                {p.feat.map((f) => <li key={f} className="flex items-center gap-2"><span className="w-1 h-1 bg-signal" /> {f}</li>)}
              </ul>
              <Link to="/register" className="mt-8">
                <Button className={`w-full rounded-sm h-12 ${p.hot ? "bg-signal text-white hover:bg-foreground" : "bg-foreground text-background hover:bg-signal"}`}>Start now</Button>
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-7xl px-6 md:px-10 pb-24">
        <div className="border border-foreground bg-foreground text-background rounded-sm p-10 md:p-16 relative overflow-hidden grain">
          <div className="grid grid-cols-12 gap-8 items-end">
            <div className="col-span-12 md:col-span-8">
              <div className="text-xs uppercase tracking-widest opacity-60">Ready to ship</div>
              <div className="font-display text-5xl md:text-7xl tracking-tighter mt-4">Command your growth.<br /><span className="text-signal">Launch the panel.</span></div>
            </div>
            <div className="col-span-12 md:col-span-4 flex md:justify-end">
              <Link to="/register" data-testid="cta-bottom-register">
                <Button className="rounded-sm bg-signal hover:bg-white hover:text-foreground text-white h-14 px-8 text-base">Create free account <ArrowRight className="ml-2 w-5 h-5" /></Button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-7xl px-6 md:px-10 py-10 flex flex-col md:flex-row gap-6 justify-between text-sm">
          <div className="flex items-center gap-2 font-display font-semibold">
            <span className="w-2 h-2 bg-signal" /> SocialBoost.Pro
          </div>
          <div className="text-muted-foreground flex flex-wrap gap-6">
            <span className="inline-flex items-center gap-1"><Globe2 className="w-3.5 h-3.5" /> 5 platforms</span>
            <span>© {new Date().getFullYear()} SocialBoost Pro</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
