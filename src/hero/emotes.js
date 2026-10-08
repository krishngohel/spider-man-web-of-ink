// Emotes (hold B, or D-pad down on a pad, for the wheel; jump flips its page): Mixamo clips
// retargeted into anims_social.glb (scripts/mixamo-clips.mjs). An emote plays standing still on the
// ground and stops the moment you move, jump, swing or fight. loop: plays until cancelled.
export const EMOTE_PAGES = [
  { title: 'GESTURES', emotes: [
    { id: 'wave', label: 'Wave', clip: 'Emote_Wave' },
    { id: 'salute', label: 'Salute', clip: 'Emote_Salute' },
    { id: 'cheer', label: 'Cheer', clip: 'Emote_Cheer' },
    { id: 'taunt', label: 'Taunt', clip: 'Emote_Taunt' },
    { id: 'clap', label: 'Clap', clip: 'Emote_Clap' },
    { id: 'flex', label: 'Flex', clip: 'Emote_Flex' },
    { id: 'bow', label: 'Bow', clip: 'Emote_Bow' },
    { id: 'laugh', label: 'Laugh', clip: 'Emote_Laugh' },
  ] },
  { title: 'MOODS', emotes: [
    { id: 'shrug', label: 'Shrug', clip: 'Emote_Shrug' },
    { id: 'think', label: 'Think', clip: 'Emote_Think' },
    { id: 'victory', label: 'Victory', clip: 'Emote_Victory' },
    { id: 'excited', label: 'Excited', clip: 'Emote_Excited' },
    { id: 'pushups', label: 'Push Ups', clip: 'Push_Up', loop: true },
    { id: 'stretch', label: 'Stretch', clip: 'Arm_Stretch' },
    { id: 'phone', label: 'Phone', clip: 'Texting', loop: true },
    { id: 'kneel', label: 'Kneel', clip: 'Kneel_Idle', loop: true },
  ] },
  { title: 'DANCES', emotes: [
    { id: 'dance', label: 'Hip Hop', clip: 'Emote_Dance', loop: true },
    { id: 'breakdance', label: 'Breakdance', clip: 'Emote_Breakdance', loop: true },
    { id: 'robot', label: 'Robot', clip: 'Emote_Robot', loop: true },
    { id: 'thriller', label: 'Zombie', clip: 'Emote_Thriller', loop: true },
    { id: 'swing', label: 'Swing', clip: 'Emote_Swing_Dance', loop: true },
    { id: 'silly', label: 'Silly', clip: 'Silly_Dance', loop: true },
    { id: 'runningman', label: 'Running Man', clip: 'Running_Man', loop: true },
    { id: 'freeze', label: 'Freeze', clip: 'Emote_Freeze', loop: true },
  ] },
];
export const EMOTES = EMOTE_PAGES.flatMap((p) => p.emotes);
export const emoteById = (id) => EMOTES.find((e) => e.id === id) ?? null;
