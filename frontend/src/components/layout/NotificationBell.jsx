import React, { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, shortDate } from "../../lib/api";
import { Bell } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

export default function NotificationBell() {
  const [items, setItems] = useState([]);
  const [unread, setUnread] = useState(0);
  const timer = useRef(null);

  const load = async () => {
    try {
      const { data } = await api.get("/notifications");
      setItems(data.notifications || []);
      setUnread(data.unread || 0);
    } catch {}
  };

  useEffect(() => {
    load();
    timer.current = setInterval(load, 30000);
    return () => clearInterval(timer.current);
  }, []);

  const markAll = async () => {
    await api.post("/notifications/read-all");
    load();
  };

  const markOne = async (notif_id) => {
    await api.post(`/notifications/${notif_id}/read`);
    load();
  };

  const typeBadge = (t) => {
    const map = {
      order: "bg-blue-50 text-blue-800 border-blue-200",
      payment: "bg-emerald-50 text-emerald-800 border-emerald-200",
      ticket: "bg-amber-50 text-amber-800 border-amber-200",
    };
    return map[t] || "bg-muted";
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="relative p-2 border border-border hover:border-foreground rounded-sm transition-colors" data-testid="notification-bell">
          <Bell className="w-4 h-4" />
          {unread > 0 && (
            <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-signal text-white text-[10px] font-mono rounded-full flex items-center justify-center" data-testid="notification-unread-count">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-96 max-h-[520px] overflow-y-auto rounded-sm p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="font-display text-lg tracking-tight">Notifications</div>
          {unread > 0 && (
            <button onClick={markAll} className="text-xs text-muted-foreground hover:text-foreground underline" data-testid="notification-mark-all-read">Mark all read</button>
          )}
        </div>
        {items.length === 0 ? (
          <div className="p-8 text-sm text-muted-foreground text-center">You're all caught up.</div>
        ) : (
          <ul className="divide-y divide-border">
            {items.map((n) => (
              <li key={n.notif_id} className={`p-4 hover:bg-muted/40 ${n.read ? "opacity-70" : ""}`} onClick={() => !n.read && markOne(n.notif_id)}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] border px-2 py-0.5 rounded-full uppercase tracking-widest ${typeBadge(n.type)}`}>{n.type}</span>
                      {!n.read && <span className="w-1.5 h-1.5 bg-signal rounded-full" />}
                    </div>
                    <div className="font-medium text-sm mt-2">{n.title}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{n.message}</div>
                    <div className="text-[10px] text-muted-foreground mt-1.5 font-mono">{shortDate(n.created_at)}</div>
                  </div>
                  {n.link && (
                    <Link to={n.link} className="text-xs underline underline-offset-2 hover:text-signal whitespace-nowrap">View</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
