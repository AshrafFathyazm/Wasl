import { matchRoutes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { routes } from './routes';
import { NAV_PATHS } from './shell/navItems';

/*
 * ONE CLAIM, AND IT WENT INTO A COMMENT BEFORE IT WAS CHECKED.
 *
 * `/tickets` is in NAV_PATHS — the nav has to keep pointing somewhere — and
 * NAV_PATHS is spread into the route table as `023` placeholders. The real list
 * route is declared AFTER that spread, and the comment beside it asserts that
 * react-router takes the last entry when two paths are identical.
 *
 * That is a claim about a library's ranking rules. Being confident is not being
 * right, and the failure would be silent: `/tickets` would render the
 * placeholder while every test in TicketListPage.test.tsx still passed, because
 * those mount the page directly and never go through the router.
 *
 * `matchRoutes` is react-router's own resolver, so this asks the question the
 * router will actually answer — rather than rendering the shell, which needs an
 * auth provider and would be testing three things at once.
 */

const leafFor = (path: string) => {
  const matches = matchRoutes(routes, path);
  expect(matches, `no route matched ${path}`).not.toBeNull();
  return matches![matches!.length - 1]!.route;
};

describe('/tickets resolves to the list, not the 023 placeholder', () => {
  it('still declares /tickets in NAV_PATHS, so the nav item survives', () => {
    /* Removing it from NAV_PATHS would also delete the nav item — which is why
     * the route is shadowed rather than the path removed. */
    expect(NAV_PATHS).toContain('/tickets');
  });

  it('declares /tickets exactly once — the placeholder is filtered, not shadowed', () => {
    const declared = routes
      .flatMap((r) => r.children ?? [])
      .flatMap((r) => r.children ?? [])
      .filter((r) => r.path === '/tickets');
    /* THE FIRST ATTEMPT DECLARED IT TWICE and relied on react-router preferring
     * the later entry. It does not: matchRoutes returned the placeholder, and
     * every TicketListPage test still passed because they mount the page
     * directly. One declaration removes the question. */
    expect(declared).toHaveLength(1);
    expect(leafFor('/tickets')).toBe(declared[0]);
  });

  it('gives /tickets a different COMPONENT from a placeholder-only nav path', () => {
    /* By component type, not by element identity. The first version compared
     * `element` objects — and `<HomePage />` is a fresh object per map() call,
     * so two placeholders compare unequal and the test passed on a build where
     * /tickets WAS the placeholder. */
    const typeOf = (path: string) => {
      const el = leafFor(path).element as { type?: unknown } | null;
      return el?.type;
    };
    expect(typeOf('/tickets')).not.toBe(typeOf('/customers'));
    /* And two placeholders DO share a component — which is what makes the
     * assertion above meaningful rather than trivially true.
     *
     * THIS CONTROL USED `/tickets/mine` AND CANNOT ANY MORE: that path is a real
     * screen now, so the pair became two real screens and the assertion would
     * have gone red for the right reason. `/` is the placeholder still left in
     * NAV_PATHS. */
    expect(typeOf('/customers')).toBe(typeOf('/'));
  });

  it('does not shadow the sibling ticket routes', () => {
    expect(leafFor('/tickets/new').path).toBe('/tickets/new');
    expect(leafFor('/tickets/abc').path).toBe('/tickets/:id');
  });
});

/*
 * THE TWO SCOPED QUEUES.
 *
 * `/tickets/mine` and `/tickets/unassigned` were NAV_PATHS placeholders, and the
 * only thing that distinguishes them from `/tickets` now is a prop. That makes
 * two silent failures possible, and both would leave every TicketListPage test
 * green: the route could still resolve to the placeholder, or it could resolve
 * to the list with NO queue — an agent's personal queue showing the whole team's
 * work, which looks like a working screen.
 */
describe('the scoped queues are the list, scoped by the path', () => {
  const elementAt = (path: string) =>
    leafFor(path).element as { type?: unknown; props?: { queue?: unknown } } | null;

  it.each([
    ['/tickets/mine', 'mine'],
    ['/tickets/unassigned', 'unassigned'],
  ])('%s renders the list component with queue="%s"', (path, queue) => {
    expect(elementAt(path)?.type).toBe(elementAt('/tickets')?.type);
    expect(elementAt(path)?.props?.queue).toBe(queue);
  });

  it('leaves /tickets unscoped — a queue prop there would narrow every list', () => {
    expect(elementAt('/tickets')?.props?.queue).toBeUndefined();
  });

  it('matches the segment exactly, so a ticket id starting "mine" still resolves', () => {
    /* The static-beats-dynamic ranking is about a WHOLE segment. Without this,
     * a passing test above would be consistent with `/tickets/mine*` swallowing
     * ids — it does not, and now that is measured rather than assumed. */
    expect(leafFor('/tickets/mineral').path).toBe('/tickets/:id');
  });
});
