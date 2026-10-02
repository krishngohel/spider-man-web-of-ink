# Overhaul: Spidey combat, comic graphics, camera and controls, mission flow

Owner feedback (2026-10-02): "needs a lot of polish, Gotham functions a lot better", "no kicks?",
"the graphics need a HUGE overhaul", "the combat system doesn't feel like Spidey at all, do deep
research on Spider-Man games". All four areas are in scope. Sources: a code comparison against
Gotham, a playtest capture, research on Insomniac's Spider-Man 2018/2020/2023, Web of Shadows,
Shattered Dimensions, Spider-Verse and Hi-Fi Rush rendering.

## Track A: combat that plays like Spider-Man
The core problem: three punch clips on the ground with the air and webs as extras is the Arkham
template minus the counter. Spider-Man fights by dodging, flipping, webbing and staying in the air.

A1. Rhythm and telegraphs. One attack token passed between enemies (at most 1 melee attacker, 2 on
Spectacular), 0.8 to 1.5 s between attack starts, off-screen shooters slower. Every attack has a
visible anticipation pose played slowly, then a fast snap (Gotham enemy.js pattern), with the
spider-sense squiggle over that enemy's head: white on the telegraph, blue for the last 150 ms
(the perfect window). Same for bosses (their windups currently have no pose at all).
A2. Flip dodge. Dodge is a 3 to 4 m flip or vault (sideways, or over the attacker), i-frames about
300 ms, buffered while attacking. Perfect dodge: 0.3x time for 0.4 s, white flash, an automatic
web shot to the attacker's face that stuns him, and nearby attackers wait 1 s.
A3. The air is safe. While the hero is more than 1.5 m up, ground melee enemies do not attack; only
whips, jetpacks and guns do. Spider-Man fights upward.
A4. Ground string of 5 with kicks. Jab, cross, roundhouse kick, spin kick, flying kick that sends
the enemy 4 to 6 m and leaves Spidey flipping. Kicks come from Gotham's retargeted motion capture
(Kick_Front, Kick_Round, Kick_Spin, Kick_Flying, Knee_Strike; same skeleton). Each hit magnetises
1.5 to 4 m to the target, turns him to face it, lands on the clip's contact frame, and can be
cancelled into dodge or web from 40% in. A real 0.3 s input buffer for every action.
A5. Launcher and air combo. Hold attack 250 ms: uppercut, follow the enemy up, low-gravity hang
while juggling, 4 hits ending in a spike; hold web in the air slams him down with splash damage;
jump plus attack from height is a ground strike sized by height.
A6. Web strike chains (Web of Shadows). Zip to an enemy up to 18 m away, kick, rebound 2 to 3 m up
and back, ready for the next strike.
A7. Webs as crowd control. Yank pulls an enemy in and spins him open; on a webbed enemy, hold to
swing him round and throw him; thrown or knocked enemies within 3 m of a wall stick to it (with a
pinned-to-wall pose, not a death clip). 4 to 5 web shots cocoon a thug; web shots disarm gunners.
Environment throws: highlighted objects yanked and flung at the target.
A8. Enemy roster that forces variety: thug, bat thug (launch him), shield (flip over or yank the
shield), brute (web him 5 times, then hit or throw), whip (anti-air), gunner, rocket (throw rockets
back), jetpack (web strike up to him). Contextual hints when a move fails ("TOO HEAVY: WEB HIM").
A9. Hit feel. Hitstop on the attacker and victim only: light 60 ms, enders and launchers 100 ms,
finishers 150 ms plus slow motion; a 2 to 4 frame camera kick and FOV punch; distinct reactions
(stagger, knockdown, launch, stuck, shrug for immune).
A10. Finishers, takedowns, defeat and heal with real animation and a short camera move; stealth
takedowns get their own camera.
A11. Bosses: anticipation poses, opening states you can see (a glow when stunned), ground warnings
before area attacks, a short intro and a slow-motion defeat, retries from the current phase.

## Track B: graphics overhaul
B1. Invert the pattern rule (the main cause of the muddy look): line hatching only in core shadow,
halftone dots only in highlights and glows, shadows coloured (hue-shifted toward violet under warm
light) with a brightness floor, never black.
B2. Coloured distance and height fog that also fades the ink, line weight 2.5 px near to 1 px far.
B3. Character readability: lit-side rim light, thicker character outlines, no hatching on
characters, faction accent colours the city never uses, the environment kept in mid values.
B4. Lighting moods: golden hour as the default free-roam look, a dot halo around the sun instead
of bloom, cool violet shadows, a warm-to-teal sky.
B5. Buildings: setbacks with a cornice slab at each tier and a parapet, a taller storefront floor
with awnings, floor bands, window frames and sills with an inset shadow, lit windows at night,
fire escapes, water towers, AC units and antennas (instanced, merged per chunk).
B6. Outlines with object ids (cleaner edges between things), slight line wobble redrawn at 12 fps.
B7. Characters: smoothed normals so toon bands fall cleanly, an inverted hull outline on heroes
and bosses, the suit web lines and lenses sharpened, a more heroic build (broader chest, narrower
waist), and the character animated on twos as a setting.
B8. Action effects: impact frames (1 to 2 inverted frames), radial speed lines on finishers and at
swing speed, star hit sparks, Kirby dot bursts, misregistration (colour offset) instead of blur in
the distance and at speed.
B9. Paper grain and a light vignette; a layered skyline of silhouette cards on the fog colour.

## Track C: controls, movement and camera
C1. Combat camera: pull back and up, centre the framing when enemies are within 14 m, keep the
token holder on screen or show a directional arc, FOV kick on hits, short zooms on finishers.
C2. Traversal camera: stop it ending up low and staring into walls while swinging (higher minimum
pitch near walls, look-ahead along velocity).
C3. Facing: the hero turns to the target on every strike and after being hit; targets picked by
the stick direction first, the camera second.
C4. A dedicated dodge (still C), no longer shared with dive and slam depending on height.

## Track D: missions and flow
D1. One prompt system, Gotham style: tips wait until they are relevant (combat tips when the fight
starts), go stale with the step, hide during takedowns and finishers, dismiss when done; the
first-play tips and story tips merged; never more than two on screen.
D2. Objectives: the card pulses when it changes; a beacon for every travel step; hidden within 7 m.
D3. Steps start with the hero facing the next site; retries face the objective after a short
defeat beat; mission complete gives a beat and heals.
D4. Radio advances with a key (Enter) and the pad; dialogue never stacks with tips.
D5. Free roam stays quiet during act cards and comic pages (no gang spawning under a title card);
the boxy placeholder cars replaced with proper ones.
D6. Bosses get a short in-engine intro (letterbox, a push-in) and an outro.

## Order and gates
1. Track A first (A1 to A5, A9, C3, C4): it is what the owner feels most. Then B1 to B4 (cheap,
   largest visual change). Then A6 to A8, A10, A11, C1, C2. Then B5 to B9. Then Track D.
2. After each block: unit tests, the combat pilot, the boss pilots, fps on a frozen build (6.9 ms
   GPU budget), WebKit, plus before and after films and sheets for the owner to judge.
3. Work in the worktree; merge to main only at verified blocks.
