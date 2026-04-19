import React from "react";
import "./App.css";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import { AuthProvider } from "./contexts/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import Register from "./pages/Register";
import AuthCallback from "./pages/AuthCallback";
import DashboardLayout from "./components/layout/DashboardLayout";
import Dashboard from "./pages/Dashboard";
import ServicesBrowse from "./pages/ServicesBrowse";
import NewOrder from "./pages/NewOrder";
import OrdersList from "./pages/OrdersList";
import AddFunds from "./pages/AddFunds";
import PaymentSuccess from "./pages/PaymentSuccess";
import Transactions from "./pages/Transactions";
import AdminPanel from "./pages/admin/AdminPanel";

function Router() {
  const location = useLocation();
  if (location.hash?.includes("session_id=")) {
    return <AuthCallback />;
  }
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/auth/callback" element={<AuthCallback />} />

      <Route
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/services" element={<ServicesBrowse />} />
        <Route path="/new-order" element={<NewOrder />} />
        <Route path="/orders" element={<OrdersList />} />
        <Route path="/add-funds" element={<AddFunds />} />
        <Route path="/transactions" element={<Transactions />} />
        <Route path="/payment/success" element={<PaymentSuccess />} />
      </Route>

      <Route
        path="/admin/*"
        element={
          <ProtectedRoute adminOnly>
            <DashboardLayout admin />
          </ProtectedRoute>
        }
      >
        <Route path="*" element={<AdminPanel />} />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Router />
        <Toaster position="top-right" richColors closeButton />
      </BrowserRouter>
    </AuthProvider>
  );
}
