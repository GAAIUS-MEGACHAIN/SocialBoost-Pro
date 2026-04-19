import axios from "axios";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API_BASE = `${BACKEND_URL}/api`;

export const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export function formatApiError(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  }
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export function money(n) {
  const v = Number(n || 0);
  return `$${v.toFixed(2)}`;
}

export function money4(n) {
  const v = Number(n || 0);
  return `$${v.toFixed(4)}`;
}

export function shortDate(iso) {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", { month: "short", day: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export const STATUS_STYLES = {
  Pending: "bg-amber-50 text-amber-800 border-amber-200",
  "In Progress": "bg-blue-50 text-blue-800 border-blue-200",
  Processing: "bg-indigo-50 text-indigo-800 border-indigo-200",
  Completed: "bg-emerald-50 text-emerald-800 border-emerald-200",
  Partial: "bg-orange-50 text-orange-800 border-orange-200",
  Canceled: "bg-red-50 text-red-800 border-red-200",
};
