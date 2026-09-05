import { useState } from 'react';

import { Button } from '../components/Button/Button';
import { Modal, type ModalSize } from '../components/Modal/Modal';
import { Toast, type ToastTone } from '../components/Toast/Toast';
import { ToastProvider, useToast } from '../components/Toast/ToastHost';
import styles from './FeedbackPreview.module.css';

/* ============================================================================
 * FE-030-00 — the feedback layer's preview. `030` AC-17.
 * ============================================================================
 * "Renders all four tones, three modal sizes, four panel variants, both
 * directions, and is reviewed BEFORE any consumer is rewired."
 *
 * THE SECOND HALF OF THAT SENTENCE IS ALREADY FALSE and this page cannot repair
 * it: the consumers were rewired on 2026-09-05 before this existed. It is built
 * anyway, and the reason is AC-18 rather than AC-17 — **the Arabic pass has no
 * other way to happen**. jsdom paints nothing, so 655 green tests have not seen
 * a stripe, a counter or a modal in either direction. This page is the only
 * place a person can look at them.
 *
 * WHAT IT DOES NOT COVER, and the absence is honest rather than an oversight:
 * the FOUR PANEL VARIANTS. §5's filter, loading, tabbed and empty panels are not
 * built — drawing them here would be drawing components that do not exist, which
 * is the one thing `027` established a preview must never do. AC-17 stays unmet
 * and is recorded unmet.
 *
 * Direction is a local `dir` on the page, not `i18n.changeLanguage`: `12-delivery-log`
 * lists a preview toggle that said `en` while rendering Arabic among the tools
 * that have lied here, and the fix was to stop having two sources for one
 * question. The copy below is Arabic in both directions on purpose — what is
 * being reviewed is the LAYOUT under `dir`, and swapping the text as well would
 * change two things at once.
 * ========================================================================= */

const TONES: readonly ToastTone[] = ['success', 'warning', 'error', 'info', 'inverse'];

const TONE_COPY: Record<ToastTone, { title: string; body: string }> = {
  success: {
    title: 'تم إرسال الردّ.',
    body: 'التذكرة #4821 انتقلت إلى «بانتظار العميل».',
  },
  warning: {
    title: 'التذكرة تجاوزت زمن الاستجابة.',
    body: 'تبقّت ساعتان قبل التصعيد التلقائي.',
  },
  error: {
    title: 'تعذّر إرسال الردّ.',
    body: 'قناة واتساب لا تستجيب. الردّ محفوظ كمسودة.',
  },
  info: { title: 'تم تحديث قواعد التصعيد.', body: 'تسري على التذاكر الجديدة فقط.' },
  inverse: { title: 'تم نسخ البريد الإلكتروني.', body: '' },
};

const MODAL_SIZES: readonly { size: ModalSize; label: string }[] = [
  { size: 'sm', label: 'sm 420 — تأكيد' },
  { size: 'md', label: 'md 560 — نموذج قصير' },
  { size: 'lg', label: 'lg 720 — معاينة' },
];

/** The live stack, which is the only way to see §2's three rules at once. */
function HostDemo() {
  const toast = useToast();

  return (
    <div className={styles.row}>
      {TONES.map((tone) => (
        <Button
          key={tone}
          buttonType="secondary-outline"
          withText
          text={tone}
          onClick={() =>
            toast.show({
              tone,
              title: TONE_COPY[tone].title,
              ...(TONE_COPY[tone].body === '' ? {} : { body: TONE_COPY[tone].body }),
            })
          }
        />
      ))}

      {/* THE THREE STACK RULES, each on its own control, because each is
          invisible until it happens: fire one twice for «×2», fire four for the
          eviction, and fire one with an action for the 10s hold. */}
      <Button
        buttonType="secondary-outline"
        withText
        text="مكرّر ×2"
        onClick={() => {
          toast.show({ tone: 'error', title: TONE_COPY.error.title, dedupeKey: 'dup' });
          toast.show({ tone: 'error', title: TONE_COPY.error.title, dedupeKey: 'dup' });
        }}
      />
      <Button
        buttonType="secondary-outline"
        withText
        text="أربعة — الرابع يزيح الأقدم"
        onClick={() => {
          for (const n of [1, 2, 3, 4]) {
            toast.show({ tone: 'error', title: `رسالة ${n}`, dedupeKey: `evict-${n}` });
          }
        }}
      />
      <Button
        buttonType="secondary-outline"
        withText
        text="مع إجراء — 10s"
        onClick={() =>
          toast.show({
            tone: 'success',
            title: 'تم حذف التذكرة.',
            action: { label: 'تراجع', onClick: () => {} },
          })
        }
      />
    </div>
  );
}

export default function FeedbackPreview() {
  const [dir, setDir] = useState<'rtl' | 'ltr'>('rtl');
  const [modal, setModal] = useState<ModalSize | null>(null);
  const [destructive, setDestructive] = useState<boolean>(false);

  return (
    <ToastProvider>
      <div className={styles.page} dir={dir}>
        <header className={styles.head}>
          <h1 className={styles.title}>طبقة الرسائل</h1>
          <p className={styles.lead}>
            التوست والنافذة المنبثقة. المرجع{' '}
            <code dir="ltr">docs/sdd/design/feedback-layer.md</code>.
            {' اللوحة الجانبية بأنواعها الأربعة غير مبنية ولا تظهر هنا.'}
          </p>

          <div className={styles.toggle} role="group" aria-label="direction">
            <button
              type="button"
              className={dir === 'rtl' ? styles.on : styles.off}
              onClick={() => setDir('rtl')}
            >
              {'rtl'}
            </button>
            <button
              type="button"
              className={dir === 'ltr' ? styles.on : styles.off}
              onClick={() => setDir('ltr')}
            >
              {'ltr'}
            </button>
          </div>
        </header>

        {/* ── the cards, STATIC ────────────────────────────────────────────
            Rendered inline rather than fired, so all five sit still and can be
            compared side by side. A tone that only exists for four seconds
            cannot be reviewed against the one beside it. */}
        <section className={styles.section}>
          <h2 className={styles.h2}>{'الأنواع الخمسة — ساكنة'}</h2>
          <div className={styles.cards}>
            {TONES.map((tone) => (
              <Toast
                key={tone}
                tone={tone}
                dismissLabel="إغلاق"
                onDismiss={() => {}}
                {...(TONE_COPY[tone].body === '' ? {} : { body: TONE_COPY[tone].body })}
                {...(tone === 'error'
                  ? { action: { label: 'إعادة المحاولة', onClick: () => {} } }
                  : {})}
                {...(tone === 'warning' ? { count: 3 } : {})}
              >
                {TONE_COPY[tone].title}
              </Toast>
            ))}
          </div>
        </section>

        {/* ── the host, LIVE ──────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.h2}>{'الحاوية — حيّة'}</h2>
          <HostDemo />
        </section>

        {/* ── the modal ───────────────────────────────────────────────────── */}
        <section className={styles.section}>
          <h2 className={styles.h2}>{'النافذة المنبثقة'}</h2>
          <div className={styles.row}>
            {MODAL_SIZES.map(({ size, label }) => (
              <Button
                key={size}
                buttonType="secondary-outline"
                withText
                text={label}
                onClick={() => {
                  setDestructive(false);
                  setModal(size);
                }}
              />
            ))}
            {/* THE ONE WORTH REVIEWING. `destructive` reverses the footer's
                reading order and moves the opening focus off the red button —
                and a screenshot cannot show where focus is, so this is the
                variant that has to be pressed rather than looked at. */}
            <Button
              buttonType="danger"
              withText
              text="هدّام — التركيز على «إلغاء»"
              onClick={() => {
                setDestructive(true);
                setModal('sm');
              }}
            />
          </div>
        </section>

        <Modal
          open={modal !== null}
          onClose={() => setModal(null)}
          title={destructive ? 'حذف التذكرة #4821؟' : 'تصعيد التذكرة'}
          size={modal ?? 'sm'}
          destructive={destructive}
          footer={
            destructive ? (
              <>
                <Button
                  buttonType="secondary-outline"
                  withText
                  text="إلغاء"
                  onClick={() => setModal(null)}
                />
                <Button
                  buttonType="danger"
                  withText
                  text="حذف"
                  onClick={() => setModal(null)}
                />
              </>
            ) : (
              <>
                <Button
                  buttonType="primary"
                  withText
                  text="تصعيد"
                  onClick={() => setModal(null)}
                />
                <Button
                  buttonType="secondary-outline"
                  withText
                  text="إلغاء"
                  onClick={() => setModal(null)}
                />
              </>
            )
          }
        >
          {destructive
            ? 'لا يمكن التراجع عن هذا الإجراء. سيُحذف السجل والمرفقات، ويبقى العميل بلا إشعار.'
            : 'اختر الفريق واكتب سبباً موجزاً يظهر في السجل. النموذج داخل مودال فقط إذا كان أقصر من ثلاثة حقول.'}
        </Modal>
      </div>
    </ToastProvider>
  );
}
