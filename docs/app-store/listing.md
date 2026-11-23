# App Store listing (v1.1)

Paste into App Store Connect > your app > App Store tab (iOS App 1.1.0 and App Information).
v1.0 went live on 20 Nov 2026; v1.1.0 is the next store version (Mini Pool, Tug of War, picture buttons).
Character limits are Apple's; counts are checked by `tests/store-listing.test.ts`.

Audience (Chris, 19 Nov 2026): friends and couples first, families still welcome. Top apps in this
category pitch "two players, one phone" to anyone and still chart in Family, so one broad listing
serves both. Ads stay child-directed for v1 (docs/ads.md).

## App Information

| Field | Value | Limit |
|---|---|---|
| Name | FamiDuel: 2 Player Games | 30 |
| Subtitle | Offline 1v1 duels & powers | 30 |
| Primary category | Games, subcategories Family and Casual | |
| Secondary category | Entertainment | |
| Content rights | Does not contain, show or access third-party content | |
| Age rating | 9+ (see app-review-answers.md) | |

The name is your call (a rename is still open, Nov 2026). Keep "2 Player Games" in it: it is the phrase people search.
Every word in the name and subtitle already counts for search, so the keywords below
don't repeat them.

## Pricing and availability

Free, with one in-app purchase: **Remove Ads** (non-consumable, product ID `famiduel.removeads`, $4.99 tier). All countries except the 27 EU ones at launch; the EU comes later (docs/release-checklist.md, "Later: add the EU").

## Version 1.1.0

### What's New in This Version (4000)

Two new games and a fresh home screen.

• Mini Pool: sink your 3 balls, then the 8. Sink it too soon and you lose.
• Tug of War: tap fast on your side to pull the ribbon past your line.
• Every game now has its own picture on the home screen, so it's easy to find.
• Super powers rotate: each game offers a fresh three every week.
• Largest text: menus can now go up to twice the size.
• Simpler Settings, with Remove Ads and Lock to FamiDuel under More.
• Fairer bots: they react no faster than a person would.
• Mini Pool and Penalty results say how the match ended, like who sank the 8.
• Fairer head starts in Snack Snatch, Tug of War and Mini Pool, so a younger player can really win, plus lots of small fixes.

Still free, still offline. No Wi-Fi needed.


### Promotional text (170, can change any time without a review)

New: Mini Pool and Tug of War! Two players, one phone: play Ping Pong, Snake Duel, Minigolf and 11 more, with fresh super powers every week. Free, and no Wi-Fi needed.

### Description (4000)

Two players. One phone. Super powers.

Settle it right now, across the table. Lay your phone flat between you and your friend, your partner, your roommate or your kid. Each player owns the half nearest them, and every game is played with one finger: tap, drag or flick. No accounts, no second phone, no waiting for anyone online. It all works offline too, so no Wi-Fi or data is needed: on a plane, on a road trip or anywhere the signal drops. Pick a game and play.

14 GAMES
Minigolf, Air Hockey, Sumo, Ping Pong, Penalty Shootout, Mini Pool, Snack Snatch, Snake Duel, Quick Draw, Tank Duel, Chop Chop, Tug of War, Sea Battle and Rock Paper Scissors.

SUPER POWERS
Before each match, both players pick one of three powers for that game, and every game brings a fresh three each week. Energy fills as you play, and the player who's behind charges faster, so a match is never over early. Powers are shown before they land, so you can see them coming and fight back. New players start on the classic rules; switch super powers on in Settings when you're ready.

CLOSE MATCHES, WHOEVER YOU PLAY
The handicap gives the newer player a quiet head start, so a first-timer can beat the friend who always wins, and a parent and a small kid can have a real game. Turn on auto handicap and it helps whoever keeps losing.

PLAY ALONE TOO
Every game has an honest bot that plays by the same rules you do, from easy to hard.

MATCH NIGHTS AND TOURNAMENTS
Keep a running scoreboard for date night, game night or the whole family, or play a best-of-7 tournament across different games. First to four wins.

EASY TO PICK UP
Big buttons, text up to twice the size, light and dark menus, and a pause button that needs a press and hold, so a stray tap never stops the game. Anyone can play in seconds, from little kids to grandparents.

FREE, AND FAIR ABOUT IT
Every game is free. A short ad can show between matches now and then, never during a game and never in your first session. Ads are family-safe and never personalized, and the app never tracks you. One purchase removes them for good. No accounts and no chat; names and scores stay on your phone.

### Keywords (100, comma separated, no spaces after commas)

two,versus,friends,couple,family,kids,party,air hockey,minigolf,sumo,ping pong,penalty,duo,minigames

### Support URL

https://cvgardner.github.io/famiduel/support.html (see "Host the support and privacy pages" in docs/release-checklist.md)

### Marketing URL (optional)

Leave blank, or the same site's index page.

### Privacy Policy URL (App Information)

https://cvgardner.github.io/famiduel/privacy.html

### Copyright

2026 Gardeno Games

### Screenshots

`npm run store:shots` (on the Mac) writes them to `docs/app-store/screenshots/`, each real app
screen with a caption above it:
- `iphone-6.9/` (1320 x 2868) goes in the 6.9" slot,
- `iphone-6.3/` (1206 x 2622) goes in the 6.3" slot (required).

Order and captions are in `docs/app-store/screenshots.json`. v1.1 has eight, in this order
(the first three show in search results):

1. Ping Pong match: "Two players. One phone." / Lay it flat and duel
2. Air Hockey power pick: "Pick a super power" / A fresh three every week
3. Home with the picture buttons: "14 free games" / No Wi-Fi needed
4. Snake Duel match: "Make them crash first" / Snake Duel
5. Mini Pool match: "New: Mini Pool" / Sink your 3, then the 8
6. Tug of War match: "New: Tug of War" / Tap faster than your friend
7. Minigolf match: "Fewest strokes wins" / Minigolf, 3 holes
8. Tournament: "Best of 7, across games" / First to four wins

In App Store Connect, delete the six v1.0 shots in each slot and upload the folder's files
in name order. `npm run store:shots -- --plain` makes bare screens with no captions instead.
