// Act 3, "Hunters and Symbiotes" (spec 10): Kraven's hunt, Miles in the hunters' warehouse,
// Sandman at the shipyard, the symbiote and the Black Suit, the bell tower and Venom.

const L = (who, text) => ({ who, text });
const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });
// A patrol route as offsets from the site.
const route = (...pts) => pts.map(([x, z]) => ({ x, z }));

export const ACT3 = [
  { id: 'act3.title', act: 'act3', type: 'title', card: 'act' },
  {
    id: 'act3.kravenCall', act: 'act3', type: 'broadcast',
    lines: [
      L('jameson', 'This is J. Jonah Jameson and, wait, who are you? Get away from that microphone!'),
      L('kraven', 'New York. I am Sergei Kravinoff, and I have hunted every beast worth the name. Tonight I hunt the spider.'),
      L('kraven', 'Central Park, at dusk. Come alone, little spider. My men will be waiting in the trees.'),
    ],
  },
  { id: 'act3.parkStart', act: 'act3', type: 'start', site: 'parkLawn', text: 'Kraven is waiting in Central Park.', env: { hour: 18.8, weather: 'clear' } },
  {
    id: 'act3.hunters', act: 'act3', type: 'stealth', site: 'parkLawn', text: 'Take out Kraven\'s hunters without being seen.', tutorial: ['takedown', 'perch', 'sense'], env: { hour: 19, weather: 'clear' },
    guards: [
      { arch: 'brawler', route: route([-30, -20], [-10, -20], [-10, -8]) },
      { arch: 'gunner', route: route([20, -25], [30, -10]) },
      { arch: 'brawler', route: route([-25, 15], [-5, 20], [-20, 30]) },
      { arch: 'sniper', route: route([25, 20], [15, 30]) },
      { arch: 'brawler', route: route([0, 0], [10, 10], [0, 15]) },
      { arch: 'whip', route: route([-35, 0], [-40, 12]) },
    ],
    faction: 'kraven', reinforce: { faction: 'kraven', mix: ['brawler', 'brute', 'gunner'] },
  },
  { id: 'act3.kraven', act: 'act3', type: 'boss', boss: 'kraven', site: 'parkLawn', text: 'Survive Kraven\'s hunt. Use your spider-sense to spot him.', tutorial: ['scan', 'yankKraven'], env: { hour: 19.2, weather: 'clear' } },
  {
    id: 'act3.kravenEnd', act: 'act3', type: 'panels', env: { hour: 19.6, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('parkLawn', [3, 1.8, 3.6], [0, 1.2, 0], [{ who: 'kraven', p: [0, 0, 0], yaw: 'cam', pose: 'perch' }], { fov: 40 }), balloons: [{ who: 'kraven', text: 'You fight like prey that refuses to be prey. Good. I will be back for the rematch.', x: 46, y: 6 }] },
        { shot: shot('parkLawn', [-2, 1.9, 2.6], [-1.2, 1.55, -1], [{ who: 'hero', p: [-1.2, 0, -1], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Yuri, the hunters had a truck. Animals in cages. They left toward the Harbor.', x: 6, y: 8 }] },
      ],
    }],
  },
  {
    id: 'act3.milesWarehouse', act: 'act3', type: 'panels', char: 'miles', env: { hour: 22, weather: 'overcast' },
    pages: [{
      panels: [
        { shot: shot('harborWarehouse', [4, 2.6, 6], [0, 3, -10], [{ who: 'hero', p: [0, 0, 0], yaw: 180 }], { fov: 46 }), caption: 'The Harbor. Kraven\'s men are loading the last of the cages.' },
        { shot: shot('harborWarehouse', [1.4, 1.8, 2.6], [0, 1.55, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'miles', text: 'Quiet. Quiet. Peter says the trick is not to be seen. I am basically a ninja.', x: 6, y: 8 }] },
      ],
    }],
  },
  { id: 'act3.milesStart', act: 'act3', type: 'start', char: 'miles', site: 'harborWarehouse', text: 'Sneak into the hunters\' yard at the Harbor.', env: { hour: 22, weather: 'overcast' } },
  {
    id: 'act3.milesStealth', act: 'act3', type: 'stealth', char: 'miles', site: 'harborWarehouse', text: 'Take down the hunters quietly and free the animals.', tutorial: ['takedown', 'venomBlast'], env: { hour: 22, weather: 'overcast' },
    guards: [
      { arch: 'brawler', route: route([-14, -10], [14, -10]) },
      { arch: 'gunner', route: route([14, 6], [14, -6]) },
      { arch: 'brawler', route: route([-12, 10], [6, 12]) },
      { arch: 'shield', route: route([0, 0], [-8, -4]) },
      { arch: 'gunner', route: route([-18, 0], [-18, 12]) },
    ],
    faction: 'kraven', reinforce: { faction: 'kraven', mix: ['brawler', 'brawler', 'jetpack'] },
  },
  {
    id: 'act3.milesFree', act: 'act3', type: 'panels', char: 'miles',
    pages: [{
      panels: [
        { shot: shot('harborWarehouse', [2.4, 2, 3.4], [0, 1.4, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 40 }), caption: 'One by one, the cages open.', balloons: [{ who: 'miles', text: 'Go on. Go home. Nobody hunts you tonight.', x: 46, y: 60 }], sfx: 'CLANK' },
      ],
    }],
  },
  { id: 'act3.sandStart', act: 'act3', type: 'start', site: 'shipyard', text: 'A sandstorm is tearing up the Harbor shipyard.', env: { hour: 14, weather: 'overcast' } },
  {
    id: 'act3.sandRadio', act: 'act3', type: 'radio',
    lines: [
      L('yuri', 'A man made of sand is robbing the shipyard payroll. My officers keep arresting a pile of sand.'),
      L('peter', 'Sand. Water. Fire hydrants. I love a plan with hydrants.'),
    ],
  },
  { id: 'act3.sandman', act: 'act3', type: 'boss', boss: 'sandman', site: 'shipyard', text: 'Stop Sandman. Water turns him to mud.', tutorial: ['hydrant', 'tank'], env: { hour: 14.2, weather: 'overcast' } },
  {
    id: 'act3.sandEnd', act: 'act3', type: 'broadcast',
    lines: [
      L('jameson', 'The shipyard is under two feet of mud and the spider calls that a win. I call it a lawsuit.'),
      L('jameson', 'Also, whoever borrowed my microphone last week: I want it back. And my chair.'),
    ],
  },
  { id: 'act3.uniStart', act: 'act3', type: 'start', site: 'uniFront', text: 'Dr. Connors asked to see you at Empire University.', env: { hour: 20, weather: 'rain' } },
  {
    id: 'act3.lab', act: 'act3', type: 'panels', env: { hour: 20.2, weather: 'rain' },
    pages: [{
      panels: [
        { shot: shot('uniFront', [3, 2.2, 4], [0, 1.4, 0], [{ who: 'connors', p: [0.8, 0, 0], yaw: 'mix:hero' }, { who: 'hero', p: [-0.8, 0, 0], yaw: 'mix:connors' }], { fov: 40 }), caption: 'Empire University. A sample from a meteor that fell last spring.', balloons: [{ who: 'connors', text: 'It is alive, Peter. It responds to touch. To mood. It has been restless for a week.', x: 46, y: 6 }] },
        { shot: shot('uniFront', [1.6, 1.4, 2.2], [-0.8, 1.4, 0], [{ who: 'hero', p: [-0.8, 0, 0], yaw: 'cam' }], { fov: 36 }), caption: 'The glass cracks. Something black runs up his arm.', sfx: 'SHLUCK' },
      ],
    }, {
      panels: [
        { shot: shot('uniFront', [0, 2.4, 3.2], [0, 1.4, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 40, suit: 'blackSuit' }), balloons: [{ who: 'peter', text: 'Whoa. Whoa. I feel... strong. Really strong.', x: 6, y: 8 }] },
        { shot: shot('uniFront', [1.4, 1.8, 2.6], [0, 1.55, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 34, suit: 'blackSuit' }), balloons: [{ who: 'peter', text: 'I should take it off. I should. In a minute.', x: 46, y: 60 }] },
      ],
    }],
  },
  {
    id: 'act3.blackSuit', act: 'act3', type: 'fight', suit: 'blackSuit', site: 'uniFront', text: 'Try the new suit on the crew outside.', tutorial: ['anger'],
    waves: [{ faction: 'sinister', mix: ['brawler', 'brawler', 'brute', 'gunner'] }, { faction: 'sinister', mix: ['shield', 'brawler', 'whip', 'rocket'] }],
  },
  {
    id: 'act3.mjFight', act: 'act3', type: 'panels', suit: 'blackSuit', env: { hour: 21.5, weather: 'rain' },
    pages: [{
      panels: [
        { shot: shot('bugleRoof', [0.8, 2.2, -5.2], [0, 1.4, 1.5], [{ who: 'mj', p: [1, 0, 0], yaw: 'mix:hero' }, { who: 'hero', p: [-1, 0, 0.2], yaw: 'mix:mj' }], { fov: 44 }), balloons: [{ who: 'mj', text: 'You put three men in the hospital tonight. That is not you.', x: 50, y: 6 }] },
        { shot: shot('bugleRoof', [-1.6, 1.85, -2.6], [-1, 1.6, 0.2], [{ who: 'hero', p: [-1, 0, 0.2], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'peter', text: 'Maybe this is me. Maybe I am tired of holding back.', x: 6, y: 8 }] },
        { shot: shot('bugleRoof', [2, 1.8, -2.4], [1, 1.6, 0], [{ who: 'mj', p: [1, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'mj', text: 'Then hold on to something else. The bells, at St. Bernard. You always said they hurt your ears.', x: 6, y: 58 }] },
      ],
    }],
  },
  { id: 'act3.bellStart', act: 'act3', type: 'start', suit: 'blackSuit', site: 'churchStreet', text: 'Go to the St. Bernard bell tower.', env: { hour: 23, weather: 'rain' } },
  { id: 'act3.bell', act: 'act3', type: 'reach', suit: 'blackSuit', site: 'bellTop', radius: 12, minY: -4, text: 'Climb the bell tower.', env: { hour: 23, weather: 'rain' } },
  {
    id: 'act3.bellPanels', act: 'act3', type: 'panels', env: { hour: 23.1, weather: 'rain' },
    pages: [{
      panels: [
        { shot: shot('bellTop', [3, 1.5, 4], [0, 1.6, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 42, suit: 'blackSuit' }), sfx: 'BONNNG', caption: 'The bell. The sound goes right through it.' },
        { shot: shot('bellTop', [0, 2, 4], [0, 1.4, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam' }], { fov: 40 }), balloons: [{ who: 'peter', text: 'Get. OFF. ME.', x: 50, y: 8 }] },
        { shot: shot('churchStreet', [4, 2, 6], [0, 1.6, 0], [{ who: 'venom', p: [0, 0, 0], yaw: 'cam' }], { fov: 44 }), caption: 'It falls. Below, someone is waiting for it.', balloons: [{ who: 'venom', text: 'We are Venom.', x: 46, y: 60 }] },
      ],
    }],
  },
  { id: 'act3.venomChase', act: 'act3', type: 'chase', boss: 'venom', site: 'churchStreet', text: 'Chase Venom across the rooftops.', env: { hour: 23.2, weather: 'rain' } },
  { id: 'act3.venom', act: 'act3', type: 'boss', boss: 'venom', site: 'churchRoof', text: 'Beat Venom. Ring the bell: yank the rope.', tutorial: ['bell'], env: { hour: 23.4, weather: 'rain' } },
  {
    id: 'act3.end', act: 'act3', type: 'panels', env: { hour: 6.5, weather: 'clear' },
    pages: [{
      panels: [
        { shot: shot('churchRoof', [3, 2.2, 4], [0, 1.2, 0], [{ who: 'hero', p: [0, 0, 0], yaw: 'cam', pose: 'perch' }], { fov: 42 }), caption: 'Dawn. The symbiote is in a sound-proof cell at the Raft. Eddie Brock is in the one next to it.' },
        { shot: shot('bugleRoof', [-2.5, 3.2, -4.5], [60, -12, 50], [{ who: 'hero', p: [-0.7, 0, 0], yaw: 45, pose: 'perch' }, { who: 'mj', p: [0.7, 0, 0.2], yaw: 40 }], { fov: 50 }), balloons: [{ who: 'mj', text: 'Welcome back.', x: 46, y: 8 }] },
        { shot: shot('oscorpFront', [70, 12, 140], [0, 170, 0], [], { fov: 46 }), caption: 'Under Oscorp, a man with four new arms is very nearly ready.', sfx: 'WHIRR' },
      ],
    }],
  },
  {
    id: 'act3.jameson', act: 'act3', type: 'broadcast',
    lines: [
      L('jameson', 'Spider-Man in a black suit, breaking bones! Spider-Man in the red suit again, saving a priest! Pick a colour, you menace!'),
    ],
  },
  { id: 'act3.done', act: 'act3', type: 'title', card: 'actEnd' },
];
