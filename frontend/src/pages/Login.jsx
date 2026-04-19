import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";
import { api, formatApiError } from "../lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { FcGoogle } from "react-icons/fc";
import { ArrowLeft, ArrowRight } from "lucide-react";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const { setUser } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/login", { email, password });
      setUser(data);
      toast.success(`Welcome back, ${data.name}`);
      navigate(["admin", "manager"].includes(data.role) ? "/admin" : "/dashboard");
    } catch (err) {
      toast.error(formatApiError(err.response?.data?.detail) || err.message);
    } finally {
      setLoading(false);
    }
  };

  const googleLogin = () => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    const redirectUrl = window.location.origin + "/dashboard";
    window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
  };

  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2 bg-background">
      <div className="relative hidden lg:block border-r border-border overflow-hidden">
        <img
          src="https://images.pexels.com/photos/34502061/pexels-photo-34502061.jpeg?auto=compress&cs=tinysrgb&dpr=2&h=900&w=900"
          alt="Minimalist workspace"
          className="absolute inset-0 w-full h-full object-cover saturate-0 contrast-110"
        />
        <div className="absolute inset-0 bg-background/20" />
        <div className="absolute top-8 left-8 flex items-center gap-2 font-display font-semibold text-xl">
          <span className="w-2.5 h-2.5 bg-signal" /> SocialBoost<span className="text-signal">.</span>Pro
        </div>
        <div className="absolute bottom-10 left-10 right-10 text-foreground">
          <div className="text-xs uppercase tracking-widest mb-3 text-muted-foreground">/ Command center</div>
          <div className="font-display text-4xl xl:text-5xl leading-[0.95] tracking-tighter">
            The panel <span className="text-signal">your agency</span> deserves.
          </div>
        </div>
      </div>
      <div className="flex items-center justify-center p-8 md:p-16">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground mb-10 hover:text-foreground">
            <ArrowLeft className="w-3 h-3" /> Back to site
          </Link>
          <h1 className="font-display text-4xl md:text-5xl tracking-tighter">Sign in</h1>
          <p className="mt-3 text-muted-foreground text-sm">Welcome back. Run your orders.</p>

          <Button type="button" variant="outline" onClick={googleLogin} className="w-full rounded-sm h-12 mt-8 border-foreground/20" data-testid="google-login-button">
            <FcGoogle className="w-5 h-5 mr-2" /> Continue with Google
          </Button>
          <div className="relative my-6">
            <div className="h-px bg-border" />
            <span className="absolute left-1/2 -translate-x-1/2 -top-2.5 bg-background px-2 text-[10px] uppercase tracking-widest text-muted-foreground">or with email</span>
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <Label htmlFor="email" className="text-xs uppercase tracking-wider">Email</Label>
              <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="rounded-sm h-11 mt-2" data-testid="login-email-input" />
            </div>
            <div>
              <Label htmlFor="password" className="text-xs uppercase tracking-wider">Password</Label>
              <Input id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="rounded-sm h-11 mt-2" data-testid="login-password-input" />
            </div>
            <Button type="submit" disabled={loading} className="w-full rounded-sm h-12 bg-signal hover:bg-foreground text-white mt-2" data-testid="login-submit-button">
              {loading ? "Signing in…" : <>Sign in <ArrowRight className="w-4 h-4 ml-1" /></>}
            </Button>
          </form>

          <div className="mt-8 text-xs text-muted-foreground font-mono leading-relaxed p-4 bg-muted/50 border border-border">
            <div className="uppercase tracking-widest mb-2 text-foreground">Demo access</div>
            admin@socialboost.pro · Admin@12345<br />
            demo@socialboost.pro · Demo@12345
          </div>

          <div className="mt-8 text-sm text-muted-foreground">
            No account yet? <Link to="/register" className="text-foreground underline hover:text-signal">Create one</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
