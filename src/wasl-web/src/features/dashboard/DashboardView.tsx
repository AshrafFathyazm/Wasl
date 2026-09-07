import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

import { Loader } from '../../components/Loader/Loader';
import { Skeleton } from '../../components/Loader/Skeleton';
import type {
  DashboardRange,
  DashboardSnapshot,
  DashboardTeamMember,
  DashboardTicketRef,
} from '../../lib/api-types.provisional';
import { IconArrowRight } from '../../icons/icons';
import { cx } from '../../lib/cx';
import { formatNumber, type Lang } from '../../lib/formatters';
import { AttentionTile } from './AttentionTile';
import { BarRow } from './BarRow';
import { CreatedResolvedChart } from './CreatedResolvedChart';
import { ageParts, durationParts } from './dashboardFormat';
import { NeedsAttentionList } from './NeedsAttentionList';
import styles from './Dashboard.module.css';

/* ============================================================================
 * DashboardView — the screen, as a function of props
 * ============================================================================
 * NOTHING HERE FETCHES. `DashboardPage` owns the request and the URL; this owns
 * the layout. The split is the one `032` made for the customer profile, and the
 * reason is the same: the states worth getting right — loading, a failed
 * request, an empty system, an Agent's four tiles instead of a Manager's — are
 * states a wired screen can only reach by breaking something. As props they can
 * be rendered side by side in `/_preview/dashboard`, which is FE-020-00's gate.
 * ========================================================================== */

export type DashboardState = 'loading' | 'error' | 'loaded';

export const DASHBOARD_RANGES: readonly DashboardRange[] = ['7d', '14d', '30d'];

/** The four statuses the queue card draws. `Resolved` arrives in the response
 *  and is deliberately not drawn: the card counts what is OPEN, and the
 *  subtitle's total is the sum of exactly these. */
const OPEN_STATUS_BARS = [
  { status: 'New', fill: 'var(--chart-status-new)', dot: 'var(--chart-status-new)' },
  { status: 'Open', fill: 'var(--chart-status-open)', dot: 'var(--chart-status-open)' },
  {
    status: 'InProgress',
    fill: 'var(--chart-status-inprogress)',
    dot: 'var(--chart-status-inprogress)',
  },
  {
    status: 'PendingCustomer',
    /* PURPLE, DOT INCLUDED — changed 2026-09-07 with the revised canvas. The
       first version made it a lighter amber sharing In progress's dot, so the
       two rows separated by weight; two amber bars of different lightness read
       as one bar rendered twice, and the paler one looks like a hover state. */
    fill: 'var(--chart-status-pending)',
    dot: 'var(--chart-status-pending)',
  },
] as const;

/**
 * How many open tickets one agent can carry before the card turns red.
 *
 * The revised canvas says "red above 8" in the card's own subtitle, so the number
 * is on the screen and this constant is what makes the two agree. A THRESHOLD
 * rather than a token: it is a number of tickets, not a colour.
 */
const TEAM_LOAD_CEILING = 8;

/** Dark to light by RANK — the tallest bar is the darkest, whatever channel is
 *  on top this fortnight. Five, because the contract always sends five. */
const RANK_FILLS = [
  'var(--chart-rank-1)',
  'var(--chart-rank-2)',
  'var(--chart-rank-3)',
  'var(--chart-rank-4)',
  'var(--chart-rank-5)',
] as const;

export interface DashboardViewProps {
  state: DashboardState;

  /** Present whenever `state` is `loaded`, and also while a NEW range is loading
   *  over an old snapshot — which is why it is not tied to the state. */
  snapshot?: DashboardSnapshot | undefined;

  /** The range the tabs show as pressed. Read from the URL by the page, so it
   *  survives a reload and the back button. */
  range: DashboardRange;

  onRangeChange: (range: DashboardRange) => void;

  lang: Lang;

  /** Minutes since the data was last true — from React Query's
   *  `dataUpdatedAt`, never from a clock started on mount. */
  updatedMinutes: number;

  /** Dims the body while a different range is in flight. The numbers on screen
   *  are still the last true ones, so they stay legible rather than being
   *  replaced by skeletons on every tab press. */
  isBusy?: boolean | undefined;

  /** From the `ProblemDetails`, never synthesised: a transport failure has no
   *  trace id because no server logged the request. */
  traceId?: string | undefined;

  onRetry: () => void;
}

export function DashboardView({
  state,
  snapshot,
  range,
  onRangeChange,
  lang,
  updatedMinutes,
  isBusy = false,
  traceId,
  onRetry,
}: DashboardViewProps) {
  const { t } = useTranslation('dashboard');

  const dayCount = Number(range.replace('d', ''));

  return (
    <div className={styles.page} data-page="dashboard">
      <header className={styles.head}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>
            {snapshot === undefined
              ? null
              : t('header.subtitle', {
                  scope: t(`scope.${snapshot.scope}`),
                  zone: snapshot.timeZoneId,
                  updated: t('header.updated', {
                    count: updatedMinutes,
                    formatted: formatNumber(updatedMinutes, lang),
                  }),
                })}

            {/* The converge loader from `029`, in place rather than over the
                page: a blocking overlay would claim the numbers still on screen
                are unavailable, and they are not — they are one range old. */}
            {isBusy ? (
              <span className={styles.headLoader}>
                <Loader size="sm" label={t('loading')} />
              </span>
            ) : null}
          </p>
        </div>

        <div className={styles.segmented} role="group" aria-label={t('range.label')}>
          {DASHBOARD_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              /* THE CLASS IS NOT DECORATION — see `Dashboard.module.css`. A
                 `<button>` with no `class` attribute is filled by `base.css`
                 rule 17 with the PRIMARY button's navy, `!important`, and the
                 pressed state then cannot be seen at all. Measured in the
                 browser, invisible to jsdom. */
              className={styles.rangeButton}
              aria-pressed={option === range}
              onClick={() => onRangeChange(option)}
            >
              {t(`range.${option}`)}
            </button>
          ))}
        </div>
      </header>

      {state === 'loading' ? <DashboardSkeleton /> : null}

      {state === 'error' ? (
        <div className={styles.errorCard} role="alert">
          <p className={styles.errorTitle}>{t('error.title')}</p>
          <p className={styles.errorBody}>{t('error.body')}</p>

          {traceId === undefined ? null : (
            /* SELECTABLE, and named. An unexplainable error is a support call,
               and the trace id is the one string that makes it short — `002`
               guarantees it matches the server log. */
            <p className={styles.trace}>
              {t('error.trace')}
              <code>{traceId}</code>
            </p>
          )}

          <button type="button" className={styles.retry} onClick={onRetry}>
            {t('error.retry')}
          </button>
        </div>
      ) : null}

      {snapshot === undefined ? null : (
        <div className={cx(styles.body, isBusy && styles.bodyBusy)}>
          <Tiles snapshot={snapshot} lang={lang} />

          <div className={styles.split}>
            <TrendCard snapshot={snapshot} lang={lang} dayCount={dayCount} />
            <QueueCard snapshot={snapshot} lang={lang} />
          </div>

          <div className={styles.split}>
            <section className={styles.card}>
              {/* THE CARD'S HEADER CARRIES A LINK NOW — "View all 15 →". The
                  count is `needsAttentionTotal`, not `needsAttention.length`:
                  the list is capped at ten, so a link reading "View all 10"
                  beside ten rows tells the reader nothing. */}
              <div className={styles.cardHead}>
                <div>
                  <h2 className={styles.cardTitle}>{t('attentionList.title')}</h2>
                  <p className={styles.cardSubtitle}>{t('attentionList.subtitle')}</p>
                </div>

                {snapshot.attention.needsAttentionTotal > snapshot.needsAttention.length ? (
                  <Link
                    to={
                      snapshot.scope === 'Team'
                        ? '/tickets?assignee=unassigned'
                        : '/tickets/mine'
                    }
                    className={styles.cardLink}
                  >
                    {t('attentionList.viewAll', {
                      count: snapshot.attention.needsAttentionTotal,
                      formatted: formatNumber(snapshot.attention.needsAttentionTotal, lang),
                    })}
                    <IconArrowRight size={12} aria-hidden="true" />
                  </Link>
                ) : null}
              </div>

              <NeedsAttentionList items={snapshot.needsAttention} lang={lang} />
            </section>

            <DemandCard snapshot={snapshot} lang={lang} dayCount={dayCount} />
          </div>

          {/* TEAM LOAD IS ITS OWN CARD NOW, and full width. The first version put
              it under the channel mix behind a rule, which the revised canvas
              splits out: it is the only block about PEOPLE rather than tickets,
              and three agent cards do not fit a 1fr column. */}
          {snapshot.teamLoad === undefined ? null : (
            <TeamLoadCard team={snapshot.teamLoad} unassigned={snapshot.attention.unassignedCount} lang={lang} />
          )}
        </div>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * Row 1 — the tiles. Two audiences, four tiles each
 * ════════════════════════════════════════════════════════════════════════════ */
function Tiles({ snapshot, lang }: { snapshot: DashboardSnapshot; lang: Lang }) {
  const { t } = useTranslation('dashboard');
  const attention = snapshot.attention;

  /** A ticket tile's value: its age, or an em dash when there is no such ticket.
   *  Never `0` — `0h` would claim a ticket exists and is brand new. */
  function ticketAge(ticket: DashboardTicketRef | null): string {
    if (ticket === null) return t('tiles.noneValue');

    const age = ageParts(ticket.ageHours);

    return t(`age.${age.unit}`, {
      count: age.value,
      formatted: formatNumber(age.value, lang),
    });
  }

  const waitingTo =
    snapshot.scope === 'Team'
      ? '/tickets?status=PendingCustomer'
      : '/tickets/mine?status=PendingCustomer';

  return (
    <div className={styles.tiles}>
      {snapshot.scope === 'Team' ? (
        <>
          <AttentionTile
            tone="danger"
            label={t('tiles.unassigned')}
            value={formatNumber(attention.unassignedCount, lang)}
            footer={t('tiles.unassignedFoot')}
            isZero={attention.unassignedCount === 0}
            to="/tickets/unassigned"
          />

          <AttentionTile
            tone="danger"
            label={t('tiles.escalated')}
            value={formatNumber(attention.escalatedOpenCount, lang)}
            /* The contract change of 2026-09-07 renders here and nowhere else.
               Counting `needsAttention` for this would be wrong from the
               eleventh escalation, silently. */
            footer={t('tiles.escalatedFoot', {
              count: attention.escalatedOverdueCount,
              formatted: formatNumber(attention.escalatedOverdueCount, lang),
            })}
            isZero={attention.escalatedOpenCount === 0}
            to="/tickets?escalated=true"
          />

          <AttentionTile
            tone="warning"
            label={t('tiles.oldestUntouched')}
            value={ticketAge(attention.oldestUntouched)}
            footer={attention.oldestUntouched?.ticketNumber ?? t('tiles.noneFoot')}
            isZero={attention.oldestUntouched === null}
            to={
              attention.oldestUntouched === null
                ? '/tickets/unassigned'
                : `/tickets/${attention.oldestUntouched.ticketId}`
            }
          />

          <AttentionTile
            tone="warning"
            label={t('tiles.waiting')}
            value={formatNumber(attention.waitingOnCustomerCount, lang)}
            footer={t('tiles.waitingFoot')}
            isZero={attention.waitingOnCustomerCount === 0}
            to={waitingTo}
          />
        </>
      ) : (
        <>
          <AttentionTile
            tone="danger"
            label={t('tiles.assignedToMe')}
            value={formatNumber(attention.assignedToMeCount, lang)}
            footer={t('tiles.assignedToMeFoot')}
            isZero={attention.assignedToMeCount === 0}
            to="/tickets/mine"
          />

          {/* THE POOL IS GLOBAL FOR AN AGENT TOO, and the tile says so. That is
              the contract's documented exception: an unassigned ticket has no
              owner, so there is no "mine" version of it, and an Agent looking at
              an empty personal queue needs the pool to be the next action. */}
          <AttentionTile
            tone="danger"
            label={t('tiles.unassignedPool')}
            value={formatNumber(attention.unassignedCount, lang)}
            footer={t('tiles.unassignedPoolFoot')}
            isZero={attention.unassignedCount === 0}
            to="/tickets/unassigned"
          />

          <AttentionTile
            tone="warning"
            label={t('tiles.myOldest')}
            value={ticketAge(attention.myOldest)}
            footer={attention.myOldest?.ticketNumber ?? t('tiles.noneFoot')}
            isZero={attention.myOldest === null}
            to={
              attention.myOldest === null
                ? '/tickets/mine'
                : `/tickets/${attention.myOldest.ticketId}`
            }
          />

          <AttentionTile
            tone="warning"
            label={t('tiles.waiting')}
            value={formatNumber(attention.waitingOnCustomerCount, lang)}
            footer={t('tiles.waitingFoot')}
            isZero={attention.waitingOnCustomerCount === 0}
            to={waitingTo}
          />
        </>
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * Row 2, left — created versus resolved
 * ════════════════════════════════════════════════════════════════════════════ */
function TrendCard({
  snapshot,
  lang,
  dayCount,
}: {
  snapshot: DashboardSnapshot;
  lang: Lang;
  dayCount: number;
}) {
  const { t } = useTranslation('dashboard');

  const created = snapshot.dailySeries.reduce((sum, day) => sum + day.created, 0);
  const resolved = snapshot.dailySeries.reduce((sum, day) => sum + day.resolved, 0);
  const gap = created - resolved;

  /* THREE SENTENCES, NOT ONE WITH A SIGNED NUMBER. "trailing by -6" is not a
     sentence anybody reads, and "trailing by 0" states a difference that is not
     one. The verdict is the fact the card exists to deliver — are we keeping
     up — so it is words rather than arithmetic left to the reader. */
  const verdict =
    gap > 0
      ? t('chart.trailing', { count: gap, formatted: formatNumber(gap, lang) })
      : gap < 0
        ? t('chart.ahead', { count: -gap, formatted: formatNumber(-gap, lang) })
        : t('chart.level');

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('chart.title')}</h2>
      <p className={styles.cardSubtitle}>
        {t('chart.subtitle', {
          count: dayCount,
          formatted: formatNumber(dayCount, lang),
          verdict,
        })}
      </p>

      {created === 0 && resolved === 0 ? (
        /* An empty period is stated, not drawn. Fourteen zero-height bars under
           an axis is a card that looks like it failed to load — and the axis is
           still rendered underneath this, so the period itself stays visible. */
        <p className={styles.emptyLine}>{t('chart.empty')}</p>
      ) : null}

      <CreatedResolvedChart days={snapshot.dailySeries} lang={lang} />

      <div className={styles.legend}>
        <span className={styles.legendItem}>
          <span className={styles.swatchCreated} aria-hidden="true" />
          {t('chart.createdTotal', { formatted: formatNumber(created, lang) })}
        </span>
        <span className={styles.legendItem}>
          <span className={styles.swatchResolved} aria-hidden="true" />
          {t('chart.resolvedTotal', { formatted: formatNumber(resolved, lang) })}
        </span>
      </div>
    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * Row 2, right — the queue's shape, and the two medians
 * ════════════════════════════════════════════════════════════════════════════ */
function QueueCard({ snapshot, lang }: { snapshot: DashboardSnapshot; lang: Lang }) {
  const { t } = useTranslation('dashboard');

  const counts = new Map(snapshot.openByStatus.map((entry) => [entry.status, entry.count]));

  const bars = OPEN_STATUS_BARS.map((bar) => ({
    ...bar,
    count: counts.get(bar.status) ?? 0,
  }));

  /* THE TOTAL IS THE SUM OF THE BARS DRAWN, not of everything the server sent.
     `Resolved` arrives in `openByStatus` and is not one of the four, so summing
     the response would put a number above the card that the bars do not add up
     to — which is the kind of discrepancy a reader spots and cannot explain. */
  const total = bars.reduce((sum, bar) => sum + bar.count, 0);

  /* SCALED TO THE LARGEST STATUS, NOT TO THE TOTAL — CHANGED 2026-09-07.
   *
   * The first version divided by the total, so four statuses of 12/18/12/21 drew
   * as 19/29/19/33% and the card used a third of its width. The revised canvas
   * scales to the biggest bar: the largest status fills the track and the others
   * are read against IT, which is the comparison the card is for. The absolute
   * numbers are on the right in both versions, so nothing is lost by the change. */
  const largest = Math.max(1, ...bars.map((bar) => bar.count));

  function share(count: number): number {
    return Math.round((count / largest) * 100);
  }

  /** A duration in words: `2h 10m`, `1d 4h`, `45m`. Used for the target and the
   *  overshoot, both of which are real numbers rather than possibly-absent ones. */
  function duration(minutes: number): string {
    return durationParts(minutes)
      .map((part) =>
        t(`duration.${part.unit}`, {
          count: part.value,
          formatted: formatNumber(part.value, lang),
        }),
      )
      .join(' ');
  }

  function median(minutes: number | null, sampleSize: number): string {
    /* `—` AT SAMPLE SIZE ZERO, NEVER `0`. Zero minutes to first reply is a
       claim, and an empty period does not make it. The sample size is what
       decides, not the value: a single ticket answered in twenty seconds
       legitimately rounds to zero minutes. */
    if (sampleSize === 0 || minutes === null) return t('medians.none');

    return duration(minutes);
  }

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('status.title')}</h2>
      <p className={styles.cardSubtitle}>
        {t('status.subtitle', { count: total, formatted: formatNumber(total, lang) })}
      </p>

      {bars.map((bar) => (
        <BarRow
          key={bar.status}
          label={t(`status.${bar.status}`)}
          fill={bar.fill}
          dot={bar.dot}
          percent={share(bar.count)}
          value={formatNumber(bar.count, lang)}
          to={`/tickets?status=${bar.status}`}
          linkLabel={t('status.open', { status: t(`status.${bar.status}`) })}
        />
      ))}

      <div className={styles.rule} />

      <MedianRow
        label={t('medians.firstReply')}
        minutes={snapshot.medians.firstReplyMinutes}
        sampleSize={snapshot.medians.firstReplySampleSize}
        targetMinutes={snapshot.medians.firstReplyTargetMinutes}
        renderMedian={median}
        renderDuration={duration}
      />

      <MedianRow
        label={t('medians.resolution')}
        minutes={snapshot.medians.resolutionMinutes}
        sampleSize={snapshot.medians.resolutionSampleSize}
        targetMinutes={snapshot.medians.resolutionTargetMinutes}
        renderMedian={median}
        renderDuration={duration}
      />
    </section>
  );
}

/**
 * One median, against its target. Added 2026-09-07 with the revised canvas.
 *
 * **The bar is the median as a fraction of the target, capped at the track.** Over
 * target it is amber and the overshoot is named in words — "+10m over" — because a
 * bar that has simply run out of track says only "a lot", and the number of
 * minutes is the thing somebody acts on.
 *
 * **Amber, never red.** Red on this screen means work nobody owns. A median an
 * hour over a two-hour target is a trend, not an emergency, and using the same
 * colour for both is how a red tile stops being read.
 */
function MedianRow({
  label,
  minutes,
  sampleSize,
  targetMinutes,
  renderMedian,
  renderDuration,
}: {
  label: string;
  minutes: number | null;
  sampleSize: number;
  targetMinutes: number;

  /* NO `lang` PROP, and it had one until the compiler objected. Every string this
     renders arrives already formatted through the two callbacks — which is the
     shape that keeps `formatNumber`'s locale in ONE place per card rather than
     being re-decided per row. An unused `lang` would have been an invitation to
     format something here and get a second answer. */
  renderMedian: (minutes: number | null, sampleSize: number) => string;
  renderDuration: (minutes: number) => string;
}) {
  const { t } = useTranslation('dashboard');

  const hasValue = sampleSize > 0 && minutes !== null;
  const over = hasValue && minutes > targetMinutes;

  /* The TARGET is the full track, so two rows with different targets are still
     comparable as "how close to what we asked for". Capped at 100 because a
     median at three times the target would otherwise render a bar wider than its
     own card. */
  const filled = hasValue ? Math.min(100, Math.round((minutes / targetMinutes) * 100)) : 0;

  return (
    <div className={styles.median}>
      <div className={styles.medianHead}>
        <span className={styles.medianLabel}>{label}</span>
        <span className={styles.medianTarget}>
          {t('medians.target', { value: renderDuration(targetMinutes) })}
        </span>
      </div>

      <div className={styles.medianHead}>
        <span className={styles.medianValue}>{renderMedian(minutes, sampleSize)}</span>

        {over ? (
          <span className={styles.medianOver}>
            {t('medians.over', { value: renderDuration(minutes - targetMinutes) })}
          </span>
        ) : null}
      </div>

      <span className={styles.track} aria-hidden="true">
        <span
          className={styles.fill}
          style={{
            inlineSize: `${filled}%`,
            backgroundColor: over ? 'var(--chart-over-target)' : 'var(--chart-under-target)',
          }}
        />
      </span>
    </div>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * Row 3, right — where demand comes from, and who is carrying it
 * ════════════════════════════════════════════════════════════════════════════ */
function DemandCard({
  snapshot,
  lang,
  dayCount,
}: {
  snapshot: DashboardSnapshot;
  lang: Lang;
  dayCount: number;
}) {
  const { t } = useTranslation('dashboard');

  /* SORTED BY COUNT HERE, IN THE CLIENT, AND THE SERVER STILL SENDS ENUM ORDER.
   *
   * The contract orders `channelMix` by the enum's declaration so the bars cannot
   * reorder between refreshes; the design ranks them, largest first, and shades
   * them dark-to-light by that rank. Both are right about different things, and
   * the ruling of 2026-09-07 is that the DESIGN WINS on the screen.
   *
   * Sorting on this side rather than asking the backend to change the order is
   * what keeps the frozen contract's guarantee available to any other consumer —
   * and the tie-break on the channel name is what stops two equal counts from
   * swapping places on every render, which is the instability the contract's rule
   * was protecting against in the first place. */
  const channels = [...snapshot.channelMix].sort(
    (left, right) => right.count - left.count || left.channel.localeCompare(right.channel),
  );

  const channelMax = Math.max(1, ...channels.map((entry) => entry.count));
  const channelTotal = channels.reduce((sum, entry) => sum + entry.count, 0);

  return (
    <section className={styles.card}>
      <h2 className={styles.cardTitle}>{t('channels.title')}</h2>
      <p className={styles.cardSubtitle}>
        {t('channels.subtitle', {
          count: dayCount,
          formatted: formatNumber(dayCount, lang),
        })}
      </p>

      {channels.map((entry, index) => (
        <BarRow
          key={entry.channel}
          /* THE SHARE, added 2026-09-07 — the canvas prints "38%" after the
             count. Computed here rather than served: it is the count divided by
             the total the client already has, and a server-side percentage would
             be a second number that can disagree with the first. */
          share={channelTotal === 0 ? undefined : Math.round((entry.count / channelTotal) * 100)}
          shareLang={lang}
          /* THE CHANNEL NAMES COME FROM `tickets:` AND ARE NOT COPIED HERE. The
             mix chart labels the same five values the ticket table does, and two
             catalogues holding one name is one that gets edited. */
          label={t(`tickets:channel.${entry.channel}`)}
          fill={RANK_FILLS[index] ?? RANK_FILLS[RANK_FILLS.length - 1] ?? ''}
          percent={Math.round((entry.count / channelMax) * 100)}
          value={formatNumber(entry.count, lang)}
          to={`/tickets?channel=${entry.channel}`}
          linkLabel={t('channels.open', {
            channel: t(`tickets:channel.${entry.channel}`),
          })}
        />
      ))}

    </section>
  );
}

/* ══════════════════════════════════════════════════════════════════════════════
 * Team load — its own card since the revised canvas, and Manager only
 * ════════════════════════════════════════════════════════════════════════════ */

/**
 * Assigned-and-open per agent, as a card each.
 *
 * **This is not a leaderboard.** US-016 excludes a ranking by tickets closed
 * deliberately: the fastest way up such a board is closing things that should have
 * stayed open. What is ranked here is CURRENT LOAD, and the number a manager acts
 * on is the one at the bottom.
 *
 * **`red above 8` is in the card's own subtitle**, so the threshold is visible to
 * the reader rather than being a colour they have to infer.
 *
 * **The canvas's "2 breaching" footnote is absent, and that is a decision.** A
 * breach needs a per-ticket SLA and this product has none — `027` left the SLA
 * pill, the rail block and the breach banner unbuilt for the reason `CLAUDE.md`
 * records: a countdown drawn from nothing looks exactly like a working one. The
 * escalated count beside it IS real, and it is what ships.
 */
function TeamLoadCard({
  team,
  unassigned,
  lang,
}: {
  team: readonly DashboardTeamMember[];
  unassigned: number;
  lang: Lang;
}) {
  const { t } = useTranslation('dashboard');

  const assigned = team.reduce((sum, row) => sum + row.assignedOpenCount, 0);
  const ceiling = Math.max(TEAM_LOAD_CEILING, ...team.map((row) => row.assignedOpenCount));

  return (
    <section className={styles.card}>
      <div className={styles.cardHead}>
        <div>
          <h2 className={styles.cardTitle}>{t('team.title')}</h2>
          <p className={styles.cardSubtitle}>
            {t('team.subtitle', {
              count: TEAM_LOAD_CEILING,
              formatted: formatNumber(TEAM_LOAD_CEILING, lang),
            })}
          </p>
        </div>

        {/* Two facts the manager reads together: what the team is holding and
            what nobody is. Both are already in the snapshot — the sum of the
            cards below, and the tile at the top of the screen. */}
        <p className={styles.cardMeta}>
          {t('team.meta', {
            assigned: formatNumber(assigned, lang),
            unassigned: formatNumber(unassigned, lang),
          })}
        </p>
      </div>

      {team.length === 0 ? (
        <p className={styles.emptyLine}>{t('team.empty')}</p>
      ) : (
        <div className={styles.agents}>
          {team.map((row) => {
            const over = row.assignedOpenCount > TEAM_LOAD_CEILING;

            return (
              <div key={row.userId} className={styles.agent}>
                <div className={styles.agentHead}>
                  {/* Initials, not an image: there are no avatars in this
                      product, and a placeholder silhouette per agent would be
                      three identical grey heads. */}
                  <span className={styles.agentAvatar} aria-hidden="true">
                    {initials(row.fullName)}
                  </span>

                  {/* The full name, unabbreviated. The canvas shows "Ashraf F."
                      and that is its sample data, not a rule: abbreviating a real
                      name is a lossy transform on user content, and the first
                      Arabic name it met would be shortened at the wrong end. */}
                  <span className={styles.agentName} dir="auto">
                    {row.fullName}
                  </span>

                  <span className={cx(styles.agentCount, over && styles.agentCountOver)}>
                    {formatNumber(row.assignedOpenCount, lang)}
                  </span>
                </div>

                <span className={styles.track} aria-hidden="true">
                  <span
                    className={styles.fill}
                    style={{
                      inlineSize: `${Math.round((row.assignedOpenCount / ceiling) * 100)}%`,
                      backgroundColor: over
                        ? 'var(--chart-team-over)'
                        : 'var(--chart-under-target)',
                    }}
                  />
                </span>

                <p className={styles.agentFoot}>
                  {row.escalatedOpenCount > 0
                    ? t('team.escalated', {
                        count: row.escalatedOpenCount,
                        formatted: formatNumber(row.escalatedOpenCount, lang),
                      })
                    : over
                      ? t('team.atCapacity')
                      : t('team.canTakeMore')}
                  {row.isActive ? null : <span className={styles.agentInactive}>{t('team.inactive')}</span>}
                </p>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

/**
 * Up to two initials from a full name, for the agent card's disc.
 *
 * Works on Arabic as it does on Latin — it takes the first character of the first
 * two whitespace-separated parts, which is a grapheme-safe operation for both
 * scripts here because neither uses combining marks in a first letter. A single
 * long name yields one initial rather than two letters of one word.
 */
function initials(fullName: string): string {
  return fullName
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => [...part][0] ?? '')
    .join('');
}

/* ══════════════════════════════════════════════════════════════════════════════
 * The loading state — the layout, at the heights it will really be
 * ════════════════════════════════════════════════════════════════════════════ */
function DashboardSkeleton() {
  const { t } = useTranslation('dashboard');

  /* THE REAL CARD HEIGHTS, so nothing moves when the data lands. A skeleton
     shorter than its card produces a jump that reads as a second load — `029`'s
     rule, and the reason these numbers are here rather than a generic spinner. */
  return (
    <div className={styles.body} aria-busy="true" aria-label={t('loading')}>
      <div className={styles.tiles}>
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className={styles.tile}>
            <Skeleton shape="text" width="52%" />
            <Skeleton shape="text" width="34%" height="28px" />
            <Skeleton shape="text" width="66%" />
          </div>
        ))}
      </div>

      <div className={styles.split}>
        <div className={styles.card}>
          <Skeleton shape="text" width="38%" />
          <Skeleton shape="block" height="152px" />
        </div>
        <div className={styles.card}>
          <Skeleton shape="text" width="46%" />
          <Skeleton shape="block" height="152px" />
        </div>
      </div>

      <div className={styles.split}>
        <div className={styles.card}>
          <Skeleton shape="text" width="42%" />
          <Skeleton shape="block" height="132px" />
        </div>
        <div className={styles.card}>
          <Skeleton shape="text" width="50%" />
          <Skeleton shape="block" height="132px" />
        </div>
      </div>
    </div>
  );
}
