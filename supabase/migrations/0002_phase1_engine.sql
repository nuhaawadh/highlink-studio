-- =====================================================================
-- 0002_phase1_engine.sql — المرحلة 1: التخزين + منع الخصم المزدوج (ADR 0002/0003، المخطط §15 الطبقة 3)
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) Supabase Storage: bucket `media` عام للقراءة، الكتابة service_role فقط
--    المسار: u/{user_id}/{asset_id}.{ext}. يُبدَّل بـR2 لاحقًا عبر _shared/storage.ts فقط.
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'video/mp4'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- RLS على storage.objects مفعّل أصلًا في Supabase. سياسة واحدة: قراءة عامة لهذا الـbucket.
-- لا سياسة إدراج/تعديل/حذف للمستخدمين — provider-webhook يكتب بـservice_role (يتجاوز RLS).
drop policy if exists "media: public read" on storage.objects;
create policy "media: public read" on storage.objects
  for select using (bucket_id = 'media');

-- ---------------------------------------------------------------------
-- 2) حجز واحد نشط لكل أصل — الحماية في القاعدة لا في الكود
-- ---------------------------------------------------------------------
create unique index if not exists credit_ledger_active_hold_per_asset_uidx
  on public.credit_ledger (asset_id)
  where kind = 'hold' and status = 'held' and asset_id is not null;

-- ---------------------------------------------------------------------
-- 3) hold_credits idempotent: تكرار الطلب بنفس assetId يعيد الحجز القائم بدل خصم ثانٍ،
--    وأصل خُصم رصيده مسبقًا لا يُحجز له مجددًا.
-- ---------------------------------------------------------------------
create or replace function public.hold_credits(p_user uuid, p_amount int, p_asset uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_asset is null then
    raise exception 'INVALID_ASSET';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text));

  -- حجز قائم لنفس الأصل → أعده كما هو (idempotency key = assetId)
  select id into v_id
  from public.credit_ledger
  where asset_id = p_asset and user_id = p_user and kind = 'hold' and status = 'held'
  limit 1;
  if v_id is not null then
    return v_id;
  end if;

  -- أصل خُصم رصيده فعلًا → لا حجز ثانٍ
  if exists (select 1 from public.credit_ledger where asset_id = p_asset and kind = 'charge') then
    raise exception 'ALREADY_CHARGED';
  end if;

  if public.get_balance(p_user) < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  insert into public.credit_ledger (user_id, amount, kind, status, asset_id)
  values (p_user, -p_amount, 'hold', 'held', p_asset)
  returning id into v_id;
  return v_id;
end;
$$;

-- الصلاحيات كما في 0001: لا تُستدعى من الواجهة
revoke execute on function public.hold_credits(uuid, int, uuid) from public, anon, authenticated;
