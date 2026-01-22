-- =============================================================================
-- ELINEAS v1.0 - Security Functions and RLS Policies
-- =============================================================================

-- =============================================================================
-- Helper Function: Get user's org_id
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_org_id(user_uuid UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT org_id FROM organization_memberships WHERE user_id = user_uuid LIMIT 1;
$$;

-- =============================================================================
-- Helper Function: Check if user is member of org
-- =============================================================================
CREATE OR REPLACE FUNCTION public.is_org_member(user_uuid UUID, target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = user_uuid AND org_id = target_org_id
    );
$$;

-- =============================================================================
-- Helper Function: Get user's role in org
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_role(user_uuid UUID, target_org_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT role FROM organization_memberships
    WHERE user_id = user_uuid AND org_id = target_org_id
    LIMIT 1;
$$;

-- =============================================================================
-- Helper Function: Check if user has specific role
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_role(user_uuid UUID, target_org_id UUID, target_role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = user_uuid AND org_id = target_org_id AND role = target_role
    );
$$;

-- =============================================================================
-- Helper Function: Check if user has permission
-- =============================================================================
CREATE OR REPLACE FUNCTION public.has_permission(user_uuid UUID, target_org_id UUID, permission_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 
        FROM organization_memberships om
        JOIN role_permissions rp ON om.role = rp.role
        WHERE om.user_id = user_uuid 
          AND om.org_id = target_org_id
          AND rp.permission_key = permission_key
    );
$$;

-- =============================================================================
-- Helper Function: Check if user can manage users (admin or security admin)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.can_manage_users(user_uuid UUID, target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM organization_memberships
        WHERE user_id = user_uuid 
          AND org_id = target_org_id 
          AND role IN ('org_admin', 'security_admin')
    );
$$;

-- =============================================================================
-- Trigger: Auto-create profile on user signup
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
    RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- Trigger: Update timestamps
-- =============================================================================
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON public.organizations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_suppliers_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_warehouses_updated_at BEFORE UPDATE ON public.warehouses FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();
CREATE TRIGGER update_inventory_snapshots_updated_at BEFORE UPDATE ON public.inventory_snapshots FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================================================
-- RLS Policies: Profiles
-- =============================================================================
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Admins can view org members" ON public.profiles FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM organization_memberships om1
        JOIN organization_memberships om2 ON om1.org_id = om2.org_id
        WHERE om1.user_id = auth.uid() AND om2.user_id = profiles.id
    )
);

-- =============================================================================
-- RLS Policies: Organizations
-- =============================================================================
CREATE POLICY "Members can view their org" ON public.organizations FOR SELECT USING (
    public.is_org_member(auth.uid(), id)
);
CREATE POLICY "Admins can update org" ON public.organizations FOR UPDATE USING (
    public.has_role(auth.uid(), id, 'org_admin')
);

-- =============================================================================
-- RLS Policies: Organization Memberships
-- =============================================================================
CREATE POLICY "Members can view org memberships" ON public.organization_memberships FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Admins can insert memberships" ON public.organization_memberships FOR INSERT WITH CHECK (
    public.can_manage_users(auth.uid(), org_id)
);
CREATE POLICY "Admins can update memberships" ON public.organization_memberships FOR UPDATE USING (
    public.can_manage_users(auth.uid(), org_id)
);
CREATE POLICY "Admins can delete memberships" ON public.organization_memberships FOR DELETE USING (
    public.can_manage_users(auth.uid(), org_id) AND user_id != auth.uid()
);

-- =============================================================================
-- RLS Policies: Permissions (Public read)
-- =============================================================================
CREATE POLICY "Anyone can view permissions" ON public.permissions FOR SELECT USING (true);

-- =============================================================================
-- RLS Policies: Role Permissions (Public read)
-- =============================================================================
CREATE POLICY "Anyone can view role permissions" ON public.role_permissions FOR SELECT USING (true);

-- =============================================================================
-- RLS Policies: Categories
-- =============================================================================
CREATE POLICY "Members can view categories" ON public.categories FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert categories" ON public.categories FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'categories.create')
);
CREATE POLICY "Managers can update categories" ON public.categories FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'categories.update')
);
CREATE POLICY "Managers can delete categories" ON public.categories FOR DELETE USING (
    public.has_permission(auth.uid(), org_id, 'categories.delete')
);

-- =============================================================================
-- RLS Policies: Suppliers
-- =============================================================================
CREATE POLICY "Members can view suppliers" ON public.suppliers FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert suppliers" ON public.suppliers FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'suppliers.create')
);
CREATE POLICY "Managers can update suppliers" ON public.suppliers FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'suppliers.update')
);
CREATE POLICY "Managers can delete suppliers" ON public.suppliers FOR DELETE USING (
    public.has_permission(auth.uid(), org_id, 'suppliers.delete')
);

-- =============================================================================
-- RLS Policies: Warehouses
-- =============================================================================
CREATE POLICY "Members can view warehouses" ON public.warehouses FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert warehouses" ON public.warehouses FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'warehouses.create')
);
CREATE POLICY "Managers can update warehouses" ON public.warehouses FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'warehouses.update')
);
CREATE POLICY "Managers can delete warehouses" ON public.warehouses FOR DELETE USING (
    public.has_permission(auth.uid(), org_id, 'warehouses.delete')
);

-- =============================================================================
-- RLS Policies: Products
-- =============================================================================
CREATE POLICY "Members can view products" ON public.products FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert products" ON public.products FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'products.create')
);
CREATE POLICY "Managers can update products" ON public.products FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'products.update')
);
CREATE POLICY "Managers can delete products" ON public.products FOR DELETE USING (
    public.has_permission(auth.uid(), org_id, 'products.delete')
);

-- =============================================================================
-- RLS Policies: Lots
-- =============================================================================
CREATE POLICY "Members can view lots" ON public.lots FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert lots" ON public.lots FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'lots.create')
);
CREATE POLICY "Managers can update lots" ON public.lots FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'lots.update')
);
CREATE POLICY "Managers can delete lots" ON public.lots FOR DELETE USING (
    public.has_permission(auth.uid(), org_id, 'lots.delete')
);

-- =============================================================================
-- RLS Policies: Inventory Snapshots
-- =============================================================================
CREATE POLICY "Members can view inventory" ON public.inventory_snapshots FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert inventory" ON public.inventory_snapshots FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'inventory.adjust')
);
CREATE POLICY "Managers can update inventory" ON public.inventory_snapshots FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'inventory.adjust')
);

-- =============================================================================
-- RLS Policies: Inventory Movements
-- =============================================================================
CREATE POLICY "Members can view movements" ON public.inventory_movements FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Managers can insert movements" ON public.inventory_movements FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'inventory.move')
);

-- =============================================================================
-- RLS Policies: Import Jobs
-- =============================================================================
CREATE POLICY "Members can view imports" ON public.import_jobs FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "Operators can insert imports" ON public.import_jobs FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'imports.run')
);
CREATE POLICY "Operators can update imports" ON public.import_jobs FOR UPDATE USING (
    public.has_permission(auth.uid(), org_id, 'imports.run')
);

-- =============================================================================
-- RLS Policies: Import Errors
-- =============================================================================
CREATE POLICY "Members can view import errors" ON public.import_errors FOR SELECT USING (
    public.is_org_member(auth.uid(), org_id)
);
CREATE POLICY "System can insert import errors" ON public.import_errors FOR INSERT WITH CHECK (
    public.has_permission(auth.uid(), org_id, 'imports.run')
);

-- =============================================================================
-- RLS Policies: Audit Logs
-- =============================================================================
CREATE POLICY "Admins can view audit logs" ON public.audit_logs FOR SELECT USING (
    org_id IS NOT NULL AND public.can_manage_users(auth.uid(), org_id)
);
CREATE POLICY "System can insert audit logs" ON public.audit_logs FOR INSERT WITH CHECK (true);

-- =============================================================================
-- RLS Policies: Error Events
-- =============================================================================
CREATE POLICY "Admins can view error events" ON public.error_events FOR SELECT USING (
    org_id IS NOT NULL AND public.can_manage_users(auth.uid(), org_id)
);
CREATE POLICY "Anyone can insert error events" ON public.error_events FOR INSERT WITH CHECK (true);