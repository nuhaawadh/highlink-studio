// بديل محلي لأنواع Deno — للتحقق من أنواع Edge Functions بـtsc بلا Deno (CLAUDE.md: لا Deno محليًا).
// يغطي ما تستخدمه وظائفنا فقط؛ أي API جديدة من Deno تُضاف هنا.
declare namespace Deno {
  const env: { get(key: string): string | undefined }
  function serve(handler: (req: Request) => Response | Promise<Response>): void
}
declare module 'npm:zod@4' {
  export * from 'zod'
}
declare module 'npm:@supabase/supabase-js@2' {
  export * from '@supabase/supabase-js'
}
