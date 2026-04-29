import React, { useEffect, useState } from "react";
import { Sparkles, TrendingUp, Lightbulb, RefreshCw } from "lucide-react";
import { api } from "../lib/api";

/**
 * Additive AI Insights card. Calls /api/ai/insights and renders a compact
 * 3-bullet summary + recommendation. No-op gracefully if AI is unavailable.
 */
export default function AIInsightsCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(null);

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const { data } = await api.get("/ai/insights");
      setData(data);
    } catch (e) {
      setErr(e?.response?.data?.detail || "AI insights unavailable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div
      className="border border-border bg-card rounded-sm p-6 relative overflow-hidden"
      data-testid="ai-insights-card"
    >
      <div className="absolute -top-16 -right-16 w-48 h-48 rounded-full bg-signal/10 blur-3xl pointer-events-none" />
      <div className="flex items-start justify-between relative">
        <div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="w-3 h-3 text-signal" /> AI Insights
          </div>
          <div className="font-display text-2xl tracking-tight mt-1">
            {loading
              ? "Analyzing your activity…"
              : data?.ai?.headline || "Your activity snapshot"}
          </div>
        </div>
        <button
          onClick={load}
          disabled={loading}
          data-testid="ai-insights-refresh"
          className="text-[10px] uppercase tracking-widest border border-border rounded-sm px-2 py-1 hover:border-signal hover:text-signal disabled:opacity-50 flex items-center gap-1"
        >
          <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} /> Refresh
        </button>
      </div>

      {err ? (
        <div className="mt-4 text-sm text-muted-foreground" data-testid="ai-insights-error">
          {String(err)}
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 md:grid-cols-3 gap-3 relative">
          {(data?.ai?.highlights || ["", "", ""]).slice(0, 3).map((h, i) => (
            <div
              key={i}
              className="border border-border rounded-sm p-3 bg-background/60"
              data-testid={`ai-highlight-${i}`}
            >
              <TrendingUp className="w-3.5 h-3.5 text-signal mb-2" />
              <div className="text-sm leading-relaxed">
                {loading ? <span className="inline-block w-32 h-3 bg-muted rounded animate-pulse" /> : h}
              </div>
            </div>
          ))}
        </div>
      )}

      {!loading && !err && data?.ai?.recommendation && (
        <div
          className="mt-4 flex items-start gap-2 text-sm text-foreground bg-signal/5 border border-signal/20 rounded-sm px-3 py-2"
          data-testid="ai-recommendation"
        >
          <Lightbulb className="w-4 h-4 text-signal mt-0.5 flex-shrink-0" />
          <span>{data.ai.recommendation}</span>
        </div>
      )}
    </div>
  );
}
