# Combat feel fix (after the first playtest)

Owner verdict after playing: combat is not enjoyable. All four causes picked: no impact / floaty,
too easy / brainless, can't tell what's going on, clunky controls. A read-only audit of the combat
code traced each to concrete causes (numbers below are the current values). Estimates are marked EST.

## A. Controls (do first: hitting the wrong enemy poisons everything else)

1. Target selection (enemies.js pickTarget, heroCombat.js free state and nextMove, moves.js).
   Now: score = distance x (1.6 - cos angle to the camera), so a thug 5 m ahead beats one 2 m to the
   side, and anything picked past 4 m becomes a 0.9 s web strike that throws the hero up and back.
   Fix: no stick: keep the current target while valid and within 5 m, else the nearest within 4 m,
   camera weighting only when nobody is within 4 m. Stick: a 50 degree cone, nearest in cone first
   (angle/50 + d/8), a new pick must beat the current by 20 percent. Re-pick at every chain point when
   the stick is pushed, so a string flows between thugs. Down, getting up and webbed thugs are not
   strike targets. A web strike (over 4 m) only when the stick points at that thug within 30 degrees
   or nobody is within 4 m.
2. Input buffer (tuning.js, moves.js, heroCombat.js). Now 0.15 s, counted on a clock that runs during
   hitstop, so early presses vanish; attack is refused during a dodge (0.45 s) and hurt (0.32 s).
   Fix: 0.3 s buffer in hero time; attack out of a dodge after 0.25 s and out of hurt after 0.2 s;
   re-dodge from 0.3 s; stick pushed over 100 degrees from the target after impact + 0.08 s ends the move.
3. Dodge (heroCombat.js, bindings.js). Now random side without a stick, can go into the attacker,
   iframes capped at 0.5 s and the blow can still land after an early dodge, ignored on walls and perches.
   Fix: iframes min(1.0, time to the blow + 0.1) and the dodged blow cannot land on that swing; no stick
   dodges away from the threat; a stick dodge within 45 degrees of the attacker turns sideways; works off
   walls and perches; the key is labelled "Dodge (fighting) / Dive".
4. Camera (cameraRig.js). Now it auto-yaws toward any windup and forces pitch 0.38 after 0.5 s without
   mouse movement, always on when the pointer is unlocked, which bends WASD and the target pick.
   Fix: only after 1.0 s with no camera and no move input, only for an off-screen threat, never with the
   pointer unlocked; the pitch eases at a quarter of the rate.

## B. Challenge

5. No stunlock. Now every hit staggers (0.45 s) and resets windups, the anti-mash rule is undone on contact.
   Fix: the mash rule (4 plain hits in a row) also applies on contact: a winding-up thug is not
   interrupted. Poise: 3 hits on one thug within 1.5 s and he ignores flinch for 1.0 s (enders,
   launchers, throws, webs still stagger). Down and getting-up thugs do not pop back to a stagger.
6. Pressure. Now 1 melee token, swing every 1.75 to 2.35 s, brawler damage 8, a dodge freezes all new
   attacks for 1.0 s, everyone clumps at punching range.
   Fix: 2 melee tokens on amazing (the second windup at least 0.35 s after the first, so one dodge can
   clear both), 2 ranged slots, cooldown 0.15 to 0.5 s, dodge hold 0.5 s, brawler damage 12 (EST:
   8 to 9 hits kill), thugs without a token circle at 3 m instead of standing in reach.
7. Webs worth using: 3 shots web a thug (was 6), a web hit cancels a windup.

## C. Impact

8. Knockback. Now light hits slide 0.1 to 0.2 m (a 30 m/s^2 brake), the ender slides 1.2 m.
   Fix: light pushes 3 / 3.5 / 4 with an exponential brake of 6/s (about 0.5 m), ender push 12 with a
   down brake of 3.5/s (about 3.4 m), a knockout launches (push x1.6, lift 3), and a procedural recoil
   tilts the body 12 to 15 degrees away from the hit, back over 0.2 s.
9. Hitstop and camera. Now light 0.05 s, every hit widens the FOV (the camera drifts out while you
   mash), shake is random buzz, the camera kick was never built.
   Fix (EST): light 0.07, round 0.08, ender 0.12, launcher 0.10, counter 0.12, finisher 0.16, cap 0.18;
   victim shake 0.07 m, hero 60 percent; the FOV punches in (-1.5 light, -3 heavy) on its own spring back
   in about 0.12 s; a 3-frame directional kick along the hit instead of the jitter.
10. Sparks, flash, sound. Now no particle on light hits, a red flash invisible on red jackets, a muffled
   thud with no whoosh. Fix: a small spark at the contact point on every hit (the burst on heavies, also
   at contact); a white flash (done); a 2 to 4 kHz click on the punch, pitch varied 8 percent, a sub layer
   on heavies, a swing whoosh on every move start. Comic words only on heavy hits.

## D. Clarity

11. Telegraphs. Now the warning squiggle sits over the hero, only brutes get a marker, edge arcs show
   even for on-screen attackers, the warning sound is a fifth as loud as a punch.
   Fix: every windup puts a marker over the attacker's head (white, turning red in the dodge window);
   the attacker's rim glows white then red while winding up; edge arcs only for off-screen attackers;
   sense sounds about 3x louder; the target marker turns yellow so red only ever means danger.
12. Down vs KO: a knockdown is not the death clip (a knockback then get-up); a knocked-out body greys out.
13. Lunge: time to contact grows with distance (0.11 s + 0.04 s per metre past 1.5), so long lunges read
   as a leap, not a teleport.
14. Dark factions lifted (Fisk muscle suits off black).

## Gates

Unit tests, combat-check (the pilot must still win, now dodging), boss-check, swing-check, story-walk,
playthrough, fps-check, load-time, webkit-check. Fight film before and after.
