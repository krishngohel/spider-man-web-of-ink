# Credits

Spider-Man: Web of Ink is an unofficial fan game, made for fun and never sold. Spider-Man and
related characters are trademarks of Marvel. This game is not affiliated with or endorsed by Marvel
or Sony.

## Bodies and animation

- Universal Base Characters, Universal Animation Library and Universal Animation Library 2 by
  Quaternius. CC0 1.0. https://quaternius.com (the hero body, the female body, long hair, and the
  clips in `anims1.glb` and `anims2.glb`)
- Motion capture from Mixamo (Adobe), free to use in games. Retargeted onto the Quaternius skeleton
  by `scripts/retarget-mocap.mjs` (`anims_combat.glb`, `anims_social.glb`). The raw Mixamo files are
  not in this repository: Mixamo's terms allow their use in games, not passing the files on.
- Five kick clips (round, front, spin, flying kick and a knee strike) carried over from the owner's
  earlier game, Gotham Needs You: motion capture applied to that game's own body with Meshy's
  auto-rigger, then retargeted the same way.

## Suit models

- "The Amazing Spider-Man 2 Spider-Man" by fredbear1211 on Sketchfab
  (https://sketchfab.com/fredbear1211). CC BY 4.0
  (https://creativecommons.org/licenses/by/4.0/). Modified: fitted and skinned to the game skeleton
  by `scripts/fit-suit.mjs`, shaded in the game's comic style. This is the classic suit, inside
  `hero_m.glb`.

<!-- SUIT MODELS START: one entry per downloaded Sketchfab suit, in this form:
     - "Title" by author on Sketchfab (link). CC BY 4.0 (licence link). Modified: how. -->

- TO FILL IN: the 13 Sketchfab suits and Miles (`assets-src/suits/suits.json`).

<!-- SUIT MODELS END -->

## Music

All six tracks are CC0 and were found on OpenGameArt.org. Re-encoded to 96 kbps MP3 by
`scripts/encode-music.mjs`.

| In the game | Track | Author |
|---|---|---|
| Title and missions | Battle Theme A | cynicmusic |
| The city by day | Urban Theme | MintoDog |
| The city by night | Night Escape | Agecaf |
| Peter's scenes | Chill lofi inspired | omfgdude |
| Street fights | Fight in the City | Umplix |
| Bosses | Epic Boss Battle | Juhani Junkala |

## Fonts

Via Google Fonts, under the SIL Open Font License: Bangers (Vernon Adams) and Barlow Condensed
(Jeremy Tribby).

## Made in code

The city, the comic ink look, the painted suits, comic pages, portraits, sound effects, the story
and the favicon are made in code for this game.

## Code

Built with Three.js (MIT), glTF Transform (MIT), meshoptimizer (MIT) and Vite (MIT).
