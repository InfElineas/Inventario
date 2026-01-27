import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Product = Database["public"]["Tables"]["products"]["Row"];
type Category = Database["public"]["Tables"]["categories"]["Row"];
type Supplier = Database["public"]["Tables"]["suppliers"]["Row"];

export interface ProductWithRelations extends Product {
  categories: Pick<Category, "id" | "name"> | null;
  suppliers: Pick<Supplier, "id" | "name"> | null;
}

type ProductStatus = Database["public"]["Enums"]["product_status"];

interface UseProductsOptions {
  orgId: string | null;
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  categoryId?: string | null;
  supplierId?: string | null;
  status?: ProductStatus | null;
}

interface UseProductsResult {
  products: ProductWithRelations[];
  loading: boolean;
  error: Error | null;
  totalCount: number;
  totalPages: number;
  refetch: () => Promise<void>;
}

export function useProducts({
  orgId,
  page = 1,
  pageSize = 10,
  searchQuery = "",
  categoryId = null,
  supplierId = null,
  status = null,
}: UseProductsOptions): UseProductsResult {
  const [products, setProducts] = useState<ProductWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const fetchProducts = useCallback(async () => {
    if (!orgId) {
      setProducts([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build base query
      let query = supabase
        .from("products")
        .select(
          `
          *,
          categories:category_id (id, name),
          suppliers:supplier_id (id, name)
        `,
          { count: "exact" }
        )
        .eq("org_id", orgId);

      // Apply filters
      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,sku.ilike.%${searchQuery}%`);
      }

      if (categoryId) {
        query = query.eq("category_id", categoryId);
      }

      if (supplierId) {
        query = query.eq("supplier_id", supplierId);
      }

      if (status) {
        query = query.eq("status", status);
      }

      // Apply pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      query = query.order("created_at", { ascending: false }).range(from, to);

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      setProducts((data as ProductWithRelations[]) || []);
      setTotalCount(count || 0);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Error fetching products"));
      console.error("Error fetching products:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, page, pageSize, searchQuery, categoryId, supplierId, status]);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  return {
    products,
    loading,
    error,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    refetch: fetchProducts,
  };
}

// Hook for fetching categories
export function useCategories(orgId: string | null) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchCategories() {
      if (!orgId) {
        setCategories([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("categories")
          .select("*")
          .eq("org_id", orgId)
          .order("name");

        if (error) throw error;
        setCategories(data || []);
      } catch (err) {
        console.error("Error fetching categories:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchCategories();
  }, [orgId]);

  return { categories, loading };
}

// Hook for fetching suppliers
export function useSuppliers(orgId: string | null) {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSuppliers() {
      if (!orgId) {
        setSuppliers([]);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("suppliers")
          .select("*")
          .eq("org_id", orgId)
          .eq("is_active", true)
          .order("name");

        if (error) throw error;
        setSuppliers(data || []);
      } catch (err) {
        console.error("Error fetching suppliers:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchSuppliers();
  }, [orgId]);

  return { suppliers, loading };
}
