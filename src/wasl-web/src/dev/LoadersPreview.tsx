import { useEffect, useState } from 'react';

import { Button } from '../components/Button/Button';
import { Input } from '../components/Input/Input';
import { Loader, type LoaderVariant } from '../components/Loader/Loader';
import { Skeleton } from '../components/Loader/Skeleton';
import styles from './LoadersPreview.module.css';

/*
 * A DEVELOPMENT ARTIFACT — stripped from the production bundle by
 * `import.meta.env.DEV` in routes.tsx. The literal strings below are allowed
 * here for the reason PreviewPage.tsx records: eslint scopes the BR-8.8 rule to
 * src/components, src/shell and src/features, and these labels name SHAPES for a
 * reviewer rather than being product copy.
 *
 * FE-029-00 — the Phase 3b gate (ADR-009). Nothing in this feature is wired
 * until this page is reviewed, and it opens in ARABIC because that is the pass
 * that finds the problems.
 */

const VARIANTS: Array<{ id: LoaderVariant; ar: string; en: string; use: string }> = [
  {
    id: 'converge',
    ar: 'تقارب',
    en: 'Converge Pro',
    use: 'الافتراضي. حفظ تذكرة، إرسال ردّ، تسجيل دخول — مع نص بجانبه · 0.5–5s',
  },
  {
    id: 'mark',
    ar: 'العلامة',
    en: 'Mark',
    use: 'اللحظات الكبيرة فقط: شاشة كاملة أو انتقال بين مساحات العمل · >1.5s',
  },
  {
    id: 'brand',
    ar: 'نبضة العلامة',
    en: 'Brand',
    use: 'شاشة كاملة عند أول دخول. مرة واحدة في الجلسة · >1s',
  },
  {
    id: 'path',
    ar: 'مسار',
    en: 'Path',
    use: 'انتظار متوسط: تصعيد تذكرة، مزامنة قناة · 2–15s',
  },
  {
    id: 'chain',
    ar: 'سلسلة',
    en: 'Chain',
    use: 'عملية معرّفة الخطوات. لا تُستخدم لعملية واحدة · 3–20s',
  },
  {
    id: 'orbit',
    ar: 'مدار',
    en: 'Orbit',
    use: 'داخل زر أثناء الإرسال، وداخل الحقل قبل ظهور محتواه · 0.3–3s',
  },
  {
    id: 'bars',
    ar: 'أعمدة',
    en: 'Bars',
    use: 'أصغر لودر في النظام: خلايا الجدول، الشرائح، أي مساحة أقل من 32px',
  },
  {
    id: 'bar',
    ar: 'شريط',
    en: 'Bar',
    use: 'تحميل خلفي لا يمنع التفاعل: تنقّل بين الصفحات، إعادة جلب القائمة',
  },
  {
    id: 'satellites',
    ar: 'نقطتان',
    en: 'Satellites',
    use: 'انتظار ردّ قناة خارجية. التيل هنا يعني «حيّ» لا «ناجح» · >10s',
  },
];

export default function LoadersPreview() {
  /* The preview owns its own direction so a reviewer can compare the two
   * without changing the application's language. `dir` on a wrapper is the real
   * mechanism — --ld-dir is defined against [dir='rtl'] at the token layer, so
   * this exercises exactly what ships. */
  const [dir, setDir] = useState<'rtl' | 'ltr'>('rtl');

  /* Read, never written. There is no way to set prefers-reduced-motion from
   * script — it is an OS or DevTools setting — and a preview that pretended to
   * toggle it would be the fifth tool in 12-delivery-log's list of things that
   * produced a well-formed report about nothing. It reports what the browser
   * actually says instead, and tells the reviewer where the switch is. */
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    return () => mq.removeEventListener('change', sync);
  }, []);

  /* Drives the gated demonstrations below. */
  const [busy, setBusy] = useState(false);

  return (
    <div className={styles.page} dir={dir}>
      <header className={styles.head}>
        <div className={styles.headTop}>
          <span className={styles.tag}>MOTION</span>
          <span className={styles.crumb}>وصل · 029 · نظام اللودرات</span>
        </div>
        <h1 className={styles.title}>اللودرات — Loaders</h1>
        <p className={styles.lede}>
          تسعة أشكال من هندسة واحدة: ثلاثة خيوط تصل إلى عقدة. كلّها CSS خالص، بلا مكتبات،
          وتحترم <code dir="ltr">prefers-reduced-motion</code>. المرجع{' '}
          <code dir="ltr">docs/sdd/design/loaders.md</code>.
        </p>

        <div className={styles.controls}>
          <div className={styles.toggle} role="group" aria-label="direction">
            <button
              type="button"
              className={dir === 'rtl' ? styles.on : undefined}
              onClick={() => setDir('rtl')}
            >
              RTL · عربي
            </button>
            <button
              type="button"
              className={dir === 'ltr' ? styles.on : undefined}
              onClick={() => setDir('ltr')}
            >
              LTR
            </button>
          </div>

          <span className={reduced ? styles.pillOn : styles.pill}>
            prefers-reduced-motion: {reduced ? 'reduce' : 'no-preference'}
          </span>
        </div>

        <p className={styles.note}>
          <b>حالة الحركة المخفّضة لا تُحاكى من هذه الصفحة، وهذا مقصود.</b> لا توجد طريقة
          لضبطها من JavaScript؛ اضبطها من النظام، أو من DevTools ‹ Rendering ‹ «Emulate CSS
          media feature prefers-reduced-motion». الشارة أعلاه تقرأ ما يقوله المتصفّح فعلاً
          — فإن لم تتغيّر، لم تتغيّر الحالة.
          <br />
          <b>ما يجب أن تراه عند التفعيل:</b> كل شكل يبقى مرئياً وساكناً. أي شكل يختفي هو
          عيب — لا تحسين.
        </p>
      </header>

      {/* ---- The nine ------------------------------------------------------ */}
      <section className={styles.section}>
        <h2 className={styles.h2}>الأشكال التسعة</h2>
        <div className={styles.grid}>
          {VARIANTS.map((v) => (
            <article key={v.id} className={styles.card}>
              <div className={styles.stage}>
                <Loader variant={v.id} />
              </div>
              <div className={styles.meta}>
                <span className={styles.name}>
                  {v.ar} — <span dir="ltr">{v.en}</span>
                </span>
                <span className={styles.use}>{v.use}</span>
                <span className={styles.mono} dir="ltr">
                  variant=&quot;{v.id}&quot;
                </span>
              </div>
            </article>
          ))}

          <article className={styles.card}>
            <div className={styles.stage}>
              <div className={styles.skelStack}>
                <Skeleton width="100%" />
                <Skeleton width="72%" />
                <Skeleton width="48%" />
              </div>
            </div>
            <div className={styles.meta}>
              <span className={styles.name}>
                هيكل — <span dir="ltr">Skeleton</span>
              </span>
              <span className={styles.use}>
                أول تحميل لقائمة أو سجل. الأفضل دائماً على السبينر في الجداول · 0.3–3s
              </span>
              <span className={styles.mono} dir="ltr">
                &lt;Skeleton /&gt;
              </span>
            </div>
          </article>
        </div>
      </section>

      {/* ---- Direction ----------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>الاتجاه — ما ينعكس وما لا ينعكس</h2>
        <p className={styles.lede}>
          العقدة دائماً في نهاية اتجاه القراءة: يميناً في LTR، يساراً في RTL. بدّل الاتجاه
          أعلاه وراقب <b>اتجاه سفر النقاط</b> — لا حجمها. الخطأ الصامت هو أن تسافر النقاط
          بعيداً عن العقدة: الحركة تبقى، والمعنى ينقلب.
        </p>
        <div className={styles.pair}>
          <div className={styles.pairCell}>
            <span className={styles.cellHead}>أشكال مجرّدة — تنعكس</span>
            <div className={styles.row}>
              <Loader variant="converge" />
              <Loader variant="path" />
              <Loader variant="chain" />
            </div>
          </div>
          <div className={styles.pairCell}>
            <span className={styles.cellHead}>العلامة — لا تنعكس أبداً</span>
            <div className={styles.row}>
              <Loader variant="mark" />
              <Loader variant="brand" />
            </div>
            <span className={styles.use}>
              العلامة اتجاهية بالتصميم وتحتفظ باتجاهها في العربية (brand.md). الخيوط تصل من
              بداية السطر، وهي في العربية اليمين.
            </span>
          </div>
        </div>
      </section>

      {/* ---- On a dark ground ---------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>على أرضية داكنة</h2>
        <p className={styles.lede}>
          كل شكل <code dir="ltr">currentColor</code>، فلا توجد نسخة ثانية للأرضية الداكنة.
          الحاوية تحدّد اللون.
        </p>
        <div className={styles.dark}>
          <Loader variant="converge" />
          <Loader variant="orbit" />
          <Loader variant="bars" />
          <Loader variant="mark" />
        </div>
      </section>

      {/* ---- The gates ------------------------------------------------------ */}
      <section className={styles.section}>
        <h2 className={styles.h2}>بوّابات التوقيت — الجزء الذي يبطّئ المنتج عمداً</h2>
        <p className={styles.lede}>
          أقل من 200ms: لا لودر إطلاقاً. 200ms–1s: يظهر بعد تأخير 150ms. وبعد الظهور يبقى
          400ms على الأقل. اضغط الزر وراقب: <b>لا شيء يومض</b>.
        </p>
        <div className={styles.gates}>
          <Button
            text={busy ? 'جارٍ…' : 'شغّل انتظاراً 90ms'}
            loading={busy}
            onClick={() => {
              setBusy(true);
              window.setTimeout(() => setBusy(false), 90);
            }}
          />
          <span className={styles.use}>
            الحارس فوري (الزر يُعطَّل في أول رسم، فنقرتان = فعل واحد) واللودر مؤجَّل. هذان
            ليسا الشيء نفسه.
          </span>
        </div>
      </section>

      {/* ---- Inside a field ------------------------------------------------- */}
      <section className={styles.section}>
        <h2 className={styles.h2}>داخل الحقول</h2>
        <div className={styles.fields}>
          <Input
            label="تحقّق غير متزامن"
            value="ahmad@wasl.sa"
            onChange={() => undefined}
            busy
            helperText="مدار 16px في نهاية الحقل. الحقل يبقى قابلاً للكتابة."
          />
          <Input
            label="بحث مع تأخير"
            value="تذاكر قناة واتساب"
            onChange={() => undefined}
            busy
            busyPlacement="start"
            helperText="أعمدة 2px في موضع أيقونة البحث نفسه — لا يقفز التخطيط."
          />
          <Input
            label="أول تحميل للنموذج"
            value=""
            onChange={() => undefined}
            loadingValue
          />
        </div>
      </section>
    </div>
  );
}
