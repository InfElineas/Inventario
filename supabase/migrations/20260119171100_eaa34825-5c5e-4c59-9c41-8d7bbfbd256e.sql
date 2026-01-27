-- Fix remaining RLS policies
DROP POLICY IF EXISTS "Admins can update memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Admins can delete memberships" ON public.organization_memberships;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can view profiles in their org" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;

CREATE POLICY "Admins can update memberships"
ON public.organization_memberships FOR UPDATE
TO authenticated
USING (public.can_manage_users(org_id, auth.uid()));

CREATE POLICY "Admins can delete memberships"
ON public.organization_memberships FOR DELETE
TO authenticated
USING (public.can_manage_users(org_id, auth.uid()));

CREATE POLICY "Users can view own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can view profiles in their org"
ON public.profiles FOR SELECT
TO authenticated
USING (
  id IN (
    SELECT user_id FROM public.organization_memberships
    WHERE org_id IN (
      SELECT org_id FROM public.organization_memberships WHERE user_id = auth.uid()
    )
  )
);

CREATE POLICY "Users can update own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (id = auth.uid());

CREATE POLICY "Users can insert own profile"
ON public.profiles FOR INSERT
TO authenticated
WITH CHECK (id = auth.uid());