-- =====================================================================
-- 0010_reference_uploads.sql — backlog B33-T1 (المراجعة المستقلة للاستوديو، تحسين T1)
--   رفع المراجع تحت up/{uid}/: صور فقط (png/jpg/jpeg/webp) وحد يومي 40 ملفًا لكل مستخدم.
--   كانت السياسة (0007) تقبل أي نوع يقبله الـbucket (ومنه mp4 حتى 50MB) وبلا حد للعدد في bucket عام.
-- لا حذف ولا تعديل بيانات (القاعدة 8). الاختبار: supabase/tests/credits.test.sql T26.
-- =====================================================================

-- عدد رفوع المستخدم خلال 24 ساعة أقل من الحد — security definer: سياسة RLS لا تقرأ storage.objects بصلاحية العميل
create or replace function public.reference_upload_ok()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select auth.uid() is not null
     and (
       select count(*)
       from storage.objects o
       where o.bucket_id = 'media'
         and o.name like 'up/' || auth.uid()::text || '/%'
         and o.created_at > now() - interval '1 day'
     ) < 40;
$$;

drop policy if exists "media: users upload own refs" on storage.objects;
create policy "media: users upload own refs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and name like 'up/' || auth.uid()::text || '/%'
    and position('..' in name) = 0
    and lower(name) ~ '\.(png|jpe?g|webp)$'
    and public.reference_upload_ok()
  );
