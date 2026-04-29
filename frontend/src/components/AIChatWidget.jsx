import React, { useEffect, useRef, useState } from "react";
import { Sparkles, Send, X, Bot, Loader2 } from "lucide-react";
import { api, formatApiError } from "../lib/api";

/**
 * Floating bottom-right AI chat widget.
 * Strictly additive — overlays the page; does not modify any existing layout.
 *
 * Props:
 *   - context: "landing" | "dashboard"  (changes greeting + suggestion chips)
 */
export default function AIChatWidget({ context = "dashboard" }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState(() => [
    {
      role: "assistant",
      content:
        context === "landing"
          ? "Hi! I'm Boost — ask me anything about our services, pricing, or how to grow on Instagram, TikTok, YouTube, and more."
          : "Hi! I'm Boost. Ask me about your orders, top platforms, or what to try next.",
    },
  ]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const scrollRef = useRef(null);

  const suggestions =
    context === "landing"
      ? [
          "What services do you offer?",
          "How does pricing work?",
          "Is there a reseller API?",
        ]
      : [
          "Summarize my recent orders",
          "Which platform should I focus on?",
          "How do I top up my wallet?",
        ];

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, open]);

  const send = async (text) => {
    const t = (text ?? input).trim();
    if (!t || busy) return;
    const next = [...messages, { role: "user", content: t }];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const { data } = await api.post("/ai/chat", {
        messages: next.filter((m) => m.role !== "system"),
        session_id: sessionId,
      });
      setSessionId(data.session_id);
      setMessages((m) => [...m, { role: "assistant", content: data.reply }]);
    } catch (e) {
      const msg = formatApiError(e?.response?.data?.detail) || "AI is unavailable.";
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* Floating launcher */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          data-testid="ai-chat-launcher"
          className="fixed bottom-20 right-6 z-[60] group"
          aria-label="Open AI chat"
        >
          <span className="absolute inset-0 rounded-full bg-signal/40 blur-xl group-hover:bg-signal/60 transition" />
          <span className="relative flex items-center gap-2 bg-foreground text-background rounded-full pl-3 pr-4 py-3 shadow-lg shadow-black/20 border border-foreground hover:bg-signal transition-all">
            <span className="w-7 h-7 rounded-full bg-signal flex items-center justify-center">
              <Sparkles className="w-4 h-4 text-white" />
            </span>
            <span className="font-display tracking-tight text-sm">Ask Boost AI</span>
          </span>
        </button>
      )}

      {/* Panel */}
      {open && (
        <div
          data-testid="ai-chat-panel"
          className="fixed bottom-20 right-6 z-[60] w-[min(380px,calc(100vw-2rem))] h-[min(560px,calc(100vh-7rem))] bg-card border border-border rounded-sm shadow-2xl flex flex-col overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 bg-foreground text-background border-b border-foreground">
            <div className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-full bg-signal flex items-center justify-center">
                <Bot className="w-4 h-4" />
              </span>
              <div className="leading-tight">
                <div className="font-display text-sm tracking-tight">Boost AI</div>
                <div className="text-[10px] uppercase tracking-widest opacity-60 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-signal rounded-full animate-pulse" /> Online
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              data-testid="ai-chat-close"
              className="opacity-70 hover:opacity-100"
              aria-label="Close chat"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-background">
            {messages.map((m, i) => (
              <div
                key={i}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                data-testid={`ai-msg-${m.role}-${i}`}
              >
                <div
                  className={`max-w-[85%] text-sm leading-relaxed rounded-sm px-3 py-2 whitespace-pre-wrap ${
                    m.role === "user"
                      ? "bg-foreground text-background"
                      : "bg-muted text-foreground border border-border"
                  }`}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {busy && (
              <div className="flex justify-start" data-testid="ai-typing">
                <div className="bg-muted text-foreground border border-border rounded-sm px-3 py-2 text-sm flex items-center gap-2">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" /> thinking…
                </div>
              </div>
            )}
          </div>

          {/* Suggestions */}
          {messages.length <= 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-2 bg-background">
              {suggestions.map((s) => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  data-testid="ai-suggestion"
                  className="text-[11px] border border-border rounded-full px-3 py-1 hover:border-signal hover:text-signal transition"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
            className="border-t border-border bg-card px-3 py-3 flex items-center gap-2"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything…"
              data-testid="ai-chat-input"
              className="flex-1 bg-transparent outline-none text-sm px-2 py-2 border border-border rounded-sm focus:border-signal"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy || !input.trim()}
              data-testid="ai-chat-send"
              className="bg-signal text-white rounded-sm w-9 h-9 flex items-center justify-center disabled:opacity-40 hover:bg-foreground transition"
              aria-label="Send"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
