# PlayStation pass (after the owner's 2026-10-04 playtest)

Owner: "take more inspiration from the ps games on the swinging and combat and the playstyle and
fights, keep the comic theme though it needs a lot of clean up", then "build it and do multiple
polish passes". Sources: a web research report on Insomniac's Spider-Man (2018), Miles Morales and
Spider-Man 2 (GDC talk write-ups, Insomniac interviews, guides), and a read-only audit of this code
against them. Insomniac never published exact numbers; values marked EST are starting points.

Already done before this spec: swing assist on by default (the swing button finds a building above
and ahead; Settings > Swing assist Off keeps aimed webs), combo moves (counter, sweep, back kick,
web pull, web blast) with prompts, pad scan/photo/trick, help card, combat panel hides, fewer swing
words, one fight at a time.

## P1 Traversal (the swing should feel like Insomniac's)
1. Anchor choice: prefer the side away from the nearer wall, ahead and above (research 1.1).
2. Cheat the pendulum: a gentle outward force away from the anchor building so the swing stays down
   the street; with no stick input the swing straightens along the street (research 1.2).
3. Release: a timed window late in the arc (phase about 0.6 to 0.8) gives forward x1.2 and +5 m/s up,
   with a whoosh and an FOV pop; outside it, no bonus. A dive carries its speed into the next swing.
4. Web zip boost: Q with no zip point in reach is a short forward-up dash (about 12 m in 0.25 s), two
   per airtime. Zip points show as a white dot while airborne (they are invisible today).
5. Wall run: hitting a wall keeps speed along it (a horizontal run, not a 3 m/s crawl) and wraps
   round building corners.
6. Camera: FOV 60 to 80 and follow distance 4 to 6.5 m with speed, +4 degrees on each web attach
   decaying over 0.4 s, a small lag on acceleration.
7. Steering: stronger stick control in a swing (it is halved today).

## P2 Combat
1. Webs are no longer a free knockout: a webbed thug breaks free after about 6 s unless stuck to a
   wall; brutes need 6 shots, shields 4.
2. The air is not safe from everything: whips may attack a hero in the air (the anti-air enemy).
3. Environment throws: street props near fights (bins, crates, manhole covers, hydrant caps) can be
   yanked with the hang/yank key and thrown at the nearest thug (stun or knockdown, a lot of focus).
4. Archetype answers: jump toward a shield thug to vault over him onto his back; a webbed brute can be
   thrown for area damage; a swing kick (attack while swinging close to a thug) knocks down.
5. The gadget wheel slows time while open and stops steering.
6. Finisher variety by context: ground, air, and next to a wall (webbed to it).

## P3 Fights and the loop
1. Bosses: phase pips by the boss bar; each opening keeps its own verb (throw back, gadget, swing
   around, etc.) so not every opening is "aim and press E".
2. Crimes get one bonus objective each (a 15 combo, two throws, a perfect dodge) paying extra tokens;
   crime alerts slide in on the right instead of stacking in the top-left caption box.
3. Progression: the 8 skills and 4 mods that do nothing get wired, and traversal/combat skills unlock
   moves (zip boost charges, wall dash, swing kick, quick zip) rather than only bump numbers.

## P4 Comic clean-up and HUD
1. Free roam near empty: speedometer off by default (a setting), the crosshair and anchor dot only
   while airborne, captions on one channel with priorities, first-play tips leave after 12 s.
2. A visual pass over every district and time of day from the play camera: linework noise on
   distant buildings, colour balance, sky, sizes of words and markers, motion lines at speed.
3. Overlapping boxes fixed (dialogue over the XP box).

## Polish passes
After the blocks: (1) feel pass with swing and fight films, (2) visual pass with screenshots of every
district and hour, (3) a code-review agent plus the full gate (unit, server, e2e, swing, combat,
combo, roster, content, postgame, story-walk, playthrough, boss, fps, load, webkit), fixes, repeat.
