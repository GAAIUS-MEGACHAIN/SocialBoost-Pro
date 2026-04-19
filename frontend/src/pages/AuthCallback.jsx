import React, { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";
import { useAuth } from "../contexts/AuthContext";
import { toast } from "sonner";

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setUser } = useAuth();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;

    const run = async () => {
      const hash = window.location.hash || "";
      const match = hash.match(/session_id=([^&]+)/);
      if (!match) {
        navigate("/login", { replace: true });
        return;
      }
      const sessionId = decodeURIComponent(match[1]);
      try {
        const { data } = await api.post("/auth/emergent/session", { session_id: sessionId });
        setUser(data);
        // Clean the hash from the URL
        window.history.replaceState(null, "", "/dashboard");
        navigate("/dashboard", { replace: true, state: { user: data } });
      } catch (e) {
        toast.error("Google login failed. Please try again.");
        navigate("/login", { replace: true });
      }
    };
    run();
  }, [navigate, setUser]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-sm text-muted-foreground">
        <div className="w-2 h-2 bg-signal animate-pulse" />
        Finalizing sign-in…
      </div>
    </div>
  );
}
