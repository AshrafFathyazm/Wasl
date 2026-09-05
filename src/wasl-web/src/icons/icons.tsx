/* ============================================================================
 * The Wasl icon set — ONE module. `037-icon-system`.
 * ============================================================================
 *
 * 24 box · 16-unit keyline · stroke 1.5 at EVERY size · round caps and joins ·
 * `currentColor` · no fills · default size 18.
 *
 * Sixty-two of these are the product owner's `Wasl Icon System` document
 * (`docs/sdd/design/icons/wasl-icon-system.html`). Eleven are ours, kept from
 * the set that came before because the document has no counterpart for them;
 * they are labelled (D) in the last section, each with the reason it survived.
 *
 * ---------------------------------------------------------------------------
 * THE DOCUMENT IS NOT FOLLOWED LITERALLY, AND THAT WAS RULED, NOT ASSUMED
 * ---------------------------------------------------------------------------
 *
 * The document is a complete second icon system, and its rules contradict
 * `design/icons.md` on three points. The product owner ruled **house rules win**
 * (spec `037` §1, R-1) — take the metaphors and the geometry, normalise to the
 * rules already written down:
 *
 *   N-1  KEYLINE.  The document draws to a 20-unit keyline; the house rule is
 *        16. Each icon is scaled about (12,12) by `s = min(1, 8 / R)`, where R
 *        is its ink's greatest distance from the centre. 22 of the 62 needed
 *        nothing; the rest took factors between 0.80 and 0.99.
 *
 *        It SCALES rather than RECENTRES, deliberately. `IconAssign` is a
 *        person on one side and a mark on the other; its ink is off-centre
 *        because the glyph is, and recentring would move the optical centre of
 *        every asymmetric icon here. The cost is that an off-centre icon gets a
 *        little more air on its short side.
 *
 *   N-2  STROKE 1.5 AT EVERY SIZE. The document asks for 1.75 at 16px to
 *        compensate optically. `icons.md` refuses that, and says why: scaling
 *        the stroke with the box is what makes a set look inconsistent across
 *        contexts. So icons at 16 read very slightly lighter than the document
 *        intends. Known, accepted.
 *
 *   N-3  NO FILLS — and this one costs the document its own headline. Its
 *        signature is the *node*: a filled circle at the end of a stroke, on
 *        seven icons. `icons.md` says "Fills: None. Do not mix filled and
 *        stroked in one set", and that rule was measured to hold without a
 *        single exception across the previous thirty-nine. So every filled
 *        circle here is stroked instead:
 *
 *          r > 1.2   a stroked circle at the same radius. At r ≥ 1.6 against a
 *                    1.5 stroke the hole is visible, so it reads as a RING.
 *                    That is the loss, and it is the whole of it.
 *          r ≤ 1.2   a round-capped zero-length stroke — `M12 16v.5`. Already
 *                    the house form; a stroked r1.15 circle has an inner radius
 *                    of 0.4 and renders as a blob with a pinhole.
 *
 * The set's signature is therefore the one `icons.md` already claims — the
 * tighter keyline and the derived radius, *felt, not seen* — and not the one
 * the document proposes.
 *
 * ---------------------------------------------------------------------------
 * WHY THIS IS ONE FILE NOW
 * ---------------------------------------------------------------------------
 *
 * There used to be two: `icons.tsx` and `icons-added.tsx`. The second one's
 * header explained that the first was "a byte-for-byte copy of
 * `docs/sdd/design/icons/index.tsx`" and that adding to it would break a drift
 * check forever.
 *
 * BOTH HALVES OF THAT WERE ALREADY FALSE. `026` changed `IconFilter` from a
 * funnel to three lines and appended four more icons, so it was not a copy; and
 * there is no drift check, and there never was. The split was costing a
 * duplicated `base()` and a duplicated `IconEye` — declared in both files with
 * different geometry, so `Input.tsx` and `TicketListPage.tsx` were rendering
 * two different drawings of the same name — and buying nothing.
 *
 * ---------------------------------------------------------------------------
 * MIRRORING IS ONE CSS RULE, NOT TWENTY COMPONENTS
 * ---------------------------------------------------------------------------
 *
 * A directional icon carries `data-flip`, and `styles/base.css` holds the only
 * rule that acts on it. Before `037` this was done per consumer, and there was
 * exactly ONE such rule — `.signOut .rowIcon` in `Sidebar.module.css` — against
 * nineteen icons that needed one and had none.
 *
 * The flip list is the document's own, verbatim, and `iconRtl.test.ts` compares
 * it against a literal copy so it cannot drift silently.
 *
 * TWO OF ITS ENTRIES OVERRIDE AN ARGUMENT WE HAD WRITTEN DOWN, and that is
 * recorded rather than quietly dropped. `refresh` and `reopen` are rotations,
 * and the previous `IconRetry` carried a comment refusing to mirror it: *"a
 * rotation points around the reading axis, not along it."* The document mirrors
 * both. The document wins here because it is the design of record for these
 * glyphs and the ruling adopted its metaphors — but the argument was real, and
 * `037` AC-11 looks at exactly this in Arabic.
 *
 * ---------------------------------------------------------------------------
 * ADDING ONE
 * ---------------------------------------------------------------------------
 *
 * Draw on the 24 box, keep the ink inside 4 … 20, stroke nothing yourself and
 * fill nothing at all, and add it here — not in a second file. Four tests will
 * tell you if you got it wrong, and each of them has been seen to fail on
 * purpose (`037` `tests.md`).
 * ========================================================================= */

import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

/* A directional icon carries `data-flip=""` on its <svg>, written out rather
 * than spread from a shared constant: `iconRtl.test.ts` reads the SOURCE, and a
 * spread is invisible to it. The attribute the file shows is the attribute the
 * DOM gets. */

/* ---- The primary family — the document’s §02 --------------------------------- */

export const IconSearch = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="10.5" cy="10.5" r="6.25" />
    <path d="M15 15l5 5" />
  </svg>
);

/**
 * LINES, NOT A FUNNEL — and the document agrees with `026`, which had already
 * made that change here for its own reason. Three centred bars, 16 · 11 · 5.
 *
 * It also FIXES a keyline violation rather than causing one: the previous
 * geometry ran 3.5 → 20.5 and was one of the nine icons AC-1 first went red on.
 * The document's runs 4 → 20 exactly, so this one needed no scaling at all.
 *
 * Do not confuse it with `IconSettings` below. That is three FULL-WIDTH tracks
 * each carrying a ring; this is three bars of decreasing length and no rings.
 */
export const IconFilter = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h16" />
    <path d="M6.5 12h11" />
    <path d="M9.5 17h5" />
  </svg>
);

export const IconCalendar = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="4.222" y="5.778" width="15.556" height="14" rx="2" />
    <path d="M8.444 4 v3.556 M15.556 4 v3.556 M4.222 10.222 h15.556" />
  </svg>
);

export const IconEmail = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="4" y="6.444" width="16" height="11.111" rx="2" />
    <path d="M4.667 7.556 L12 12.667 19.333 7.556" />
  </svg>
);

/**
 * The document's `chat`. Its node is stroked (N-3), so the bubble's mark is a ring.
 */
export const IconComment = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <rect x="4" y="4.941" width="16" height="10.824" rx="2.353" />
    <path d="M8.706 15.765 v3.765 L12.941 15.765" />
    <circle cx="12" cy="10.353" r="1.506" />
  </svg>
);

/**
 * NEW, and it is where the old `IconSms` went. That icon drew a handset; the
 * document draws a handset as `mobile` and gives `sms` a bubble with two lines
 * of text in it. So the channel column now gets the bubble and the handset keeps
 * its drawing under an honest name.
 */
export const IconMobile = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="7.789" y="4" width="8.421" height="16" rx="1.895" />
    <path d="M10.526 17.474 h2.947" />
  </svg>
);

/**
 * NO CONSUMER, deliberately. Attachments are out of scope for the product
 * (`00-project-context.md`), and this ships because the set is the deliverable.
 * An icon promises nothing until something renders it — `027`'s rule bites on
 * data regions and inert controls, not on an unused export. `iconCoverage.test.ts`
 * names it so it cannot be mistaken for an oversight.
 */
export const IconAttachment = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M16 8.5v7.5a4 4 0 01-8 0V7a2.5 2.5 0 015 0v9a1 1 0 01-2 0V8.5" />
  </svg>
);

/**
 * The document's rising swoosh with a mark at its head, replacing the arrow in a
 * rounded square that was here before. Seven consumers see a different glyph.
 *
 * Its mark is one of the seven the document calls a NODE and fills; N-3 strokes
 * it, so it is a ring. That is the document's signature, and it does not ship.
 */
export const IconEscalate = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M4.809 16.494 h4.045 c4.944 0 6.292 -4.944 7.82 -8.629" />
    <path d="M4.809 12 h5.393 c3.596 0 4.944 -2.247 6.472 -3.955" />
    <circle cx="18.292" cy="7.506" r="1.708" />
  </svg>
);

export const IconCustomer = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="8.471" r="3.671" />
    <path d="M5.412 20 c0 -3.765 2.918 -6.212 6.588 -6.212 s6.588 2.447 6.588 6.212" />
  </svg>
);

/**
 * A SLIDER, NOT A GEAR — the document's form, and the reason it gives is size:
 * a gear's teeth choke at 16px, three tracks do not.
 *
 * Three full-width tracks, each with one ring at a DIFFERENT position along it
 * (x ≈ 15.5 · 8.5 · 13.5). The offset positions are the content — three rings in
 * a column would be a list, and three at the same x would be a stack.
 *
 * The document fills those three; N-3 strokes them. `037` Q-6 asks the one
 * question that decides whether this works: at 18px, does an r2 ring stay a
 * ring, or does it fill in? If it fills in, the only thing left separating this
 * from `IconFilter` is bar length. The fallback, pre-authorised, is the old
 * gear — see `tests.md` for which way it went.
 */
export const IconSettings = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
    <circle cx="15.5" cy="7" r="2" />
    <circle cx="8.5" cy="12" r="2" />
    <circle cx="13.5" cy="17" r="2" />
  </svg>
);

/**
 * The document's `refresh`.
 *
 * IT MIRRORS UNDER RTL, AND THAT OVERRIDES AN ARGUMENT WE HAD WRITTEN DOWN. The
 * previous `IconRetry` carried a comment refusing to flip: a rotation points
 * around the reading axis, not along it, so mirroring it reverses a physical
 * action instead of a direction. The document lists `refresh` and `reopen` among
 * its twenty mirrored glyphs. It wins because the ruling adopted its metaphors and
 * it is the design of record for them — but the argument was not wrong, and AC-11
 * looks at both of these in Arabic specifically.
 */
export const IconRetry = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M19.758 12 a7.758 7.758 0 1 1 -2.279 -5.479" />
    <path d="M20 4.727 v3.782 h-3.782" />
  </svg>
);

/* ---- Interface primitives — §04 ---------------------------------------------- */

export const IconClose = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M6.5 6.5l11 11M17.5 6.5l-11 11" />
  </svg>
);

export const IconAdd = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4.5v15M4.5 12h15" />
  </svg>
);

export const IconCheck = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4.5 12.5l4.75 4.75L19.5 7" />
  </svg>
);

/**
 * POINTS RIGHT, and it mirrors under RTL. `IconChevronDown` in the (D) section is
 * this same glyph rotated 90°, and it does not mirror — a vertical axis has
 * nothing for RTL to flip. Two exports because a rotation is a redraw, not a prop.
 */
export const IconChevron = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M8.5 5l7 7-7 7" />
  </svg>
);

/**
 * Three rings, r1.5, not three dots — N-3. The set has never had a filled shape.
 */
export const IconMore = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="6" cy="12" r="1.5" />
    <circle cx="12" cy="12" r="1.5" />
    <circle cx="18" cy="12" r="1.5" />
  </svg>
);

export const IconEdit = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M15.5 5.5l3 3L9 18H6v-3z" />
    <path d="M14 7l3 3" />
  </svg>
);

export const IconCopy = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="8.706" y="8.706" width="11.294" height="11.294" rx="2.118" />
    <path d="M15.294 8.706 V6.353 a2.353 2.353 0 0 0 -2.353 -2.353 H6.353 A2.353 2.353 0 0 0 4 6.353 v6.588 A2.353 2.353 0 0 0 6.353 15.294 h2.353" />
  </svg>
);

export const IconTrash = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4.941 7.294 h14.118" />
    <path d="M9.647 7.294 V5.412 A1.412 1.412 0 0 1 11.059 4 h1.882 A1.412 1.412 0 0 1 14.353 5.412 v1.882" />
    <path d="M6.824 7.294 l0.847 11.388 a1.412 1.412 0 0 0 1.412 1.318 h5.835 a1.412 1.412 0 0 0 1.412 -1.318 L17.176 7.294" />
  </svg>
);

export const IconDownload = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4v11" />
    <path d="M7.5 11l4.5 4.5L16.5 11" />
    <path d="M4.5 20h15" />
  </svg>
);

export const IconUpload = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 15.5V4.5" />
    <path d="M7.5 9L12 4.5 16.5 9" />
    <path d="M4.5 20h15" />
  </svg>
);

export const IconExternal = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M13 4.5h6.5V11" />
    <path d="M19.5 4.5L11 13" />
    <path d="M17 14.5V18a1.5 1.5 0 01-1.5 1.5H6A1.5 1.5 0 014.5 18V8.5A1.5 1.5 0 016 7h3.5" />
  </svg>
);

/**
 * ONE `IconEye`. There were two before `037` — one in each file, r 2.4 and r 2.5 —
 * so `Input.tsx` and `TicketListPage.tsx` rendered different drawings of the same
 * import name. `iconRules.test.ts` fails on a duplicate export now.
 */
export const IconEye = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="2.189" />
    <path d="M4 12 s3.2 -5.053 8 -5.053 8 5.053 8 5.053 -3.2 5.053 -8 5.053 -8 -5.053 -8 -5.053 z" />
  </svg>
);

/**
 * Its dot is the house form, a round-capped zero-length stroke (N-3).
 */
export const IconCircleInfo = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 11.059 v5.176" />
    <path d="M12 7.985v0.5" />
  </svg>
);

export const IconSort = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 5v14M4 16l3 3 3-3" />
    <path d="M17 19V5M14 8l3-3 3 3" />
  </svg>
);

/* ---- Tickets and customers — §05 --------------------------------------------- */

export const IconTicket = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="4" y="6.667" width="16" height="10.667" rx="2" />
    <path d="M8.889 6.667 v1.778 M8.889 11.111 v1.778 M8.889 15.556 v1.778" />
  </svg>
);

export const IconPriority = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 12l5-5 5 5" />
    <path d="M7 17l5-5 5 5" />
  </svg>
);

/**
 * The one filled circle in the document that is NOT a node — a solid centre
 * inside a ring, meaning "this is the current state".
 *
 * N-3 strokes it, so it is two concentric rings. It reads as a target rather than
 * a dot, which is a real change of character and the clearest single illustration
 * of what R-1 costs.
 */
export const IconStatus = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="12" cy="12" r="2.75" />
  </svg>
);

/**
 * THE MOST-SCALED ICON IN THE SET — s = 0.80, because the document draws it from
 * x = 2 to x = 21.7 and the keyline is 4 … 20.
 *
 * Its node is stroked (N-3). The person sits left and the mark right, and the
 * scaling deliberately did not recentre that: the asymmetry is the glyph.
 */
export const IconAssign = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <circle cx="8" cy="8.8" r="2.56" />
    <path d="M4 18 c0 -2.56 1.76 -4.4 4 -4.4 s4 1.84 4 4.4" />
    <path d="M14 12 h2.56" />
    <circle cx="18.4" cy="12" r="1.36" />
  </svg>
);

/**
 * CANONICAL for the clock face. The set used to also export `IconPending` with
 * this same drawing; one glyph under two names is how a screen ends up meaning two
 * things by one mark. It had zero consumers, so removing it cost nothing.
 */
export const IconHistory = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3.5 2.2" />
  </svg>
);

/**
 * Node stroked (N-3).
 */
export const IconMerge = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4.36 6.607 h3.596 c4.494 0 5.843 2.697 8.09 5.393" />
    <path d="M4.36 17.393 h3.596 c4.494 0 5.843 -2.697 8.09 -5.393" />
    <circle cx="18.292" cy="12" r="1.708" />
  </svg>
);

export const IconResolved = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M8 12.3l2.8 2.8 5.4-5.6" />
  </svg>
);

/**
 * Mirrors under RTL. Same override as `IconRetry` above, same reason.
 */
export const IconReopen = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M4.242 12 a7.758 7.758 0 1 0 3.297 -6.303" />
    <path d="M4 5.018 v3.588 h3.588" />
  </svg>
);

export const IconCompany = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5.333 19.556 V7.2 a0.889 0.889 0 0 1 0.622 -0.889 L11.111 4.889 a0.889 0.889 0 0 1 1.156 0.889 v13.778" />
    <path d="M12.267 10.756 l5.778 1.778 a0.889 0.889 0 0 1 0.622 0.889 v6.133" />
    <path d="M4 19.556 h16" />
    <path d="M7.556 9.778 v1.422 M7.556 13.778 v1.422 M15.2 14.844 v1.422" />
    <path d="M9.6 19.556 v-2.844 h2.311 v2.844" />
  </svg>
);

export const IconNote = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M4.941 5.412 A1.412 1.412 0 0 1 6.353 4 h7.529 L19.059 9.176 v9.412 a1.412 1.412 0 0 1 -1.412 1.412 H6.353 A1.412 1.412 0 0 1 4.941 18.588 z" />
    <path d="M13.882 4 V9.176 h5.176" />
    <path d="M8.706 12.941 h6.588 M8.706 16.235 h3.765" />
  </svg>
);

export const IconTag = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <circle cx="8.923" cy="8.923" r="1.231" />
    <path d="M19.472 12.44 l-7.032 7.032 a1.406 1.406 0 0 1 -2.022 0 l-5.889 -5.889 a1.406 1.406 0 0 1 -0.44 -0.967 V5.847 a1.406 1.406 0 0 1 1.406 -1.406 h6.768 c0.352 0 0.703 0.176 0.967 0.44 l6.241 6.241 a1.406 1.406 0 0 1 0 2.198 z" />
  </svg>
);

export const IconCustomers = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="9.474" cy="9.053" r="2.863" />
    <path d="M4 18.737 c0 -3.032 2.442 -5.221 5.474 -5.221 s5.474 2.189 5.474 5.221" />
    <path d="M15.789 7.958 a2.358 2.358 0 0 1 0 4.716" />
    <path d="M16.632 13.853 c1.937 0.421 3.368 2.105 3.368 4.463" />
  </svg>
);

/* ---- Channels — §06 ---------------------------------------------------------- */

export const IconSms = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <rect x="4" y="4.941" width="16" height="10.824" rx="2.353" />
    <path d="M8.706 15.765 v3.765 L12.941 15.765" />
    <path d="M8.235 9.176 h7.529 M8.235 12.471 h4.706" />
  </svg>
);

export const IconWebform = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="4.889" y="4" width="14.222" height="16" rx="2" />
    <path d="M8.444 8.444 h7.111 M8.444 12 h7.111" />
    <path d="M8.444 15.733 l1.6 1.6 L12.889 15.111" />
  </svg>
);

export const IconCall = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M6.5 4.5h3l1.5 4-2 1.5a11 11 0 005 5l1.5-2 4 1.5v3a1.5 1.5 0 01-1.6 1.5C10.5 18.6 5.4 13.5 5 6.1A1.5 1.5 0 016.5 4.5z" />
  </svg>
);

/**
 * Its presence dot is stroked (N-3), so it is a small ring rather than a filled
 * one. The document also colours it `teal-600`; this set is `currentColor` only,
 * so the colour is the consumer's to apply and no icon here carries one.
 */
export const IconLivechat = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <rect x="4.5" y="6.583" width="12.5" height="8.75" rx="2.083" />
    <path d="M8.25 15.333 v3.167 L11.583 15.333" />
    <circle cx="18.25" cy="6.167" r="1.75" />
  </svg>
);

/* ---- The agent desk — §07 ---------------------------------------------------- */

export const IconDashboard = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="4" y="4" width="7.059" height="7.059" rx="1.412" />
    <rect x="12.941" y="4" width="7.059" height="7.059" rx="1.412" />
    <rect x="4" y="12.941" width="7.059" height="7.059" rx="1.412" />
    <rect x="12.941" y="12.941" width="7.059" height="7.059" rx="1.412" />
  </svg>
);

export const IconTasks = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M4 7l2.2 2.2L10 5.5" />
    <path d="M13 7.5h7" />
    <path d="M4 16l2.2 2.2L10 14.5" />
    <path d="M13 16.5h7" />
  </svg>
);

export const IconBell = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M17.683 16.262 H6.317 l1.326 -2.178 V10.106 a4.357 4.357 0 0 1 8.714 0 v3.978 z" />
    <path d="M10.39 19.104 a1.894 1.894 0 0 0 3.22 0" />
  </svg>
);

export const IconQuickReply = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M13.412 4 L6.353 13.412 h4.235 L10.588 20 17.647 10.588 h-4.235 z" />
  </svg>
);

export const IconMention = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3.4" />
    <path d="M15.4 8.6v5.1a2.1 2.1 0 004.2 0V12a7.6 7.6 0 10-3 6" />
  </svg>
);

export const IconHandoff = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M4 9h13l-3-3" />
    <path d="M20 15H7l3 3" />
  </svg>
);

/* ---- Knowledge base and customer portal — §08 -------------------------------- */

export const IconArticle = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5.679 v13.728" />
    <path d="M12 5.679 C10.025 4.198 7.654 3.802 5.284 4.395 a0.988 0.988 0 0 0 -0.691 0.988 v12.247 a0.988 0.988 0 0 0 1.185 0.988 c1.975 -0.395 4.444 0 6.222 1.383" />
    <path d="M12 5.679 c1.975 -1.481 4.346 -1.877 6.716 -1.284 a0.988 0.988 0 0 1 0.691 0.988 v12.247 a0.988 0.988 0 0 1 -1.185 0.988 c-1.975 -0.395 -4.444 0 -6.222 1.383" />
  </svg>
);

/**
 * Its dot is the house round-capped stroke (N-3).
 */
export const IconFaq = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9.741 9.553 A2.353 2.353 0 0 1 14.259 10.118 c0 1.6 -2.259 1.882 -2.259 3.388" />
    <path d="M12 16.079v0.5" />
  </svg>
);

export const IconSolution = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M9.741 15.388 a5.176 5.176 0 1 1 4.518 0" />
    <path d="M9.647 15.388 h4.706 v1.788 a2.353 2.353 0 0 1 -4.706 0 z" />
    <path d="M10.588 20 h2.824" />
  </svg>
);

export const IconGuide = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="5.182" cy="7" r="1.182" />
    <circle cx="5.182" cy="12" r="1.182" />
    <circle cx="5.182" cy="17" r="1.182" />
    <path d="M8.818 7 h10 M8.818 12 h10 M8.818 17 h10" />
  </svg>
);

export const IconPortal = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 11.059 L12 4.471 l8 6.588" />
    <path d="M6.353 10.118 v8.941 h11.294 V10.118" />
    <path d="M10.588 19.059 v-4.706 h2.824 v4.706" />
  </svg>
);

export const IconSubmit = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M20 4 L4 10.588 l6.118 2.353 2.353 6.118 z" />
    <path d="M20 4 L10.118 12.941" />
  </svg>
);

/**
 * Two marks, and only one of them was filled: the circle at the tail is stroked
 * in the document already, the one at the head is a node. After N-3 they are both
 * rings, so the glyph is now symmetrical in a way the document's is not.
 *
 * Noted because it is the one place N-3 changes what an icon SAYS rather than how
 * it looks — the head no longer reads as the destination.
 */
export const IconTrack = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <circle cx="5.263" cy="16.211" r="1.263" />
    <path d="M5.263 16.211 h2.947 c4.632 0 4.211 -7.579 8.084 -7.579" />
    <circle cx="18.316" cy="8.632" r="1.6" />
  </svg>
);

export const IconRating = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4.282 l2.447 4.988 5.553 0.847 -3.953 3.859 0.941 5.459 L12 16.894 l-4.988 2.541 0.941 -5.459 -3.953 -3.859 5.553 -0.847 z" />
  </svg>
);

/* ---- Security and platform — §09 --------------------------------------------- */

export const IconShield = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4.444 l6.667 2.489 v4.8 c0 3.911 -2.667 7.111 -6.667 8.267 -4 -1.156 -6.667 -4.356 -6.667 -8.267 V6.933 z" />
  </svg>
);

export const IconKey = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <circle cx="14.667" cy="9.333" r="3.111" />
    <path d="M12.444 11.556 L5.333 18.667 V20 H7.556 v-1.778 h1.778 v-1.778 h1.333 z" />
  </svg>
);

export const IconAudit = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <circle cx="15.294" cy="15.294" r="4.706" />
    <path d="M4.941 6.824 h11.294 M4.941 11.059 h6.588" />
    <path d="M15.294 12.941 v2.353 l1.694 1.129" />
  </svg>
);

export const IconRole = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="11.059" cy="8.235" r="3.2" />
    <path d="M4 19.529 c0 -3.388 2.918 -5.835 6.588 -5.835 0.565 0 1.129 0.094 1.6 0.188" />
    <path d="M13.882 17.176 l1.882 1.882 3.765 -3.765" />
  </svg>
);

export const IconGlobe = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M4 12 h16" />
    <path d="M12 4 c2.635 2.824 2.635 13.176 0 16" />
    <path d="M12 4 c-2.635 2.824 -2.635 13.176 0 16" />
  </svg>
);

export const IconDepartment = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="9.333" y="4" width="5.333" height="4.444" rx="1.111" />
    <rect x="4" y="13.333" width="5.333" height="4.444" rx="1.111" />
    <rect x="14.667" y="13.333" width="5.333" height="4.444" rx="1.111" />
    <path d="M12 8.444 v3.111" />
    <path d="M6.667 11.556 h10.667" />
    <path d="M6.667 11.556 v1.778 M17.333 11.556 v1.778" />
  </svg>
);

export const IconBranding = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <circle cx="9.176" cy="9.647" r="1.412" />
    <circle cx="14.824" cy="9.647" r="1.412" />
    <circle cx="12" cy="14.824" r="1.412" />
  </svg>
);

/* ============================================================================
 * (D) — OURS. Fifteen glyphs the document does not contain.
 * ============================================================================
 *
 * Each is kept for a stated reason, not because it was already here. They are
 * drawn to the same rules as everything above, and four of them were scaled by
 * N-1 to get inside the keyline they had been outside of for several features:
 * `IconAlert` (0.889), `IconClosed` and `IconTriangleAlert` (0.941), and
 * `IconWhatsapp` (0.990).
 * ========================================================================= */

/**
 * (D) A padlock — `Closed` as a terminal ticket STATE (BR-1). The document has
 * `resolve` and `status` and no lock.
 *
 * NO CONSUMER TODAY, and an earlier draft of this note said "the ticket list shows
 * both this and `IconCircleX` in one row". It does not: the status column renders
 * a text pill, and nothing imports this. The distinction it draws — this is the
 * STATE, `IconCircleX` is the destructive ACTION — is still the reason to keep the
 * two apart, but it is an argument about a future row, not a description of one
 * that exists. `iconCoverage.test.ts` lists it.
 *
 * Scaled 0.941 by N-1 — it had been 0.5 units outside the keyline.
 */
export const IconClosed = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="4.941" y="10.588" width="14.118" height="8.941" rx="1.882" />
    <path d="M8.235 10.588 V7.765 a3.765 3.765 0 0 1 7.529 0 v2.824" />
  </svg>
);

/**
 * (D) AN EXPLICIT EXCEPTION TO THE DOCUMENT'S OWN RULE, ruled 2026-09-05.
 *
 * The document forbids vendor logos in the set — «شعارات المزوّدين داخل السِت …
 * واتساب وتيليجرام وغيرها علامات مسجّلة، استخدم «محادثة» المحايدة، والشعار
 * الحقيقي في صفحة الربط فقط» — and directs channels to the neutral `chat`.
 *
 * The product owner kept it: the channel column's only job is telling channels
 * apart, and collapsing WhatsApp into `chat` defeats that. The rule is quoted here
 * so the exception is visible rather than silent.
 *
 * THE TRADEMARK QUESTION THE DOCUMENT RAISES IS FLAGGED AND NOT RESOLVED. It is
 * not a design call and `037` does not make it.
 *
 * Scaled 0.990 by N-1 — its arc's true centre is (12.081, 11.919), not (12, 12),
 * so it reached x = 20.081 and failed AC-1 by eight hundredths of a unit.
 */
export const IconWhatsapp = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4.08 19.92 l1.188 -3.96 A7.92 7.92 0 1 1 8.04 18.732 L4.08 19.92 Z" />
    <path d="M9.525 9.822 c0 2.871 2.178 5.049 4.95 5.247" />
  </svg>
);

/**
 * (D) The frame stays, the arrow leaves it. The document has no exit glyph.
 *
 * THE ONLY RETAINED ICON THAT MIRRORS. Before `037` this was done by
 * `.signOut .rowIcon` in `Sidebar.module.css`; that rule is gone and the flip is
 * the icon's own, like every other directional glyph in the set.
 */
export const IconSignOut = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M14.4 7.6V6a2 2 0 0 0-2-2H6.6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h5.8a2 2 0 0 0 2-2v-1.6" />
    <path d="M19.4 12h-8.8m0 0 2.6-2.6M10.6 12l2.6 2.6" />
  </svg>
);

/**
 * (D) The eye with a slash. The document has `eye` and no struck-through form,
 * and `025`'s password toggle needs both states.
 *
 * DOES NOT MIRROR. The slash is physical, not directional: a struck-through eye is
 * struck the same way in Arabic, and flipping it would make the two states differ
 * by direction rather than by meaning (ADR-007 §6).
 */
export const IconEyeOff = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12s3.2-5 8-5c1.2 0 2.3.3 3.2.8M20 12s-3.2 5-8 5c-1.2 0-2.3-.3-3.2-.8" />
    <path d="M9.9 9.9a2.5 2.5 0 003.5 3.5" />
    <path d="M4.5 19.5l15-15" />
  </svg>
);

/**
 * (D) A circle, a stem, and a DETACHED dot — the gap is the glyph, not an accident
 * of drawing. `030` gives each of four toast tones its own shape so they are not
 * distinguishable by colour alone, and the document supplies only one of the four
 * (`info`).
 *
 * Scaled 0.889 by N-1 — it had been a full unit outside the keyline.
 */
export const IconAlert = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 8 v4.444" />
    <path d="M12 15.556 v0.444" />
  </svg>
);

/**
 * (D) The WARNING tone. `feedback-layer.md` §2 gives warning a triangle, and the
 * document has no triangle at all. Shape carries the tone, so this cannot be
 * `IconAlert` in another colour.
 *
 * Scaled 0.941 by N-1.
 */
export const IconTriangleAlert = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4.471 L4 18.588 h16 L12 4.471 z" />
    <path d="M12 9.647 v3.953" />
    <path d="M12 15.953 v0.376" />
  </svg>
);

/**
 * (D) The destructive ACTION. `IconClosed` is the state. See its note.
 */
export const IconCircleX = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </svg>
);

/**
 * (D) A bare vertical arrow. The document's `escalate` is the branded swoosh; this
 * is the primitive, and `027`'s menu wants the bare direction.
 *
 * Does not mirror — the axis is vertical, so RTL has nothing to flip.
 */
export const IconArrowUp = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 19.6V4.4" />
    <path d="M6.6 9.8 12 4.4l5.4 5.4" />
  </svg>
);

/**
 * (D) A bare horizontal arrow — the "from → to" on `027`'s status-change rows.
 *
 * DOES NOT MIRROR, and it is the deliberate exception to the shape of the rule. A
 * reading-direction glyph must flip; this is a diagram of a transition, and the v3
 * canvas draws it pointing right on an Arabic screen. Flipped, an Arabic reader
 * sees «من جديدة ← إلى مفتوحة» pointing back at the value it came from.
 */
export const IconArrowRight = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 12h16M14 6l6 6-6 6" />
  </svg>
);

/**
 * (D) One line, two heads, on the diagonal — a ticket changing owner.
 *
 * Kept alongside the document's `handoff`, which sits under «لوحة الموظف» beside
 * `tasks` and `bell` and means a shift change. Different acts (`037` Q-2).
 *
 * Does not mirror: both ends carry a head, so there is no direction to reverse.
 */
export const IconReassign = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M17.6 6.4 6.4 17.6" />
    <path d="M17.6 10.8V6.4h-4.4" />
    <path d="M6.4 13.2v4.4h4.4" />
  </svg>
);

/**
 * (D) The document's `chevron` rotated 90° clockwise about (12,12) —
 * `(x, y) → (24 − y, x)`. Thirty-three consumers expect a downward chevron and the
 * document draws only the rightward one.
 *
 * Does not mirror; `IconChevron` does.
 */
export const IconChevronDown = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 8.5 12 15.5 19 8.5" />
  </svg>
);

/**
 * (D) Sort ascending — supplied by the product owner 2026-09-06, with
 * `IconSortDesc`, to finish the table header the document's neutral `sort` only
 * half covers.
 *
 * THE BARS CARRY THE MEANING, NOT THE ARROW. Three of them at 4 · 6.5 · 9 on
 * the house 7 / 12 / 17 grid, growing downward for ascending and shrinking for
 * descending. The arrow alone would leave the two states differing by a
 * five-unit stroke at the far left of a 16px glyph — the bars are what a reader
 * resolves first. **Do not drop them and keep the arrow.**
 *
 * ---------------------------------------------------------------------------
 * TWO COORDINATES MOVED BY 0.5 FROM THE SUPPLIED PATHS, AND HERE IS WHY
 * ---------------------------------------------------------------------------
 *
 * As supplied, the arrow ran to x = 3.5 and the longest bar to x = 20.5 — a
 * 17-unit span, half a unit outside the house keyline on each side, which fails
 * AC-1. It was measured, not assumed.
 *
 * `N-1` would have scaled the whole glyph by 8/8.5 = 0.941, and that is what
 * every icon taken from the document got. It is the wrong tool HERE: it would
 * put the three bars at y 7.29 / 12 / 16.71 and take them off the 7 / 12 / 17
 * grid that the same instruction specified — one house rule broken to keep
 * another.
 *
 * So the arrow moved +0.5 and the bars −0.5 instead. **Nothing was resized:**
 * the arrowhead is the same size, the stem is the same length, and the bars are
 * still exactly 4 · 6.5 · 9 on exactly y 7 / 12 / 17. The glyph now spans
 * x 4 … 20, y 5.5 … 18.5. Only the gap between arrow and bars changed, from 3
 * units to 2.
 *
 * STROKE IS 1.5, NOT THE 1.75 THE INSTRUCTION ASKED FOR AT 16px. That is `N-2`
 * and it is `R-1`'s ruling applied consistently — three icons at 1.75 beside
 * seventy at 1.5 is the inconsistency `icons.md` names. If 1.75-at-16 is wanted,
 * it is a change to `R-1` for the whole set, not an exception for these.
 *
 * MIRRORS UNDER RTL, unlike the neutral `IconSort` and `IconClose`, which are
 * symmetric. The bars sit to the reading side of the arrow, and that side is
 * what flips.
 */
export const IconSortAsc = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M6.5 18.5V5.5" />
    <path d="M4 8L6.5 5.5 9 8" />
    <path d="M11 7h4" />
    <path d="M11 12h6.5" />
    <path d="M11 17h9" />
  </svg>
);

/**
 * (D) Add customer — supplied by the product owner 2026-09-06 for the side
 * panel's header, replacing a bare `+`.
 *
 * A PERSON WITH A SMALL PLUS, and both halves of that are the instruction:
 *
 *   - The shoulder arc **stops at x ≈ 12.4 and does not close.** The gap is
 *     deliberate — it is what makes room for the plus. Do not complete it.
 *   - The plus is **≈5.8 units, not 15.** A large plus alone means "add
 *     anything"; small, beside a person, it means "add a customer".
 *   - **No node.** Nothing on this glyph ends in a filled circle.
 *
 * SCALED BY N-1 (0.889), AND THERE WAS NO ALTERNATIVE. As supplied it ran
 * x 3 … 20.75 — 17.75 units wide against a 16-unit keyline, so unlike
 * `IconSortAsc` it could not be shifted into place, only shrunk. The three
 * constraints above are ratios and a gap, all of which a uniform scale
 * preserves: the arc still breaks at the same point (12.5 → 12.44), the plus is
 * still small, and nothing gained a fill. The supplied numbers 3.6 and 6.5 are
 * therefore 3.2 and 5.778 here.
 *
 * MIRRORS UNDER RTL.
 */
export const IconAddCustomer = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <circle cx="9.778" cy="8.444" r="3.2" />
    <path d="M4 18.667 c0 -3.289 2.578 -5.689 5.778 -5.689 0.978 0 1.867 0.178 2.667 0.533" />
    <path d="M16.889 13.778 v5.778" />
    <path d="M14 16.667 h5.778" />
  </svg>
);

/**
 * (D) Customer profile — supplied with `IconAddCustomer`, replacing a lone
 * Arabic initial in the panel header.
 *
 * A CARD, NOT A PERSON: the frame is the record the person is held in, which is
 * what separates it from `IconCustomer`.
 *
 * THE TWO LINES ARE UNEQUAL ON PURPOSE — ≈3.0 and ≈2.2 units. Equal lines read
 * as a table rather than as a name over a detail, and that was stated as a
 * constraint rather than left to taste. The ratio is 1.4 before and after
 * scaling.
 *
 * SCALED BY N-1 (0.865) for the same forced reason as the icon above: the card
 * alone was 18.5 units wide. **No node.**
 *
 * ---------------------------------------------------------------------------
 * IT IS NOT A DEFAULT AVATAR. Read this before using it.
 * ---------------------------------------------------------------------------
 *
 * The header of an EXISTING customer shows their photo, or their initial. This
 * glyph stands in for that **only while loading and in the empty state** — when
 * there is no photo and no name yet. It must never replace a real customer's
 * initial, because a letter that is present says who this is and a generic card
 * says nothing.
 */
export const IconCustomerProfile = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <rect x="4" y="5.514" width="16" height="12.973" rx="1.946" />
    <circle cx="9.189" cy="10.486" r="2.032" />
    <path d="M6.378 15.676 c0 -1.643 1.254 -2.854 2.811 -2.854 s2.811 1.211 2.811 2.854" />
    <path d="M14.595 9.838 h3.027" />
    <path d="M14.595 12.865 h2.162" />
  </svg>
);

/** (D) Sort descending — `IconSortAsc` with the arrow reversed and the bars
 *  ordered 9 · 6.5 · 4. Same grid, same keyline fit, same reasons; see the note
 *  above, which covers both. */
export const IconSortDesc = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} data-flip="" {...p}>
    <path d="M6.5 5.5v13" />
    <path d="M4 16L6.5 18.5 9 16" />
    <path d="M11 7h9" />
    <path d="M11 12h6.5" />
    <path d="M11 17h4" />
  </svg>
);
