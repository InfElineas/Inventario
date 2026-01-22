import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Category = Database["public"]["Tables"]["categories"]["Row"];

export interface CategoryWithParent extends Category {
  parent?: Pick<Category, "id" | "name"> | null;
  children_count?: number;
}

interface UseCategoriesOptions {
  orgId: string | null;
  page?: number;
  pageSize?: number;
  searchQuery?: string;
  parentId?: string | null;
  includeAll?: boolean;
}

interface UseCategoriesResult {
  categories: CategoryWithParent[];
  loading: boolean;
  error: Error | null;
  totalCount: number;
  totalPages: number;
  refetch: () => Promise<void>;
}

export function useCategories({
  orgId,
  page = 1,
  pageSize = 10,
  searchQuery = "",
  parentId = undefined,
  includeAll = false,
}: UseCategoriesOptions): UseCategoriesResult {
  const [categories, setCategories] = useState<CategoryWithParent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [totalCount, setTotalCount] = useState(0);

  const fetchCategories = useCallback(async () => {
    if (!orgId) {
      setCategories([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Build base query
      let query = supabase
        .from("categories")
        .select(
          `
          *,
          parent:parent_id (id, name)
        `,
          { count: "exact" }
        )
        .eq("org_id", orgId);

      // Apply filters
      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,description.ilike.%${searchQuery}%`);
      }

      // Filter by parent (null for root categories, specific id for children)
      if (parentId !== undefined) {
        if (parentId === null) {
          query = query.is("parent_id", null);
        } else {
          query = query.eq("parent_id", parentId);
        }
      }

      // Apply pagination only if not fetching all
      if (!includeAll) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        query = query.order("name").range(from, to);
      } else {
        query = query.order("name");
      }

      const { data, error: queryError, count } = await query;

      if (queryError) throw queryError;

      // Get children count for each category
      const categoriesWithCount = await Promise.all(
        (data || []).map(async (cat) => {
          const { count: childCount } = await supabase
            .from("categories")
            .select("id", { count: "exact", head: true })
            .eq("parent_id", cat.id);

          return {
            ...cat,
            parent: cat.parent as Pick<Category, "id" | "name"> | null,
            children_count: childCount || 0,
          };
        })
      );

      setCategories(categoriesWithCount);
      setTotalCount(count || 0);
    } catch (err) {
      setError(err instanceof Error ? err : new Error("Error fetching categories"));
      console.error("Error fetching categories:", err);
    } finally {
      setLoading(false);
    }
  }, [orgId, page, pageSize, searchQuery, parentId, includeAll]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  return {
    categories,
    loading,
    error,
    totalCount,
    totalPages: Math.ceil(totalCount / pageSize),
    refetch: fetchCategories,
  };
}

// Simple hook for select dropdowns (excludes a specific category and its children)
export function useCategoryOptions(orgId: string | null, excludeId?: string) {
  const [options, setOptions] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOptions() {
      if (!orgId) {
        setOptions([]);
        setLoading(false);
        return;
      }

      try {
        let query = supabase
          .from("categories")
          .select("*")
          .eq("org_id", orgId)
          .order("name");

        if (excludeId) {
          query = query.neq("id", excludeId);
        }

        const { data, error } = await query;

        if (error) throw error;

        // If excluding a category, also exclude its descendants
        if (excludeId && data) {
          const descendants = new Set<string>();
          const findDescendants = (parentId: string) => {
            data.forEach((cat) => {
              if (cat.parent_id === parentId) {
                descendants.add(cat.id);
                findDescendants(cat.id);
              }
            });
          };
          findDescendants(excludeId);
          
          setOptions(data.filter((cat) => !descendants.has(cat.id)));
        } else {
          setOptions(data || []);
        }
      } catch (err) {
        console.error("Error fetching category options:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchOptions();
  }, [orgId, excludeId]);

  return { options, loading };
}
