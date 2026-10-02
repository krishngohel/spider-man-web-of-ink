// Act 4, "Sinister Six" (spec 10): the breakout, the city under Sable's checkpoints, the Six in
// pairs, Doctor Octopus up Oscorp Tower, the Green Goblin's finale on the bridge, the epilogue.

const L = (who, text) => ({ who, text });
const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });
const route = (...pts) => pts.map(([x, z]) => ({ x, z }));

export const ACT4 = [
  { id: 'act4.title', act: 'act4', type: 'title', card: 'act' },
  {
    id: 'act4.breakout', act: 'act4', type: 'panels', env: { hour: 2, weather: 'rain' },
    pages: [{
      panels: [
        { shot: shot('oscorpFront', [70, 12, 140], [0, 170, 0], [], { fov: 46 }), caption: 'Two in the morning. Every alarm at the Raft goes off at once.', sfx: 'WHAAM' },
        { shot: shot('oscorpFront', [3, 2.4, 5], [0, 1.8, 0], [{ who: 'ock', p: [0, 0, 0], yaw: 'cam' }], { fov: 44 }), balloons: [{ who: 'ock', text: 'Electro. Vulture. Rhino. Scorpion. Mysterio. You were all given your toys by me. Now you will use them together.', x: 46, y: 6 }] },
        { shot: shot('oscorpFront', [-3, 2, 5], [0, 1.6, 0], [{ who: 'rhino', p: [-1.5, 0, 0], yaw: 'cam' }, { who: 'scorpion', p: [1.5, 0, 0.4], yaw: 'cam' }], { fov: 46 }), balloons: [{ who: 'rhino', text: 'Who do we smash first?', x: 8, y: 8 }] },
      ],
    }],
  },
  {
    id: 'act4.curfew', act: 'act4', type: 'broadcast',
    lines: [
      L('jameson', 'Six escaped lunatics, and the mayor has hired a private army to lock down the city. Sable checkpoints on every corner! Curfew at dark!'),
      L('jameson', 'I hate to say it, and I really do hate to say it: where is Spider-Man?'),
    ],
  },
  { id: 'act4.harborStart', act: 'act4', type: 'start', site: 'powerGate', text: 'Electro and Vulture are at the power station again.', env: { hour: 21, weather: 'clear' } },
  {
    id: 'act4.harborRadio', act: 'act4', type: 'radio',
    lines: [
      L('electro', 'Round two, bug. And this time I brought a friend.'),
      L('vulture', 'Two birds, one stone. Or one bug, two birds. Either way.'),
    ],
  },
  { id: 'act4.electroVulture', act: 'act4', type: 'boss', boss: 'duo', duo: ['electro', 'vulture'], site: 'powerRoof', text: 'Beat Electro and the Vulture together.', env: { hour: 21.2, weather: 'overcast' } },
  {
    id: 'act4.milesCheckpoint', act: 'act4', type: 'panels', char: 'miles', env: { hour: 22, weather: 'rain' },
    pages: [{
      panels: [
        { shot: shot('hellsStreet', [4, 2.6, 6], [0, 3, -10], [{ who: 'hero', p: [0, 0, 0], yaw: 180 }], { fov: 46 }), caption: 'Hell\'s Kitchen. Sable has a checkpoint on every corner, and nobody gets through.' },
        { shot: shot('hellsStreet', [1.4, 1.8, 2.6], [0, 1.55, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'miles', text: 'The shelter needs a supply run and the trucks cannot get past them. So the checkpoint goes. Quietly.', x: 6, y: 8 }] },
      ],
    }],
  },
  { id: 'act4.milesStart', act: 'act4', type: 'start', char: 'miles', site: 'hellsStreet', text: 'Clear the Sable checkpoint in Hell\'s Kitchen.', env: { hour: 22, weather: 'rain' } },
  {
    id: 'act4.milesStealth', act: 'act4', type: 'stealth', char: 'miles', site: 'hellsStreet', text: 'Take out the checkpoint without raising the alarm.', tutorial: ['takedown'], env: { hour: 22, weather: 'rain' },
    guards: [
      { arch: 'gunner', route: route([-10, -6], [10, -6]) },
      { arch: 'brawler', route: route([12, 4], [12, -8]) },
      { arch: 'shield', route: route([-12, 6], [0, 8]) },
      { arch: 'gunner', route: route([0, 0], [-6, -2]) },
      { arch: 'brawler', route: route([16, 10], [6, 12]) },
    ],
    faction: 'sable', reinforce: { faction: 'sable', mix: ['brawler', 'shield', 'brawler'] },
  },
  { id: 'act4.financialStart', act: 'act4', type: 'start', site: 'exchangeFront', text: 'Rhino and Scorpion are tearing up the Financial District.', env: { hour: 12, weather: 'clear' } },
  { id: 'act4.rhinoScorpion', act: 'act4', type: 'boss', boss: 'duo', duo: ['rhino', 'scorpion'], site: 'exchangeFront', text: 'Beat Rhino and Scorpion together. Make Rhino charge into things.', env: { hour: 12.2, weather: 'clear' } },
  {
    id: 'act4.mid', act: 'act4', type: 'broadcast',
    lines: [
      L('jameson', 'Four down. Four! I am not saying thank you. I am saying it out loud that four is a number.'),
    ],
  },
  { id: 'act4.neonStart', act: 'act4', type: 'start', site: 'neonPlaza', text: 'Mysterio is putting on another show.', env: { hour: 22.5, weather: 'clear' } },
  { id: 'act4.mysterio', act: 'act4', type: 'boss', boss: 'mysterio', variant: 'rematch', site: 'neonPlaza', text: 'Find the real Mysterio. His own smoke gives him away now.', tutorial: ['scan'], env: { hour: 22.6, weather: 'clear' } },
  {
    id: 'act4.milesShelter', act: 'act4', type: 'panels', char: 'miles', env: { hour: 18, weather: 'overcast' },
    pages: [{
      panels: [
        { shot: shot('shelter', [2.8, 2, 3.6], [0, 1.4, 0], [{ who: 'may', p: [0.8, 0, 0], yaw: 'mix:hero' }, { who: 'hero', p: [-0.8, 0, 0], yaw: 'mix:may' }], { fov: 40 }), balloons: [{ who: 'may', text: 'Sable says we are a security risk. They are coming to close us down.', x: 48, y: 6 }] },
        { shot: shot('shelter', [1.4, 1.8, 2.6], [-0.8, 1.55, 0], [{ who: 'hero', p: [-0.8, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'miles', text: 'Over my dead. Over my. Nobody is closing anything.', x: 6, y: 8 }] },
      ],
    }],
  },
  { id: 'act4.milesShelterStart', act: 'act4', type: 'start', char: 'miles', site: 'shelter', text: 'Hold the F.E.A.S.T. shelter.' },
  {
    id: 'act4.milesDefend', act: 'act4', type: 'defend', char: 'miles', site: 'shelter', text: 'Keep Sable away from the shelter generator.',
    waves: [{ faction: 'sable', mix: ['brawler', 'brawler', 'shield', 'gunner'] }, { faction: 'sable', mix: ['brute', 'brawler', 'jetpack', 'gunner'] }, { faction: 'sable', mix: ['shield', 'brute', 'whip', 'rocket'] }],
  },
  { id: 'act4.ockStart', act: 'act4', type: 'start', site: 'oscorpFront', text: 'Doctor Octopus is at Oscorp Tower.', env: { hour: 22, weather: 'rain' } },
  { id: 'act4.ock', act: 'act4', type: 'boss', boss: 'ock', site: 'oscorpFront', text: 'Stop Doctor Octopus.', tutorial: ['ockGrab', 'ockBraced'], env: { hour: 22.2, weather: 'rain' } },
  {
    id: 'act4.ockEnd', act: 'act4', type: 'panels', env: { hour: 23, weather: 'rain' },
    pages: [{
      panels: [
        { shot: shot('oscorpFront', [3, 2.2, 4], [0, 1.4, 0], [{ who: 'ock', p: [0, 0, 0], yaw: 'cam' }, { who: 'yuri', p: [1.4, 0, 1], yaw: 'to:ock' }], { fov: 42 }), balloons: [{ who: 'ock', text: 'You think I built all this alone? Norman Osborn paid for every bolt.', x: 46, y: 6 }] },
        { shot: shot('oscorpFront', [70, 12, 140], [0, 170, 0], [], { fov: 46 }), caption: 'At the top of the tower, a glider lights up.', sfx: 'HA HA HA' },
      ],
    }],
  },
  { id: 'act4.goblinChase', act: 'act4', type: 'chase', boss: 'goblin', site: 'oscorpFront', text: 'Chase the Green Goblin across the city.', env: { hour: 23.2, weather: 'rain' } },
  { id: 'act4.goblin', act: 'act4', type: 'boss', boss: 'goblin', site: 'bridgeDeck', text: 'Beat the Green Goblin. Yank him off his glider when he dives.', tutorial: ['yankDive'], env: { hour: 23.5, weather: 'rain' } },
  { id: 'act4.catchMJ', act: 'act4', type: 'boss', boss: 'catchMJ', site: 'bridgeDeck', text: 'Catch MJ! Web her before she hits the water.', tutorial: ['catch'], env: { hour: 23.6, weather: 'rain' } },
  {
    id: 'act4.epilogue', act: 'act4', type: 'panels', env: { hour: 6.4, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('bugleRoof', [-2.5, 3.2, -4.5], [60, -12, 50], [{ who: 'hero', p: [-1.4, 0, 0], yaw: 45, pose: 'perch' }, { who: 'mj', p: [0, 0, 0.2], yaw: 40 }, { who: 'miles', p: [1.4, 0, 0], yaw: 50, pose: 'perch' }], { fov: 50 }), caption: 'Morning. The city is still standing.' },
        { shot: shot('bugleRoof', [0.6, 2.2, -5.2], [0, 1.4, 1.5], [{ who: 'may', p: [1.2, 0, 0], yaw: 'mix:mj' }, { who: 'mj', p: [-0.2, 0, 0.2], yaw: 'mix:may' }], { fov: 44 }), balloons: [{ who: 'may', text: 'I brought sandwiches. Nobody saves a city on an empty stomach.', x: 46, y: 6 }] },
        { shot: shot('bugleRoof', [-1.4, 1.85, -2.6], [-0.7, 1.6, 0], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Same time tomorrow?', x: 6, y: 8 }] },
      ],
    }],
  },
  {
    id: 'act4.jameson', act: 'act4', type: 'broadcast',
    lines: [
      L('jameson', 'The Sinister Six, behind bars. The Goblin, behind bars. Sable, sent packing. And the wall-crawler, out there, doing whatever it is he does.'),
      L('jameson', 'I am not going to say it. Fine. Thank you, Spider-Man. Now get off my roof.'),
    ],
  },
  { id: 'act4.credits', act: 'act4', type: 'credits' },
];
