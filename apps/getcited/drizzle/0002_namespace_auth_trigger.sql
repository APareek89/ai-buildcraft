-- Namespace the signup trigger/function so GetCited never collides with other apps
-- sharing this Supabase project. Replaces the generic on_auth_user_created /
-- handle_new_user created in 0001 with getcited-prefixed objects.
-- Drop the trigger first; DROP FUNCTION without CASCADE then fails loudly if any
-- OTHER object still depends on it (it should not — verified only ours used it).

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
--> statement-breakpoint
DROP FUNCTION IF EXISTS public.handle_new_user();
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.getcited_handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;
--> statement-breakpoint

DROP TRIGGER IF EXISTS getcited_on_auth_user_created ON auth.users;
--> statement-breakpoint
CREATE TRIGGER getcited_on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.getcited_handle_new_user();
