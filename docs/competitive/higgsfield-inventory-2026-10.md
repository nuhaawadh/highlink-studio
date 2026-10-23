# جرد منصة Higgsfield (المنافس) — أكتوبر 2026

- **تاريخ الجرد:** 2026-10-23
- **المصدر الأساسي:** سيرفر MCP الرسمي لـHiggsfield المربوط بالجلسة (أدوات `mcp__highfield__*`) — **قراءة فقط**، لم تُستدعَ أي أداة توليد/إنشاء/نشر/إنفاق رصيد.
- **المصدر الثانوي:** صفحات higgsfield.ai العامة (التسعير، المدونة، برنامج الكرييتورز) — راجع §4 و§5.
- **سياقنا:** استوديو هاي لينك (توليد صور/فيديو عربي بنظام رصيد) — المقارنة الأخرى: هلاي AI (السعودية).
- **الحساب المستخدم في الجرد:** مساحة عمل خاصة (private) على خطة `plus`، الرصيد وقت الجرد 11.77 كريدت.

## أدوات فشلت أو أرجعت فارغًا

| الأداة | النتيجة |
|---|---|
| `get_presets(source=viral, category=motion)` و`(category=product-shot)` | خطأ: `Use effects for Viral, or product-shot / motion for Marketing Studio` — تبويبات Viral الفعلية هي `effects` فقط. |
| `get_presets(source=katana, katana_source=higgsfield)` | `{"items": []}` — كتالوج Katana الرسمي فارغ لهذا الحساب؛ كتالوج المجتمع (`community`) يعمل. |
| `get_preset_instructions()` بلا وسيط | أرجع 63 وصفة فقط (recipes) ولم يُرجع أوامر `/ugc-video` `/faceless-video` `/ad-multiplier` أو عناوين Katana رغم أن وصف الأداة يذكرها. |
| `models_explore(action=get)` | لا يُرجع تكلفة الكريدت لكل نموذج — التكاليف أُخذت من `transactions` (تاريخ إنفاق الحساب) ومن تلميحات صفحة الخطط. |
| `unlim` في كل استدعاءات `models_explore` | `{"available": false}` — الحساب لا يملك "unlimited" نشطًا، فلم نستطع قراءة قائمة الإعدادات المغطاة. |
| `show_credit_reset` | `{"scenario": "none"}` — لا عرض استرجاع لهذا الحساب. |
| `show_characters` / `show_reference_elements` / `ads_studio_list_brands` | قوائم فارغة (الحساب لم ينشئ Soul أو Elements أو Brands) — الأدوات تعمل. |
| `get_workflow_instructions(faceless-video)` | 120 ألف حرف — قُرئت العناوين والقواعد الأساسية فقط (لا الملف كاملًا). |
| `WebFetch(higgsfield.ai/pricing)` | الصفحة تُحمَّل بالجافاسكربت — لم تُرجع الخطط؛ الأسعار العامة أُخذت من مصادر ثانوية مؤرخة (§4.4). |
| TikTok، المسابقات، النشر، Apps invoke | لم تُستدعَ (ممنوعة) — وُصفت من أسماء الأدوات وأوصافها فقط. |

---

## 1. خريطة المنتج: الاستوديوهات والأدوات والورك فلوز

### 1.1 الأقسام الكبرى كما تظهر من أسماء الأدوات (122 أداة في سيرفر MCP)

| القسم | الأدوات في MCP | ما يفعله |
|---|---|---|
| **التوليد الأساسي** | `generate_image`, `generate_video`, `generate_audio`, `generate_3d` + نسخ `_batch` للصور/الفيديو/الصوت، `jobs_wait`, `job_display`, `show_result`, `show_generations`, `show_generation_by_ids` | توليد عام بأي نموذج من الكتالوج (§2)، دفعات متوازية، انتظار المهام وعرضها في ويدجت. |
| **Presets / Viral Hub / Effects** | `get_presets`, `get_preset_instructions`, `execute_preset` | معرض بريسيتات متعدد المصادر: `viral`, `marketing_studio`, `genjutsu`, `soul`, `recraft`, `katana`, `what_if` (§3). |
| **Marketing Studio (v2)** | `show_marketing_studio_v2`, `show_marketing_studio_generations` + نماذج `marketing_studio_v2_video`, `marketing_studio_2_image`, `marketing_studio_v2_reference2video`, `ms_image` (DTC Ads) | معرض قوالب بتبويبات: UGC ads, product shots, motion graphics, posters, ads, marketplace. أنواع الفيديو: `2d_motion`, `hypermotion`, `mixed_media`, `saas_motion`, `ugc`, `video_mode`, `ugc_v2`, `product_link` (من رابط منتج)، `ad_reference` (من إعلان مرجعي)، `app_video` (من لقطات تطبيق). يدعم **Brand Kit** (يُسحب من موقع العلامة) و**Products** و**Avatars**. |
| **Ads Studio** | `ads_studio_list_brands`, `ads_studio_create_brand`, `ads_studio_get_brand`, `ads_studio_add_product`, `ads_studio_list_products`, `ads_studio_get_product`, `ads_studio_update_product`, `ads_studio_quote`, `ads_studio_generate`, `ads_studio_list_runs`, `ads_studio_get_run`, `ads_studio_cancel_run` | إعلانات ثابتة بنسخة إعلانية (Meta/Instagram/Facebook): بحث عن العلامة من موقعها → brand kit → منتجات → عرض سعر (quote) → توليد "run". |
| **Genjutsu** (تغليف Higgsfield) | عبر `get_presets(source=genjutsu)` + نماذج `hf_mult_motion_control`, `hf_mult_replace_object`, `hf_mult_motion_control_flash` (Genjutsu Lite = Wan 3.0 حتى 15 ث)، `hf_mult_replace_object_flash` (Genjutsu Lite = Kling 4.0) | نقل حركة من فيديو مرجعي إلى صور مرجعية، استبدال كائن/شخص في فيديو، و**Genjutsu Styles** (إعادة رسم فيديو المستخدم بأسلوب مع الحفاظ على الحركة). تبويبات: Higgsfield / Trending / New / Styles. |
| **Soul** (تغليف Higgsfield) | `show_characters` (list/train/status) + نماذج `soul_2`/`soul_v2`, `soul_cinematic`, `soul_cast`, `soul_location`, `soul_cinema_studio` | نموذج صور "واقعي UGC/أزياء" خاص بهم + **تدريب هوية** (Soul ID) من 5–20 صورة خلال ~10 دقائق، يعمل فقط مع Soul V2 وSoul Cinema. 33 "Soul Style" منسّقة. |
| **Cinema Studio** (تغليف Higgsfield) | نماذج `cinematic_studio_2_5` (صور حتى 4K)، `cinematic_studio_video`, `_v2`, `_3_0`, `_3_5`, `_video_4_0`, `cinematic_studio_image` (كاميرا/عدسة/بعد بؤري/فتحة)، `cinematic_studio_soul_cast`, `cinematic_studio_soul_location` | "مخرج سينمائي": تحكم في genre/era/camera body/lens/aperture/pacing/lighting rig/color palette؛ الإصدار 4.0 يدعم t2v وomni_reference وvideo_edit وvideo_extension (4–30 ث). |
| **Katana** | `get_katana_config`, `register_katana_result`, `show_katana_result` + `get_presets(source=katana)` | "ريمكس" فيديو مرجعي: تحرير فيديو المستخدم حسب بريف أو إعادة إنتاج أسلوب مونتاج مرجعي مع مشاهد/حركة/نصوص جديدة. يملك "free runs" مستقلة عن الرصيد. |
| **Elements (مراجع قابلة لإعادة الاستخدام)** | `show_reference_elements` (list/get/create), `manage_reference_elements` | حفظ شخصية/بيئة/خاصية من صورة واحدة فورًا، تُستدعى داخل البرومبت بـ`<<<UUID>>>`؛ تعمل مع Nano Banana Pro/2، GPT Image 2، Seedream 4.5/5 lite، Cinema Studio 2.5، Cinema Studio Video 2/3.0، Seedance 2.0، Kling 3.0 (يحتاج start_image). |
| **AI Influencer** | `ai_influencer_list_presets`, `ai_influencer_get_options`, `ai_influencer_get_settings`, `ai_influencer_prepare`, `ai_influencer_generate`, `build_ai_influencer` | بناء "character sheet" لمؤثر افتراضي من سمات (tiers: normal, freak, total, insects, frogs, cats, dogs, capybaras, birds) ثم تحريكه عبر Genjutsu. |
| **Shorts Studio** | `shorts_studio_list_presets`, `shorts_studio_create_preset`, `shorts_studio_create`, `shorts_studio_list_sessions`, `shorts_studio_status` | إعادة تصميم (restyle) شورت بأسلوب بصري من مكتبة CMS أو أسلوب خاص بالمستخدم. |
| **Explainer / Faceless** | `get_explainer_presets`, `resolve_explainer_preset` + workflow `faceless-video` | أساليب جاهزة لفيديوهات الشرح الطويلة (5 أنواع: Explainer, History, Kids, Picture Story, Fairy Tale & Myth). |
| **3D Jutsu / Scene Builder** | `scene_builder_3d_*` (19 أداة: create_project, run_python, query_python, import_asset, search_assets, generate_angles, generate_video, get_glb, get_blend, show_scene…) + نماذج `3d_jutsu_angles` | مشهد 3D مستضاف يُبنى بـPython/`bpy` (Blender 5.2 headless) مع تحكم بالمراجعات، تصدير GLB/Blend، وتوليد زوايا/فيديو من الرندر. |
| **3D Generation** | `generate_3d`, `animation_actions` + 17 نموذج 3D (§2.4) | صورة→GLB، نص→GLB، rigging، animation (678 حركة)، remesh، retexture. |
| **الصوت** | `list_voices`, `create_voice`, `create_voice_from_confirmed_audio`, `voice_change`, `dubbing` + نماذج TTS (§2.3) | TTS متعدد المحركات، استنساخ صوت، تغيير صوت فيديو، دبلجة. |
| **أدوات التحرير على أصول موجودة** | `upscale_image`, `upscale_video`, `remove_background`, `outpaint_image`, `reframe`, `motion_control` + نماذج `topaz_*`, `bytedance_*_upscale`, `video_deflicker`, `fps_boost`, `image_decompose`, `depth_anything_video`, `sync_so` (Lipsync 3), `draw_to_video` | تكبير، إزالة خلفية، توسيع، تغيير إطار، lipsync، تقسيم الصورة لطبقات، HDR (Topaz Hyperion 2.5)… |
| **Websites / Apps / Games** | `create_website`, `deploy_website`, `publish_website`, `website_repo_access`, `website_db`, `website_secrets`, `website_status`, `list_websites`, `rename_website`, `list_website_categories` + `sandbox_exec` | بناء مواقع/تطبيقات/ألعاب متصفح مستضافة على Higgsfield (3 أنواع: game, website, app). |
| **Apps Marketplace** | `apps_search`, `apps_describe`, `apps_invoke` | تطبيقات طرف ثالث داخل Higgsfield تُستدعى من MCP. |
| **المشاريع والمجلدات** | `create_project`, `get_project`, `list_projects`, `update_project`, `archive_project`, `delete_project`, `attach_project_asset`, `list_project_assets`, `copy/move/remove_project_asset`, `get_project_asset_prompt/source`, `resolve_project_assets`, `create/get/list/move/rename/delete/search_folder(s)` | تنظيم الأصول. |
| **النشر والمجتمع** | `publish_project`, `unpublish_project`, `get_project_publication`, `update_project_publication`, `save_project_publication_preview`, `confirm/cancel_project_publication_review`, `participate_in_contest` | نشر المشاريع لمعرض المجتمع (مع مراجعة)، والمشاركة في مسابقات. |
| **TikTok** | `tiktok_connect`, `tiktok_reconnect`, `tiktok_accounts`, `tiktok_prepare_publish`, `tiktok_publish_status`, `tiktok_music_trending`, `tiktok_music_tune` | ربط حسابات تيك توك والنشر المباشر + موسيقى ترند. |
| **التحليل والتنبؤ** | `virality_predictor`, `video_analysis_create`, `video_analysis_status`, `video_analysis_jobs` | توقّع انتشار الفيديو وتحليل hook/retention. |
| **الفوترة** | `balance`, `transactions`, `show_plans_and_credits`, `show_credit_reset`, `cancel_trial_auto_renewal` | §4. |
| **الميديا** | `media_upload`, `media_upload_widget`, `media_confirm`, `media_import_url`, `show_medias` | رفع/استيراد. |
| **التفضيلات/المساحات** | `get_preferences`, `update_preferences`, `list_workspaces`, `select_workspace` | مساحات خاصة وفِرَق (team_owner / team_member). |

### 1.2 الورك فلوز (SKILL.md مستضافة) — من `get_workflow_instructions()`

| الاسم | الإصدار | الوظيفة (كما وُصفت) |
|---|---|---|
| `ad-multiplier` | 1.5 | من فيديو واحد (4–30 ث) إلى نسخ إعلانية عديدة: وضع Edit (استبدال أشخاص/منتجات/خلفيات/نصوص مع حفظ الحركة والمونتاج) ووضع Recreate (إعادة تصوير نفس بنية الإعلان لسوق/لغة/جمهور/منتج آخر). |
| `ads-studio` | 1.2 | إعلانات ثابتة بنسخة إعلانية (Meta) من موقع العلامة أو رابط منتج أو صورة منتج أو برومبت. |
| `brand-asset-creation` | 1.1 | شعارات، هويات، brand kits، mockups، تغليف، لافتات، brandbooks، عروض تقديمية، بوسترات — حتى إعادة تلوين SVG رسمي. |
| `character-sheet` | 1.0 | ورقة شخصية متسقة متعددة الزوايا (photoreal-unretouched, editorial, anime/2D, 3D-stylized, game-concept). |
| `faceless-video` | 2.4 | فيديو قناة بدون وجه متعدد المشاهد براوٍ واحد وترجمة محروقة؛ 5 أنواع. |
| `katana` | — | ريمكس/تحرير الفيديو المرجعي. |
| `narration` | 1.1 | تعليق صوتي "جاهز للإنتاج": لقطات مرقّمة ضمن نوافذ زمنية ثابتة، قصة طويلة بصوت مقفول، "ضعني في هذا الفيديو" (راوٍ على الشاشة). |
| `product-photoshoot` | 1.0 | packshots، lifestyle، pins، hero banners، carousels، try-on افتراضي، CGI-style. |
| `thumbnail-generation` | 1.3 | ثمبنيل يوتيوب/إنستا بـ16 إطارًا مفاهيميًا، casting بـ11 انفعالًا، 4K عبر nano_banana_pro / gpt_image_2 / seedream. |
| `ugc-video` | — | فيديو UGC نهائي: مراجعة كرييتور، منتج فقط بصوت خارجي، unboxing، try-on، tutorial، website tour من لقطات حقيقية. |
| `video-editing` | 1.0 | تحرير فوتج أو موشن جرافيك مدعوم بملفات عبر "Higgsedit" (قص، صوت، نصوص متحركة، shaders، overlays). |
| `video-montage` | — | تجميع كليبات، موسيقى، ترجمة الكلام وحرقها. |
| `website-builder-flow` | 2026-07-25 | بناء موقع/تطبيق/لعبة على Higgsfield؛ 3 أنواع: game (multiplayer rooms)، website (مستقل)، app (Sign in with Higgsfield + fnf SDK، يُبنى بـ"Quanta"). |

### 1.3 الوصفات (Recipes) الجاهزة — 63 وصفة من `get_preset_instructions()`

كل وصفة = نموذج مقفول + برومبت رئيسي + نسبة أبعاد، تُنفَّذ بصورة منتج واحدة بلا بريف. مثال `/hero-shot`: النموذج `gpt_image_2_5` (variant `sunburst`، 2k، quality high، 3:4) مع برومبت يحافظ على النص المطبوع "لا تترجم ولا تستبدل الحروف".

- **صور (45):** angles, before-after, benefits, bundle, care-guide, color-pop, fabric-wave, feature-zoom, flatlay, gym-bag, hero-shot, how-it-works, ice-capsule, in-hand, inside-pack, kitchen-scene, luxury, main-benefit, minimalist-white, moodboard, myth-fact, new-drop, on-desk, pedestal-shot, powder-cloud, power-angle, product-match, quick-steps, reel-cover, retail-stack, saveable-tip, share-card, shelf-ready, signature-frame, specs, swipe-opener, symmetry, three-reasons, travel-pack, unboxing, usage-guide, vertical-hook, water-splash, weekend-carry, whats-inside.
- **فيديو (18):** crane-reveal, detail-scan, floating-roll, half-turn, impact, label-trace, light-sweep, liquid-wrap, macro-glide, paint-wave, product-spin, pull-back, push-in, shadow-motion, sunrise-pass, texture-track, topdown-dive, whip-pan.

> ملاحظة: نصف الوصفات "محتوى تعليمي/اجتماعي" (Saveable Tip, Three Reasons, Myth Fact, Quick Steps, Swipe Opener…) وليس مجرد تصوير منتج — أي أنهم يبيعون "كاروسيل إنستقرام جاهز" لا صورة.

---

## 2. النماذج (من `models_explore` — 59 فيديو، 50 صورة، 8 صوت، 17 ثلاثي الأبعاد)

### 2.1 نماذج الصور (50)

| معرّف النموذج | الاسم الظاهر | المزوّد الأصلي | ملاحظات (دقة/خيارات) | unlim |
|---|---|---|---|---|
| `soul_2` / `soul_v2` | Higgsfield Soul 2.0 | **Higgsfield (تغليف)** | 1.5k/2k، `style_id` من 33 Soul Style، `soul_id` هوية مدرّبة | ✓ |
| `soul_cinematic` | Soul Cinema | Higgsfield | 1.5k/2k، حتى 21:9 | |
| `soul_cast` / `cinematic_studio_soul_cast` | Soul Cast | Higgsfield | هوية شخصية سينمائية متسقة، `budget` 10–500 | |
| `soul_location` / `cinematic_studio_soul_location` | Soul Location | Higgsfield | بيئات ومواقع | |
| `soul_cinema_studio` | — | Higgsfield | `enhance_prompt`, `custom_reference_id` | |
| `cinematic_studio_2_5` | Cinema Studio Image 2.5 | Higgsfield | 1k/2k/4k | |
| `cinematic_studio_image` | Cinematic Studio Image | Higgsfield | يتطلب camera_model/lens/focal_length ids | |
| `marketing_studio_image` | Marketing Studio Image | Higgsfield | إعلانات منتج بنقرة | |
| `marketing_studio_2_image` | Marketing Studio Product Shot | Higgsfield | types: product_shots, product_shots_people, poster, ads, marketplace؛ brand_kit_id | |
| `ms_image` | DTC Ads | Higgsfield | style_id إلزامي، brand_kit، حتى 4 منتجات، batch 1–20 | |
| `image_auto` | Auto | Higgsfield | يختار النموذج تلقائيًا | |
| `autosprite` | AutoSprite Animation | Higgsfield | sprite sheet للألعاب (idle/walk/run/attack/jump + iso) | |
| `nano_banana` | Nano Banana | Google | ميزانية | ✓ |
| `nano_banana_pro` / `nano_banana_2_shots` | Nano Banana Pro | Google | 1k/2k/4k، نص ومخططات | ✓ |
| `nano_banana_2` | Nano Banana 2 | Google | 1k/2k/4k، inpaint بقناع | ✓ |
| `nano_banana_2_1` | Nano Banana 2.1 | Google | thinking_level، web/image search، مراجع فيديو، نِسب 8:1 | |
| `nano_banana_2_lite` | Nano Banana 2 Lite | Google | 1k | |
| `gpt_image_2` | GPT Image 2 | OpenAI | 1k/2k/4k، low/med/high | ✓ |
| `gpt_image_2_5` | GPT Image 2.5 | OpenAI | variants flare/sunburst، quality حتى max، خلفية شفافة | |
| `openai_hazel` | OpenAI Hazel | OpenAI | "أفضل نص"، 1:1/3:2/2:3 | |
| `seedream_v4_5` | Seedream 4.5 | Bytedance | basic 4K / high ~6K | ✓ |
| `seedream_v5_lite` | Seedream 5.0 Lite | Bytedance | | ✓ |
| `seedream_5_0_flash` | Seedream 5.0 Flash | Bytedance | حتى 2K | |
| `seedream_v5_pro` | Seedream 5.0 Pro | Bytedance | remove_bg، inpaint | ✓ |
| `3d_jutsu_angles` | 3D Jutsu Angles | Bytedance (Seedream 5.0 Pro) | زوايا جديدة لمشهد | |
| `flux_2` | FLUX.2 | Black Forest Labs | pro/flex/max، 1k/2k | ✓ |
| `flux_2_pro_outpaint` | FLUX.2 Pro Outpaint | BFL | توسيع لكل جانب بالبكسل | |
| `flux_3_image` | FLUX 3 Image | BFL | حتى 10 مراجع، 768sq→4k، batch 4 | |
| `flux_kontext` | Flux Kontext | BFL | تحرير سياقي | |
| `kling_omni_image` | Kling O1 Image | Kling | 1k/2k | ✓ |
| `grok_image` / `grok_image_2_0` | Grok Image / 2.0 | xAI | 1k/2k | |
| `ideogram_4_5` | Ideogram 4.5 | Ideogram | 5 مصادر، magic_prompt، نِسب كثيرة | |
| `ideogram_vector` | Ideogram Vector | Ideogram | SVG generate/vectorize | |
| `recraft_v4_1` | Recraft V4.1 | Recraft | standard/vector/utility/utility_vector، لوحة ألوان 10 | |
| `recraft_v4_styles` | Recraft V4 Styles | Recraft | أسلوب مخصص محفوظ | |
| `z_image` | Z Image | Tongyi-MAI | سريع ورخيص | |
| `image_background_remover` | — | — | | |
| `outpaint` | Outpaint | — | | |
| `topaz_image` / `topaz_image_generative` | Topaz | Topaz | Standard V2 / High Fidelity / Text Refine / Redefine / Recovery | |
| `bytedance_image_upscale` | Bytedance Image Upscale | Bytedance | 2k/4k + remove_bg | |
| `image_decompose` | Image Decompose | — | تقسيم لطبقات granular/standard | |

### 2.2 نماذج الفيديو (59)

| معرّف | الاسم | المزوّد | ملاحظات | unlim |
|---|---|---|---|---|
| `cinematic_studio_video_4_0` | Cinema Studio 4.0 | Higgsfield (تغليف) | t2v / omni_reference / video_edit / video_extension؛ 4–30 ث؛ 480p–1080p؛ era/camera/lens/aperture/pacing/genre/lighting/color ids | |
| `cinematic_studio_3_0` | Cinema Studio Video 3.0 | Higgsfield | 4–15 ث، حتى 4k، genre | |
| `cinematic_studio_video_3_5` | Cinematic Studio Video 3.5 | — | 480p–1080p، مراجع صوت/فيديو | |
| `cinematic_studio_video_v2` / `cinematic_studio_video` | Cinema Studio Video (v2 / v1) | Higgsfield | 3–12 ث pro/std؛ 5/10 ث slow-motion | |
| `marketing_studio_video` | Marketing Studio | Higgsfield | 12–15 ث، إعلانات TikTok/Reels | |
| `marketing_studio_v2_video` | Marketing Studio Video | Higgsfield | 10 أنواع (2d_motion, hypermotion, mixed_media, saas_motion, ugc, video_mode, ugc_v2, product_link, ad_reference, app_video)، batch 4 | |
| `marketing_studio_v2_reference2video` | Marketing Studio Reference Video | Higgsfield | إعادة إنتاج فيديو مرجعي بشخصيتك ومنتجك | |
| `ad_multiplier` | Ad Multiplier | Higgsfield (على Seedance 2.5) | | |
| `ad_multiplier_v2` | Ad Multiplier Recreate | Higgsfield | recreate / sections (hook+CTA) | |
| `hf_mult_motion_control` / `hf_mult_replace_object` | Genjutsu | Higgsfield | 480p–1080p | |
| `hf_mult_motion_control_flash` | Genjutsu Lite | Higgsfield (Wan 3.0) | حتى 15 ث | |
| `hf_mult_replace_object_flash` | Genjutsu Lite | Higgsfield (Kling 4.0) | 720p/1080p | |
| `higgsfield_preset` | Higgsfield Preset | Higgsfield | legacy image-to-video للبريسيتات | |
| `kling3_0` | Kling v3.0 | Kling | 3–15 ث، std/pro/4k، sound on/off، 16:9/9:16/1:1 | ✓ |
| `kling3_0_turbo` | Kling 3.0 Turbo | Kling | 720p/1080p | |
| `kling4_0` | Kling 4.0 | Kling | t2v/i2v/reference/video-edit، 3–30 ث، حتى 7 عناصر | |
| `kling_o3_image_reference` / `kling_o3_flf` / `kling_video_edit` | Kling 3.0 Omni / (Frames) / Omni Edit | Kling | حتى 7 مراجع؛ first/last frame؛ تحرير فيديو | |
| `kling3_0_motion_control` | Kling 3.0 Motion Control | Kling | std/pro | ✓ |
| `kling2_6` | Kling 2.6 Video | Kling | | |
| `seedance_2_0` | Seedance 2.0 | Bytedance | 4–15 ث، 480p–4k، std/fast (std يتطلب Plus+)، audio | ✓ |
| `seedance_2_0_mini` | Seedance 2.0 Mini | Bytedance | 480p/720p | ✓ |
| `seedance_2_5` | Seedance 2.5 | Bytedance | t2v / omni_reference / video_edit / video_extension | |
| `seedance1_5` | Seedance 1.5 Pro | Bytedance | | |
| `veo3_1` | Google Veo 3.1 | Google | 4/6/8 ث، basic/high/ultra، preview/fast، 16:9/9:16 فقط | |
| `veo3_1_lite` / `veo3` | Veo 3.1 Lite / Veo 3 | Google | | |
| `gemini_omni` | Gemini Omni Flash | Google | 720p، مراجع | ✓ |
| `gemini_omni_flash_1_1` | Gemini Omni Flash 1.1 | Google | 360p–4k، edit | |
| `wan2_6` / `wan2_7` / `wan3_0` / `wan3_0_prime` | Wan 2.6 / 2.7 / 3.0 / 3.0 Prime | Wan (Alibaba) | 3.0: 2–30 ث، smart duration (-1) للـunlimited فقط، thinking | 2.7 ✓ |
| `minimax_hailuo` | Minimax Hailuo | Hailuo | variants minimax / fast / 2.3 / 2.3-fast | |
| `minimax_h3` / `minimax_h3_max` | MiniMax H3 / H3 Max | MiniMax | 2K؛ 480p/768p | |
| `grok_video` / `grok_video_v15` / `grok_video_v15_lite` | Grok Video / 1.5 / 1.5 Lite | xAI | 2–15 ث | |
| `flux_3_video` | FLUX 3 Video | BFL | حتى 4k، continuation، صوت متزامن | |
| `flux_3_video_edit` | FLUX 3 Video Edit | BFL | 1 كريدت/ثانية، أول 15 ث | |
| `happy_horse_video` | Happy Horse Video | Happy Horse | | |
| `sync_so` | Sync Lipsync 3 | Sync | lipsync | |
| `dubbing` / `voice_change` | — | — | | |
| `draw_to_video` | Draw To Video | — | | |
| `reframe` | Reframe | — | | |
| `video_background_remover` / `sam_3_video` | Remove Background | Meta SAM 3 | | |
| `topaz_video` / `topaz_hyperion_2_5` / `bytedance_video_upscale` / `video_upscale` | upscalers | Topaz / Bytedance | 1080p–4k؛ SDR→HDR | |
| `video_deflicker` / `fps_boost` / `depth_anything_video` | أدوات | Bytedance/Topaz/Depth Anything | | |

### 2.3 نماذج الصوت (8)

| معرّف | الاسم | المزوّد | ملاحظات | unlim |
|---|---|---|---|---|
| `text2speech_v2` | Text to Speech V2 | Higgsfield (تغليف) | محركات: elevenlabs, minimax, seed_speech, vibe_voice, cozy_voice؛ أصوات preset أو element (مستنسخة) | ✓ |
| `seed_audio` | Seed Audio 1.0 | ByteDance | TTS + مرجع صوتي/صورة؛ wav/mp3/ogg | ✓ |
| `qwen_audio_tts` | Qwen Audio 3.0 TTS Flash | Alibaba Cloud | تعليمات انفعال/لهجة ≤128 حرفًا؛ لغات: zh,en,fr,de,ja,ko,ru,pt,th,id,vi,it,ms — **لا عربية في قائمة اللغات** | |
| `elevenlabs_v4` / `elevenlabs_v4_turbo` | Eleven v4 / Turbo | ElevenLabs | حوار حتى 10 أصوات / صوت واحد؛ 10,000 حرف | |
| `sonilo_music` | Sonilo Music | FAL | موسيقى — "Game pipeline only" | |
| `mirelo_text_to_audio` | Mirelo Text to Audio | FAL | مؤثرات صوتية — Game pipeline only | ✓ |
| `inworld_text_to_speech` | Inworld TTS | FAL | ~115 صوتًا بالاسم؛ العربية: **Nour (ar), Omar (ar)** فقط — Game pipeline only | ✓ |

> **ملاحظة مهمة:** Higgsfield يتكئ على **FAL** كمزوّد لبعض نماذج الصوت (Sonilo, Mirelo, Inworld) — نفس المزوّد الذي نبني عليه. Qwen TTS يدعم 13 لغة بلا عربية، وInworld فيه صوتان عربيان فقط.

### 2.4 نماذج 3D (17)

`sam_3_3d` (Meta, صورة→GLB)، `sam_3_3d_body` (Meta, جسم بشري)، `image_to_3d` / `meshy_image_to_3d`، `multi_image_to_3d` / `meshy_multi_image_to_3d` (1–4 صور)، `3d_rigging` / `meshy_rigging`، `meshy_v5_remesh`، `meshy_v5_retexture`، `meshy_v6_text_to_3d`، `meshy_v7_image_to_3d` (ultra_mode)، `tripo_3d` (نص→3D)، `tripo_h3_1_image_to_3d`، `tripo_h3_1_multiview_to_3d`، `tripo_p2_image_to_3d` (GLB/FBX)، `hunyuan3d_v3_image_to_3d`، `hunyuan3d_v3_1_text_to_3d` (Tencent). مكتبة حركات: 678 حركة (`animation_actions`).

### 2.5 ما هو "تغليف Higgsfield" وما هو مزوّد خارجي

| اسم Higgsfield | الحقيقة المستنتَجة من الأداة نفسها |
|---|---|
| **Soul 2.0 / Soul Cinema / Soul Cast / Soul Location** | نماذج صور تحمل اسم Higgsfield (provider_name=Higgsfield)؛ الأصل غير معلن. تدريب هوية خاص. |
| **Cinema Studio (Image 2.5 / Video 2, 3.0, 3.5, 4.0)** | طبقة "إخراج" (genre/era/lens/lighting) فوق نماذج فيديو؛ الأصل غير معلن. |
| **Genjutsu** | نقل حركة/استبدال كائن؛ النسخة "Lite" معلنة صراحة: **Wan 3.0** و**Kling 4.0**. |
| **3D Jutsu Angles** | معلن: **Seedream 5.0 Pro**. |
| **Ad Multiplier** | معلن: **Seedance 2.5**. |
| **Marketing Studio / DTC Ads / Ads Studio** | طبقة قوالب + brand kit + نسخ إعلانية فوق نماذج الصور/الفيديو. |
| **Katana** | ريمكس مرجعي (orchestration) — ليس نموذجًا. |
| **Text to Speech V2** | واجهة موحدة فوق ElevenLabs / MiniMax / Seed Speech / Vibe Voice / Cozy Voice. |
| **Auto** (`image_auto`) | موجّه تلقائي للنماذج. |

---

## 3. البريسيتات / الإفكتس

### 3.1 المصادر والفئات والأعداد

| المصدر (`source`) | الفئات | العدد المعلن (`total`) | طبيعة العنصر |
|---|---|---|---|
| `viral` (Viral Hub) | `effects` فقط (التبويبات المعروضة: All/Motion/Product shot/Effects لكن الأداة تقبل effects فقط) | **87** | `kind=chain` — سلسلة توليد (صورة→فيديو) بمعاينة فيديو |
| `marketing_studio` / `product-shot` | product_shots, product_shots_people | **418** | صور ثابتة |
| `marketing_studio` / `motion` | hypermotion, mixed_media, 2d_motion, saas_motion | **231** | فيديو موشن |
| `genjutsu` / `genjutsu-trending` | — | غير معلن (cursor وصل 3010 بعد صفحة واحدة = مرتّب حسب شعبية المجتمع) | `genjutsu-motion` مع فيديو قيادة (driving video) |
| `genjutsu` / `genjutsu-styles` | — | **20** | `genjutsu-style` (إعادة رسم فيديو المستخدم) |
| `soul` | Soul Styles | **33** | `soul-style` (أسلوب صورة) |
| `what_if` | — | 50+ (صفحة واحدة) | أساليب فيديو "ماذا لو" (شرح/إنفوجرافيك متحرك) |
| `katana` (community) | — | 20+ | ريمكس مونتاج |
| `katana` (higgsfield) | — | **0** (فارغ) | — |
| `recraft` | أساليب المستخدم الخاصة | 0 لهذا الحساب | — |

### 3.2 أمثلة الأسماء

- **Viral/Effects (87):** Floating fall, Vanish, Eyes in, Cutout, Wild ride, Lidar transition, Smash and grab, Incline, Clones, Infinite clones, Selfception, Act natural, Monster dab, Street colossus, World morphing, Studio slide, High flip, Lacewalker, Burning man, Melting, boarding pass, Frozen in motion, Architecture wave, Scrapbook collage, Stop world, Agamemnon, Earth zoom, Ink Riot, Fallen angel, Bullet time, Fairytale castle, Comic, Cold vision, Cyclope, Particles, Mighty fighter, Windows, Canvas, Pigeons, Tracking, Superstar, Pearl earring, LSD, Blue depth, Palette, Moonwalk, Knight's diary, Argus, Fragments, 2000's paparazzi…
  - نمط لافت: سلسلة "لوحات عالمية + أنت" (Fallen angel/Cabanel، Cyclope/Redon، Pearl earring/Vermeer، Argus/Rivière) بصيغة split-screen "مبنية لتنتشر".
- **Genjutsu Trending (أول 50):** Manor Bridge Blast, Street Style Swap, Soccer Dribble Master, Suit Crowd Shift, Currency Fan Shuffle, Banquet Dance, Cyber Hologram Encounter, Athlete Dance Swap, Arcade Identity Swap, Luxury Sedan Arrival, Skyway Chase, Football Showstopper, Studio Rap Performance, Subway Hero Swap, Car Selfie Swap, Fashion Film Strut, Desert Truck Jump, Midnight Fridge Feast, Midnight Sports Car Drive, Studio Product Showcase, Unboxed Item Swap, City Skydive, Colossal City Stroll, Custom Car Replacement…
- **Genjutsu Styles (20):** Hand-Painted Cel Animation, Knitted Yarn World, Expressive 2D Animation, Rounded Toy CGI, Felt Puppet Stop Motion, Grotesque Street CGI, Warm Painterly 3D Animation, Graphic Cel, Expressive Gouache Fashion, Sculptural 3D Fashion, Chunky Textured Low-Poly, Cel-Shaded CG Anime, Painterly Cinematic 3D, Outline-free Cel, Painterly Sculpted Animation, Neon Graphic Cinematic 3D, Textured Gouache Character Illustration, Comic 3D, Retro Game 3D, Nighttime Anime Pixel Art.
- **Soul Styles (33):** General, Warm ambient, Y2K studio, Swag era, Theatrical light, Y2K street, Flash editorial, Old smartphone, Street photography, Retro BW, Asian nostalgia, Surreal solarization, Subtle flash, Digital camera, Siren, Mystique city, Candy pop, Double exposure, 2000s band, Frutiger aero, Drain, Extraterrestrial, Editorial street style, Nature light, New Indie, Underwater, 80s horror, Disposable camera, Neutral pastel film, Warm vivid film, BW film, Warm contrast film, Muted cool film.
- **Marketing Studio product-shot (418):** Chilled Can, Ice Cube Hover, Brushed Tin, Linen Lid Lift, Golden Dew, Off Kilter, Pistachio Void, Buried in Ice, Slanted Shelf Duo, Paint Puddle, Cozy Pour, Takeout Hand-Off, Spa Morning, Poolside Float, Crescent Shadow, Botanical Shadows, Checkerboard Mosaic, Fruit Ice Bed, Retro Hotline, Uncapped Macro, Workout Mat, Peach Sphere, Fingertip Drop, Open Tote, Focus Pull Trio, Everyday Carry, Picnic Trio, Volleyball Sky…
- **Marketing Studio motion (231):** Monospace Callouts, Pixel Block Yard, Pastel Shape Choreography, Echo Wave, Wheatpaste Wall, 90s Bedroom CRT, Retro Starburst Orbit, Ink & Ribbon, Green Tea Macro, Halftone Street Collage, Storybook Page Turns, Vibrant Carousel, Claymation Storm, Fashion Editorial Reveal, Acid Graphic, Chrome Core, Candy Color Swap, DVD Collage, Chili Burst, Liquid Gold, Y2K Flip Phone, Signal Red HUD, Split Flap Scoreboard, Denim Flatlay…
- **What If (أساليب فيديو شرح):** Haze Countdown, Pixel Night, Heatwave Park, Night Scan, Toy Planet, Lowpoly Skyline, Ink & Gold, Astro HUD, Cutaway Lab, Grain Poster, Wash Atlas, Ops Console, Rubber Hose, Blueprint Line, Gold Studio, Woodblock Wave, Swiss Grid, Candy Diner, Paper Atlas, Sitcom Mini, Pastel Clay…
- **Katana community:** Industrial Style Lookbook, Gentleman Driver Style, candy-pop, Daytona Drift, Pop Cutout Fashion Edit, monolith, Aura Fast, Track Day Showcase, Surreal Collage Vibe, Kinetic Graphic Photo Edit, FW26 Style Lookbook, Chrome Noir Style Edit, Pop Art Comic Edit, Swole Cinema Aesthetic, High Octane Turbo Sprint, Noir Crowned Fashion Montage, comic, Kinetic Tech Edit, Monochrome Glitch Montage, Camera Shots.

### 3.3 كيف تُسعَّر البريسيتات

- لا سعر ثابت في الكتالوج؛ السعر يظهر فقط عند فتح البريسيت بمدخلات (`get_presets` بـ`preset_id` + `initial_inputs`) في حقل `execution.cost_credits` مع `execution.readiness`، أي **تسعير ديناميكي حسب النموذج الكامن والدقة والمدة**.
- Katana لديه "free runs" مستقلة (`free_generation: true` في `get_katana_config`)، وGenjutsu "free gens" غير متاحة عبر MCP.
- Soul Styles وRecraft Styles ليست بريسيتات تُنفَّذ، بل `style_id` يُمرَّر للنموذج (`soul_2` / `recraft_v4_styles`).

---

## 4. التسعير والرصيد (من `show_plans_and_credits` + `balance` + `transactions`)

### 4.1 الخطط (كما أرجعتها الأداة، بالدولار)

| الخطة | الكريدت/شهر | شهري | سنوي (لكل شهر) | توازي | أبرز ما يُذكر |
|---|---|---|---|---|---|
| **PLUS** ("For consistent and easy AI content creation") | 1,000 (التلميح: ~4,800 صورة أو ~200 فيديو أو ~60 شخصية؛ "= 600 Nano Banana Pro" و"~200 Kling 3.0") | غير معروض عبر MCP (0) | **$39** (أصلي $49، خصم 20%) | 6 فيديو + 8 صور | Seedance 2.0 كامل، "unlimited marketplace"، 2 GB تخزين، supercomputer Efficient+Smart، 2 scheduled jobs |
| **ULTRA** ("For creators building AI projects", BEST VALUE / most popular) | 3,000 (~12,000 صورة أو ~500 فيديو أو ~100 شخصية؛ "= 1,500 Nano Banana Pro"، "~500 Kling 3.0") | **$129** | **$99** (أصلي $129، خصم 23%) | 8 فيديو + 8 صور | "Lowest cost per credit — 70% cheaper"، 5 GB، 10 scheduled jobs، خطط 18 شهرًا وسنتين |

- **Unlimited / Free Gens (حوافز مؤقتة "Buy until Oct 24"):**
  - 365-Day Unlimited على: Seedream 5.0 Lite (2K/3K)، Flux.2 Pro (1K)، Seedream 4.5 (2K/4K)، Nano Banana، Kling O1 Image، GPT Image.
  - 7-Day Unlimited: Nano Banana 2 (1K/2K) لكل الخطط؛ Kling 3.0 (720p/5s) للسنوي؛ Nano Banana Pro لـULTRA فقط ("NO UNLIMITED" على PLUS).
  - Soul V2 & Cinema "Free Gens": 3,000 (Plus شهري) / 5,000 (Plus سنوي وUltra شهري) / 10,000 (Ultra سنوي).
  - ملاحظة الأداة: "Available on web" — أي أن الـunlimited لا يُصرف عبر MCP (`unlim_trial_in_mcp_active: false`).

### 4.2 التعبئة (Top-up) — تنتهي بعد 90 يومًا

| الحزمة | السعر | السعر الأصلي | الخصم | كريدت/دولار |
|---|---|---|---|---|
| 500 | $29.41 | $42.50 | 31% | 17 |
| 1,000 | $55.56 | $85.00 | 35% | 18 |
| 2,000 | $105.26 | $170.00 | 38% | 19 |
| 4,000 (الأكثر شعبية) | $210.53 | $340.00 | 38% | 19 |

- **Auto-refill:** عتبة 100 كريدت؛ خيارات $10/$20/$30/$50/$100 ← 181/363/545/909/1818 كريدت (18 كريدت/دولار)؛ الأداة تدفع نحوه أولًا ("Best move: turn on auto-refill once").
- **التجربة:** `trial_status.eligible: false` لهذا الحساب؛ وصف الأداة يذكر "3-day $0 Plus trial with MCP-only credits" يتطلب بطاقة ويتجدد تلقائيًا ما لم يُلغَ (`cancel_trial_auto_renewal`).
- **Credit reset:** أداة `show_credit_reset` (/reset-credits) لعرض "عرض استرجاع" — راجع التحديث أدناه.
- **فرق (Team):** مساحات `team_owner` / `team_member`؛ العضو لا يشتري.

### 4.3 تكلفة العمليات الفعلية (من سجل `transactions` لهذا الحساب)

| النموذج (كما في السجل) | الكريدت لكل عملية |
|---|---|
| Nano Banana 2.1 (صورة) | 2 |
| GPT Image 2.5 Flare / Sunburst (صورة) | 2.75 |
| Recraft V4.1 (صورة) | 1.25 |
| Bytedance Image Upscale | 2 |
| Seed Audio 1.0 (TTS، جمل قصيرة) | 0.4 – 1.1 |
| Kling 2.6 Video | 5 |
| Seedance 2.5 (فيديو) | 35 / 45 / 60 / 105 / 240 (حسب المدة/الدقة) |
| FLUX 3 Video Edit (من وصف النموذج) | 1 كريدت/ثانية |

- معادلة تقريبية: على ULTRA السنوي ($99 ÷ 3,000) الكريدت ≈ **$0.033**؛ على PLUS السنوي ($39 ÷ 1,000) ≈ **$0.039**؛ التعبئة ≈ $0.053–0.059. (مقارنة: استوديو هاي لينك يسعّر الكريدت بـ$0.042 ÷ 3 هامش — راجع `packages/shared/pricing.ts`.)
- أي صورة Nano Banana 2.1 ≈ $0.07–0.12، وفيديو Seedance 2.5 قصير ≈ $1.2–2.4 للمستخدم النهائي.
- من وصف الأداة: اشتراك الكريدت الشهري **لا يُرحَّل** (ينتهي مع الدورة)، والتعبئة تنتهي خلال 90 يومًا وتُستهلك بعد كريدت الاشتراك.

### 4.4 الأسعار العامة على الويب (للتمييز عن خطط MCP) — متقلبة وترويجية

الخطط التي أرجعها MCP (`PLUS`/`ULTRA` بروابط `mcp-pricing`) **تختلف** عن خطط الموقع العام. مصادر ثانوية مؤرخة:

| المصدر والتاريخ | الخطط كما وردت |
|---|---|
| blog.segmind.com (التُقط من حساب مسجّل في 2026-08-05) | **Basic** $9/شهر = 120 كريدت؛ **Pro** $29 شهري / $18 سنوي = 600 كريدت؛ **Max** $79 شهري ($59 أول شهر) / $41 سنوي = 1,800 كريدت. كلفة الكريدت: Basic $0.075، Pro $0.048/$0.030، Max $0.044/$0.023. Nano Banana Pro = 2 كريدت؛ Seedance 2.0 ≈ 22 كريدت؛ Seedance 2.0 Fast ≈ 17 كريدت (Basic لا يصل إلى Seedance 2.0 الكامل). |
| creatify.ai (مقارنة تسويقية، 2026 بلا تاريخ) | Free: "10 credits/day, basic models only" (بلا Veo 3.1/Kling 3.0)؛ Starter $15 = 200؛ $34 = 1,000؛ $84 = 3,000؛ **Teams $49/مقعد/شهر سنويًا**. |
| higgsfield.ai/ambassador-program | يذكر "the $249 monthly Creator plan". |
| meta keywords في صفحة التسعير | "Basic Pro Ultimate Creator"، "credit-based pricing"، ورابط Enterprise. |

> الخلاصة: أسماء الخطط وأسعارها تتغير كل بضعة أسابيع (Basic/Pro/Max/Ultimate/Creator/Plus/Ultra) مع عروض "أول شهر" و"Buy until" — نموذج تسعير قائم على الاستعجال لا على الوضوح.

---

## 5. ميزات التوزيع والنمو

### 5.1 داخل المنصة (من MCP)

| القناة | ما رأيناه |
|---|---|
| **MCP نفسه** | **122 أداة** على سيرفر واحد. النمط: (أ) كل أمر `/x` يُحلّ عبر `get_preset_instructions` إلى وصفة بنموذج مقفول وبرومبت رئيسي؛ (ب) كل مهمة مركّبة = SKILL.md مستضاف يُحمَّل عبر `get_workflow_instructions` ومعه ملفات مرجعية وسكربتات تُنفَّذ داخل `sandbox_exec` (ffmpeg/python/Whisper) — أي أنهم يبيعون "وكيل إنتاج" لا API؛ (ج) الأدوات تحمل نصوص مبيعات داخل وصفها (auto-refill أولًا، روابط checkout جاهزة، "relay verbatim")؛ (د) ويدجتات تفاعلية في العميل (معرض بريسيتات، خطط، صوت، شخصيات). |
| **السكيلز المستضافة** | 13 ورك فلو (§1.2) + 63 وصفة (§1.3) + 5 مراجع 3D Jutsu + حزم ملفات (ugc-video: 33 ملفًا؛ faceless-video: 30 ملفًا منها سكربتات تحقق وقياس تعليق صوتي). ورك فلو `faceless-video` وحده 120 ألف حرف من القواعد (بوابات GATE 0–6، صوت مقفول `voice.lock`، Whisper tiny للتحقق). |
| **TikTok** | 7 أدوات: ربط حسابات (`tiktok_connect/reconnect/accounts`)، تجهيز نشر وتتبع حالته، **موسيقى ترند** (`tiktok_music_trending`) و"tune" للموسيقى. لم تُستدعَ. |
| **المجتمع والنشر** | نشر المشروع لمعرض المجتمع عبر مراجعة (`publish_project` → `confirm/cancel_project_publication_review` + `save_project_publication_preview`)، و`participate_in_contest` للمسابقات. ترتيب "Trending" في Genjutsu وKatana community مبني على المجتمع (cursor بالآلاف). فئات موقع/تطبيقات المستخدمين (`list_website_categories`): Viral Trends، Ads & Marketing، UGC & Social (Shorts Studio, Personal Clipper, Explainer)، Cinematic (Cinema Studio, Originals, storyboard)، Characters & Avatars (Soul ID, Photodump, Face Swap, Character Swap)، Product & E-commerce، Portrait & Lifestyle، Other. |
| **Apps Marketplace** | `apps_search` أرجع تطبيقًا واحدًا قابلًا للاستدعاء من MCP: **"Match Cut + Tracelab"** (28 إجراء: facecut, logocut, productcut, stickercut, typewriter, commentcut, CRT, VHS, nokia, thermal, glitch…). الموقع يذكر "80+ apps" (Face Swap, Lipsync Studio, AI Headshot, Skin Enhancer, Product Placement, Outfit Swap, Commercial Faces, Angles 2.0). |
| **Websites/Apps/Games** | بناء مواقع وتطبيقات وألعاب مستضافة على Higgsfield مع "Sign in with Higgsfield" وSDK — أي منصة تطبيقات طرف ثالث فوق مولّداتهم. |
| **الأصوات** | `list_voices`: 122 صوتًا (صفحة أولى 100 + `has_more`)، كلها أسماء غربية (Grady, Ainsley, Cillian…) + أصوات المستخدم المستنسخة (`element`). الصوت الافتراضي في faceless-video: **Cillian**. لا صوت عربي في القائمة. |
| **AI Influencer** | 39 بريسيت شخصية (AI Influencer 01…52) بإعدادات قابلة لإعادة الإنتاج؛ السمات تشمل `ethnicity: middle_eastern` و`st_olive/tan/brown` — لكن لا حجاب/ثوب/شماغ في أي مجموعة (hair/accessory/aesthetic). |
| **Explainer / Shorts** | 22 أسلوب Explainer كلها 9:16 (Editorial Motion Graphics, Stickman Cartoon, Watercolor Chronicle, Fairy Tale & Myth, Paper Diorama, Pastel Flat 2D, Colorful 3D, Hand Drawn, Poster Vector, Mannequin, Whiteboard Doodle, 3D Papercraft, Mixed Media, Low Poly, 2D Illustrator, Pixel Art, Claymotion, Isometric Flat Vector, 3D Mix, Studio 3D, Fluffy Toy, Paper collage). Shorts Studio: 8+ أساليب (Bold Urban, Green Contrast, Urban Serenity, Warm Glow, Yellow Frame, Monochrome Vibes, Claymation, Marker Scribble) + إنشاء أسلوب خاص. |
| **التنبؤ والتحليل** | `virality_predictor` (hook/retention/attention) و`video_analysis_*` — طبقة "تحليل قبل النشر". |
| **Similarity Scoring** (ويب) | مارس 2026: فحص تشابه مع شخصيات/مشاهير/شعارات قبل التسليم لعملاء Team (دقة معلنة 86.6%). |

### 5.2 برامج الكرييتورز والأفلييت (من الويب)

| البرنامج | التفاصيل كما وردت |
|---|---|
| **Affiliate Program** (مدونة 2026-08-24، higgsfield.ai/affiliate) | عمولة "Up to 25% of the plan price" تتصاعد مع الإيراد، لمدة "up to 12 months" من تسجيل المُحال، المحال يحصل على "up to 50% off" لمدة 3 ساعات بعد الدخول من الرابط. ممنوع الإعلانات المدفوعة والمزايدة على اسم العلامة ومواقع الكوبونات. مثال الحاسبة: 10 إحالات/شهر × $100 × 25% = "$19,500 over 12 months". |
| **Ambassador Program** (عبر Impact) | "up to 15% commission" على كل مشتريات المُحالين حتى 12 شهرًا، نافذة تتبع 30 يومًا، دفع شهري بالدولار بحد أدنى $50؛ مثال: مشترك Creator بـ$249/شهر لـ9 أشهر = $336.15. |
| **Creator Partnership Program (CPP)** | بلا حد أدنى للمتابعين (نطاقات: Under 5K → 500K+)، مراجعة بشرية، المقابل: خطة كاملة تتجدد شهريًا + كريدت إضافي للأفلام والمسلسلات، playbooks، وصول مبكر، مجتمع في "35+ countries"، عرض الأعمال في قنواتهم. الالتزام: الإشارة إلى Higgsfield والتفاعل مع الإطلاقات. |
| **Higgsfield Earn** (creators.higgsfield.ai) | حملات مدفوعة: مبلغ ثابت مضمون لكل تسليم + مكافأة أداء بعد أسبوع؛ Instagram/YouTube/X؛ الدفع عبر Garna؛ متاح حسب الدولة. |
| **Karma / Collab** | نقاط Karma من ميزة Collab تُستبدل بكريدت (مذكورة في مركز المساعدة). |
| **B2B / Enterprise** | عبر Contact Sales (Team plan: Similarity Scoring، Teams $49/مقعد/شهر سنويًا حسب creatify). |

### 5.3 التكاملات (من الويب، thepostflow 2026-10-14)

- إضافات: **DaVinci Resolve** (7 أدوات + AI LUT، 2026-06-07)، **Premiere Pro / After Effects** (2025+)، Photoshop، Figma، Blender، وإضافة Chrome "Reference Extension".
- **MCP لـClaude وغيره**؛ سكيل Claude لـ**Katana** (2026-10-08)؛ "MCP Production bundle" لتدريج الألوان في Resolve Studio (2026-09-23).

### 5.4 خط زمني لإطلاقات 2026 (ويب)

| التاريخ | الإطلاق |
|---|---|
| يناير 2026 | تمديد Series A بـ$80M (تقييم >$1.3B)؛ دراسة حالة OpenAI (2026-01-21). |
| مارس 2026 | Similarity Scoring لعملاء Team. |
| 2026-06-07 | إضافة DaVinci Resolve. |
| 2026-08-12 | **Cinema Studio 4.0** على Seedance 2.5: حتى 30 ث، حتى 50 مرجعًا، صوت أصلي، 1080p. |
| 2026-08-21 | Relight وColor Palette كأدوات مستقلة. |
| 2026-08-27 | FLUX 3 Video Upscaler. |
| أغسطس 2026 | **Series B بـ$400M، تقييم $5.4B** (Inc.)؛ 361M زيارة يناير–يوليو 2026؛ ~300 موظف؛ run-rate معلن $200M نهاية 2025. |
| 2026-09-01 | **Genjutsu** (motion transfer + object swap؛ مرجع 3–30 ث؛ حتى 40 صورة مرجعية؛ "free trial"). |
| 2026-09-23 | MCP Production bundle (Claude/Codex). |
| 2026-10-08 | **Katana** كسكيل Claude (يعيد بناء المونتاج من مرجع). |
| أكتوبر 2026 (من MCP) | Kling 4.0، Seedance 2.5 (omni_reference/video_edit/extension)، Wan 3.0/Prime، Gemini Omni Flash 1.1، GPT Image 2.5، Nano Banana 2.1، FLUX 3 Image/Video، Ideogram 4.5/Vector، Meshy 7، Tripo P2/H3.1، 3D Jutsu، Ads Studio، Shorts Studio، AI Influencer، What-If styles، Genjutsu Styles وLite. |

---

## 6. ثغرات يمكن لمنصة عربية استغلالها

1. **الصوت العربي غائب كليًا:** 122 صوتًا بلا اسم عربي؛ Qwen TTS بـ13 لغة بلا عربية؛ Inworld صوتان عربيان فقط ومقيدان بـ"Game pipeline only"؛ الصوت الافتراضي للفيديو بلا وجه "Cillian". TTS/دبلجة بلهجة سعودية/خليجية + ترجمة محروقة عربية صحيحة = تمييز مباشر لا يملكونه.
2. **الخط العربي داخل الصور والفيديو غير معالج:** وصفة `/hero-shot` تأمر النموذج "لا تترجم ولا تستبدل الحروف" بلا أي دعم RTL؛ لا بريسيت واحد مصمم للعربية بين 87 Viral و418 product-shot و231 motion. بوستر/كاروسيل عربي صحيح التشكيل والاتجاه يبقى ثغرة (Nano Banana Pro وGPT Image 2.5 متاحان لنا عبر Replicate/fal).
3. **التسعير بالدولار وStripe فقط:** لا ريال، لا مدى/Apple Pay/STC Pay، لا فاتورة ضريبية سعودية، ولا خطة فريق محلية. ما نبنيه (Paylink/Moyasar بالريال، `pricing.ts`) يغلق هذه الفجوة.
4. **تعقيد يطرد المستخدم الصغير:** 122 أداة، 59 نموذج فيديو، 50 نموذج صورة، 7 مصادر بريسيتات، 13 ورك فلو، ومصطلحات خاصة (Soul/Genjutsu/Katana/Jutsu). صاحب متجر سلة/زد يحتاج 5 استوديوهات بأسماء عربية واضحة (`content/studios/*.json`) لا كتالوجًا.
5. **حزم غالية وتنتهي بسرعة:** أرخص دخول جدي $39/شهر سنويًا (MCP) أو $9 لـ120 كريدت (= 60 صورة فقط)؛ التعبئة من $29 وتنتهي خلال 90 يومًا؛ كريدت الاشتراك لا يُرحَّل؛ auto-refill مدفوع بإلحاح داخل الأداة. حزم صغيرة بالريال بلا انتهاء قريب + رصيد مُرحَّل = عرض أوضح.
6. **تسعير قائم على الاستعجال:** "Buy until Oct 24"، "7-Day Unlimited"، "أول شهر $59 ثم $79"، أسماء خطط تتبدل (Basic/Pro/Max/Plus/Ultra/Creator)، وunlimited "على الويب فقط". عرض سعر ثابت لكل عملية قبل التوليد (كما في `generate-media`) يبني ثقة.
7. **لا محتوى محلي:** لا رمضان/عيد/اليوم الوطني/موسم الرياض، لا عقار/مطاعم/عبايات/عطور، وقوالب product-shot غربية (Chilled Can, Yellow Cab Carry, Clay Court Chic). مكتبة قوالب موسمية وقطاعية سعودية (عقار، مطاعم، عيادات، متاجر) فجوة واضحة.
8. **الهوية البصرية للشخصيات غربية:** AI Influencer فيه `middle_eastern` كعرق لكن بلا حجاب/ثوب/شماغ/غترة في أي مجموعة سمات؛ Soul Styles وViral effects (Vermeer, Cabanel, Y2K, paparazzi) غربية. "شخصية سعودية متسقة" (Elements/Soul محلي) لمتاجر الأزياء والعطور ثغرة.
9. **التبعية على نفس المزوّدين:** Genjutsu Lite = Wan 3.0 وKling 4.0؛ Ad Multiplier = Seedance 2.5؛ 3D Jutsu = Seedream 5.0 Pro؛ وجزء من الصوت عبر FAL. القيمة في طبقة التغليف العربية لا في النموذج — ونماذجهم الأساسية متاحة لنا بالتكلفة نفسها تقريبًا.
10. **أفكار تُنسخ بسرعة وبتكلفة قليلة:** (أ) 63 وصفة "محتوى اجتماعي" (Three Reasons, Saveable Tip, Swipe Opener, Reel Cover) = ستوديو "كاروسيل إنستقرام عربي"؛ (ب) `product_link` (رابط منتج → إعلان) = "رابط سلة/زد → فيديو"؛ (ج) Brand Kit من موقع العلامة؛ (د) Ad Multiplier Recreate لتعريب إعلان أجنبي؛ (هـ) أفلييت 25%/12 شهرًا وبرنامج كرييتورز بلا حد متابعين — قابل للتطبيق على مجتمع Monetify.
