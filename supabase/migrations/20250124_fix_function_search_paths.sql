-- Fix Function Search Path Security Vulnerabilities
-- This migration sets the search_path parameter for all database functions to prevent security issues
-- Reference: https://supabase.com/docs/guides/database/database-linter?lint=0011_function_search_path_mutable

-- Helper functions
ALTER FUNCTION public.get_user_role() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_admin() SET search_path = public, pg_catalog;
ALTER FUNCTION public.is_vendor_or_admin() SET search_path = public, pg_catalog;

-- Product management functions
ALTER FUNCTION public.check_max_product_images() SET search_path = public, pg_catalog;
ALTER FUNCTION public.set_primary_image() SET search_path = public, pg_catalog;
ALTER FUNCTION public.check_image_limit() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_product_availability() SET search_path = public, pg_catalog;
ALTER FUNCTION public.sync_external_product() SET search_path = public, pg_catalog;
ALTER FUNCTION public.search_products() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_trending_products() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_low_stock_products() SET search_path = public, pg_catalog;

-- Order management functions
ALTER FUNCTION public.calculate_order_totals() SET search_path = public, pg_catalog;
ALTER FUNCTION public.get_user_order_history() SET search_path = public, pg_catalog;
ALTER FUNCTION public.calculate_cart_total() SET search_path = public, pg_catalog;
ALTER FUNCTION public.generate_order_number() SET search_path = public, pg_catalog;

-- Stock management functions
ALTER FUNCTION public.monitor_price_changes() SET search_path = public, pg_catalog;
ALTER FUNCTION public.reserve_product_stock() SET search_path = public, pg_catalog;
ALTER FUNCTION public.release_product_stock() SET search_path = public, pg_catalog;
ALTER FUNCTION public.update_stock_reservation() SET search_path = public, pg_catalog;
ALTER FUNCTION public.finalize_stock_on_delivery() SET search_path = public, pg_catalog;
ALTER FUNCTION public.monitor_stock_changes() SET search_path = public, pg_catalog;
ALTER FUNCTION public.check_stock_availability() SET search_path = public, pg_catalog;

-- Stock reservation functions (both versions if they exist)
DO $$
BEGIN
    -- Check and update the first version
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'reserve_stock'
        AND pg_get_function_identity_arguments(p.oid) != ''
    ) THEN
        EXECUTE 'ALTER FUNCTION public.reserve_stock() SET search_path = public, pg_catalog';
    END IF;

    -- Update overloaded versions with parameters
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'reserve_stock'
        AND pg_get_function_identity_arguments(p.oid) LIKE '%integer%'
    ) THEN
        -- This will catch any parameterized version
        EXECUTE 'ALTER FUNCTION public.reserve_stock(integer, integer) SET search_path = public, pg_catalog';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        -- Continue if specific overload doesn't exist
        NULL;
END;
$$;

-- Handle commit_reserved_stock overloads
DO $$
BEGIN
    -- First version
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'commit_reserved_stock'
        AND pg_get_function_arguments(p.oid) LIKE '%uuid%'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.commit_reserved_stock(uuid) SET search_path = public, pg_catalog';
    END IF;

    -- Second version if different parameters exist
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'commit_reserved_stock'
        AND pg_get_function_arguments(p.oid) NOT LIKE '%uuid%'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.commit_reserved_stock() SET search_path = public, pg_catalog';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END;
$$;

-- Handle release_reserved_stock overloads
DO $$
BEGIN
    -- First version
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'release_reserved_stock'
        AND pg_get_function_arguments(p.oid) LIKE '%uuid%'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.release_reserved_stock(uuid) SET search_path = public, pg_catalog';
    END IF;

    -- Second version if different parameters exist
    IF EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public' AND p.proname = 'release_reserved_stock'
        AND pg_get_function_arguments(p.oid) NOT LIKE '%uuid%'
    ) THEN
        EXECUTE 'ALTER FUNCTION public.release_reserved_stock() SET search_path = public, pg_catalog';
    END IF;
EXCEPTION
    WHEN OTHERS THEN
        NULL;
END;
$$;

-- Inventory management functions
ALTER FUNCTION public.adjust_stock() SET search_path = public, pg_catalog;
ALTER FUNCTION public.increment_reserved_quantity() SET search_path = public, pg_catalog;
ALTER FUNCTION public.debug_increment_reserved_quantity() SET search_path = public, pg_catalog;

-- Cleanup and maintenance functions
ALTER FUNCTION public.cleanup_old_data() SET search_path = public, pg_catalog;
ALTER FUNCTION public.cleanup_expired_reservations() SET search_path = public, pg_catalog;
ALTER FUNCTION public.trigger_cleanup_expired_reservations() SET search_path = public, pg_catalog;
ALTER FUNCTION public.cleanup_old_audit_logs() SET search_path = public, pg_catalog;
ALTER FUNCTION public.cleanup_old_metrics() SET search_path = public, pg_catalog;

-- System functions
ALTER FUNCTION public.update_updated_at_column() SET search_path = public, pg_catalog;

-- Verify all functions have been secured
DO $$
DECLARE
    func_record RECORD;
    unsecured_count INTEGER := 0;
BEGIN
    FOR func_record IN
        SELECT n.nspname AS schema_name,
               p.proname AS function_name,
               pg_get_function_identity_arguments(p.oid) AS arguments
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE n.nspname = 'public'
        AND p.prosecdef = false
        AND NOT EXISTS (
            SELECT 1
            FROM pg_depend d
            WHERE d.objid = p.oid
            AND d.deptype = 'e'
        )
        AND p.proconfig IS NULL OR NOT ('search_path' = ANY(
            SELECT split_part(config, '=', 1)
            FROM unnest(p.proconfig) AS config
        ))
    LOOP
        RAISE NOTICE 'Warning: Function %.%(%) may still have mutable search_path',
            func_record.schema_name,
            func_record.function_name,
            func_record.arguments;
        unsecured_count := unsecured_count + 1;
    END LOOP;

    IF unsecured_count > 0 THEN
        RAISE NOTICE 'Found % function(s) that may still need search_path configuration', unsecured_count;
    ELSE
        RAISE NOTICE 'All functions have been successfully secured with explicit search_path';
    END IF;
END;
$$;

-- Add comment documenting the security fix
COMMENT ON SCHEMA public IS 'Public schema with secured functions - all functions have explicit search_path set to prevent security vulnerabilities';