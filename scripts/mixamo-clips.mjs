// Every Mixamo clip the game uses: our name, the Mixamo animation it came from, and how it is
// retargeted (scripts/retarget-mocap.mjs spec suffix). Raw FBX files live in assets-src/mixamo
// (not in the repo: Mixamo's terms allow use in games, not redistribution of the files); each is
// converted with scripts/fbx2glb.mjs first. Then:
//   node scripts/mixamo-clips.mjs combat   -> public/assets/anims_combat.glb + src/combat/clipData.js
//   node scripts/mixamo-clips.mjs social   -> public/assets/anims_social.glb (emotes, story, city)
// Spec: :limb (:hand = farthest hand), !noaim (keeps its own heading), %loop (whole clip, own hips
// sway, loops), %air (not set down on the ground). Social clips are all kept whole (a wave or a
// nod is slow; the energy trim would cut it short) and played once or looped by the game.
import { spawnSync } from 'node:child_process';

const NO = '!noaim', LOOP = '%loop', AIR = '%loop%air';
export const CLIPS = {
  combat: {
    // Hero kicks (contact: the foot that goes highest).
    Martelo_2: ['Martelo 2', ''], Armada: ['Armada', ''], Meia_Lua: ['Meia Lua De Compasso', ''], Leg_Sweep: ['Leg Sweep', ''],
    Flip_Kick: ['Flip Kick', ''], Flying_Kick: ['Flying Kick', ''], Scissor_Kick: ['Scissor Kick', ''], Hurricane_Kick: ['Hurricane Kick', ''],
    Kip_Kick: ['Inverted Double Kick To Kip Up', ''], Spin_Flip_Kick: ['Spin Flip Kick', ''], Mma_Kick: ['Mma Kick', ''],
    Roundhouse_Kick: ['Roundhouse Kick', ''], Side_Kick: ['Side Kick', ''], Drop_Kick: ['Drop Kick', ''], Roll_Kicking: ['Roll Kicking', ''],
    Illegal_Knee: ['Illegal Knee', ''],
    // Punches, throws and grabs (contact: the hand's farthest reach).
    Hook_Punch: ['Hook Punch', ':hand'], Cross_Punch: ['Cross Punch', ':hand'], Punch_Combo: ['Punch Combo', ':hand'],
    Elbow_Punch: ['Illegal Elbow Punch', ':hand'], Jab_Cross: ['Jab Cross', ':hand'], Body_Jab_Cross: ['Body Jab Cross', ':hand'],
    Lead_Jab: ['Lead Jab', ':hand'], Quad_Punch: ['Quad Punch', ':hand'], Surprise_Uppercut: ['Surprise Uppercut', ':hand'],
    Backflip_Uppercut: ['Back Flip To Uppercut', ':hand!noaim'], Flying_Knee: ['Flying Knee Punch Combo', ':hand'], Headbutt: ['Headbutt', ':Head'],
    Grab_Slam: ['Grab And Slam', ':hand!noaim'], Pull_Rope: ['Pulling A Rope', ':hand!noaim'], Shoulder_Throw: ['Shoulder Throw', ':hand!noaim'],
    Flying_Shoulder_Throw: ['Flying Shoulder Throw', ':hand!noaim'], Brute_Punch: ['Mutant Punch', ':hand!noaim'], Brute_Swipe: ['Mutant Swiping', ':hand!noaim'],
    // Evades and flips.
    Aerial_Evade: ['Aerial Evade', NO], Corkscrew_Evade: ['Corkscrew Evade', NO], Au_To_Role: ['Au To Role', NO],
    Dodge_L: ['Standing Dodge Left', NO], Dodge_R: ['Standing Dodge Right', NO], Dodge_Back: ['Standing Dodge Backward', NO],
    Dodging: ['Dodging', NO], Ducking: ['Ducking', NO], Front_Flip: ['Front Flip', NO], Backflip: ['Backflip', NO],
    Front_Twist_Flip: ['Front Twist Flip', NO], Running_Flip: ['Running Forward Flip', NO], Stylish_Flip: ['Stylish Flip', NO],
    Running_Slide: ['Running Slide', NO],
    // Hit reactions, knockdowns and get-ups (knockback comes from the fight's physics, not the clip).
    React_Front: ['Standing React Large From Front', NO], React_Back: ['Standing React Large From Back', NO],
    React_Right: ['Standing React Large From Right', NO], React_Left: ['Standing React Large From Left', NO],
    React_Small_L: ['Standing React Small From Left', NO], React_Small_R: ['Standing React Small From Right', NO],
    React_Small_F: ['Standing React Small From Front', NO], React_Head: ['Hit To Head', NO], React_Gut: ['Stomach Hit', NO],
    React_Groin: ['Kick To The Groin', NO], Big_Head_Hit: ['Big Hit To Head', NO], Getting_Hit_Back: ['Getting Hit Backwards', NO],
    Uppercut_Hit: ['Receiving An Uppercut', NO], Big_Uppercut_Hit: ['Receiving A Big Uppercut', NO],
    Liver_Knockdown: ['Livershot Knockdown', NO], Knocked_Down: ['Knocked Down', NO], Knocked_Out: ['Knocked Out', NO],
    Sweep_Fall: ['Sweep Fall', NO], Fall_Back_Death: ['Falling Back Death', NO], Flying_Back_Death: ['Flying Back Death', NO],
    Getting_Up: ['Getting Up', NO], Kip_Up: ['Kip Up', NO], Corkscrew_Kip_Up: ['Corkscrew Kip Up', NO],
    // Fight idles and goon attitude (kept whole: a jeer is slow, the energy trim cut it short).
    Fight_Idle: ['Fighting Idle', LOOP], Fight_Idle_Bounce: ['Bouncing Fight Idle', LOOP], Stunned: ['Stunned', LOOP],
    Injured_Idle: ['Injured Idle', LOOP], Brute_Roar: ['Roar', LOOP], Goon_Taunt: ['Taunt', LOOP], Goon_Taunt2: ['Standing Taunt Chest Thump', LOOP],
    Goon_Battlecry: ['Standing Taunt Battlecry', LOOP], Goon_Threat: ['Threatening', LOOP], Goon_Insult: ['Insult', LOOP], Goon_Cheer: ['Fist Pump', LOOP],
    // Traversal.
    Falling_Idle: ['Falling Idle', AIR], Falling: ['Falling', AIR], Swinging: ['Swinging', AIR], Rope_Swinging: ['Rope Swinging', AIR],
    Hanging_Idle: ['Hanging Idle', AIR], Start_Swinging: ['Start Swinging', NO + '%air'], Swing_To_Land: ['Swing To Land', NO],
    Hard_Landing: ['Hard Landing', NO], Falling_To_Roll: ['Falling To Roll', NO], Falling_To_Landing: ['Falling To Landing', NO],
    Jump_From_Wall: ['Jump From Wall', NO], Climb_Top: ['Climbing To Top', NO], Wall_Run: ['Wall Run', LOOP],
    Wall_Run_Diag: ['Diagonal Wall Run', LOOP], Climb_Wall: ['Climbing Up Wall', LOOP], Crouch_Idle: ['Crouch Idle', LOOP],
    Running: ['Running', LOOP], Walking: ['Walking', LOOP], Sneak_Walk: ['Sneak Walk', LOOP],
    Idle_Look: ['Looking Around', LOOP], Idle_Breathing: ['Breathing Idle', LOOP],
  },
  social: {
    // Emotes (the hold-B wheel; goons borrow the taunt and cheer).
    Emote_Wave: ['Waving', LOOP], Emote_Salute: ['Salute', LOOP], Emote_Dance: ['Hip Hop Dancing', LOOP], Emote_Cheer: ['Cheering', LOOP],
    Emote_Taunt: ['Taunt Gesture', LOOP], Emote_Clap: ['Clapping', LOOP], Emote_Flex: ['Mutant Flexing Muscles', LOOP],
    Emote_Breakdance: ['Breakdance Footwork 1', LOOP], Emote_Robot: ['Robot Hip Hop Dance', LOOP], Emote_Thriller: ['Thriller Part 1', LOOP],
    Emote_Bow: ['Quick Formal Bow', LOOP], Emote_Laugh: ['Laughing', LOOP], Emote_Shrug: ['Shrugging', LOOP], Emote_Think: ['Thinking', LOOP],
    Emote_Victory: ['Victory', LOOP], Emote_Swing_Dance: ['Swing Dancing', LOOP], Emote_Freeze: ['Breakdance Freezes', LOOP],
    Emote_Wave_Dance: ['Wave Hip Hop Dance', LOOP], Emote_Excited: ['Excited', LOOP], Silly_Dance: ['Silly Dancing', LOOP],
    Running_Man: ['Dancing Running Man', LOOP],
    // Story and city acting: sitting, talking, phones, fear, school, rescues.
    Sit_Idle: ['Sitting Idle', LOOP], Sit_Laugh: ['Sitting Laughing', LOOP], Sit_Talk: ['Sitting Talking', LOOP], Sit_Clap: ['Sitting Clap', LOOP],
    Sit_Yell: ['Sitting Yell', LOOP], Sit_Point: ['Sitting And Pointing', LOOP], Sit_Disbelief: ['Sitting Disbelief', LOOP],
    Sit_Angry: ['Sitting Angry', LOOP], Sit_Rub_Arm: ['Sitting Rubbing Arm', LOOP], Sit_Dazed: ['Sitting Dazed', LOOP],
    Sit_Type: ['Typing', LOOP], Gaming: ['Gaming', LOOP], Writing: ['Writing', LOOP], Hand_Raise: ['Hand Raising', LOOP],
    Talking: ['Talking', LOOP], Arguing: ['Standing Arguing', LOOP], Talk_Watercooler: ['Talking At Watercooler', LOOP],
    Phone: ['Talking On Phone', LOOP], Phone_Pace: ['Talking Phone Pacing', LOOP], Texting: ['Texting While Standing', LOOP],
    Terrified: ['Terrified', LOOP], Scared: ['Scared', LOOP], Pointing: ['Pointing Forward', LOOP], Angry_Point: ['Angry Point', LOOP],
    Angry: ['Angry Gesture', LOOP], Yelling: ['Yelling', LOOP], Head_Shake: ['Shaking Head No', LOOP], Head_Nod: ['Head Nod Yes', LOOP],
    Lean_Wall: ['Leaning On A Wall', LOOP], Sad_Idle: ['Sad Idle', LOOP], Happy_Idle: ['Happy Idle', LOOP], Crying: ['Crying', LOOP],
    Relieved: ['Relieved Sigh', LOOP], Kneel_Inspect: ['Kneeling Inspecting', LOOP], Kneel_Idle: ['Kneeling Idle', LOOP], Bored: ['Bored', LOOP],
    Telling_Secret: ['Telling A Secret', LOOP], Rejected: ['Rejected', LOOP], Disappointed: ['Disappointed', LOOP],
    Handshake: ['Shaking Hands 1', LOOP], Walk_Shopping: ['Walking With Shopping Bag', LOOP], Skateboarding: ['Skateboarding', LOOP],
    Drinking: ['Drinking', LOOP], Sleeping: ['Sleeping Idle', LOOP], Waking: ['Waking', LOOP], Arm_Stretch: ['Arm Stretching', LOOP],
    Open_Door: ['Opening Door Inwards', LOOP], Pick_Up: ['Picking Up Object', LOOP], Helping_Out: ['Helping Out', LOOP],
    Give_Cpr: ['Administering Cpr', LOOP], Get_Cpr: ['Receiving Cpr', LOOP], Injured_Wave: ['Injured Wave Idle', LOOP],
    Greeting: ['Standing Greeting', LOOP], Push_Up: ['Push Up', LOOP],
  },
};

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const group = process.argv[2];
  const set = CLIPS[group];
  if (!set) { console.error('usage: node scripts/mixamo-clips.mjs combat|social'); process.exit(1); }
  const specs = Object.entries(set).map(([name, [, spec]]) => `${name}=assets-src/mixamo/${name}.glb${spec}`);
  const args = ['scripts/retarget-mocap.mjs', '--map', 'mixamo'];
  // The combat file keeps Gotham's five Meshy kicks; the social file (slow acting, 20 fps) is rebuilt whole.
  if (group === 'combat') args.push('--append');
  else args.push('--out', 'public/assets/anims_social.glb', '--data', 'none', '--fps', '20');
  const r = spawnSync(process.execPath, [...args, ...specs], { stdio: 'inherit' });
  if (r.status !== 0) process.exit(r.status ?? 1);
  // Shrink the rebuilt set (rotations as shorts, meshopt-packed) the way the game ships it.
  const o = spawnSync(process.execPath, ['scripts/optimize-assets.mjs', `anims_${group}.glb`], { stdio: 'inherit' });
  process.exit(o.status ?? 1);
}
