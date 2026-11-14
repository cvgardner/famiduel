# App Store Accessibility Nutrition Labels

The App Store product page lists which accessibility features an app supports, per device
(Apple's "Accessibility Nutrition Labels", 2025). A label must hold for the app's **common
tasks** (for us: pick a game, set up players, play a match, read the result). A wrong claim
hurts trust more than a missing one, so we claim only what a test backs. Play Store has no
such labels yet; the same list feeds its listing text.

Written 2026-11-14 (F244). Re-check before the first store submission.

| Label | Claim? | Why / what backs it |
| --- | --- | --- |
| Dark Interface | **Yes** | Menus follow the phone's light/dark setting or a Settings pick (`src/app/theme.ts`, #79); match screens are always dark (`.arena`). Contrast is tested in both themes (`tests/contrast.test.ts`, `domcontrast.ts`). |
| Sufficient Contrast | **Yes** | Every drawn word is checked at 4.5:1 (3:1 for large bold) on every game surface (`tests/contrast.test.ts`, `__contrast` probe in the playtest); DOM menus by `domcontrast.ts`; the pause dot is measured at 3:1 (#267). |
| Differentiate Without Color Alone | **Yes** | Whose piece is whose comes from position first (each player owns the half nearest them) and player colours are kept apart for protan / deutan / tritan vision (`src/core/colors.ts` `safePair`, `tests/colors.test.ts`). Good/bad marks use a colour-blind safe pair (F5, #68) plus words or icons; middle buttons carry icons (#268, #270). |
| Reduced Motion | **Yes** | With the phone's Reduce Motion on, screen shake is off and full-screen flashes are calmed (`src/engine/fx.ts`), power pictures hold still (`powerpic.ts`), the logo stops; with it off, nothing blinks faster than 2 a second (`calm.ts`, `tests/flicker.test.ts`) and flashes merge (#265). |
| Larger Text | **Not yet** | Apple asks for text that grows to at least 200% for common tasks. In-game words are canvas text with an in-app "Bigger text" switch (about 1.2x, `settings.bigText`); menus are DOM text but have not been checked at 200%. See gap 1. |
| VoiceOver | **No** | Menus have labels (buttons carry aria-labels), but matches are canvas games with no spoken state. A real-time two-player game played by touch is hard to make screen-reader playable; don't claim. Gap 2 covers the menus. |
| Voice Control | **No** | Matches need live touch (swipes, holds). Menus are plain buttons, but common tasks include playing. |
| Captions | **n/a** | No speech or video in the app; sounds are short effects. |
| Audio Descriptions | **n/a** | No video content. |

## Gaps (each a todo line)

1. **Menus at 200% text.** Set the root font size to 2x and open home, intro, settings,
   result and pause at 390x844: no clipped or overlapping words, buttons still tappable.
   Then decide whether "Bigger text" in matches can reach 2x for headline words (scores,
   banners) without covering play.
2. **VoiceOver on menus.** Walk home -> intro -> Ready -> result with VoiceOver on a real
   phone (store wrapper): every control named, the pause button activates on a double tap
   (backlog: "press and hold" vs detail 0). Menus only; matches stay unclaimed.
