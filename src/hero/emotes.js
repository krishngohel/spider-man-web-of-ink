// Emotes (hold B, or D-pad down on a pad, for the wheel): Mixamo clips retargeted into
// anims_combat.glb (scripts/retarget-mocap.mjs). An emote plays standing still on the ground
// and stops the moment you move, jump, swing or fight. loop: plays until cancelled.
export const EMOTES = [
  { id: 'wave', label: 'Wave', clip: 'Emote_Wave' },
  { id: 'salute', label: 'Salute', clip: 'Emote_Salute' },
  { id: 'dance', label: 'Dance', clip: 'Emote_Dance', loop: true },
  { id: 'cheer', label: 'Cheer', clip: 'Emote_Cheer' },
  { id: 'taunt', label: 'Taunt', clip: 'Emote_Taunt' },
  { id: 'clap', label: 'Clap', clip: 'Emote_Clap' },
  { id: 'flex', label: 'Flex', clip: 'Emote_Flex' },
  { id: 'breakdance', label: 'Breakdance', clip: 'Emote_Breakdance', loop: true },
];
export const emoteById = (id) => EMOTES.find((e) => e.id === id) ?? null;
