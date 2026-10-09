# Real suits and Gotham-level polish

Owner, 2026-10-08: "use the real models and make sure its as good as the gotham for mansi game we
made before letting me look at it, should have the same amount of polish."

Two parts: the 13 downloaded Sketchfab suits (plus Miles) worn in game, and a polish pass driven by
two read-only audits of Gotham against Web of Ink. The owner sees it only when both are done.

## Part S: real suit models

Downloads (Sketchfab, CC BY, signed-in API) live in `assets-src/suits/sketchfab/<key>.glb`
(gitignored). They differ: four Mixamo rigs (ghost, homemade, shadow, symbiote), three other rigs
(iron, miles, s2099), seven with no usable rig (amazing, armour, bigtime, noir, punk, scarlet, volt);
some lie flat or face +X, scales run from 0.01 m to 10 m, Miles stands on a ground plane, Iron
Spider carries separate spider arms, the PS5 symbiote is 661k triangles.

S1. `scripts/fit-any-suit.mjs`: one fitter for every model, rig or not.
  - Per suit config `assets-src/suits/suits.json`: source file, rotation fix, height override,
    parts to drop (by mesh or material name), triangle budget, texture size.
  - Normalise: rotate, scale to the hero's height, feet on y = 0, facing +Z.
  - Find the source's joints: from its rig when the names map (Mixamo, Rigify), otherwise from the
    shape (hand and foot extremes, chest width) by bending and stretching the hero's chains onto it.
  - Skin by transfer: the hero body deformed into the source's pose and proportions, each source
    vertex takes the weights of the nearest hero surface points. The suit's bind skeleton is the
    hero skeleton placed on the source joints, so at run time the hero's bones pull the suit to the
    hero's proportions (as the film suit does now).
  - Simplify to the budget (meshoptimizer), base colour textures to JPEG at game size, write
    `public/assets/suits/<id>.glb` (mesh + skin over the hero's joint names, no animations).
S2. Run time: `suit.model` names a file; it loads on first wear (and for the suit menu preview),
    binds to the hero's skeleton by bone name, gets the comic toon material, the hull outline and the
    lens rule. The painted body stays as the fallback until it arrives. The classic film suit keeps
    living in hero_m.glb. Recolour suits stay recolours of the film suit.
S3. Miles: the roster's Miles wears his model the same way (roster bodies are hero_m clones).
S4. Gates: a suit sheet (every suit, idle, mid swing, punch, crouch: front and back) checked by eye
    for tears, floating parts and inside-out faces; a unit test that every SUITS model file exists and
    its joints are a subset of the hero's; load time and GPU p95 with the heaviest suit worn.
S5. Credits: every model's title, author, link, licence (CC BY 4.0) and "modified" in the end credits,
    on a title-screen Credits page and in CREDITS.md.

## Part P: polish to the Gotham bar

From the audits (player-facing and engineering). Ordered by player impact.

P1. Menus and flow: one-click Continue on the title (last slot, act); Credits on the title; gamepad
    and Esc/B work on every page (slots, skills and suits, characters, city progress, tracker);
    Resume re-locks the mouse; menu move/select/back sounds; Settings split into tabs with value
    readouts; missing rows: camera shake, impact frames (Full/Soft/Off), tutorial tips on/off and
    reset; suit cards show a rendered thumbnail of each suit; challenge Retry and Quit; "What's new".
P2. HUD: sound words placed off HUD boxes and off each other (Gotham placeWord); the low-power notice
    goes through a timed queue below the boss bar and only in play; HUD fades while the letterbox is
    up; the FPS counter and district caption no longer overlap; save on tab hide.
P3. Impact: tiered impact frames (flash, then a comic-panel freeze on finishers and criticals) with
    Full/Soft/Off; a critical action-camera shot with speed lines.
P4. Feel: foot planting on the ground (Gotham's sole probe) for the hero, Peter and the crowd.
P5. Story presentation: in-engine shots (Gotham cinematic.js: shots, subtitles, skip) for act openers
    and the finale; reward comic pages at 100% and all gold medals.
P6. Engineering: boot error says what failed; WebGL context loss overlay; combat clip load failure
    falls back; `?bench=1` perf bench; preload hints and a favicon; asset optimisation (prune the
    Mixamo GLBs, re-encode music); CREDITS.md and README credits fixed; dev probes worth keeping
    move out of the gitignored scripts/dev; Firefox switch on playthrough.mjs.
P7. Coverage: e2e specs for content, a boss start, stealth and save-resume; more unit tests on save,
    story ids and content data.

Not in scope: voice lines (no human or Fable source for audio), deploying (asks first), a GitHub
workflow is written but nothing is pushed.

## Done means

Full gate green (unit, e2e, swing, combat, combo, roster, story-walk, boss-check with flakes passing
alone, stroll, request, content, postgame, webkit, fps and load on the frozen build), a suit sheet and
a story-walk contact sheet looked at by eye, a code review subagent with its findings fixed, then
main fast-forwarded. Only then is the owner told to look.
