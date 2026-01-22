-- =============================================================================
-- ELINEAS v1.0 - MULTI-TENANT INVENTORY PLATFORM
-- Part 1: Core Tables, Enums, and Base Schema
-- =============================================================================

-- Custom Types
CREATE TYPE public.app_role AS ENUM ('org_admin', 'inventory_manager', 'import_operator', 'viewer', 'security_admin');
CREATE TYPE public.import_status AS ENUM ('queued', 'running', 'success', 'failed');
CREATE TYPE public.movement_type AS ENUM ('entry', 'exit', 'adjustment');
CREATE TYPE public.product_status AS ENUM ('active', 'discontinued', 'out_of_stock');

-- =============================================================================
-- Organizations (Tenants)
-- =============================================================================
CREATE TABLE public.organizations (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Profiles (User profiles linked to auth.users)
-- =============================================================================
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Organization Memberships (User belongs to Org with Role)
-- =============================================================================
CREATE TABLE public.organization_memberships (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    role app_role NOT NULL DEFAULT 'viewer',
    invited_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(user_id, org_id)
);

-- =============================================================================
-- Permissions Catalog (Static list of all permissions)
-- =============================================================================
CREATE TABLE public.permissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    description TEXT
);

-- =============================================================================
-- Role Permissions (Which role has which permissions)
-- =============================================================================
CREATE TABLE public.role_permissions (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    role app_role NOT NULL,
    permission_key TEXT NOT NULL REFERENCES public.permissions(key) ON DELETE CASCADE,
    UNIQUE(role, permission_key)
);

-- =============================================================================
-- Categories (Scoped by org)
-- =============================================================================
CREATE TABLE public.categories (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES public.categories(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Suppliers (Scoped by org)
-- =============================================================================
CREATE TABLE public.suppliers (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(org_id, code)
);

-- =============================================================================
-- Warehouses (Scoped by org)
-- =============================================================================
CREATE TABLE public.warehouses (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    address TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(org_id, code)
);

-- =============================================================================
-- Products (Scoped by org)
-- =============================================================================
CREATE TABLE public.products (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    sku TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    category_id UUID REFERENCES public.categories(id),
    supplier_id UUID REFERENCES public.suppliers(id),
    unit TEXT DEFAULT 'unit',
    min_stock INTEGER DEFAULT 0,
    max_stock INTEGER,
    cost_price DECIMAL(12, 2),
    sale_price DECIMAL(12, 2),
    status product_status NOT NULL DEFAULT 'active',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(org_id, sku)
);

-- =============================================================================
-- Lots (Batch tracking with expiry, scoped by org)
-- =============================================================================
CREATE TABLE public.lots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    lot_number TEXT NOT NULL,
    manufacture_date DATE,
    expiry_date DATE,
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(org_id, lot_number)
);

-- =============================================================================
-- Inventory Snapshots (Current stock levels)
-- =============================================================================
CREATE TABLE public.inventory_snapshots (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES public.lots(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    reserved_quantity INTEGER NOT NULL DEFAULT 0,
    last_movement_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(org_id, product_id, warehouse_id, lot_id)
);

-- =============================================================================
-- Inventory Movements (History of all stock changes)
-- =============================================================================
CREATE TABLE public.inventory_movements (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    warehouse_id UUID NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
    lot_id UUID REFERENCES public.lots(id),
    movement_type movement_type NOT NULL,
    quantity INTEGER NOT NULL,
    quantity_before INTEGER NOT NULL DEFAULT 0,
    quantity_after INTEGER NOT NULL DEFAULT 0,
    reason TEXT,
    reference_type TEXT,
    reference_id UUID,
    performed_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Import Jobs (File import tracking)
-- =============================================================================
CREATE TABLE public.import_jobs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    job_type TEXT NOT NULL,
    file_name TEXT NOT NULL,
    file_checksum TEXT NOT NULL,
    status import_status NOT NULL DEFAULT 'queued',
    total_rows INTEGER DEFAULT 0,
    processed_rows INTEGER DEFAULT 0,
    success_rows INTEGER DEFAULT 0,
    error_rows INTEGER DEFAULT 0,
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(org_id, file_checksum, job_type)
);

-- =============================================================================
-- Import Errors (Detailed error tracking per row)
-- =============================================================================
CREATE TABLE public.import_errors (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    job_id UUID NOT NULL REFERENCES public.import_jobs(id) ON DELETE CASCADE,
    row_number INTEGER NOT NULL,
    row_data JSONB,
    error_message TEXT NOT NULL,
    error_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Audit Logs (All actions tracked)
-- =============================================================================
CREATE TABLE public.audit_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    before_data JSONB,
    after_data JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Error Events (System error tracking)
-- =============================================================================
CREATE TABLE public.error_events (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    org_id UUID REFERENCES public.organizations(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    error_type TEXT NOT NULL,
    error_message TEXT NOT NULL,
    stack_trace TEXT,
    context JSONB,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- =============================================================================
-- Indexes for Performance
-- =============================================================================
CREATE INDEX idx_org_memberships_user ON public.organization_memberships(user_id);
CREATE INDEX idx_org_memberships_org ON public.organization_memberships(org_id);
CREATE INDEX idx_categories_org ON public.categories(org_id);
CREATE INDEX idx_suppliers_org ON public.suppliers(org_id);
CREATE INDEX idx_warehouses_org ON public.warehouses(org_id);
CREATE INDEX idx_products_org ON public.products(org_id);
CREATE INDEX idx_products_category ON public.products(category_id);
CREATE INDEX idx_products_supplier ON public.products(supplier_id);
CREATE INDEX idx_lots_org ON public.lots(org_id);
CREATE INDEX idx_lots_product ON public.lots(product_id);
CREATE INDEX idx_inventory_snapshots_org ON public.inventory_snapshots(org_id);
CREATE INDEX idx_inventory_snapshots_product ON public.inventory_snapshots(product_id);
CREATE INDEX idx_inventory_snapshots_warehouse ON public.inventory_snapshots(warehouse_id);
CREATE INDEX idx_inventory_movements_org ON public.inventory_movements(org_id);
CREATE INDEX idx_inventory_movements_product ON public.inventory_movements(product_id);
CREATE INDEX idx_inventory_movements_created ON public.inventory_movements(created_at);
CREATE INDEX idx_import_jobs_org ON public.import_jobs(org_id);
CREATE INDEX idx_import_jobs_checksum ON public.import_jobs(file_checksum);
CREATE INDEX idx_import_errors_job ON public.import_errors(job_id);
CREATE INDEX idx_audit_logs_org ON public.audit_logs(org_id);
CREATE INDEX idx_audit_logs_user ON public.audit_logs(user_id);
CREATE INDEX idx_audit_logs_created ON public.audit_logs(created_at);
CREATE INDEX idx_audit_logs_entity ON public.audit_logs(entity_type, entity_id);

-- =============================================================================
-- Enable RLS on all tables
-- =============================================================================
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.import_errors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.error_events ENABLE ROW LEVEL SECURITY;