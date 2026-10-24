-- =====================================================================
-- 0005_concurrency_reconcile.sql — backlog B2 وB9 (قبل الفيديو)
--   B2: claim_and_hold — حد التزامن من الباقة + حجز الأصل (queued → processing) + حجز الرصيد
--       في معاملة واحدة تحت قفل المستخدم الاستشاري نفسه الذي يستخدمه hold_credits.
--   B9: reconcile_holds بمهلة حسب نوع الأصل (صورة 30 د، فيديو 120 د)؛ الأصل processing الذي له مهمة عند المزوّد
--       لا يُعتبر فاشلًا هنا بل يُعاد كـ`provider_check` لتسأل Edge Function `reconcile` المزوّد عن حالته.
-- الاختبارات: supabase/tests/credits.test.sql T11–T14
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) claim_and_hold
-- ---------------------------------------------------------------------
create or replace function public.claim_and_hold(p_user uuid, p_asset uuid, p_amount int, p_provider text, p_model text, p_type text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max         int;
  v_processing  int;
  v_rows        int;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  -- نفس قفل hold_credits (قابل لإعادة الدخول داخل المعاملة)
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select pl.max_concurrent into v_max
  from public.profiles pr join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user;
  v_max := coalesce(v_max, 1);

  -- الحجز أولًا (أصل محجوز مسبقًا → ALREADY_CLAIMED قبل أي فحص آخر)، ثم عدّ processing شاملًا هذا الأصل
  update public.assets
  set status = 'processing', provider = p_provider, cost_credits = p_amount, model = p_model, type = p_type
  where id = p_asset and user_id = p_user and status = 'queued';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'ALREADY_CLAIMED';
  end if;

  select count(*) into v_processing
  from public.assets a
  where a.user_id = p_user and a.status = 'processing' and a.deleted_at is null;
  if v_processing > v_max then
    raise exception 'RATE_LIMITED';   -- يلغي حجز الأصل أعلاه
  end if;

  -- أي استثناء هنا (INSUFFICIENT_CREDITS) يلغي حجز الأصل أعلاه أيضًا
  return public.hold_credits(p_user, p_amount, p_asset);
end;
$$;
revoke execute on function public.claim_and_hold(uuid, uuid, int, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 2) reconcile_holds بمهلة حسب النوع + provider_check
-- ---------------------------------------------------------------------
drop function if exists public.reconcile_holds(interval);

create or replace function public.reconcile_holds(
  p_image_older_than interval default interval '30 minutes',
  p_video_older_than interval default interval '120 minutes'
)
returns table (hold_id bigint, asset uuid, asset_status text, asset_type text, provider text, provider_job_id text, age interval, action text)
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
begin
  for r in
    select l.id as l_id, l.asset_id as l_asset, a.status as a_status, a.type as a_type, a.provider as a_provider,
           a.provider_job_id as a_job, now() - l.created_at as l_age, a.id as a_id
    from public.credit_ledger l
    left join public.assets a on a.id = l.asset_id
    where l.kind = 'hold' and l.status = 'held'
      and l.created_at < now() - (case when a.type = 'video' then p_video_older_than else p_image_older_than end)
    order by l.id
  loop
    hold_id := r.l_id; asset := r.l_asset; asset_status := r.a_status; asset_type := r.a_type;
    provider := r.a_provider; provider_job_id := r.a_job; age := r.l_age;
    if r.a_status = 'completed' then
      perform public.confirm_hold(r.l_id);
      action := 'confirmed';
    elsif r.a_status = 'processing' and r.a_job is not null then
      -- المهمة عند المزوّد: لا نقرر هنا — Edge Function `reconcile` تسأل المزوّد وتُنهي
      action := 'provider_check';
    else
      perform public.release_hold(r.l_id, 'reconcile_holds: asset ' || coalesce(r.a_status, 'missing'));
      if r.a_status in ('queued', 'processing') then
        update public.assets
        set status = 'failed',
            error_code = 'PROVIDER_ERROR',
            error_message = 'انتهت مهلة التوليد — استُرجع رصيدك كاملًا',
            completed_at = now(),
            metadata = metadata || jsonb_build_object('reconciled_from', r.a_status, 'reconciled_at', now())
        where id = r.a_id and status = r.a_status;
        action := 'released_timeout';
      else
        action := 'released';
      end if;
    end if;
    return next;
  end loop;
end;
$$;
revoke execute on function public.reconcile_holds(interval, interval) from public, anon, authenticated;
