/**
 * المركز القانوني — بنية على نمط هلاي: كل بند = جملة واحدة + ثلاث نقاط.
 * المستندات: شروط الخدمة (20 بندًا)، سياسة الخصوصية (17 بندًا)، سياسة الاسترداد، حذف البيانات.
 * المواقف المتعمدة: السلع الرقمية والرصيد غير قابلة للاسترداد إلا عند فشل تقني؛ العمر 18+ (هلاي 13+ بموافقة ولي الأمر — قرار مُتعمد لتقليل المخاطر).
 */
export type LegalKind = 'terms' | 'privacy' | 'refund' | 'deletion'
export interface LegalSection {
  h: string
  p: string
  li: string[]
}
export interface LegalDoc {
  title: string
  updated: string
  sections: LegalSection[]
}

const UPDATED = { ar: '22 أكتوبر 2026', en: 'October 22, 2026' }
const ENTITY = { ar: 'هاي لينك (نشاط مرخّص بوثيقة عمل حر في المملكة العربية السعودية)', en: 'Highlink (a business licensed under a Saudi freelance document)' }

export const legal: Record<'ar' | 'en', Record<LegalKind, LegalDoc>> = {
  ar: {
    terms: {
      title: 'شروط الخدمة',
      updated: UPDATED.ar,
      sections: [
        {
          h: '1. قبول الشروط',
          p: `باستخدامك استوديو هاي لينك فأنت تبرم اتفاقية ملزمة مع ${ENTITY.ar}.`,
          li: ['استخدام المنصة بأي شكل يعني قبولك الكامل لهذه الشروط', 'تسري على الزوار والمستخدمين المسجلين وعملاء واجهة البرمجة', 'قد نحدّث الشروط دوريًا، ويُعد استمرارك في الاستخدام قبولًا للنسخة المحدّثة'],
        },
        {
          h: '2. الأهلية',
          p: 'يجب أن يكون عمرك 18 عامًا فأكثر لإنشاء حساب أو الشراء.',
          li: ['المنصة غير موجهة لمن هم دون 18 عامًا ولا نجمع بياناتهم عن علم', 'باستخدامك المنصة تقرّ بأنك تملك الأهلية القانونية للتعاقد', 'يُحظر الاستخدام حيثما يمنعه النظام المحلي للمستخدم'],
        },
        {
          h: '3. تسجيل الحساب',
          p: 'الوصول إلى أدوات التوليد يتطلب حسابًا صالحًا.',
          li: ['يجب أن تكون بيانات الحساب صحيحة ومحدّثة', 'حساب واحد لكل شخص، والحسابات المكررة تُدمج أو تُغلق', 'نحتفظ بحق رفض تقديم الخدمة لأي جهة'],
        },
        {
          h: '4. أمن الحساب',
          p: 'أنت المسؤول الوحيد عن سرية بيانات الدخول وكل ما يتم عبر حسابك.',
          li: ['أبلغنا فورًا عن أي استخدام غير مصرح به', 'لا نتحمل الخسائر الناتجة عن إهمال حماية الحساب', 'يُحظر مشاركة الحساب بين عدة أشخاص'],
        },
        {
          h: '5. وصف الخدمة',
          p: 'تقدّم المنصة أدوات ذكاء اصطناعي توليدي لإنشاء الصور ومقاطع الفيديو.',
          li: ['تشمل الاستوديوهات: المنتجات، الإعلانات، UGC، والتوليد الحر', 'تُقدَّم الخدمة «كما هي» وفق توفر النماذج لدى مزوّديها', 'قد نضيف أو نزيل ميزات ونماذج مع تطور التقنية'],
        },
        {
          h: '6. محتوى المستخدم والمدخلات',
          p: 'تبقى الأوصاف والوسائط التي ترفعها ملكًا لك.',
          li: ['تمنحنا ترخيصًا محدودًا لمعالجتها واستضافتها بغرض تقديم الخدمة', 'يجب ألا تنتهك مدخلاتك حقوق الغير أو خصوصيتهم', 'لا ندّعي أي ملكية على ما ترفعه'],
        },
        {
          h: '7. ملكية المخرجات',
          p: 'مع التزامك بهذه الشروط، تملك الأصول التي تولّدها عبر المنصة.',
          li: ['حقوق الاستخدام التجاري الكاملة للمشتركين في الباقات المدفوعة', 'أنت المسؤول عن قانونية استخدام المحتوى المولّد', 'قد لا يقبل المحتوى المولّد بالذكاء الاصطناعي حماية حقوق المؤلف في بعض الدول'],
        },
        {
          h: '8. الاستخدام المحظور',
          p: 'يُحظر استخدام المنصة لإنتاج محتوى ضار أو مخالف للنظام.',
          li: ['لا محتوى جنسي أو صور لأشخاص دون موافقتهم', 'لا خطاب كراهية أو تحريض على العنف أو انتحال لأشخاص حقيقيين', 'يُحظر تجاوز مرشحات الأمان أو الهندسة العكسية للمنصة ونماذجها'],
        },
        {
          h: '9. مزوّدو النماذج وإخلاء المسؤولية',
          p: 'نعتمد على نماذج ذكاء اصطناعي من أطراف ثالثة لتقديم التوليد.',
          li: ['التوليد احتمالي وقد تختلف النتائج عن المتوقع حتى مع الوصف نفسه', 'جودة المخرجات تعتمد على وضوح الوصف وجودة المراجع', 'انقطاع أو تغيّر مزوّد النموذج خارج عن سيطرتنا المباشرة'],
        },
        {
          h: '10. باقات الاشتراك',
          p: 'توفر الباقات المدفوعة رصيدًا أعلى وميزات إضافية.',
          li: ['تتجدد الباقات تلقائيًا عند تفعيل الدفع المحفوظ ما لم تُلغَ', 'الإلغاء يوقف التجديد في نهاية الفترة الحالية', 'الترقية تسري فورًا؛ والتخفيض يسري من الدورة التالية'],
        },
        {
          h: '11. نظام الرصيد',
          p: 'الرصيد هو الوحدة الداخلية لمهام التوليد.',
          li: ['لا قيمة نقدية للرصيد وغير قابل للتحويل بين الحسابات', 'رصيد الاشتراك ينتهي بنهاية دورة الفوترة؛ ورصيد الباقات المشتراة لمرة واحدة صالح 12 شهرًا', 'العمليات الفاشلة تقنيًا يُعاد رصيدها تلقائيًا'],
        },
        {
          h: '12. الدفع والفوترة',
          p: 'تُعالج المدفوعات بأمان عبر بوابة دفع مرخّصة من البنك المركزي السعودي.',
          li: ['العملة هي الريال السعودي', 'تُضاف ضريبة القيمة المضافة (15%) متى ما انطبقت نظامًا', 'بتفعيل الدفع المحفوظ تفوّضنا بخصم رسوم التجديد من وسيلة الدفع المسجّلة'],
        },
        {
          h: '13. سياسة الاسترداد',
          p: 'السلع الرقمية والرصيد غير قابلة للاسترداد بشكل عام.',
          li: ['يُرد المبلغ فقط في حالات الفشل التقني من جهتنا أو من مزوّد النموذج', 'استخدام الرصيد يُعد استهلاكًا للخدمة', 'الاعتراضات البنكية (chargeback) دون سبب وجيه تؤدي إلى إغلاق الحساب'],
        },
        {
          h: '14. الملكية الفكرية لهاي لينك',
          p: 'واجهة المنصة وعلامتها وبرمجياتها ووصفات الاستوديوهات ملك لنا.',
          li: ['لا يجوز استخدام شعار هاي لينك أو اسمها دون إذن كتابي', 'يُحظر كشط بيانات المنصة أو معرضها العام', 'الشفرة المصدرية والوصفات الداخلية سرية'],
        },
        {
          h: '15. أدوات التجارة (استوديو المنتجات والإعلانات)',
          p: 'شروط خاصة بالملفات الموجهة للمتاجر الإلكترونية.',
          li: ['الملفات المصدَّرة مخصصة للاستخدام في متجرك (سلة، زد، شوبيفاي وغيرها)', 'أنت المسؤول عن مطابقة الصور للمنتج الفعلي أمام عملائك', 'الأوصاف والتحليلات المولّدة للمنتج يجب أن تتحقق منها قبل النشر'],
        },
        {
          h: '16. واجهة البرمجة والأتمتة',
          p: 'الوصول عبر واجهة البرمجة أو MCP يخضع لسياسة الاستخدام العادل.',
          li: ['أنت المسؤول عن أمن مفاتيح الوصول الخاصة بك', 'تُطبق حدود معدل الطلبات لضمان استقرار الخدمة', 'التوليد الآلي بكميات كبيرة قد يتطلب اتفاقًا منفصلًا'],
        },
        {
          h: '17. إنهاء الخدمة',
          p: 'نحتفظ بحق تعليق أو إنهاء الحسابات المخالفة.',
          li: ['إساءة الاستخدام تؤدي إلى الحظر الفوري دون استرداد', 'الحسابات المجانية غير النشطة 12 شهرًا قد تُحذف بعد إشعار بالبريد', 'يمكنك إغلاق حسابك في أي وقت عبر صفحة حذف البيانات'],
        },
        {
          h: '18. حدود المسؤولية',
          p: 'لا نتحمل الأضرار غير المباشرة أو التبعية الناتجة عن استخدام المنصة.',
          li: ['لا نضمن توفر نماذج الذكاء الاصطناعي بنسبة 100%', 'تقتصر مسؤوليتنا على المبالغ المدفوعة خلال آخر 3 أشهر', 'لسنا مسؤولين عن المحتوى الذي يشاركه المستخدمون في المعرض العام'],
        },
        {
          h: '19. التعويض',
          p: 'توافق على تعويض هاي لينك عن أي مطالبة تنشأ عن استخدامك.',
          li: ['يشمل ذلك سوء استخدام المنصة', 'ويشمل انتهاك حقوق الغير في مدخلاتك', 'وتتحمل التكاليف القانونية المتعلقة بمحتواك المولّد'],
        },
        {
          h: '20. النظام الواجب التطبيق',
          p: 'تخضع هذه الشروط لأنظمة المملكة العربية السعودية.',
          li: ['تُسوَّى النزاعات أمام المحاكم المختصة في المنطقة الشرقية', 'يُطبق نظام حماية البيانات الشخصية السعودي', 'الموافقات والعقود الإلكترونية صالحة وملزمة'],
        },
      ],
    },
    privacy: {
      title: 'سياسة الخصوصية',
      updated: UPDATED.ar,
      sections: [
        { h: '1. المقدمة والنطاق', p: `تصف هذه السياسة كيف تجمع ${ENTITY.ar} بياناتك وتستخدمها وتحميها.`, li: ['تنطبق على جميع مستخدمي المنصة', 'تشمل الويب وواجهة البرمجة والتطبيقات المرتبطة', 'تشمل البيانات المعالجة بالذكاء الاصطناعي'] },
        { h: '2. المعلومات التي نجمعها', p: 'نجمع الحد الأدنى اللازم لتشغيل حسابك.', li: ['بيانات الحساب: البريد الإلكتروني، والاسم والصورة عند الدخول بحساب Google', 'معرّفات المصادقة والجلسات', 'تفضيلاتك مثل اللغة والإعدادات الافتراضية'] },
        { h: '3. المحتوى والبيانات الوصفية', p: 'نعالج ما تقدمه لتوليد وسائط جديدة.', li: ['الأوصاف النصية والوسائط المرجعية', 'إعدادات التوليد وسجله والنتائج المحفوظة في مكتبتك', 'عند الربط بتطبيق خارجي: سجل الطلبات ونتائجها واستهلاك الرصيد وعنوان IP ومعلومات المتصفح'] },
        { h: '4. كيف نستخدم بياناتك', p: 'تُستخدم بياناتك لتقديم الخدمة وتحسينها.', li: ['تنفيذ التوليد وخصم الرصيد', 'إدارة مكتبة أصولك', 'الدعم الفني ومنع إساءة الاستخدام'] },
        { h: '5. الأساس النظامي للمعالجة', p: 'نعالج البيانات وفق أسس معترف بها نظامًا.', li: ['الضرورة التعاقدية لتقديم الخدمة', 'موافقتك الصريحة حيث تلزم', 'الالتزام بالمتطلبات النظامية'] },
        { h: '6. معالجة الذكاء الاصطناعي', p: 'عند طلب التوليد نرسل الوصف والوسائط المرجعية والإعدادات اللازمة إلى مزوّد النموذج المختار.', li: ['لا نرسل كلمات المرور أو بيانات حسابك أو أي معلومات غير لازمة للمهمة', 'تخضع معالجة المزوّد واحتفاظه بالبيانات لشروطه وسياسته', 'نختار مزوّدين يتيحون عدم استخدام البيانات لتدريب نماذجهم حيثما توفّر'] },
        { h: '7. الاحتفاظ بالبيانات', p: 'الوسائط المرفوعة والمولّدة تبقى حتى تحذفها أنت.', li: ['حذف العنصر من المكتبة يزيله ويطلب تنظيف ملفاته من التخزين', 'عند حذف الحساب تُحذف بياناتك خلال 30 يومًا عدا ما يلزم الاحتفاظ به نظامًا', 'نحتفظ بسجلات الدفع والفواتير للمدة التي يفرضها النظام'] },
        { h: '8. إجراءات الأمن', p: 'نطبق ضوابط أمنية مناسبة لطبيعة البيانات.', li: ['تشفير أثناء النقل والتخزين', 'ضبط وصول صارم على مستوى الصف لكل مستخدم', 'مراقبة ومراجعة للسجلات'] },
        { h: '9. بيانات الدفع', p: 'بيانات بطاقتك لا تمر عبر خوادمنا.', li: ['تُعالج لدى بوابة دفع مرخّصة من البنك المركزي السعودي ومتوافقة مع PCI-DSS', 'نحتفظ بمرجع العملية والمبلغ والحالة فقط', 'لا نخزّن أرقام البطاقات'] },
        { h: '10. حقوقك في بياناتك', p: 'لك السيطرة على بياناتك.', li: ['الوصول إلى بياناتك وطلب نسخة منها', 'تصحيح معلومات حسابك', 'حذف وسائطك من المكتبة أو حذف حسابك كاملًا عبر صفحة حذف البيانات'] },
        { h: '11. أحكام خاصة بالمملكة', p: 'نلتزم بالأنظمة السعودية ذات الصلة.', li: ['نظام حماية البيانات الشخصية ولوائحه', 'الشفافية في الأسعار والضرائب', 'الخدمة متاحة بالعربية والإنجليزية'] },
        { h: '12. المعرض العام', p: 'الأصول التي تختار مشاركتها علنًا تُعامل وفق ما يلي.', li: ['قد تُفهرس وتُعرض مع بياناتها الوصفية (النموذج والوصف)', 'لا يُعرض اسمك إلا إذا اخترت ذلك', 'يمكنك إلغاء المشاركة في أي وقت'] },
        { h: '13. البيانات التقنية', p: 'نجمع بيانات تشخيصية للاستقرار والأمان.', li: ['عنوان IP لكشف الاحتيال والإساءة', 'مقاييس الجلسة وسجلات الأخطاء', 'ملفات تعريف ارتباط ضرورية فقط (الجلسة واللغة) دون تتبع إعلاني'] },
        { h: '14. القاصرون', p: 'المنصة موجهة لمن هم 18 عامًا فأكثر.', li: ['لا نجمع عن علم بيانات من هم دون 18', 'إذا علمنا بحساب لقاصر نحذفه', 'يمكن لولي الأمر مراسلتنا للإبلاغ أو طلب الحذف'] },
        { h: '15. القرارات الآلية', p: 'تدير أنظمة آلية بعض جوانب السلامة والجودة.', li: ['مرشحات أمان المحتوى قبل التوليد وبعده', 'كشف الاحتيال وإساءة الاستخدام', 'التحقق من استهلاك الرصيد وإعادته عند الفشل'] },
        { h: '16. تغييرات السياسة', p: 'قد نحدّث هذه السياسة مع تطور الخدمة.', li: ['نحدّث تاريخ «آخر تحديث» أعلى الصفحة', 'التغييرات الجوهرية تُعلن داخل المنصة أو بالبريد', 'استمرار الاستخدام بعد التحديث يُعد قبولًا'] },
        { h: '17. التواصل والشكاوى', p: 'لأي استفسار أو شكوى تتعلق بالخصوصية.', li: ['البريد الإلكتروني الموضح في صفحة التواصل', 'نرد خلال يومي عمل', 'يحق لك التصعيد إلى الجهة المختصة بحماية البيانات في المملكة'] },
      ],
    },
    refund: {
      title: 'سياسة الاسترداد',
      updated: UPDATED.ar,
      sections: [
        { h: '1. القاعدة العامة', p: 'السلع الرقمية والرصيد غير قابلة للاسترداد.', li: ['المحتوى يُنتج فورًا عند الطلب ويستهلك موارد حوسبة حقيقية', 'شراء الرصيد يعني الموافقة على هذه القاعدة', 'عدم الرضا عن نتيجة توليد ناجح لا يُعد سببًا للاسترداد'] },
        { h: '2. الفشل التقني', p: 'الحالة الوحيدة للاسترداد هي الفشل التقني من جهتنا أو من مزوّد النموذج.', li: ['رصيد العملية الفاشلة يُعاد إلى حسابك تلقائيًا خلال دقائق', 'إذا لم يُعَد، راسلنا برقم العملية ونصححه خلال يومي عمل', 'إذا تعذّر تقديم الخدمة كليًا بعد الشراء ولم يُستخدم أي رصيد، نرد المبلغ كاملًا'] },
        { h: '3. الاشتراكات', p: 'يمكنك إلغاء الاشتراك في أي وقت.', li: ['الإلغاء يوقف التجديد ويبقى رصيدك متاحًا حتى نهاية الدورة', 'لا استرداد جزئي للدورة الجارية', 'التخفيض يسري من الدورة التالية'] },
        { h: '4. طريقة الرد', p: 'عند استحقاق الاسترداد يُعاد المبلغ إلى وسيلة الدفع نفسها.', li: ['بطاقات مدى: 1–3 أيام عمل', 'بطاقات الائتمان: 7–14 يوم عمل حسب البنك', 'نرسل تأكيدًا بالبريد عند تنفيذ الرد'] },
        { h: '5. الاعتراضات البنكية', p: 'نرجو التواصل معنا قبل أي اعتراض لدى البنك.', li: ['أغلب المشاكل تُحل خلال يومي عمل', 'الاعتراض دون سبب وجيه يؤدي إلى إغلاق الحساب', 'نحتفظ بسجلات العمليات للرد على الاعتراضات'] },
      ],
    },
    deletion: {
      title: 'حذف بياناتك',
      updated: UPDATED.ar,
      sections: [
        { h: '1. حذف عنصر', p: 'تحذف أي صورة أو مقطع من مكتبتك بنفسك في أي وقت.', li: ['الحذف يزيل العنصر من المكتبة ويطلب تنظيف ملفاته من التخزين', 'الملفات المشتركة مع عنصر آخر تبقى حتى يُحذف هو أيضًا', 'المشاركة في المعرض العام تُلغى تلقائيًا بحذف العنصر'] },
        { h: '2. حذف الحساب', p: 'تطلب حذف حسابك كاملًا بالبريد من إيميل حسابك.', li: ['العنوان: بريد التواصل الموضح أسفل الصفحة، بعنوان «Delete my data»', 'ننفذ الحذف ونرسل تأكيدًا خلال 30 يومًا', 'يُحذف الحساب والوسائط والسجل، والرصيد المتبقي يسقط دون تعويض'] },
        { h: '3. الاستثناءات', p: 'بعض السجلات يلزم الاحتفاظ بها نظامًا.', li: ['سجلات الدفع والفواتير للمدة التي يفرضها النظام', 'نسخ الاستعادة الاحتياطية تُدوَّر خلال 7 أيام ولا تشمل ملفات الوسائط', 'احتفاظ مزوّدي النماذج بنسخهم يخضع لسياساتهم'] },
        { h: '4. التطبيقات المرتبطة', p: 'فصل تطبيق خارجي لا يحذف سجلاته تلقائيًا.', li: ['سجل الطلبات عبر واجهة البرمجة يبقى حتى حذف الحساب', 'يمكنك إبطال مفاتيح الوصول فورًا من الإعدادات', 'اطلب حذف السجل صراحة إن أردت ذلك قبل حذف الحساب'] },
      ],
    },
  },
  en: {
    terms: {
      title: 'Terms of Service',
      updated: UPDATED.en,
      sections: [
        { h: '1. Acceptance', p: `By using Highlink Studio you enter into a binding agreement with ${ENTITY.en}.`, li: ['Any use of the platform is full acceptance of these terms', 'They apply to visitors, registered users and API clients', 'We may update them periodically; continued use is acceptance of the updated version'] },
        { h: '2. Eligibility', p: 'You must be 18 or older to create an account or purchase.', li: ['The platform is not directed at anyone under 18 and we do not knowingly collect their data', 'By using the platform you confirm you have legal capacity to contract', 'Use is prohibited where local law forbids it'] },
        { h: '3. Account registration', p: 'Access to generation tools requires a valid account.', li: ['Account information must be accurate and current', 'One account per person; duplicates are merged or closed', 'We reserve the right to refuse service to anyone'] },
        { h: '4. Account security', p: 'You alone are responsible for your credentials and all activity on your account.', li: ['Report unauthorized use immediately', 'We are not liable for losses caused by failure to protect the account', 'Sharing an account between people is prohibited'] },
        { h: '5. Service description', p: 'The platform provides generative AI tools for images and video.', li: ['Studios include Product, Ads, UGC and free generation', 'The service is provided "as is" subject to model availability at providers', 'Features and models may be added or removed as technology evolves'] },
        { h: '6. User content and inputs', p: 'Prompts and media you upload remain yours.', li: ['You grant us a limited licence to process and host them to provide the service', 'Your inputs must not infringe third-party rights or privacy', 'We claim no ownership of what you upload'] },
        { h: '7. Ownership of outputs', p: 'Subject to these terms, you own the assets you generate.', li: ['Full commercial rights for paid-plan subscribers', 'You are responsible for the lawful use of generated content', 'AI-generated content may not qualify for copyright in some jurisdictions'] },
        { h: '8. Prohibited use', p: 'The platform may not be used to produce harmful or unlawful content.', li: ['No sexual content or images of people without their consent', 'No hate speech, incitement to violence or impersonation of real people', 'No bypassing safety filters or reverse-engineering the platform and its models'] },
        { h: '9. Model providers and disclaimer', p: 'We rely on third-party AI models to deliver generation.', li: ['Generation is probabilistic; results may differ from expectations even with the same prompt', 'Output quality depends on prompt clarity and reference quality', 'Provider outages or changes are outside our direct control'] },
        { h: '10. Subscription plans', p: 'Paid plans provide more credits and extra features.', li: ['Plans renew automatically when saved payment is enabled, unless cancelled', 'Cancellation stops renewal at the end of the current period', 'Upgrades apply immediately; downgrades apply from the next cycle'] },
        { h: '11. Credit system', p: 'Credits are the internal unit for generation tasks.', li: ['Credits have no cash value and cannot be transferred between accounts', 'Subscription credits expire at the end of the billing cycle; one-time packs are valid for 12 months', 'Technically failed generations are refunded in credits automatically'] },
        { h: '12. Payment and billing', p: 'Payments are processed securely through a gateway licensed by the Saudi Central Bank.', li: ['The currency is the Saudi Riyal', 'VAT (15%) is added where legally applicable', 'By enabling saved payment you authorize us to charge renewals to the registered method'] },
        { h: '13. Refund policy', p: 'Digital goods and credits are generally non-refundable.', li: ['Refunds are issued only for technical failures on our side or the model provider\'s', 'Using credits constitutes consumption of the service', 'Chargebacks without valid reason lead to account closure'] },
        { h: '14. Highlink intellectual property', p: 'The platform interface, brand, software and studio recipes are ours.', li: ['The Highlink name and logo may not be used without written permission', 'Scraping the platform or its public gallery is prohibited', 'Source code and internal recipes are confidential'] },
        { h: '15. Commerce tools (Product and Ads studios)', p: 'Special terms for files intended for online stores.', li: ['Exported files are for use in your store (Salla, Zid, Shopify and others)', 'You are responsible to your customers for images matching the actual product', 'Generated product descriptions and analysis must be verified before publishing'] },
        { h: '16. API and automation', p: 'Access via the API or MCP is subject to fair-use policy.', li: ['You are responsible for the security of your access keys', 'Rate limits apply to keep the service stable', 'High-volume automated generation may require a separate agreement'] },
        { h: '17. Termination', p: 'We reserve the right to suspend or terminate accounts in breach.', li: ['Abuse leads to immediate ban without refund', 'Free accounts inactive for 12 months may be deleted after email notice', 'You can close your account at any time via the data deletion page'] },
        { h: '18. Limitation of liability', p: 'We are not liable for indirect or consequential damages arising from use of the platform.', li: ['We do not guarantee 100% availability of AI models', 'Our liability is limited to amounts paid in the last 3 months', 'We are not responsible for content users share in the public gallery'] },
        { h: '19. Indemnification', p: 'You agree to indemnify Highlink against claims arising from your use.', li: ['This includes misuse of the platform', 'And infringement of third-party rights in your inputs', 'You bear legal costs related to your generated content'] },
        { h: '20. Governing law', p: 'These terms are governed by the laws of the Kingdom of Saudi Arabia.', li: ['Disputes are settled before the competent courts in the Eastern Province', 'The Saudi Personal Data Protection Law applies', 'Electronic consents and contracts are valid and binding'] },
      ],
    },
    privacy: {
      title: 'Privacy Policy',
      updated: UPDATED.en,
      sections: [
        { h: '1. Introduction and scope', p: `This policy describes how ${ENTITY.en} collects, uses and protects your data.`, li: ['Applies to all platform users', 'Covers the web app, the API and connected apps', 'Covers data processed by AI'] },
        { h: '2. Information we collect', p: 'We collect the minimum needed to run your account.', li: ['Account data: email, plus name and photo when signing in with Google', 'Authentication and session identifiers', 'Preferences such as language and defaults'] },
        { h: '3. Content and metadata', p: 'We process what you provide to generate new media.', li: ['Text prompts and reference media', 'Generation settings, history and results saved to your library', 'With connected apps: request logs, results, credit usage, IP address and browser information'] },
        { h: '4. How we use your data', p: 'Your data is used to deliver and improve the service.', li: ['Running generations and deducting credits', 'Maintaining your asset library', 'Support and abuse prevention'] },
        { h: '5. Legal basis', p: 'We process data on recognized legal grounds.', li: ['Contractual necessity to provide the service', 'Your explicit consent where required', 'Compliance with legal obligations'] },
        { h: '6. AI processing', p: 'When you request a generation we send the prompt, reference media and required settings to the selected model provider.', li: ['We never send passwords, account data or anything not needed for the task', 'The provider\'s processing and retention are governed by its own terms and policy', 'We prefer providers that allow opting out of training on your data where available'] },
        { h: '7. Data retention', p: 'Uploaded and generated media remain until you delete them.', li: ['Deleting an item removes it from your library and requests cleanup of its files from storage', 'When you delete your account, data is deleted within 30 days except what the law requires us to keep', 'Payment records and invoices are kept for the period required by law'] },
        { h: '8. Security measures', p: 'We apply controls appropriate to the nature of the data.', li: ['Encryption in transit and at rest', 'Strict row-level access control per user', 'Monitoring and log review'] },
        { h: '9. Payment data', p: 'Your card details never pass through our servers.', li: ['Processed by a PCI-DSS compliant gateway licensed by the Saudi Central Bank', 'We keep only the transaction reference, amount and status', 'We do not store card numbers'] },
        { h: '10. Your data rights', p: 'You are in control of your data.', li: ['Access your data and request a copy', 'Correct your account information', 'Delete media from your library or delete your whole account via the data deletion page'] },
        { h: '11. Saudi-specific provisions', p: 'We comply with the relevant Saudi regulations.', li: ['The Personal Data Protection Law and its regulations', 'Transparency in prices and taxes', 'Service available in Arabic and English'] },
        { h: '12. Public gallery', p: 'Assets you choose to share publicly are handled as follows.', li: ['They may be indexed and displayed with their metadata (model and prompt)', 'Your name is shown only if you choose so', 'You can unshare at any time'] },
        { h: '13. Technical data', p: 'We collect diagnostics for stability and security.', li: ['IP address for fraud and abuse detection', 'Session metrics and error logs', 'Essential cookies only (session and language), no advertising tracking'] },
        { h: '14. Minors', p: 'The platform is intended for users 18 and older.', li: ['We do not knowingly collect data from anyone under 18', 'If we learn of a minor\'s account we delete it', 'A guardian may contact us to report or request deletion'] },
        { h: '15. Automated decisions', p: 'Automated systems manage some safety and quality aspects.', li: ['Content safety filters before and after generation', 'Fraud and abuse detection', 'Credit usage verification and automatic refunds on failure'] },
        { h: '16. Policy changes', p: 'We may update this policy as the service evolves.', li: ['We update the "last updated" date at the top', 'Material changes are announced in the platform or by email', 'Continued use after an update is acceptance'] },
        { h: '17. Contact and complaints', p: 'For any privacy question or complaint.', li: ['The email on the Contact page', 'We reply within two business days', 'You may escalate to the competent data protection authority in the Kingdom'] },
      ],
    },
    refund: {
      title: 'Refund Policy',
      updated: UPDATED.en,
      sections: [
        { h: '1. General rule', p: 'Digital goods and credits are non-refundable.', li: ['Content is produced on demand and consumes real compute resources', 'Buying credits means accepting this rule', 'Dissatisfaction with a successful generation is not grounds for a refund'] },
        { h: '2. Technical failure', p: 'The only refund case is a technical failure on our side or the model provider\'s.', li: ['Credits for a failed generation are returned to your account automatically within minutes', 'If they are not, email us the generation ID and we fix it within two business days', 'If the service cannot be delivered at all after purchase and no credits were used, we refund in full'] },
        { h: '3. Subscriptions', p: 'You can cancel your subscription at any time.', li: ['Cancellation stops renewal; your credits remain until the end of the cycle', 'No partial refund for the current cycle', 'Downgrades apply from the next cycle'] },
        { h: '4. How refunds are paid', p: 'When a refund is due it goes back to the original payment method.', li: ['mada cards: 1–3 business days', 'Credit cards: 7–14 business days depending on the bank', 'We email a confirmation when the refund is issued'] },
        { h: '5. Chargebacks', p: 'Please contact us before disputing a charge with your bank.', li: ['Most issues are resolved within two business days', 'Disputes without valid reason lead to account closure', 'We keep transaction records to respond to disputes'] },
      ],
    },
    deletion: {
      title: 'Delete your data',
      updated: UPDATED.en,
      sections: [
        { h: '1. Delete an item', p: 'You can delete any image or video from your library yourself at any time.', li: ['Deletion removes the item from the library and requests cleanup of its files from storage', 'Files shared with another item remain until that item is deleted too', 'Public gallery sharing is cancelled automatically when the item is deleted'] },
        { h: '2. Delete your account', p: 'Request full account deletion by email from your account address.', li: ['Send to the contact email at the bottom of this page with the subject "Delete my data"', 'We complete the deletion and send a confirmation within 30 days', 'The account, media and history are deleted; remaining credits are forfeited without compensation'] },
        { h: '3. Exceptions', p: 'Some records must be kept by law.', li: ['Payment records and invoices for the legally required period', 'Backups rotate within 7 days and do not include media files', 'Model providers\' retention of their copies is governed by their policies'] },
        { h: '4. Connected apps', p: 'Disconnecting an external app does not delete its logs automatically.', li: ['API request logs remain until the account is deleted', 'You can revoke access keys immediately from settings', 'Explicitly request log deletion if you want it before deleting the account'] },
      ],
    },
  },
}
