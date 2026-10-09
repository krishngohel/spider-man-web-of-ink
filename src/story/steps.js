// The story (spec 10), as data. Every step has a stable id ('act.name'); saves keep the current
// step id and the ids already done, never an index, so steps can be added or reordered later.
//
// Step types (src/story/director.js runs them):
//   start     a mission marker: free roam until the hero gets there (map icon, waypoint)
//   reach     get to a site (radius, optional minY for roofs)
//   radio     lines in the radio panel while play goes on
//   broadcast Jameson on the Bugle radio (the same panel, his skin, a crackle)
//   panels    comic pages, drawn in engine from shots (game paused)
//   title     an act card
//   fight     waves of a faction at a site
//   boss      a boss module (src/story/bosses) in an arena site
//   chase     a chase module (the boss module's chase phase)
//   stroll    Peter out of the suit: walk a scene and talk to people (src/story/stroll.js)
// Sites are named spots resolved against the city at run time (src/story/sites.js).
// cine: '<id>' plays a cinematic (src/story/cinematics.js) as the step begins, before its pages,
// card or stroll; reveal: '<line>' on a boss step is a reveal shot round him before the fight.

import { ACT2 } from './acts/act2.js';
import { ACT3 } from './acts/act3.js';
import { ACT4 } from './acts/act4.js';
import { spliceScenes, PETER_SCENES } from './acts/peter.js';
import { FINALE } from './acts/finale.js';

const L = (who, text) => ({ who, text });

export const ACTS = [
  { id: 'prologue', name: 'Prologue', title: 'First Light at Fisk Tower' },
  { id: 'act1', name: 'Act One', title: 'The Bird and the Bull' },
  { id: 'act2', name: 'Act Two', title: 'Power and Illusions' },
  { id: 'act3', name: 'Act Three', title: 'Hunters and Symbiotes' },
  { id: 'act4', name: 'Act Four', title: 'Sinister Six' },
];

// Who speaks: a name and a portrait (src/ui/portraits.js).
export const SPEAKERS = {
  peter: 'Spider-Man', parker: 'Peter', yuri: 'Captain Watanabe', mj: 'MJ', may: 'Aunt May', jameson: 'J. Jonah Jameson',
  kingpin: 'Kingpin', shocker: 'Shocker', vulture: 'Vulture', rhino: 'Rhino', cop: 'Officer', robbie: 'Robbie Robertson',
  miles: 'Miles', electro: 'Electro', scorpion: 'Scorpion', mysterio: 'Mysterio', lizard: 'Lizard', connors: 'Dr. Connors',
  kraven: 'Kraven', venom: 'Venom', sandman: 'Sandman', ock: 'Doctor Octopus', goblin: 'Green Goblin',
};

// Comic panel shots: a camera and a cast, relative to a site. cam / look / p are [x, y, z] offsets
// in metres from the site; yaw is where a figure faces, in degrees (0 = +z, 90 = +x).
const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });

export const STEPS = spliceScenes([
  // ------------------------------------------------------------------ Prologue
  {
    id: 'prologue.open', act: 'prologue', type: 'panels', cine: 'prologue', env: { hour: 6.4, weather: 'clear' },
    pages: [{
      layout: 'wide',
      panels: [
        { shot: shot('peterRoof', [5, 2.8, 3.5], [-25, -4, -6], [{ who: 'hero', p: [0, 0, 0], yaw: 270, pose: 'perch' }], { fov: 50 }), caption: 'New York. Six in the morning. The city is still yawning.' },
        { shot: shot('peterRoof', [-2.4, 1.85, 1.2], [0, 1.55, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 270 }], { fov: 36 }), balloons: [{ who: 'peter', text: 'Eight months of building a case. Today the cops finally get to use it.', x: 8, y: 8 }] },
        { shot: shot('fiskBase', [120, 140, 220], [0, 120, 0], [], { fov: 38 }), caption: 'Fisk Tower. Wilson Fisk calls it a business. Everyone else calls him Kingpin.', captionPos: 'bottom' },
      ],
    }, {
      panels: [
        { shot: shot('peterRoof', [-1.6, 1.75, -1.4], [0, 1.6, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 270 }], { fov: 34 }), balloons: [{ who: 'yuri', text: 'Watanabe. Warrant is signed. We move at sunrise, with or without you.', x: 50, y: 6, radio: true }] },
        { shot: shot('peterRoof', [-3.2, -0.6, 2.6], [0, 1.2, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 270, pose: 'perch' }], { fov: 50 }), balloons: [{ who: 'peter', text: 'With. Definitely with. Save me a seat.', x: 10, y: 70 }], sfx: 'THWIP!' },
      ],
    }],
  },
  { id: 'prologue.swing', act: 'prologue', type: 'reach', site: 'fiskBase', radius: 45, text: 'Swing to Fisk Tower.', tutorial: ['swing', 'jump', 'zip'], env: { hour: 6.6, weather: 'clear' }, quiet: true },
  {
    id: 'prologue.yuri', act: 'prologue', type: 'radio',
    lines: [
      L('yuri', 'We have the plaza surrounded. His security is not going quietly.'),
      L('peter', 'Do they ever? Clearing a path for you.'),
    ],
  },
  {
    id: 'prologue.plaza', act: 'prologue', type: 'fight', site: 'fiskBase', text: 'Take down Fisk\'s guards in the plaza.', tutorial: ['attack', 'dodge', 'web'],
    waves: [{ faction: 'kingpin', mix: ['brawler', 'brawler', 'brawler', 'gunner'] }, { faction: 'kingpin', mix: ['brawler', 'shield', 'brute', 'gunner'] }],
  },
  {
    id: 'prologue.roofRadio', act: 'prologue', type: 'radio',
    lines: [
      L('yuri', 'Lobby is ours. Fisk is not in it. A chopper is warming up on his roof.'),
      L('peter', 'The big man is taking the stairs? No. Going up.'),
    ],
  },
  { id: 'prologue.roof', act: 'prologue', type: 'reach', site: 'fiskRoof', radius: 30, minY: -6, text: 'Get to the roof of Fisk Tower.', tutorial: ['wall', 'zip'] },
  { id: 'prologue.kingpin', act: 'prologue', type: 'boss', boss: 'kingpin', site: 'fiskRoof', text: 'Take down the Kingpin.', tutorial: ['yank', 'finisher'], reveal: 'Wilson Fisk does not run. He waits for you to come up.' },
  {
    id: 'prologue.end', act: 'prologue', type: 'panels', env: { hour: 8, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('fiskBase', [4.2, 2.3, 5.2], [0, 1.6, 0], [{ who: 'kingpin', p: [0, 0, 0], yaw: 'cam' }, { who: 'yuri', p: [1.5, 0, 1.2], yaw: 'mix:kingpin' }, { who: 'cop', p: [-1.3, 0, 0.6], yaw: 'to:kingpin' }], { fov: 44 }), balloons: [{ who: 'kingpin', text: 'You think a cell holds me? Half this city is on my payroll.', x: 6, y: 6 }] },
        { shot: shot('fiskBase', [2.4, 1.9, 3.2], [0, 1.6, 0], [{ who: 'yuri', p: [0, 0, 0], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'yuri', text: 'Then I will start with the other half. Thank you, Spider-Man.', x: 48, y: 8 }] },
        { shot: shot('bugleFront', [2.6, 1.9, 3.4], [0, 1.55, 0], [{ who: 'mj', p: [0, 0, 0], yaw: 'cam' }], { fov: 40 }), caption: 'Across town, the Daily Bugle.', balloons: [{ who: 'mj', text: 'Fisk in cuffs and I got the photo. Peter is going to be so jealous.', x: 46, y: 58 }] },
      ],
    }],
  },
  {
    id: 'prologue.jameson', act: 'prologue', type: 'broadcast',
    lines: [
      L('jameson', 'This is J. Jonah Jameson, and you are listening to the truth.'),
      L('jameson', 'Wilson Fisk, arrested! Good. But who was swinging around his tower at dawn? The wall-crawling menace, that is who.'),
      L('jameson', 'The police do the work and the bug in pyjamas gets the headlines. Not on my station. Back after this.'),
    ],
  },
  { id: 'prologue.free', act: 'prologue', type: 'title', card: 'free' },

  // ------------------------------------------------------------------ Act 1: The Bird and the Bull
  { id: 'act1.title', act: 'act1', type: 'title', card: 'act', cine: 'act1', env: { hour: 12.4, weather: 'clear' } },
  { id: 'act1.bankStart', act: 'act1', type: 'start', site: 'exchangeFront', text: 'Trouble on Exchange Street. Head to the Financial District.', tutorial: ['freeroam', 'requests'] },
  {
    id: 'act1.bankRadio', act: 'act1', type: 'radio',
    lines: [
      L('yuri', 'Silent alarm at the Exchange Street bank vault. Maggia crew, and someone who brought a sound system.'),
      L('peter', 'A sound system? Please be a DJ. Please be a DJ.'),
    ],
  },
  {
    id: 'act1.bank', act: 'act1', type: 'fight', site: 'exchangeFront', text: 'Stop the Maggia crew outside the bank.',
    waves: [{ faction: 'maggia', mix: ['brawler', 'brawler', 'gunner', 'whip'] }, { faction: 'maggia', mix: ['shield', 'brawler', 'rocket', 'gunner'] }],
  },
  { id: 'act1.shocker', act: 'act1', type: 'boss', boss: 'shocker', site: 'exchangeFront', text: 'Shut down the Shocker.', tutorial: ['cover', 'backfire', 'yankProp'], env: { hour: 13, weather: 'overcast' }, reveal: 'Herman Schultz. Two gloves, one bank, no indoor voice.' },
  {
    id: 'act1.shockerEnd', act: 'act1', type: 'broadcast',
    lines: [
      L('jameson', 'Exchange Street, a crater! A bank vault, rattled to bits! And who do I see in the footage? Spider-Man!'),
      L('jameson', 'Sure, the man with the vibrating gloves is in jail. Coincidence? I have been in this business forty years. Nothing is a coincidence.'),
    ],
  },
  { id: 'act1.mjStart', act: 'act1', type: 'start', site: 'bugleRoof', text: 'MJ wants to meet on the Daily Bugle roof.' },
  {
    id: 'act1.mj', act: 'act1', type: 'panels', env: { hour: 17.6, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('bugleRoof', [0.8, 2.2, -5.2], [0, 1.4, 1.5], [{ who: 'mj', p: [1, 0, 0], yaw: 'mix:hero' }, { who: 'hero', p: [-1, 0, 0.2], yaw: 'mix:mj' }], { fov: 44 }), balloons: [{ who: 'mj', text: 'Somebody walked out of Oscorp last night with a prototype flight harness. Oscorp has not reported it.', x: 50, y: 6 }] },
        { shot: shot('bugleRoof', [-1.6, 1.85, -2.6], [-1, 1.6, 0.2], [{ who: 'hero', p: [-1, 0, 0.2], yaw: 'mix:mj' }, { who: 'mj', p: [1, 0, 0], yaw: 'to:hero' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Why would they keep quiet about it?', x: 8, y: 8 }] },
        { shot: shot('bugleRoof', [2, 1.8, -2.4], [1, 1.6, 0], [{ who: 'mj', p: [1, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'mj', text: 'Because the man who designed it was fired and never paid. Adrian Toomes. My source says he is going back for the rest.', x: 6, y: 58 }] },
      ],
    }],
  },
  { id: 'act1.oscorpStart', act: 'act1', type: 'start', site: 'oscorpFront', text: 'Stake out Oscorp Tower.', env: { hour: 19.2, weather: 'clear' } },
  {
    id: 'act1.vultureRadio', act: 'act1', type: 'radio',
    lines: [
      L('peter', 'Okay, Toomes. Any minute now.'),
      L('vulture', 'Up here, bug. Keep up if you can.'),
    ],
  },
  { id: 'act1.vultureChase', act: 'act1', type: 'chase', boss: 'vulture', site: 'oscorpFront', text: 'Chase the Vulture. Stay close and hit him with webs.', tutorial: ['chase'] },
  { id: 'act1.vulture', act: 'act1', type: 'boss', boss: 'vulture', site: 'bugleRoof', text: 'Ground the Vulture. Web yank him out of his dives.', tutorial: ['yankDive'] },
  {
    id: 'act1.vultureEnd', act: 'act1', type: 'broadcast',
    lines: [
      L('jameson', 'A man in a bird suit dive bombs MY building and lands on MY roof, and who is standing over him? The spider!'),
      L('jameson', 'I am not saying Spider-Man trained that vulture. I am asking. Loudly.'),
    ],
  },
  { id: 'act1.mayStart', act: 'act1', type: 'start', site: 'shelter', text: 'Aunt May asked you to drop by the F.E.A.S.T. shelter in Harlem.' },
  {
    id: 'act1.may', act: 'act1', type: 'panels', env: { hour: 12, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('shelter', [3.4, 2.2, 4.4], [-0.6, 1.4, 0], [{ who: 'may', p: [0, 0, 0], yaw: 'mix:parker' }, { who: 'parker', p: [-1.4, 0, -0.4], yaw: 'mix:may' }], { fov: 42 }), caption: 'F.E.A.S.T., Harlem.', balloons: [{ who: 'may', text: 'You look tired. You always look tired. Eat something.', x: 50, y: 8 }] },
        { shot: shot('shelter', [1.4, 1.8, 2.6], [0, 1.5, 0], [{ who: 'may', p: [0, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'may', text: 'Half our volunteers came in from Hell\'s Kitchen today. Something big has been tearing up the streets over there.', x: 6, y: 8 }] },
        { shot: shot('shelter', [0.2, 1.9, 2.4], [-1.4, 1.55, -0.4], [{ who: 'parker', p: [-1.4, 0, -0.4], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'parker', text: 'Something big. Great. I will take a look. And a sandwich.', x: 46, y: 60 }] },
      ],
    }],
  },
  { id: 'act1.rhinoStart', act: 'act1', type: 'start', site: 'hellsStreet', text: 'Something is wrecking Hell\'s Kitchen. Find it.', env: { hour: 15.5, weather: 'overcast' } },
  {
    id: 'act1.rhinoRadio', act: 'act1', type: 'radio',
    lines: [
      L('yuri', 'Every unit in Hell\'s Kitchen is calling it in. A man in a rhino suit, flipping cars.'),
      L('rhino', 'Spider-Man! Somebody paid good money to see you flattened.'),
      L('peter', 'Somebody? Let me guess. Big guy, white suit, recently arrested?'),
    ],
  },
  { id: 'act1.rhino', act: 'act1', type: 'boss', boss: 'rhino', site: 'hellsStreet', text: 'Stop the Rhino. Make him charge into something hard.', tutorial: ['charge'], reveal: 'Aleksei Sytsevich. Two tons, one speed, no brakes.' },
  {
    id: 'act1.end', act: 'act1', type: 'panels', env: { hour: 19.4, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('bugleRoof', [0.4, 2.4, -5.6], [0, 1.4, 2], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 'mix:mj' }, { who: 'mj', p: [0.7, 0, 0.2], yaw: 'mix:hero' }], { fov: 46 }), caption: 'That evening.', balloons: [{ who: 'mj', text: 'Shocker, Vulture, Rhino. All in one week. All with gear way above their pay grade.', x: 6, y: 8 }] },
        { shot: shot('bugleRoof', [-1.4, 1.85, -2.6], [-0.7, 1.6, 0], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Somebody is arming them. And Fisk is not doing it from a cell.', x: 48, y: 8 }] },
        { shot: shot('bugleRoof', [-2.5, 3.2, -4.5], [60, -12, 50], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 45, pose: 'perch' }, { who: 'mj', p: [0.7, 0, 0.2], yaw: 40 }], { fov: 50 }), caption: 'Across the river, every light in the Harbor flickers at once.', sfx: 'BZZT' },
      ],
    }],
  },
  {
    id: 'act1.jameson', act: 'act1', type: 'broadcast',
    lines: [
      L('jameson', 'Three costumed lunatics in seven days, and every single time, guess who shows up. You do the math, New York. I already did.'),
      L('jameson', 'And somebody fix the lights in the Harbor! I can hear my studio buzzing.'),
    ],
  },
  { id: 'act1.done', act: 'act1', type: 'title', card: 'actEnd' },
  ...ACT2,
  ...ACT3,
  ...ACT4,
], [...PETER_SCENES, FINALE]);

export const stepById = (id) => STEPS.find((s) => s.id === id) ?? null;
export const actById = (id) => ACTS.find((a) => a.id === id) ?? null;
