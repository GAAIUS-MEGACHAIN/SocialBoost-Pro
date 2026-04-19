import React, { useState } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiError, money } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { CreditCard, Wallet } from "lucide-react";
import { FaPaypal, FaCcStripe } from "react-icons/fa6";

const PRESETS = [5, 10, 25, 50, 100, 250, 500, 1000];

export default function AddFunds() {
  const { user } = useAuth();
  const [amount, setAmount] = useState(25);
  const [loading, setLoading] = useState(false);

  const pay = async (provider) => {
    if (!PRESETS.includes(Number(amount))) {
      toast.error(`Please select one of: $${PRESETS.join(", $")}`);
      return;
    }
    setLoading(true);
    try {
      if (provider === "stripe") {
        const { data } = await api.post("/payments/stripe/checkout", {
          amount: Number(amount),
          origin_url: window.location.origin,
        });
        window.location.href = data.url;
      } else if (provider === "paypal") {
        const { data } = await api.post("/payments/paypal/checkout", {
          amount: Number(amount),
          origin_url: window.location.origin,
        });
        window.location.href = data.url;
      }
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-8">
      <div>
        <div className="text-xs uppercase tracking-widest text-muted-foreground">Wallet</div>
        <h1 className="font-display text-4xl md:text-5xl tracking-tighter mt-1">Add funds</h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 border border-border bg-card rounded-sm p-6 space-y-6">
          <div>
            <Label className="text-xs uppercase tracking-wider">Choose amount</Label>
            <div className="grid grid-cols-4 gap-2 mt-3">
              {PRESETS.map((v) => (
                <button
                  key={v}
                  onClick={() => setAmount(v)}
                  data-testid={`funds-preset-${v}`}
                  className={`h-12 border rounded-sm font-display text-lg tracking-tight ${
                    Number(amount) === v ? "bg-foreground text-background border-foreground" : "border-border hover:border-foreground"
                  }`}
                >
                  ${v}
                </button>
              ))}
            </div>
          </div>

          <Tabs defaultValue="stripe">
            <TabsList className="rounded-sm">
              <TabsTrigger value="stripe" data-testid="tab-stripe"><FaCcStripe className="w-4 h-4 mr-2" /> Stripe (Card)</TabsTrigger>
              <TabsTrigger value="paypal" data-testid="tab-paypal"><FaPaypal className="w-4 h-4 mr-2" /> PayPal</TabsTrigger>
            </TabsList>
            <TabsContent value="stripe" className="mt-5 space-y-4">
              <div className="text-sm text-muted-foreground">
                Secure Stripe Checkout. Visa, Mastercard, AmEx, Apple Pay, Google Pay, and more.
              </div>
              <Button onClick={() => pay("stripe")} disabled={loading} className="w-full rounded-sm h-12 bg-signal hover:bg-foreground text-white" data-testid="pay-stripe-button">
                <CreditCard className="w-4 h-4 mr-2" /> {loading ? "Redirecting…" : `Pay $${amount} with Stripe`}
              </Button>
            </TabsContent>
            <TabsContent value="paypal" className="mt-5 space-y-4">
              <div className="text-sm text-muted-foreground">
                You'll be redirected to PayPal to approve the payment. Funds are credited instantly on capture.
              </div>
              <Button onClick={() => pay("paypal")} disabled={loading} variant="outline" className="w-full rounded-sm h-12 border-foreground/30" data-testid="pay-paypal-button">
                <FaPaypal className="w-4 h-4 mr-2" /> {loading ? "…" : `Pay $${amount} with PayPal`}
              </Button>
            </TabsContent>
          </Tabs>
        </div>

        <div className="border border-border bg-foreground text-background rounded-sm p-6 h-fit">
          <div className="text-[10px] uppercase tracking-widest opacity-60">Current balance</div>
          <div className="font-display text-5xl tracking-tighter mt-6">{money(user?.balance)}</div>
          <div className="mt-6 text-xs opacity-60 flex items-center gap-2"><Wallet className="w-3.5 h-3.5" /> Instant credit after payment</div>
          <div className="mt-6 pt-6 border-t border-white/10 text-xs opacity-80 leading-relaxed">
            Payments are processed by Stripe — we never touch your card data. Balance tops up automatically once payment is confirmed.
          </div>
        </div>
      </div>
    </div>
  );
}
