-- Apply only after owner authorization. Existing SELECT grants are sufficient.
-- Read access only: does not alter RLS, grants, data, or write policies.
BEGIN;

CREATE POLICY "Users can read own profile"
ON public.profiles
FOR SELECT
TO authenticated
USING ((SELECT auth.uid()) = id);

COMMIT;
