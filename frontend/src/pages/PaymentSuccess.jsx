import React, { useEffect, useRef, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { api, money } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2, Wallet } from "lucide-react";

export default function PaymentSuccess() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const { refresh } = useAuth();
  const [state, setState] = useState({ status: "pending", amount: null, msg: "Checking payment status…" });
  const attempts = useRef(0);
  const done = useRef(false);

  useEffect(() => {
    if (!sessionId) {
      setState({ status: "failed", msg: "No payment session found." });
      return;
    }
    const poll = async () => {
      if (done.current) return;
      attempts.current += 1;
      try {
        const { data } = await api.get(`/payments/stripe/status/${sessionId}`);
        if (data.status === "paid") {
          done.current = true;
          setState({ status: "paid", amount: (data.amount_total || 0) / 100, msg: "Payment confirmed" });
          await refresh();
          return;
        }
        if (data.status === "expired") {
          done.current = true;
          setState({ status: "failed", msg: "Payment session expired." });
          return;
        }
        if (attempts.current > 20) {
          done.current = true;
          setState({ status: "timeout", msg: "Taking longer than expected. Please check your wallet shortly." });
          return;
        }
        setTimeout(poll, 2000);
      } catch (e) {
        if (attempts.current > 20) {
          done.current = true;
          setState({ status: "failed", msg: "Could not verify payment." });
          return;
        }
        setTimeout(poll, 2000);
      }
    };
    poll();
  }, [sessionId, refresh]);

  const icon = state.status === "paid" ? CheckCircle2 : state.status === "failed" ? XCircle : Loader2;
  const color = state.status === "paid" ? "text-emerald-600" : state.status === "failed" ? "text-red-600" : "text-muted-foreground";

  return (
    <div className="max-w-xl mx-auto">
      <div className="border border-border bg-card rounded-sm p-10 text-center">
        {React.createElement(icon, { className: `w-16 h-16 mx-auto ${color} ${state.status === "pending" ? "animate-spin" : ""}` })}
        <h2 className="font-display text-4xl tracking-tighter mt-6">{state.status === "paid" ? "Funds added" : state.status === "failed" ? "Payment failed" : "Processing"}</h2>
        <p className="text-muted-foreground mt-3 text-sm" data-testid="payment-status-message">{state.msg}</p>
        {state.amount && <div className="mt-8 font-display text-6xl tracking-tighter text-signal">{money(state.amount)}</div>}
        <div className="mt-10 flex gap-3 justify-center">
          <Link to="/dashboard"><Button className="rounded-sm bg-foreground text-background hover:bg-signal" data-testid="back-to-dashboard-button">Back to dashboard</Button></Link>
          <Link to="/add-funds"><Button variant="outline" className="rounded-sm">Add more</Button></Link>
        </div>
      </div>
    </div>
  );
}
