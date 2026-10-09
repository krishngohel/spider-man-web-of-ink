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

- **Amazing suit**: "Spiderman TASM 1 - Andrew Garfield" by Virtual Void Studio on Sketchfab (https://sketchfab.com/3d-models/d8458b230dab4a28b276e8f801cbf2a0). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Scarlet Hoodie**: "Spiderman Scarlet" by AsterOmice on Sketchfab (https://sketchfab.com/3d-models/57944a3376dc4a71807d54dac3581e7e). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Black Suit**: "Spider-Man 2 Symbiote Suit (PS5)" by jerrylxia on Sketchfab (https://sketchfab.com/3d-models/0845c06a538746c8a8111b241575bd9d). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Noir (suit and roster)**: "Spider- Man Noir Ver. 2" by sentientshoebox on Sketchfab (https://sketchfab.com/3d-models/d9cd5843507547d6ab3be9f63b4723c1). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **2099 (suit and roster)**: "Miguel O'hara Spiderman 2099 Rigged Textured" by dwij8405 on Sketchfab (https://sketchfab.com/3d-models/69f61cec7d60453e95ad2e54c5e08919). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Stealth Big Time**: "Spider-Man Big Time" by Robduc on Sketchfab (https://sketchfab.com/3d-models/169b9d4d764445008a94c0259e2c1996). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Volt**: "spider man" by k13473117 on Sketchfab (https://sketchfab.com/3d-models/d04aa2ef76334e77a2a864eb9b6f1429). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Punk**: "Spiderpunk" by FaLiCreative on Sketchfab (https://sketchfab.com/3d-models/56efb423a72b463c9d648614f63a0d68). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Homemade**: "spider-man home made suit free rigged" by tuki master on Sketchfab (https://sketchfab.com/3d-models/3c51260ca14849948c3a5331a0b3119f). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Armour Mk II**: "Spiderman Concept Suit #1" by Spoderick on Sketchfab (https://sketchfab.com/3d-models/7b38292d2628432782e789ef47e51d4c). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Ghost Spider suit and Spider-Gwen (roster)**: "Gwen Stacy (downloadable)" by Diox..Andrey on Sketchfab (https://sketchfab.com/3d-models/83c543eb10804a8b82827401012d61ba). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Shadow**: "Shadow Web - Stylized Superhero 3D Character" by Holy419 on Sketchfab (https://sketchfab.com/3d-models/1959396dfa0b4f6a9150e568123bc780). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).
- **Miles Morales (roster)**: "Miles Morales - Blender Cycles with Rig" by Darth Iron on Sketchfab (https://sketchfab.com/3d-models/5d812244f02c402ba7d0747338d2183e). [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). Modified: re-posed and fitted to the game skeleton, re-skinned, simplified, textures resized (`scripts/fit-any-suit.mjs`).

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
