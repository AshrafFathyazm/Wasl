import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Badge } from '../../components/Badge/Badge';
import { Button } from '../../components/Button/Button';
import { Skeleton } from '../../components/Loader/Skeleton';
import { IconCustomer } from '../../icons/icons';
import { IconAlert, IconRetry } from '../../icons/icons-added';
import { formatDate, formatPhone, type Lang } from '../../lib/formatters';
import type { CustomerDetail } from '../../lib/api-types.provisional';
import { CopyValue } from './CopyValue';
import styles from './Customers.module.css';

/* ============================================================================
 * CustomerProfileView — the screen's shape, with no idea where data comes from
 * ============================================================================
 *
 * PURE PROPS. No `useQuery`, no `useParams`, no navigation decisions. ADR-011 §4
 * puts fetching at the route, and this being a component rather than the page is
 * what lets the ADR-009 preview render every state on demand — including two
 * that a wired page can only reach by breaking something (AC-14).
 *
 * FOUR STATES, ONE OF WHICH IS NOT AN ERROR. The design's own reasoning, kept
 * because it is easy to lose: **a `404` is an ANSWER and a failed request is
 * not.** The first is the server telling you this customer does not exist; the
 * second is the server telling you nothing at all. They get different glyphs,
 * different copy, and only one of them offers Retry.
 *
 * THE HEADER TRAVELS WITH THE BODY. It is absent on `notFound` and on `error`,
 * not empty — neither state has an identity to put in it, and a name-shaped gap
 * above an explanation reads as a screen that failed to finish rendering.
 * ============================================================================ */

export type ProfileState = 'loading' | 'loaded' | 'notFound' | 'error';

export interface CustomerProfileViewProps {
  state: ProfileState;

  /** Required when `state` is `loaded`, ignored otherwise. */
  customer?: CustomerDetail | undefined;

  /** The `traceId` from the failed response. The one string that makes a support
   *  call short, and the reason the error state is not just an apology. */
  traceId?: string | undefined;

  onRetry?: (() => void) | undefined;

  /** Raised by whichever copy control was pressed, with the field's own name, so
   *  the page can put ONE toast on screen naming what was copied. */
  onCopied?: ((fieldLabel: string) => void) | undefined;

  /** Which language the dates are formatted for. Passed rather than read from
   *  i18next here, so the preview can render both side by side. */
  lang: Lang;
}

/** The id, shown short and copied whole. Eight and four is the shape support
 *  engineers already read in logs, and it is enough to compare two ids by eye. */
function shortId(id: string): string {
  return id.length <= 16 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

/* ============================================================================
 * `<bdi>` WITH NO `dir="auto"` ON ITS PARENT, AND THE TWO TOGETHER ARE A DEFECT
 * ============================================================================
 * Four elements here carry user content — the name, the company in the header,
 * the company in the strip, and the notes. Each wraps its text in `<bdi>` and
 * NONE of them carries `dir="auto"`. The first version carried both, and it was
 * measured in Chrome at 1120px in the Arabic frame:
 *
 *   element            dir attr   computed direction   box            avatar
 *   h2 (the name)      auto       ltr                  x 57 → 673     x 667
 *   h2 > bdi           —          rtl                  x 57 → 165
 *   p (the company)    auto       ltr                  x 57 → 673
 *
 * `dir="auto"` decides direction from the first strong character IN the element
 * — and it skips the content of any descendant that manages its own direction,
 * which a `<bdi>` does by definition. So the h2 saw no strong character, fell
 * back to `ltr`, and `text-align: start` resolved to the LEFT edge. The Arabic
 * name rendered 610px away from its own avatar, and the bdi inside it was
 * correctly `rtl` the whole time, which is why nothing looked broken in the
 * markup.
 *
 * Removing `dir="auto"` makes each element inherit the page's direction, so
 * `start` is the right edge in Arabic and the left in English, while the `bdi`
 * still orders and isolates the text itself. That is the same split `Input`
 * documents for a field message, reached here by measurement rather than by
 * reading it.
 *
 * `07-customer-profile.md` specifies `dir="auto"` on the name and the company.
 * This deviates deliberately and the reason is above: with a `<bdi>` present it
 * is inert at best, and it inverts the alignment of a Latin name in an Arabic
 * interface at worst. Recorded in `032`'s `tests.md` §3.
 * ========================================================================== */

/** The header avatar. The first grapheme of the name, not `name[0]` — a UTF-16
 *  code unit splits an emoji and can split a combining sequence, which renders
 *  as a lone accent. */
function initial(fullName: string): string {
  return [...fullName.trim()][0] ?? '';
}

export function CustomerProfileView({
  state,
  customer,
  traceId,
  onRetry,
  onCopied,
  lang,
}: CustomerProfileViewProps) {
  const { t } = useTranslation();

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label={t('common:nav.customers')}>
        <Link className={styles.crumbLink} to="/customers">
          {t('common:nav.customers')}
        </Link>
        <span className={styles.crumbSep} aria-hidden="true">
          {'/'}
        </span>
        {/* The crumb says what is known. On a `404` the name is the one thing
            that is not, so it says so rather than echoing an id. */}
        <span className={styles.crumbCurrent}>
          <bdi>
            {state === 'loaded' && customer
              ? customer.fullName
              : t('customers:profile.unknownCustomer')}
          </bdi>
        </span>
      </nav>

      {state === 'loading' ? (
        <div className={styles.head} aria-busy="true">
          <Skeleton shape="avatar" width="52px" height="52px" />
          <div className={styles.headText}>
            {/* ONE announcement for the whole screen, from the region that owns
                it — not one per skeleton. Eight silent shapes and one labelled
                one is the rule `029` wrote into `Skeleton`. */}
            <Skeleton width="190px" height="13px" label={t('common:loading')} />
            <Skeleton width="128px" height="9px" />
          </div>
        </div>
      ) : null}

      {state === 'loaded' && customer ? (
        <div className={styles.head}>
          <span className={styles.avatar} aria-hidden="true">
            <bdi>{initial(customer.fullName)}</bdi>
          </span>

          <div className={styles.headText}>
            <h2 className={styles.name}>
              <bdi>{customer.fullName}</bdi>
            </h2>
            {customer.companyName === null ? null : (
              <p className={styles.company}>
                <bdi>{customer.companyName}</bdi>
              </p>
            )}
          </div>

          {/* THE INACTIVE BADGE, AND WHY IT IS HERE AT ALL (spec Q-5).
              `008`'s contract says `isActive` is not in the response; the built
              DTO carries it and a test asserts the `false` case answers `200`.
              A deactivated customer is therefore reachable and, without this,
              renders identically to a live one — while tickets deliberately keep
              linking to it, so a `404` would be the wrong fix.

              A badge and nothing else: no disabled controls, no branch anywhere
              else on the screen. Deactivation is not designed (`007`'s contract
              records reactivation as undesigned), and a screen that acts on a
              state the product cannot leave is worse than one that names it. */}
          {customer.isActive ? null : (
            <Badge tone="neutral" label={t('customers:profile.inactive')} />
          )}

          {/* NO EDIT CONTROL. `07-customer-profile.md` says hidden until US-003
              ships, and `017` is not built — no `PUT /api/customers/{id}` exists
              in the API at all. Absent, not disabled: a disabled button is a
              promise, and this one would be a promise about an endpoint. */}
        </div>
      ) : null}

      {state === 'loading' ? <ProfileSkeleton /> : null}

      {state === 'loaded' && customer ? (
        <div className={styles.body}>
          <section className={styles.strip} aria-label={t('customers:profile.contact')}>
            <div className={styles.stripCell}>
              <span className={styles.cellLabel}>{t('customers:field.email')}</span>
              {customer.email === null ? (
                <span className={styles.cellEmpty}>{'—'}</span>
              ) : (
                <CopyValue
                  value={customer.email}
                  copyLabel={t('customers:profile.copyEmail')}
                  onCopied={() => onCopied?.(t('customers:field.email'))}
                >
                  {/* `dir="ltr"` and NOT `dir="auto"`: an address is not language
                      content, and `unicode-bidi: isolate` in the stylesheet keeps
                      it from reordering the Arabic label beside it. A reversed
                      address is unusable rather than merely ugly. */}
                  <a className={styles.cellLink} dir="ltr" href={`mailto:${customer.email}`}>
                    {customer.email}
                  </a>
                </CopyValue>
              )}
            </div>

            <div className={styles.stripCell}>
              <span className={styles.cellLabel}>{t('customers:field.phone')}</span>
              {customer.phone === null ? (
                <span className={styles.cellEmpty}>{'—'}</span>
              ) : (
                <CopyValue
                  value={customer.phone}
                  copyLabel={t('customers:profile.copyPhone')}
                  onCopied={() => onCopied?.(t('customers:field.phone'))}
                >
                  {/* GROUPED FOR READING, RAW FOR COPYING AND FOR `tel:`. The
                      href keeps the E.164 the dialler needs; only the text is
                      grouped, and `CopyValue` above was handed the raw value. */}
                  <a className={styles.cellNumeric} dir="ltr" href={`tel:${customer.phone}`}>
                    {formatPhone(customer.phone)}
                  </a>
                </CopyValue>
              )}
            </div>

            <div className={styles.stripCell}>
              <span className={styles.cellLabel}>{t('customers:field.company')}</span>
              {customer.companyName === null ? (
                <span className={styles.cellEmpty}>{'—'}</span>
              ) : (
                <span className={styles.cellValue}>
                  <bdi>{customer.companyName}</bdi>
                </span>
              )}
            </div>
          </section>

          <div className={styles.columns}>
            <div className={styles.mainColumn}>
              <section className={styles.card}>
                <h3 className={styles.cardTitle}>{t('customers:field.notes')}</h3>
                {/* A MUTED LINE, NEVER AN ABSENT SECTION. "Nothing written" has to
                    read differently from "nothing loaded" — and from "the request
                    failed", which is the third state that also shows no notes.
                    AC-5 asserts the three are distinguishable. */}
                {customer.notes === null || customer.notes.trim() === '' ? (
                  <p className={styles.notesEmpty}>{t('customers:profile.noNotes')}</p>
                ) : (
                  <p className={styles.notes}>
                    <bdi>{customer.notes}</bdi>
                  </p>
                )}
              </section>

              {/* THE GAP, NAMED. `018-customer-overview` owns the ticket history
                  and its counts, and no endpoint serves them yet. Rendering
                  nothing would make this screen look complete while the story it
                  is missing is the one a support agent opens a customer FOR.
                  The copy is user-facing and names no feature number. */}
              <section className={styles.pending}>
                <span className={styles.pendingIcon} aria-hidden="true">
                  <IconCustomer size={18} />
                </span>
                <span className={styles.pendingText}>
                  <span className={styles.pendingTitle}>
                    {t('customers:profile.ticketsTitle')}
                  </span>
                  <span className={styles.pendingBody}>
                    {t('customers:profile.ticketsSoon')}
                  </span>
                </span>
              </section>
            </div>

            <section className={styles.card}>
              <h3 className={styles.cardTitle}>{t('customers:profile.record')}</h3>

              <div className={styles.recordRow}>
                <span className={styles.recordLabel}>{t('customers:field.created')}</span>
                <span className={styles.recordValue}>
                  {formatDate(customer.createdAtUtc, lang)}
                </span>
              </div>

              {/* IDENTICAL TO `created` UNTIL `017` SHIPS, and rendered anyway.
                  `008`'s contract states the equality; it is a fact about this
                  release, not about this screen, and hiding the row would mean
                  adding it back — and re-testing it — in the feature that makes
                  the two differ. */}
              <div className={styles.recordRow}>
                <span className={styles.recordLabel}>{t('customers:field.updated')}</span>
                <span className={styles.recordValue}>
                  {formatDate(customer.updatedAtUtc, lang)}
                </span>
              </div>

              <div className={styles.recordRow}>
                <span className={styles.recordLabel}>{t('customers:field.id')}</span>
                <CopyValue
                  value={customer.id}
                  copyLabel={t('customers:profile.copyId')}
                  onCopied={() => onCopied?.(t('customers:field.id'))}
                >
                  {/* SHOWN SHORT, COPIED WHOLE — the case AC-4 exists for. A test
                      comparing the clipboard to this text would pass on a
                      truncated id, which is an id-shaped string that resolves to
                      nothing. */}
                  <span className={styles.cellMono} dir="ltr">
                    {shortId(customer.id)}
                  </span>
                </CopyValue>
              </div>
            </section>
          </div>
        </div>
      ) : null}

      {state === 'notFound' ? (
        <section className={styles.blank}>
          <span className={styles.blankIcon} aria-hidden="true">
            <IconCustomer size={25} />
          </span>
          <h2 className={styles.blankTitle}>{t('customers:profile.notFoundTitle')}</h2>
          <p className={styles.blankBody}>{t('customers:profile.notFoundBody')}</p>
          <div className={styles.blankActions}>
            <Link className={styles.blankLink} to="/customers">
              {t('customers:profile.backToList')}
            </Link>
          </div>
        </section>
      ) : null}

      {state === 'error' ? (
        <section className={styles.blank} role="alert">
          <span className={styles.blankIconDanger} aria-hidden="true">
            <IconAlert size={25} />
          </span>
          <h2 className={styles.blankTitle}>{t('customers:profile.errorTitle')}</h2>
          <p className={styles.blankBody}>{t('customers:profile.errorBody')}</p>

          {/* THE TRACE ID, VERBATIM AND ISOLATED. Never translated, never
              reformatted, never truncated (BR-8.7): it has to match the server
              log character for character or it is worse than absent, because
              someone will read it out. `dir="ltr"` inside the Arabic layout — the
              colon in `0HN…:0000000B` moves to the wrong end otherwise, and the
              string still LOOKS right. */}
          {traceId === undefined ? null : (
            <p className={styles.trace} dir="ltr">
              {traceId}
            </p>
          )}

          <div className={styles.blankActions}>
            <Button
              text={t('customers:profile.retry')}
              iconStart={<IconRetry size={15} />}
              {...(onRetry ? { onClick: onRetry } : {})}
            />
            <Link className={styles.blankLink} to="/customers">
              {t('customers:profile.backToList')}
            </Link>
          </div>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The body's skeleton: the strip's three cells and the two columns.
 *
 * SHAPED LIKE WHAT IS COMING, which is what makes it a skeleton rather than a
 * spinner with extra steps — the strip does not reflow when the data lands.
 * Widths vary per cell deliberately; a column of identical bars reads as a bar
 * chart (`029`).
 */
function ProfileSkeleton() {
  return (
    <div className={styles.body} aria-hidden="true">
      <div className={styles.strip}>
        {['86%', '72%', '64%'].map((width) => (
          <div className={styles.stripCell} key={width}>
            <Skeleton width="78px" height="8px" />
            <Skeleton width={width} height="10px" />
          </div>
        ))}
      </div>

      <div className={styles.columns}>
        <div className={styles.card}>
          <Skeleton width="68px" height="8px" />
          <Skeleton width="100%" height="9px" />
          <Skeleton width="92%" height="9px" />
          <Skeleton width="58%" height="9px" />
        </div>
        <div className={styles.card}>
          <Skeleton width="84px" height="8px" />
          <Skeleton width="100%" height="9px" />
          <Skeleton width="100%" height="9px" />
        </div>
      </div>
    </div>
  );
}
