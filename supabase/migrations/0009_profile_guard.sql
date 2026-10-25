-- =====================================================================
-- 0009_profile_guard.sql — حارس أعمدة profiles (اكتُشف 2026-10-25 أثناء بناء صفحة الحساب)
-- سياسة "profiles: update own" (0001) تسمح للمستخدم بتعديل صفه كاملًا عبر PostgREST، ومنه plan_id:
-- أي مستخدم كان يقدر يرفع نفسه لباقة creators (تزامن 8 في claim_and_hold، حدود API في 0004، ولاحقًا
-- التجديد الشهري يمنح رصيد الباقة)، ويحجز username ويضع avatar_url أي رابط.
-- قائمة سماح: المستخدم يعدّل display_name وlocale فقط (صفحة الحساب)؛ أي عمود آخر — وأي عمود يُضاف لاحقًا —
-- للسيرفر (service_role) أو الأدوار الإدارية، مثل assets_guard_user_update (0003).
-- التحقق من الطول واللغة على ما تغيّر فقط، فاسم طويل من التسجيل لا يمنع تغيير اللغة.
-- لا يغيّر بيانات ولا يحذف شيئًا (القاعدة 8). الاختبار: supabase/tests/credits.test.sql T25.
-- المراجعة الثانية (2026-10-25): قائمة سماح بدل قائمة منع، والتحقق على التغيير فقط، واختبارات created_at/upsert/username.
-- تنبيه للمستقبل: عمود يحدّثه trigger تلقائيًا (مثل updated_at) لازم يُطرح هنا أيضًا، أو يُسمّى الـtrigger حقه بحيث يأتي
-- بعد profiles_guard_user_update أبجديًا — وإلا رُفض كل تعديل من المستخدم.
-- =====================================================================

create or replace function public.profiles_guard_user_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if (to_jsonb(new) - 'display_name' - 'locale') is distinct from (to_jsonb(old) - 'display_name' - 'locale') then
      raise exception 'FORBIDDEN_COLUMN_UPDATE';
    end if;
    if new.locale is distinct from old.locale and new.locale not in ('ar', 'en') then
      raise exception 'INVALID_LOCALE';
    end if;
    if new.display_name is distinct from old.display_name and char_length(coalesce(new.display_name, '')) > 60 then
      raise exception 'INVALID_DISPLAY_NAME';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_user_update on public.profiles;
create trigger profiles_guard_user_update
  before update on public.profiles
  for each row execute function public.profiles_guard_user_update();
