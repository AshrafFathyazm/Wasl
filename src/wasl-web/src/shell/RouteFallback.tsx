import { useTranslation } from 'react-i18next';

import { Loader } from '../components/Loader/Loader';
import { useDeferredBusy } from '../lib/useDeferredBusy';
import styles from './RouteFallback.module.css';

/**
 * The Suspense fallback for route-level code splitting.
 *
 * `design/loaders.md` §2 gives `brand` exactly this slot: a full screen at first
 * entry, once per session, never repeated inside a screen. It is the one place
 * the whole mark is allowed to be the loader.
 *
 * `fallback={null}` was correct before this system existed — a chunk that
 * resolves in 40ms and renders a spinner is a flash, and null is better than a
 * flash. The gate replaces that judgement with the rule: nothing for 150ms, and
 * the mark after.
 *
 * ---------------------------------------------------------------------------
 * ONE GATE DOES NOT APPLY HERE, AND IT IS NOT AN OVERSIGHT.
 * ---------------------------------------------------------------------------
 * The 400ms minimum-visible floor cannot hold a Suspense fallback. React
 * unmounts this component the instant the chunk resolves; there is no state left
 * to keep it on screen, and nothing inside it can refuse to be unmounted.
 *
 * So a chunk that resolves between 150ms and 550ms still flashes the mark.
 * Measured window, narrow, and stated rather than papered over — the honest
 * alternative would be a wrapper holding the resolved route back for 400ms,
 * which is 400ms of latency on every navigation to remove a flash on some.
 * `useDeferredBusy` keeps the floor for every caller that CAN honour it.
 */
export function RouteFallback() {
  const { t } = useTranslation();

  /* Mounted only while suspended, so the flag is simply `true` — the hook is
   * here for the 150ms appear delay, not for a changing condition. */
  const { visible } = useDeferredBusy(true);

  if (!visible) return null;

  return (
    <div className={styles.screen}>
      <Loader variant="brand" label={t('common:loading')} />
    </div>
  );
}
