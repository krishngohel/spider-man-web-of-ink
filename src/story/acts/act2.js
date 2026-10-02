// Act 2, "Power and Illusions" (spec 10): the Harbor blackout and Electro, Miles at the shelter,
// Scorpion on the bridge, Mysterio's premiere, the Lizard in the park.

const L = (who, text) => ({ who, text });
const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });

export const ACT2 = [
  { id: 'act2.title', act: 'act2', type: 'title', card: 'act' },
  {
    id: 'act2.blackout', act: 'act2', type: 'panels', env: { hour: 21, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('bugleRoof', [-2.5, 3.2, -4.5], [60, -12, 50], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 45, pose: 'perch' }], { fov: 50 }), caption: 'Nine at night. The Harbor goes dark, block by block.' },
        { shot: shot('bugleRoof', [-1.4, 1.85, -2.6], [-0.7, 1.6, 0], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'yuri', text: 'The power station is not answering. My people at the gate say the fence is humming.', x: 46, y: 6, radio: true }] },
        { shot: shot('powerGate', [-34, 9, 46], [0, 30, -24], [], { fov: 50 }), caption: 'Harbor Power Station.', sfx: 'BZZZT' },
      ],
    }],
  },
  { id: 'act2.powerStart', act: 'act2', type: 'start', site: 'powerGate', text: 'Get to the Harbor Power Station.', env: { hour: 21.2, weather: 'clear' } },
  {
    id: 'act2.powerRadio', act: 'act2', type: 'radio',
    lines: [
      L('yuri', 'Oscorp security has the gate. They say it is a private matter. They are pointing guns at my officers.'),
      L('peter', 'Private matter. Got it. I will be discreet.'),
    ],
  },
  {
    id: 'act2.gate', act: 'act2', type: 'fight', site: 'powerGate', text: 'Get past the Oscorp guards at the gate.',
    waves: [{ faction: 'oscorp', mix: ['brawler', 'shield', 'gunner', 'brawler'] }, { faction: 'oscorp', mix: ['brute', 'brawler', 'jetpack', 'brawler'] }],
  },
  { id: 'act2.electro', act: 'act2', type: 'boss', boss: 'electro', site: 'powerRoof', text: 'Stop Electro. Yank a relay to drain him.', tutorial: ['relay'], env: { hour: 21.4, weather: 'overcast' } },
  {
    id: 'act2.electroEnd', act: 'act2', type: 'broadcast',
    lines: [
      L('jameson', 'Half the Harbor without power for three hours, and the cause? A glowing man in green pyjamas! And who was up there with him? You know who!'),
      L('jameson', 'I am told the lights came back on when the spider showed up. I am told a lot of things.'),
    ],
  },
  {
    id: 'act2.miles', act: 'act2', type: 'panels', char: 'miles', env: { hour: 21.6, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('shelter', [3.4, 2.2, 4.4], [0, 1.4, 0], [{ who: 'may', p: [0.8, 0, 0], yaw: 'mix:hero' }, { who: 'hero', p: [-0.8, 0, 0], yaw: 'mix:may' }], { fov: 42 }), caption: 'Meanwhile, in Harlem.', balloons: [{ who: 'may', text: 'The generator is all that is keeping the lights on in here. And those men outside want it.', x: 48, y: 6 }] },
        { shot: shot('shelter', [1.4, 1.8, 2.6], [-0.8, 1.55, 0], [{ who: 'hero', p: [-0.8, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'miles', text: 'Peter is busy across the river. So it is me. Okay. Okay, okay, okay.', x: 6, y: 8 }] },
      ],
    }],
  },
  { id: 'act2.milesStart', act: 'act2', type: 'start', char: 'miles', site: 'shelter', text: 'Protect the F.E.A.S.T. shelter generator.' },
  {
    id: 'act2.milesDefend', act: 'act2', type: 'defend', char: 'miles', site: 'shelter', text: 'Keep them away from the generator.', tutorial: ['venomBlast'],
    waves: [{ faction: 'oscorp', mix: ['brawler', 'brawler', 'gunner'] }, { faction: 'oscorp', mix: ['brawler', 'shield', 'brawler', 'gunner'] }, { faction: 'oscorp', mix: ['brute', 'brawler', 'whip', 'gunner'] }],
  },
  {
    id: 'act2.milesEnd', act: 'act2', type: 'panels', char: 'miles',
    pages: [{
      panels: [
        { shot: shot('shelter', [2.8, 2, 3.6], [0, 1.4, 0], [{ who: 'may', p: [0.8, 0, 0], yaw: 'mix:hero' }, { who: 'hero', p: [-0.8, 0, 0], yaw: 'mix:may' }], { fov: 40 }), balloons: [{ who: 'may', text: 'Two spider-people. This city is very lucky. Now come in and eat something.', x: 48, y: 6 }] },
        { shot: shot('shelter', [1.4, 1.8, 2.6], [-0.8, 1.55, 0], [{ who: 'hero', p: [-0.8, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'miles', text: 'Does everybody in this family feed people when they are stressed?', x: 46, y: 60 }] },
      ],
    }],
  },
  { id: 'act2.bridgeStart', act: 'act2', type: 'start', site: 'bridgeHarbor', text: 'An Oscorp transport was hit on the Queensway Bridge.', env: { hour: 10, weather: 'clear' } },
  {
    id: 'act2.bridgeRadio', act: 'act2', type: 'radio',
    lines: [
      L('yuri', 'Oscorp transport, overturned on the bridge. The driver says a man with a tail took one crate and ran.'),
      L('scorpion', 'You again. Catch me and I will show you what was in the crate.'),
    ],
  },
  { id: 'act2.scorpionChase', act: 'act2', type: 'chase', boss: 'scorpion', site: 'bridgeHarbor', text: 'Catch the Scorpion on the bridge.', tutorial: ['chase'] },
  { id: 'act2.scorpion', act: 'act2', type: 'boss', boss: 'scorpion', site: 'bridgeDeck', text: 'Beat the Scorpion before the poison does.', tutorial: ['poison'] },
  {
    id: 'act2.scorpionEnd', act: 'act2', type: 'broadcast',
    lines: [
      L('jameson', 'A man dressed as a bug fights a man dressed as a different bug on MY bridge, during MY commute. This city has gone insane.'),
      L('jameson', 'And the Oscorp crate? Empty. Somebody already had what they wanted.'),
    ],
  },
  { id: 'act2.neonStart', act: 'act2', type: 'start', site: 'neonPlaza', text: 'The Neon Square premiere. Something is wrong with the show.', env: { hour: 22, weather: 'clear' } },
  {
    id: 'act2.premiere', act: 'act2', type: 'panels', env: { hour: 22, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('neonPlaza', [1.2, 1.5, 4.5], [0, 3.5, -12], [{ who: 'mysterio', p: [0, 0, -1.5], yaw: 'cam' }], { fov: 54 }), caption: 'Neon Square. Opening night of a show nobody booked.', balloons: [{ who: 'mysterio', text: 'Welcome, welcome! Tonight, the greatest trick of all: making a hero disappear.', x: 50, y: 30 }] },
        { shot: shot('neonPlaza', [2.2, 1.8, 2.8], [0, 1.6, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Let me guess. Smoke, mirrors, fishbowl.', x: 8, y: 8 }] },
      ],
    }],
  },
  { id: 'act2.mysterio', act: 'act2', type: 'boss', boss: 'mysterio', site: 'neonPlaza', text: 'Find the real Mysterio. Use your spider-sense.', tutorial: ['scan', 'drones'], env: { hour: 22.2, weather: 'clear' } },
  {
    id: 'act2.mysterioEnd', act: 'act2', type: 'broadcast',
    lines: [
      L('jameson', 'Witnesses describe a sixty foot man in a goldfish bowl. Sixty feet! I want photographs, people. Real ones.'),
      L('jameson', 'The so-called hero says it was all special effects. Well, so is his reputation.'),
    ],
  },
  { id: 'act2.zooStart', act: 'act2', type: 'start', site: 'zooPlaza', text: 'Something got loose at the Park Zoo.', env: { hour: 16, weather: 'overcast' } },
  {
    id: 'act2.zooRadio', act: 'act2', type: 'radio',
    lines: [
      L('yuri', 'Zoo keepers report a seven foot lizard. They also report it said thank you when it opened the gate.'),
      L('peter', 'Doctor Connors. He was testing that regeneration serum on himself. Oh no.'),
    ],
  },
  { id: 'act2.lizardChase', act: 'act2', type: 'chase', boss: 'lizard', site: 'zooPlaza', text: 'Chase the Lizard across the park. Few anchors here: zip and run.', tutorial: ['parkRun'] },
  { id: 'act2.lizard', act: 'act2', type: 'boss', boss: 'lizard', site: 'zooPlaza', text: 'Wear the Lizard down, then web him for the cure.', tutorial: ['cure'] },
  {
    id: 'act2.end', act: 'act2', type: 'panels', env: { hour: 18.6, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('zooPlaza', [3, 2.2, 4], [0, 1.2, 0], [{ who: 'connors', p: [0, 0, 0], yaw: 'cam' }, { who: 'hero', p: [-1.2, 0, -0.6], yaw: 'to:connors' }], { fov: 40 }), caption: 'The cure takes. Slowly, Curt Connors comes back.', balloons: [{ who: 'connors', text: 'Someone gave me the last of the serum. Someone who wanted to see what it would do.', x: 46, y: 6 }] },
        { shot: shot('zooPlaza', [1.6, 1.8, 2.6], [-1.2, 1.55, -0.6], [{ who: 'hero', p: [-1.2, 0, -0.6], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Electro, Scorpion, Mysterio, you. All in a month. Someone is building something.', x: 6, y: 8 }] },
        { shot: shot('oscorpFront', [70, 12, 140], [0, 170, 0], [], { fov: 46 }), caption: 'Across town, in a lab under Oscorp, someone takes notes.', sfx: 'CLICK' },
      ],
    }],
  },
  {
    id: 'act2.jameson', act: 'act2', type: 'broadcast',
    lines: [
      L('jameson', 'A lizard, a magician, a scorpion and a living light bulb. Is anyone else noticing a pattern? Because I am, and the pattern has eight legs.'),
    ],
  },
  { id: 'act2.done', act: 'act2', type: 'title', card: 'actEnd' },
];
