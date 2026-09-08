import {
  IconEmail,
  IconLivechat,
  IconSms,
  IconWebform,
  IconWhatsapp,
} from '../../icons/icons';

/**
 * Channel → glyph, in one place. `021`.
 *
 * **Extracted from `TicketDetailPage.tsx` because `021` became its second
 * consumer.** The map lived as a local const there and the Messages panel needed
 * the same three of its five entries — so the choice was to duplicate it or to
 * move it, and `016` had just finished paying for a duplicated fact: five call
 * sites of one mapper that disagreed about eleven fields.
 *
 * `037` makes the case sharper still. It found `IconEye` declared in **two** icon
 * files with different geometry — `r 2.4` and `r 2.5` — so two screens rendered
 * different drawings under one import name, with a green build. A channel glyph
 * appearing in a list and again in a rail must be the same glyph.
 *
 * **Keyed on the wire value, never on a translated label.** Keying on displayed
 * text renders every glyph missing for an Arabic user and nothing fails: no
 * exception, no failing test, nothing visibly wrong in English. `TicketBadges`
 * carries the same warning for the same reason.
 *
 * **All five channels, not the three that are sendable.** A ticket that *arrived*
 * through a web form is normal and its channel needs a glyph — only *outbound*
 * sending is limited to three (spec A-3). Mapping the sendable set here would
 * make the rail lose an icon.
 */
export const CHANNEL_ICON = {
  Email: IconEmail,
  WhatsApp: IconWhatsapp,
  LiveChat: IconLivechat,
  Sms: IconSms,
  WebForm: IconWebform,
} as const;
