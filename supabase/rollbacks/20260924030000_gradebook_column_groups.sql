-- Deploy the previous frontend before running this. Export groups and group_id first if edits must be restored.
-- Columns, scores and column sort_order survive; explicit group names, order and membership do not.
BEGIN;
DROP FUNCTION public.gradebook_column_groups_reorder(bigint, bigint[]);
DROP POLICY "everyone in class can view" ON public.gradebook_column_groups;
ALTER TABLE public.gradebook_columns DROP COLUMN group_id;
DROP TABLE public.gradebook_column_groups;
DROP FUNCTION public.broadcast_gradebook_column_groups_change();
ALTER TABLE public.gradebooks DROP CONSTRAINT gradebooks_id_class_id_key;
COMMIT;
