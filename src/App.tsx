import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import Auth from "./pages/Auth";
import { AppLayout } from "./components/AppLayout";
import { RequirePermission } from "./components/auth/RequirePermission";
import Dashboard from "./pages/Dashboard";
import PlaceholderPage from "./pages/PlaceholderPage";
import ProductsPage from "./pages/ProductsPage";
import CategoriesPage from "./pages/CategoriesPage";
import UsersPage from "./pages/UsersPage";
import RolesPage from "./pages/RolesPage";
import NotFound from "./pages/NotFound";
import Forbidden from "./pages/Forbidden";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/auth" element={<Auth />} />
          
          {/* Protected routes with sidebar layout */}
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route
              path="/products"
              element={
                <RequirePermission required="products.read">
                  <ProductsPage />
                </RequirePermission>
              }
            />
            <Route
              path="/categories"
              element={
                <RequirePermission required="categories.read">
                  <CategoriesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/suppliers"
              element={
                <RequirePermission required="suppliers.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/warehouses"
              element={
                <RequirePermission required="warehouses.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/inventory"
              element={
                <RequirePermission required="inventory.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/lots"
              element={
                <RequirePermission required="lots.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/imports"
              element={
                <RequirePermission required="imports.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/users"
              element={
                <RequirePermission required="users.read">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route
              path="/roles"
              element={
                <RequirePermission required="roles.read">
                  <RolesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/audit"
              element={
                <RequirePermission required="audit.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/errors"
              element={
                <RequirePermission required="errors.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route
              path="/settings"
              element={
                <RequirePermission required="org.read">
                  <PlaceholderPage />
                </RequirePermission>
              }
            />
            <Route path="/forbidden" element={<Forbidden />} />
          </Route>
          
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
