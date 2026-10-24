# المجموعة الذهبية — استوديو المنتجات

ضعي هنا صور المنتجات الحقيقية العشر في `inputs/` (PNG أو JPG أو WEBP، حتى 8MB لكل صورة). المجلد مستثنى من git.

اختياري: `products.json` بجانب هذا الملف لتسمية المنتجات أو طلب نص عربي على بعضها (أقترح 3 من 10 بنص):

```json
[
  { "file": "perfume.jpg", "name": "عطر رونق", "text": "عرض خاص" },
  { "file": "coffee.jpg", "name": "قهوة مختصة", "preset": "saudi-heritage" }
]
```

التشغيل (يحتاج رصيد Replicate فوق 5$ ليرتفع حد الإرسال عن 6 في الدقيقة):

```bash
python -I scripts/golden-product-shot.py
```

النتيجة: `report-<date>.html` (للمراجعة، مستثنى من git) و`results-<date>.json` (الدرجات فقط، يُلتزم).
بعد المراجعة: `python -I scripts/golden-product-shot.py --cleanup` يحذف المستخدم المؤقت وملفاته.
