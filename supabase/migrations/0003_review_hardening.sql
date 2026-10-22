-- =====================================================================
-- 0003_review_hardening.sql — نتائج المراجعة المستقلة لمحرك المرحلة 1 (2026-10-22)
-- لا يعدّل 0001/0002؛ يستبدل الدوال والسياسات التي ثبت قصورها ويضيف شبكة أمان للحجوزات.
--   1) حارس أعمدة assets: كان يقرأ request.jwt.claim.role الذي لا يضبطه PostgREST ≥ 9 (PG14+) فلم يعمل قط.
--   2) سياسة INSERT: الواجهة لا تضبط أعمدة السيرفر عند الإدراج.
--   3) get_balance: المالك (أو service_role) فقط.
--   4) reconcile_holds(): تحرير/تأكيد الحجوزات العالقة أقدم من 30 دقيقة (المخطط §15 الطبقة 3) حتى تُبنى cron-renewals.
-- الاختبارات: supabase/tests/credits.test.sql T9–T11.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) حارس الأعمدة الحساسة — رفض افتراضي: كل من ليس service_role يُمنع من أعمدة السيرفر
--    current_user في (postgres, supabase_admin, service_role) = الهجرات، SQL Editor، الاختبارات،
--    والدوال security definer المملوكة لـpostgres (reconcile_holds). الواجهة = authenticated.
-- ---------------------------------------------------------------------
create or replace function public.assets_guard_user_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.status is distinct from old.status
       or new.url is distinct from old.url
       or new.thumbnail_url is distinct from old.thumbnail_url
       or new.cost_credits is distinct from old.cost_credits
       or new.provider is distinct from old.provider
       or new.provider_job_id is distinct from old.provider_job_id
       or new.user_id is distinct from old.user_id
       or new.type is distinct from old.type
       or new.model is distinct from old.model then
      raise exception 'FORBIDDEN_COLUMN_UPDATE';
    end if;
  end if;
  return new;
end;
$$;
-- الـtrigger نفسه (assets_guard_user_update) من 0001 يبقى ويشير إلى الدالة المستبدلة.

-- ---------------------------------------------------------------------
-- 2) INSERT من الواجهة: queued فقط وبلا أي عمود يكتبه السيرفر
-- ---------------------------------------------------------------------
drop policy if exists "assets: insert own queued" on public.assets;
create policy "assets: insert own queued" on public.assets for insert
  with check (
    auth.uid() = user_id
    and status = 'queued'
    and provider is null
    and provider_job_id is null
    and url is null
    and thumbnail_url is null
    and cost_credits is null
    and error_code is null
    and error_message is null
    and completed_at is null
  );

-- ---------------------------------------------------------------------
-- 3) get_balance: المستخدم يرى رصيده فقط؛ service_role (بلا sub) يرى أي مستخدم
-- ---------------------------------------------------------------------
create or replace function public.get_balance(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::int
  from public.credit_ledger
  where user_id = p_user
    and (auth.uid() is null or auth.uid() = p_user)
    and status in ('posted', 'held')
    and (expires_at is null or expires_at > now());
$$;

-- ---------------------------------------------------------------------
-- 4) reconcile_holds — شبكة أمان الحجوزات العالقة (service_role / cron فقط)
--    لكل حجز held أقدم من p_older_than:
--      أصله completed            → confirm_hold (خصم نهائي ضاع تأكيده)
--      أصله failed/canceled/مفقود → release_hold
--      أصله queued/processing     → release_hold + تعليم الأصل failed برسالة عربية (مهلة التوليد)
--    idempotent: التشغيل الثاني لا يجد شيئًا.
-- ---------------------------------------------------------------------
create or replace function public.reconcile_holds(p_older_than interval default interval '30 minutes')
returns table (hold_id bigint, asset uuid, asset_status text, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select l.id as l_id, l.asset_id as l_asset, a.status as a_status
    from public.credit_ledger l
    left join public.assets a on a.id = l.asset_id
    where l.kind = 'hold' and l.status = 'held' and l.created_at < now() - p_older_than
    order by l.id
  loop
    hold_id := r.l_id;
    asset := r.l_asset;
    asset_status := r.a_status;
    if r.a_status = 'completed' then
      perform public.confirm_hold(r.l_id);
      action := 'confirmed';
    else
      perform public.release_hold(r.l_id, 'reconcile_holds: asset ' || coalesce(r.a_status, 'missing'));
      if r.a_status in ('queued', 'processing') then
        update public.assets
        set status = 'failed',
            error_code = 'PROVIDER_ERROR',
            error_message = 'انتهت مهلة التوليد — استُرجع رصيدك كاملًا',
            completed_at = now(),
            metadata = metadata || jsonb_build_object('reconciled_from', r.a_status, 'reconciled_at', now())
        where id = r.l_asset and status = r.a_status;
        action := 'released_timeout';
      else
        action := 'released';
      end if;
    end if;
    return next;
  end loop;
end;
$$;

revoke execute on function public.reconcile_holds(interval) from public, anon, authenticated;
