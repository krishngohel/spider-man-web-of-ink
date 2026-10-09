// The finale (written for the game): the block party at F.E.A.S.T. a week after the last fight, a
// last walk among everyone, and the roof at dusk before the credits. The string lights and the
// grill are set dressing (stroll.js decor and props).
// Finale: the block party at F.E.A.S.T., a week after the bridge. Spliced after Jameson's last
// broadcast, before the credits: one page to set the party, a stroll through everyone, two panels
// on the roof with MJ. Same format as a PETER_SCENES entry (acts/peter.js).
const L = (who, text) => ({ who, text });
const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });

export const FINALE = {
  after: 'act4.jameson',
  names: { kid: 'Theo', elder: 'Mr. Okafor', studentA: 'Dev', studentB: 'Priya', volunteerA: 'Rosa', volunteerB: 'Sam', vendor: 'Sal' },
  steps: [
    {
      id: 'act4.party', act: 'act4', type: 'panels', decor: [{ kind: 'lights', from: [-13, 3.4, -2.8], to: [13, 3.4, -2.8] }, { kind: 'lights', from: [-13, 3.7, 1.2], to: [13, 3.7, 1.2] }, { kind: 'lights', from: [-13, 3.3, 4.8], to: [13, 3.3, 4.8] }],  env: { hour: 19, weather: 'clear' },
      pages: [{
        panels: [
          { shot: shot('shelter', [-4, 2.4, 8], [-5, 1.3, 1.5], [{ who: 'vendor', p: [-9, 0, -1], yaw: 'cam', pose: 'Helping_Out', prop: 'grill' }, { who: 'kid', p: [-6, 0, 3], yaw: 'cam', pose: 'Emote_Excited' }, { who: 'studentA', p: [-3, 0, 4.5], yaw: 180, pose: 'Emote_Dance' }, { who: 'studentB', p: [-1.8, 0, 4.5], yaw: 180, pose: 'Running_Man', t: 0.3 }], { fov: 50 }), caption: 'F.E.A.S.T., a week later. The windows are back in. Somebody found string lights. Somebody else found a grill.' },
          { shot: shot('shelter', [8.5, 1.9, 5], [10.8, 1.4, 1.8], [{ who: 'may', p: [11.5, 0, 1.5], yaw: 'mix:parker', pose: 'Happy_Idle', prop: 'table' }, { who: 'parker', p: [10, 0, 2.2], yaw: 'mix:may' }], { fov: 42 }), balloons: [{ who: 'may', text: 'A week of quiet and the whole block turned up. Take a plate before Theo takes them all.', x: 46, y: 6 }] },
          { shot: shot('shelter', [8.6, 1.65, 4.2], [10, 1.5, 2.2], [{ who: 'parker', p: [10, 0, 2.2], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'Seven days with nothing on fire. I am starting to learn what that sounds like.', x: 6, y: 8 }] },
        ],
      }],
    },
    {
      id: 'act4.partyWalk', act: 'act4', type: 'stroll', cine: 'party', decor: [{ kind: 'lights', from: [-13, 3.4, -2.8], to: [13, 3.4, -2.8] }, { kind: 'lights', from: [-13, 3.7, 1.2], to: [13, 3.7, 1.2] }, { kind: 'lights', from: [-13, 3.3, 4.8], to: [13, 3.3, 4.8] }],  char: 'parker', site: 'shelter', env: { hour: 19.2, weather: 'clear' },
      text: 'The block party. Make the rounds. Aunt May is holding a plate for you.',
      spawn: [-12, 0, 4, 90],
      npcs: [
        { who: 'vendor', name: 'Sal', p: [-9, 0, -1], yaw: 150, clip: 'Helping_Out', prop: 'grill' },
        { who: 'volunteerB', name: 'Sam', p: [-4, 0, -1.5], yaw: 60, clip: 'Emote_Clap' },
        { who: 'kid', name: 'Theo', p: [-2.5, 0, 2.5], yaw: 200, clip: 'Silly_Dance', after: 'Silly_Dance', need: false, talk: [
          L('kid', 'Mr. Parker! The glowing one is HERE. He came in the suit. He let me hold the mask.'),
          L('parker', 'He let you hold the mask. Did you check if it was clean?'),
          L('kid', 'It smelled like a bus. Is the old one coming?'),
          L('parker', 'The old one is here. He is just blending in. Very well. Go eat a hot dog.'),
        ] },
        { who: 'studentA', name: 'Dev', p: [-3, 0, 4.5], yaw: 180, clip: 'Emote_Dance' },
        { who: 'studentB', name: 'Priya', p: [-1.8, 0, 4.5], yaw: 180, clip: 'Running_Man' },
        { who: 'volunteerA', name: 'Rosa', p: [0.6, 0, -2], yaw: 0, clip: 'Sit_Laugh', prop: 'bench' },
        { who: 'elder', name: 'Mr. Okafor', p: [1.3, 0, -2], yaw: 0, clip: 'Sit_Talk', need: false, talk: [
          L('elder', 'A week of quiet. A whole week. I counted, son. I did not trust it until Tuesday.'),
          L('parker', 'Tuesday is fair. I gave it until Wednesday.'),
          L('elder', 'Angry is for the morning. Tonight I am being old on a bench, and the bench is good.'),
          L('parker', 'Best seat on the block, sir.'),
        ] },
        { who: 'robbie', p: [4, 0, 4], yaw: 240, clip: 'Drinking', talkClip: 'Talking', after: 'Happy_Idle', need: false, talk: [
          L('robbie', 'Peter. He came. I told him there would be press. There is no press. I am the press.'),
          L('parker', 'Robbie, does he know this is a soup kitchen?'),
          L('robbie', 'He knows. He brought a cheque. He made me carry it so nobody would see him hand it over.'),
          L('robbie', 'Full rate for the bridge photos, by the way. He said half. Payroll laughed.'),
        ] },
        { who: 'jameson', p: [5.5, 0, 4.5], yaw: 250, clip: 'Bored', talkClip: 'Arguing', after: 'Bored', need: false, talk: [
          L('jameson', 'Parker. Not a word. I am here for the hot dogs. Robertson said there would be hot dogs.'),
          L('parker', 'There are hot dogs, Mr. Jameson. Sal is on the grill.'),
          L('jameson', 'The bus photo sold out the morning edition. Twice. I am not saying the spider sells papers.'),
          L('parker', 'You are just saying out loud that twice is a number.'),
          L('jameson', 'If the wall-crawler turns up tonight, you tell him the thank you was a one time offer.'),
          L('parker', 'He heard it the first time, sir. I think he is still not over it.'),
        ] },
        { who: 'yuri', p: [7, 0, 0], yaw: 270, clip: 'Drinking', talkClip: 'Talking', after: 'Idle_Look', need: false, talk: [
          L('yuri', 'Parker. Off duty. First night in a month. I do not know what to do with my hands.'),
          L('parker', 'Captain. Most people hold a drink. You seem to have figured that out.'),
          L('yuri', 'Sable is gone. The Raft has new locks. I am told your lucky friend checked them personally.'),
          L('parker', 'He is thorough. Also unemployed, so he has the time.'),
          L('yuri', 'Tell him the precinct has a bench with his name on it. Figure of speech. He is not to sit on it.'),
        ] },
        { who: 'miles', p: [9, 0, 3], yaw: 270, clip: 'Happy_Idle', talkClip: 'Talking', after: 'Happy_Idle', need: true, talk: [
          L('miles', 'Came straight from patrol. May took one look and said masks off at her table. So. Hi.'),
          L('parker', 'House rules. She has had them a long time. Longer than you would think.'),
          L('miles', 'Theo asked if I know the old one. I said we text. He wants to know why the old one never texts him.'),
          L('parker', 'Tell him the old one is bad at phones. Miles. The checkpoint. The shelter. The chairs. Thank you.'),
          L('miles', 'You were busy with a tower. Somebody had to do the easy stuff.'),
          L('parker', 'None of it was easy. That is the part nobody tells you. You did it anyway.'),
        ] },
        { who: 'mj', p: [10.5, 0, -1], yaw: 300, clip: 'Idle_Look', talkClip: 'Talking', after: 'Happy_Idle', need: true, talk: [
          L('mj', 'There he is. I watched you circle this block twice before you came in. In your own clothes.'),
          L('parker', 'Old habits. I was checking the treelines. There are no trees. I checked anyway.'),
          L('mj', 'A week ago you webbed me out of the East River. Tonight you are holding a paper plate. I prefer this.'),
          L('parker', 'The plate is a lot. I am managing. How is the piece coming?'),
          L('mj', 'Front page, tomorrow. Osborn, every bolt. Your photo. Do not be jealous.'),
          L('parker', 'Proud. Mostly proud. Roof after this?'),
          L('mj', 'Roof after this. The next thing can wait for the hot dog.'),
        ] },
        { who: 'may', p: [11.5, 0, 1.5], yaw: 270, clip: 'Happy_Idle', prop: 'table', talkClip: 'Talking', after: 'Happy_Idle', need: true, talk: [
          L('may', 'Peter. Did you eat? Do not answer, I can see it. Take the plate.'),
          L('parker', 'May. Everyone came. The whole block.'),
          L('may', 'They came for the soup. They stayed because for eight years the doors have always been open.'),
          L('parker', 'The doors held because of you.'),
          L('may', 'The doors held because of everyone in this yard. Some of them wear pyjamas to work. Eat.'),
          L('parker', 'Yes, ma\'am.'),
          L('may', 'Next week, bring the other you. The one who never uses the front door. There is soup either way.'),
        ] },
      ],
    },
    {
      id: 'act4.partyEnd', act: 'act4', type: 'panels', env: { hour: 20.5, weather: 'clear' },
      pages: [{
        panels: [
          { shot: shot('bugleRoof', [-2.5, 3.2, -4.5], [60, -12, 50], [{ who: 'parker', p: [-0.7, 0, 0], yaw: 45 }, { who: 'mj', p: [0.7, 0, 0.2], yaw: 40 }], { fov: 50 }), caption: 'The roof above the shelter, dusk. The party goes on underneath. The city goes on past it.', balloons: [{ who: 'mj', text: 'Jonah thanked Spider-Man on the air. Theo thanked Peter for the plate. Same guy. Nobody noticed.', x: 6, y: 58 }] },
          { shot: shot('bugleRoof', [-1.4, 1.85, -2.6], [-0.7, 1.6, 0], [{ who: 'parker', p: [-0.7, 0, 0], yaw: 'cam' }], { fov: 34 }), balloons: [{ who: 'parker', text: 'Let them. Spider-Man keeps this city. Peter Parker gets to live in it. It has room for both of us.', x: 6, y: 8 }], caption: 'Same time tomorrow.', captionPos: 'bottom' },
        ],
      }],
    },
  ],
};
