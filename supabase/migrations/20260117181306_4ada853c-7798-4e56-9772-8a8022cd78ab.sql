-- =============================================================================
-- ELINEAS v1.0 - Seed Permissions and Role Mappings
-- =============================================================================

-- Insert all permissions
INSERT INTO public.permissions (key, name, category, description) VALUES
-- Organization
('org.read', 'View Organization', 'Organization', 'View organization details'),
('org.update', 'Update Organization', 'Organization', 'Update organization settings'),
('org.limits.read', 'View Limits', 'Organization', 'View organization limits'),
('org.limits.update', 'Update Limits', 'Organization', 'Update organization limits'),
-- Users & Security
('users.read', 'View Users', 'Security', 'View user list'),
('users.create', 'Create Users', 'Security', 'Create new users'),
('users.update', 'Update Users', 'Security', 'Update user details'),
('users.deactivate', 'Deactivate Users', 'Security', 'Deactivate users'),
('users.delete', 'Delete Users', 'Security', 'Delete users'),
('roles.read', 'View Roles', 'Security', 'View roles'),
('roles.create', 'Create Roles', 'Security', 'Create roles'),
('roles.update', 'Update Roles', 'Security', 'Update roles'),
('roles.delete', 'Delete Roles', 'Security', 'Delete roles'),
('permissions.read', 'View Permissions', 'Security', 'View permissions'),
('audit.read', 'View Audit Logs', 'Security', 'View audit logs'),
-- Catalog
('products.read', 'View Products', 'Catalog', 'View products'),
('products.create', 'Create Products', 'Catalog', 'Create products'),
('products.update', 'Update Products', 'Catalog', 'Update products'),
('products.deactivate', 'Deactivate Products', 'Catalog', 'Deactivate products'),
('products.delete', 'Delete Products', 'Catalog', 'Delete products'),
('categories.read', 'View Categories', 'Catalog', 'View categories'),
('categories.create', 'Create Categories', 'Catalog', 'Create categories'),
('categories.update', 'Update Categories', 'Catalog', 'Update categories'),
('categories.delete', 'Delete Categories', 'Catalog', 'Delete categories'),
('suppliers.read', 'View Suppliers', 'Catalog', 'View suppliers'),
('suppliers.create', 'Create Suppliers', 'Catalog', 'Create suppliers'),
('suppliers.update', 'Update Suppliers', 'Catalog', 'Update suppliers'),
('suppliers.delete', 'Delete Suppliers', 'Catalog', 'Delete suppliers'),
('warehouses.read', 'View Warehouses', 'Catalog', 'View warehouses'),
('warehouses.create', 'Create Warehouses', 'Catalog', 'Create warehouses'),
('warehouses.update', 'Update Warehouses', 'Catalog', 'Update warehouses'),
('warehouses.delete', 'Delete Warehouses', 'Catalog', 'Delete warehouses'),
-- Inventory
('inventory.read', 'View Inventory', 'Inventory', 'View inventory'),
('inventory.adjust', 'Adjust Inventory', 'Inventory', 'Adjust stock levels'),
('inventory.move', 'Move Inventory', 'Inventory', 'Move stock between warehouses'),
('inventory.movements.read', 'View Movements', 'Inventory', 'View movement history'),
-- Lots
('lots.read', 'View Lots', 'Lots', 'View lots'),
('lots.create', 'Create Lots', 'Lots', 'Create lots'),
('lots.update', 'Update Lots', 'Lots', 'Update lots'),
('lots.delete', 'Delete Lots', 'Lots', 'Delete lots'),
-- Imports
('imports.read', 'View Imports', 'Imports', 'View import jobs'),
('imports.run', 'Run Imports', 'Imports', 'Execute import jobs'),
('imports.rerun', 'Rerun Imports', 'Imports', 'Rerun failed imports'),
('imports.errors.read', 'View Import Errors', 'Imports', 'View import errors'),
('imports.format.read', 'View Import Formats', 'Imports', 'View import formats'),
('imports.format.update', 'Update Import Formats', 'Imports', 'Update import formats'),
-- Automation
('automations.read', 'View Automations', 'Automation', 'View automations'),
('automations.manage', 'Manage Automations', 'Automation', 'Manage automations'),
('automations.runs.read', 'View Automation Runs', 'Automation', 'View automation runs'),
('automations.runs.retry', 'Retry Automation Runs', 'Automation', 'Retry failed runs'),
('webhooks.receive', 'Receive Webhooks', 'Automation', 'Receive webhooks'),
-- Observability
('metrics.read', 'View Metrics', 'Observability', 'View metrics'),
('errors.read', 'View Errors', 'Observability', 'View error events');

-- =============================================================================
-- ORG_ADMIN - All permissions
-- =============================================================================
INSERT INTO public.role_permissions (role, permission_key)
SELECT 'org_admin'::app_role, key FROM public.permissions;

-- =============================================================================
-- SECURITY_ADMIN - Users, roles, audit
-- =============================================================================
INSERT INTO public.role_permissions (role, permission_key) VALUES
('security_admin', 'org.read'),
('security_admin', 'users.read'),
('security_admin', 'users.create'),
('security_admin', 'users.update'),
('security_admin', 'users.deactivate'),
('security_admin', 'users.delete'),
('security_admin', 'roles.read'),
('security_admin', 'roles.create'),
('security_admin', 'roles.update'),
('security_admin', 'roles.delete'),
('security_admin', 'permissions.read'),
('security_admin', 'audit.read'),
('security_admin', 'errors.read');

-- =============================================================================
-- INVENTORY_MANAGER - Catalog + Inventory + Imports (no security)
-- =============================================================================
INSERT INTO public.role_permissions (role, permission_key) VALUES
('inventory_manager', 'org.read'),
('inventory_manager', 'products.read'),
('inventory_manager', 'products.create'),
('inventory_manager', 'products.update'),
('inventory_manager', 'products.deactivate'),
('inventory_manager', 'products.delete'),
('inventory_manager', 'categories.read'),
('inventory_manager', 'categories.create'),
('inventory_manager', 'categories.update'),
('inventory_manager', 'categories.delete'),
('inventory_manager', 'suppliers.read'),
('inventory_manager', 'suppliers.create'),
('inventory_manager', 'suppliers.update'),
('inventory_manager', 'suppliers.delete'),
('inventory_manager', 'warehouses.read'),
('inventory_manager', 'warehouses.create'),
('inventory_manager', 'warehouses.update'),
('inventory_manager', 'warehouses.delete'),
('inventory_manager', 'inventory.read'),
('inventory_manager', 'inventory.adjust'),
('inventory_manager', 'inventory.move'),
('inventory_manager', 'inventory.movements.read'),
('inventory_manager', 'lots.read'),
('inventory_manager', 'lots.create'),
('inventory_manager', 'lots.update'),
('inventory_manager', 'lots.delete'),
('inventory_manager', 'imports.read'),
('inventory_manager', 'imports.run'),
('inventory_manager', 'imports.rerun'),
('inventory_manager', 'imports.errors.read'),
('inventory_manager', 'imports.format.read');

-- =============================================================================
-- IMPORT_OPERATOR - Only imports + read catalog
-- =============================================================================
INSERT INTO public.role_permissions (role, permission_key) VALUES
('import_operator', 'org.read'),
('import_operator', 'products.read'),
('import_operator', 'categories.read'),
('import_operator', 'suppliers.read'),
('import_operator', 'warehouses.read'),
('import_operator', 'inventory.read'),
('import_operator', 'lots.read'),
('import_operator', 'imports.read'),
('import_operator', 'imports.run'),
('import_operator', 'imports.rerun'),
('import_operator', 'imports.errors.read'),
('import_operator', 'imports.format.read');

-- =============================================================================
-- VIEWER - Read only
-- =============================================================================
INSERT INTO public.role_permissions (role, permission_key) VALUES
('viewer', 'org.read'),
('viewer', 'products.read'),
('viewer', 'categories.read'),
('viewer', 'suppliers.read'),
('viewer', 'warehouses.read'),
('viewer', 'inventory.read'),
('viewer', 'inventory.movements.read'),
('viewer', 'lots.read'),
('viewer', 'imports.read'),
('viewer', 'imports.errors.read');