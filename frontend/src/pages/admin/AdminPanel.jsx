import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import AdminOverview from "./AdminOverview";
import AdminUsers from "./AdminUsers";
import AdminRoles from "./AdminRoles";
import AdminServices from "./AdminServices";
import AdminSuppliers from "./AdminSuppliers";
import AdminOrders from "./AdminOrders";
import AdminTransactions from "./AdminTransactions";

export default function AdminPanel() {
  return (
    <Routes>
      <Route index element={<AdminOverview />} />
      <Route path="users" element={<AdminUsers />} />
      <Route path="roles" element={<AdminRoles />} />
      <Route path="services" element={<AdminServices />} />
      <Route path="suppliers" element={<AdminSuppliers />} />
      <Route path="orders" element={<AdminOrders />} />
      <Route path="transactions" element={<AdminTransactions />} />
      <Route path="*" element={<Navigate to="/admin" replace />} />
    </Routes>
  );
}
