// Peter's life between the missions: mask off, at school, at the shelter, at the Bugle, with MJ.
// Each scene is a short run of steps spliced in AFTER an existing step id (spliceScenes below).
// `names` gives display names for the crowd ids (cast.js CROWD) a scene uses as speakers: the same
// crowd look can be a different person in another scene, so the names go on the lines themselves.
const L = (who, text) => ({ who, text });
const shot = (at, cam, look, cast = [], extra = {}) => ({ at, cam, look, cast, ...extra });

export const PETER_SCENES = [
  // ------------------------------------------------------------------ Prologue: late for class
  {
    after: 'prologue.jameson',
    names: { studentA: 'Dev', studentB: 'Priya', studentC: 'Marcus', studentD: 'Lena', prof: 'Professor Hollis' },
    steps: [
      {
        id: 'prologue.parkerCampus', act: 'prologue', type: 'panels', env: { hour: 9.8, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('uniFront', [-1, 1.7, 6.5], [-1.5, 1.2, 2.5], [{ who: 'studentA', p: [-2, 0, 2], yaw: 0, pose: 'Sit_Laugh', prop: 'bench' }, { who: 'studentB', p: [-1.3, 0, 2], yaw: 0, pose: 'Sit_Laugh', t: 0.4 }, { who: 'studentC', p: [1, 0, 1.5], yaw: 'cam', pose: 'Phone' }], { fov: 46 }), caption: 'Empire State University. Nine fifty in the morning. Peter Parker\'s nine o\'clock is well underway.' },
            { shot: shot('uniFront', [-7.5, 1.65, 5.6], [-9, 1.5, 3], [{ who: 'parker', p: [-9, 0, 3], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'Catch a crime lord at dawn, miss a lecture at nine. The Parker luck, in one morning.', x: 6, y: 8 }] },
          ],
        }],
      },
      {
        id: 'prologue.parkerCampusWalk', act: 'prologue', type: 'stroll', char: 'parker', site: 'uniFront', env: { hour: 10, weather: 'clear' },
        text: 'Walk the campus. Find Dr. Connors before he finds you.',
        spawn: [-11, 0, 3, 90],
        npcs: [
          { who: 'studentA', name: 'Dev', p: [-2, 0, 2], yaw: 0, clip: 'Sit_Laugh', prop: 'bench', talk: [
            L('studentA', 'Jameson says Spider-Man was at Fisk Tower. Says he is probably on the payroll.'),
            L('parker', 'Whose payroll? Fisk pays everyone except, apparently, Spider-Man.'),
            L('studentA', 'You defend that guy a lot for someone who sells his photos to Jameson.'),
            L('parker', 'I defend the photos. The photos are great.'),
          ] },
          { who: 'studentB', name: 'Priya', p: [-1.3, 0, 2], yaw: 0, clip: 'Sit_Talk', talk: [
            L('studentB', 'Parker! You missed Hollis. He did the whole lecture to your empty chair.'),
            L('parker', 'Was it good? Did my chair take notes?'),
            L('studentB', 'It got a B. Also, did you see the news? They got Fisk. At dawn!'),
            L('parker', 'Dawn. Wow. Some people are up at dawn. Wild.'),
          ] },
          { who: 'studentC', name: 'Marcus', p: [-5, 0, 5], yaw: 90, clip: 'Skateboarding' },
          { who: 'studentD', name: 'Lena', p: [1.5, 0, -1.5], yaw: 20, clip: 'Texting' },
          { who: 'prof', name: 'Professor Hollis', p: [8, 0, -1], yaw: 200, clip: 'Phone_Pace' },
          { who: 'connors', p: [4.5, 0, 1], yaw: 270, clip: 'Talk_Watercooler', talkClip: 'Talking', after: 'Idle_Look', talk: [
            L('connors', 'Peter. Nine o\'clock. Lab. We have talked about this.'),
            L('parker', 'The train, Dr. Connors. The train was, I want to say, hijacked.'),
            L('connors', 'The mice are fed, the serum batch is logged, and I did it all without my lab assistant.'),
            L('parker', 'That is a flex and a guilt trip in one sentence. I am learning so much here.'),
            L('connors', 'Good. Lab, noon. And eat something, you look like you fought a building.'),
          ] },
        ],
      },
      {
        id: 'prologue.parkerMjText', act: 'prologue', type: 'radio',
        lines: [
          L('mj', 'Text from MJ: Front page. My photo. Fisk in cuffs. Do not be jealous.'),
          L('parker', 'Not jealous. Proud. Mostly proud. Lunch?'),
          L('mj', 'Lunch. You buy. I got the front page, I get the sandwich.'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 1: the Bugle, after the Shocker
  {
    after: 'act1.shockerEnd',
    names: { workerA: 'Hector', workerB: 'Dana', vendor: 'Sal', elder: 'Walt' },
    steps: [
      {
        id: 'act1.parkerBugle', act: 'act1', type: 'panels', env: { hour: 15, weather: 'overcast' },
        pages: [{
          panels: [
            { shot: shot('bugleFront', [2.6, 1.8, 3.8], [0.6, 1.5, 0.2], [{ who: 'jameson', p: [0, 0, 0], yaw: 'cam', pose: 'Angry_Point' }, { who: 'robbie', p: [1.6, 0, 0.8], yaw: 'to:jameson' }], { fov: 42 }), caption: 'The Daily Bugle, an hour later. Jonah does his best work on the sidewalk.', balloons: [{ who: 'jameson', text: 'Parker! Tell me you got the spider wrecking that vault!', x: 6, y: 6 }] },
            { shot: shot('bugleFront', [-4.4, 1.65, 3.6], [-3, 1.5, 1.2], [{ who: 'parker', p: [-3, 0, 1.2], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'I got him stopping the guy wrecking the vault. Is that close?', x: 44, y: 60 }] },
          ],
        }],
      },
      {
        id: 'act1.parkerBugleWalk', act: 'act1', type: 'stroll', char: 'parker', site: 'bugleFront', env: { hour: 15.2, weather: 'overcast' },
        text: 'Deliver the Shocker photos. Survive Jonah.',
        spawn: [-10, 0, 3, 90],
        npcs: [
          { who: 'vendor', name: 'Sal', p: [-7, 0, 5.5], yaw: 340, clip: 'Idle_Breathing' },
          { who: 'workerA', name: 'Hector', p: [-4, 0, 1], yaw: 30, clip: 'Phone' },
          { who: 'jameson', p: [1, 0, 0], yaw: 270, clip: 'Angry_Point', talkClip: 'Arguing', after: 'Angry', talk: [
            L('jameson', 'Parker! Twelve photos and in every one the menace looks heroic. Do you do that on purpose?'),
            L('parker', 'I just point the camera, Mr. Jameson. He keeps standing in front of it.'),
            L('jameson', 'Crop him. Crop him out of the whole city. Robbie! Pay the kid half.'),
            L('parker', 'Half of what you usually pay is still a number I can live with, somehow.'),
          ] },
          { who: 'robbie', p: [4.5, 0, 1.5], yaw: 270, clip: 'Talking', after: 'Idle_Look', talk: [
            L('robbie', 'Full rate, Peter. He says half every week. Payroll stopped listening years ago.'),
            L('parker', 'Thanks, Robbie. Does he ever actually watch the footage?'),
            L('robbie', 'He watches the part where the vault blows. Then he writes the headline. Then the rest.'),
            L('robbie', 'Between us: those gloves. Nobody builds that in a garage. Somebody is paying for it.'),
            L('parker', 'Yeah. I was wondering about that too.'),
          ] },
          { who: 'workerB', name: 'Dana', p: [7.5, 0, 3.5], yaw: 250, clip: 'Drinking', need: false, talk: [
            L('workerB', 'Hey, Parker. Were you really on Exchange Street when the bank went? Like, right there?'),
            L('parker', 'Right there. Behind a very sturdy mailbox.'),
            L('workerB', 'Living the dream. I got a parking ticket today.'),
          ] },
          { who: 'elder', name: 'Walt', p: [10.5, 0, 4.5], yaw: 300, clip: 'Sit_Idle', prop: 'bench' },
        ],
      },
      {
        id: 'act1.parkerMjText', act: 'act1', type: 'radio',
        lines: [
          L('mj', 'Text from MJ: Roof. Now. Bring the other you. I have something on Oscorp.'),
          L('parker', 'The other me is on his way. The tired one is coming too.'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 2: F.E.A.S.T., the morning after the blackout
  {
    after: 'act2.milesEnd',
    names: { volunteerA: 'Rosa', volunteerB: 'Sam', kid: 'Theo', elder: 'Mr. Okafor' },
    steps: [
      {
        id: 'act2.parkerFeast', act: 'act2', type: 'panels', env: { hour: 9, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('shelter', [3.2, 2, 4.2], [-0.4, 1.4, 0.2], [{ who: 'may', p: [0, 0, 0], yaw: 'mix:parker' }, { who: 'parker', p: [-1.4, 0, 0.6], yaw: 'mix:may' }, { who: 'volunteerB', p: [3, 0, -2], yaw: 160, pose: 'Pick_Up' }], { fov: 42 }), caption: 'F.E.A.S.T., the morning after. The generator held. So did Aunt May.', balloons: [{ who: 'may', text: 'A new spider, Peter. Polite. Called me ma\'am twice. You should meet him.', x: 48, y: 6 }] },
            { shot: shot('shelter', [-2.6, 1.65, 3], [-1.4, 1.5, 0.6], [{ who: 'parker', p: [-1.4, 0, 0.6], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'I was across the river. I owe him one. I owe him like four.', x: 6, y: 8 }] },
          ],
        }],
      },
      {
        id: 'act2.parkerFeastWalk', act: 'act2', type: 'stroll', char: 'parker', site: 'shelter', env: { hour: 9.2, weather: 'clear' },
        text: 'Help clean up at the shelter. Talk to the volunteers, then find Aunt May.',
        spawn: [-10, 0, 4, 90],
        npcs: [
          { who: 'volunteerA', name: 'Rosa', p: [-3, 0, 1], yaw: 90, clip: 'Pick_Up', after: 'Helping_Out', talk: [
            L('volunteerA', 'Peter! Grab a box. We lost two windows and the soup pot survived, so, net win.'),
            L('parker', 'The pot is the heart of this place. Everyone knows it.'),
            L('volunteerA', 'That new spider kid stacked the chairs after. Stacked them! Who raised him?'),
            L('parker', 'Someone good, sounds like.'),
          ] },
          { who: 'volunteerB', name: 'Sam', p: [-1, 0, -2.5], yaw: 180, clip: 'Helping_Out' },
          { who: 'kid', name: 'Theo', p: [2, 0, 3], yaw: 0, clip: 'Gaming', prop: 'stool', need: false, talk: [
            L('kid', 'Were you here last night? The spider guy went like WHOOM and the bad guys went like aaaa.'),
            L('parker', 'Whoom. Got it. Very technical.'),
            L('kid', 'He glows. The other one does not glow. The other one is old.'),
            L('parker', 'Old. Sure. The other one is going to remember that.'),
          ] },
          { who: 'elder', name: 'Mr. Okafor', p: [5, 0, 1], yaw: 270, clip: 'Sit_Talk', prop: 'bench', need: false, talk: [
            L('elder', 'They cut the power to half of Harlem and nobody came but the kids in masks. Nobody.'),
            L('parker', 'The police were pinned at the station, sir. It was a bad night everywhere.'),
            L('elder', 'I know, son. I am old, not angry. Angry is for the morning. Now it is morning.'),
          ] },
          { who: 'may', p: [8.5, 0, 2.5], yaw: 270, clip: 'Talk_Watercooler', talkClip: 'Talking', after: 'Happy_Idle', talk: [
            L('may', 'There he is. Did you sleep? Do not answer, I can see it.'),
            L('parker', 'Four hours. In a row, mostly.'),
            L('may', 'The men were Oscorp security, Peter. Oscorp. Since when does a company want a soup kitchen generator?'),
            L('parker', 'Since last night, apparently. I am going to find out why.'),
            L('may', 'Find out after a sandwich. Rosa made the good kind.'),
          ] },
        ],
      },
      {
        id: 'act2.parkerBridgeCall', act: 'act2', type: 'radio',
        lines: [
          L('yuri', 'Spider-Man, if you are anywhere near a radio: Oscorp transport on the Queensway Bridge. It just stopped being a transport.'),
          L('peter', 'On my way. Just need a minute to, uh, change lenses.'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 2: the lab, before the Lizard
  {
    after: 'act2.mysterioEnd',
    names: { studentA: 'Dev', studentB: 'Priya', studentE: 'Marcus', studentF: 'Lena', prof: 'Professor Hollis' },
    steps: [
      {
        id: 'act2.parkerLab', act: 'act2', type: 'panels', env: { hour: 11, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('uniFront', [-1, 1.7, 7], [-2, 1.2, 3], [{ who: 'studentA', p: [-3, 0, 3], yaw: 0, pose: 'Sit_Laugh', prop: 'bench' }, { who: 'studentB', p: [-2.3, 0, 3], yaw: 0, pose: 'Sit_Talk' }, { who: 'studentF', p: [2, 0, 4.5], yaw: 'to:studentB', pose: 'Talking' }], { fov: 46 }), caption: 'Empire State University. Everyone saw the goldfish bowl. Nobody agrees on how big it was.' },
            { shot: shot('uniFront', [9.4, 1.8, 3.6], [7.2, 1.5, 0.4], [{ who: 'connors', p: [7, 0, 0], yaw: 'mix:parker' }, { who: 'parker', p: [5.6, 0, 0.8], yaw: 'mix:connors' }], { fov: 40 }), balloons: [{ who: 'connors', text: 'The regeneration serum, Peter. Third trial. The mice grew the limb back in a week.', x: 6, y: 6 }] },
            { shot: shot('uniFront', [4.6, 1.65, 3.2], [5.6, 1.5, 0.8], [{ who: 'parker', p: [5.6, 0, 0.8], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'A week. Doc, that is incredible. Why do you look like you have not slept?', x: 6, y: 60 }] },
          ],
        }],
      },
      {
        id: 'act2.parkerLabWalk', act: 'act2', type: 'stroll', char: 'parker', site: 'uniFront', env: { hour: 11.2, weather: 'clear' },
        text: 'Campus hour. Catch up with everyone, then check on Dr. Connors.',
        spawn: [-11, 0, 4, 90],
        npcs: [
          { who: 'prof', name: 'Professor Hollis', p: [-6.5, 0, 0], yaw: 90, clip: 'Phone_Pace' },
          { who: 'studentA', name: 'Dev', p: [-3, 0, 3], yaw: 0, clip: 'Sit_Laugh', prop: 'bench' },
          { who: 'studentB', name: 'Priya', p: [-2.3, 0, 3], yaw: 0, clip: 'Sit_Talk', talk: [
            L('studentB', 'Sixty feet tall. My cousin says more like a hundred. He was there. In a bar. Half a mile away.'),
            L('parker', 'Reliable. Did the cousin see the fishbowl?'),
            L('studentB', 'He says the fishbowl winked at him.'),
            L('parker', 'That is a quality witness. Jameson should hire him.'),
          ] },
          { who: 'studentE', name: 'Marcus', p: [0.5, 0, 5.5], yaw: 300, clip: 'Talk_Watercooler' },
          { who: 'studentF', name: 'Lena', p: [3, 0, 5], yaw: 240, clip: 'Talking', need: false, talk: [
            L('studentF', 'Peter, settle this. Electro, Scorpion, Mysterio. Who wins in a fight?'),
            L('parker', 'Spider-Man. He fought all three. In a month. He is very tired.'),
            L('studentF', 'Did not ask about Spider-Man. Marcus says Scorpion because of the tail.'),
            L('parker', 'Everyone says tail. Nobody respects the fishbowl.'),
          ] },
          { who: 'connors', p: [7, 0, 0], yaw: 270, clip: 'Head_Shake', talkClip: 'Talking', after: 'Idle_Look', talk: [
            L('connors', 'Peter. Good. Have you ever seen a cell wall heal itself? In real time?'),
            L('parker', 'I have seen a lab assistant heal a coffee machine. Doc, what happened to your sleeve?'),
            L('connors', 'Nothing. A spill. Listen. Someone offered to fund the whole programme. No strings. Oscorp money.'),
            L('parker', 'Oscorp money always has strings. They are just long and green.'),
            L('connors', 'I know what I am doing, Peter. For the first time in years I know exactly what I am doing.'),
          ] },
        ],
      },
      {
        id: 'act2.parkerLabEnd', act: 'act2', type: 'panels', env: { hour: 11.6, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('uniFront', [8.6, 1.7, 2.4], [7, 1.4, 0], [{ who: 'connors', p: [7, 0, 0], yaw: 'cam', pose: 'Sad_Idle' }], { fov: 36 }), caption: 'He does not. Under the sleeve, something is already scaling over.', captionPos: 'bottom' },
          ],
        }],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 3: an afternoon off in the park, with MJ
  {
    after: 'act3.sandEnd',
    names: { vendor: 'Sal', kid: 'Benny', elder: 'Walt', studentC: 'Marcus', studentF: 'Lena' },
    steps: [
      {
        id: 'act3.parkerPark', act: 'act3', type: 'panels', env: { hour: 16, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('parkLawn', [2.4, 1.8, 8.2], [3.6, 1.3, 4.5], [{ who: 'mj', p: [4, 0, 4], yaw: 0, pose: 'Sit_Talk', prop: 'bench' }, { who: 'parker', p: [2.6, 0, 5.2], yaw: 'to:mj', pose: 'Talking' }], { fov: 44 }), caption: 'Central Park. The lawn is open again. First afternoon off in a month.', balloons: [{ who: 'mj', text: 'A week ago a man hunted you across this lawn. Now we are having lunch on it.', x: 46, y: 6 }] },
            { shot: shot('parkLawn', [0.6, 1.65, 7.6], [2.6, 1.5, 5.2], [{ who: 'parker', p: [2.6, 0, 5.2], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'The lawn has moved on. I am trying to be like the lawn.', x: 6, y: 8 }] },
          ],
        }],
      },
      {
        id: 'act3.parkerParkWalk', act: 'act3', type: 'stroll', char: 'parker', site: 'parkLawn', env: { hour: 16.2, weather: 'clear' },
        text: 'An afternoon off. Walk the lawn, then sit with MJ.',
        spawn: [-6, 0, 8, 90],
        npcs: [
          { who: 'vendor', name: 'Sal', p: [-4, 0, -2], yaw: 120, clip: 'Idle_Look', need: false, talk: [
            L('vendor', 'Pretzel? Two for one. Business is bad since the hunting thing.'),
            L('parker', 'Two, then. For morale.'),
            L('vendor', 'You are the only guy who buys for morale. Everyone else buys for hunger.'),
          ] },
          { who: 'studentF', name: 'Lena', p: [-7.5, 0, 2], yaw: 90, clip: 'Writing', prop: 'bench' },
          { who: 'studentC', name: 'Marcus', p: [-6, 0, -7], yaw: 0, clip: 'Push_Up' },
          { who: 'kid', name: 'Benny', p: [3, 0, -6], yaw: 200, clip: 'Skateboarding' },
          { who: 'elder', name: 'Walt', p: [7, 0, -3], yaw: 300, clip: 'Sit_Idle', prop: 'bench', need: false, talk: [
            L('elder', 'You hear the radio this week? Sand man. Mud man. The whole shipyard.'),
            L('parker', 'I heard. Two feet of mud, Jameson said.'),
            L('elder', 'Took me back. The big flood when I was a boy, same depth. Nobody blamed a spider.'),
            L('parker', 'Different times, sir. Fewer spiders.'),
          ] },
          { who: 'mj', p: [4, 0, 4], yaw: 0, clip: 'Sit_Talk', prop: 'bench', talk: [
            L('mj', 'You are doing the thing where you check every treeline.'),
            L('parker', 'I am looking at the trees. Trees are nice. Tall. Full of nothing.'),
            L('mj', 'Kraven is at the Raft. The animals went home. The shipyard is mud, but it is quiet mud.'),
            L('parker', 'Then why do I feel like the next thing is already on its way?'),
            L('mj', 'Because it always is. Eat the pretzel, Peter. The next thing can wait for the pretzel.'),
          ] },
        ],
      },
      {
        id: 'act3.parkerConnorsCall', act: 'act3', type: 'radio',
        lines: [
          L('connors', 'Peter, it is Curt. Can you come by the lab tonight? Bring your, ah, colleague. The one with the webs.'),
          L('connors', 'Something arrived last spring and it has started moving.'),
          L('parker', 'My colleague. Right. He will be there.'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 3: Peter's own roof, the morning after Venom
  {
    after: 'act3.jameson',
    names: { elder: 'Mr. Delgado', kid: 'Omar' },
    steps: [
      {
        id: 'act3.parkerRoof', act: 'act3', type: 'panels', env: { hour: 8.5, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('peterRoof', [3.2, 1.7, 3.4], [3, 1.5, 0], [{ who: 'parker', p: [3, 0, 0], yaw: 'cam', pose: 'Arm_Stretch' }], { fov: 38 }), caption: 'Peter\'s building. The red suit is in the wash. The black one is in a cell.', balloons: [{ who: 'parker', text: 'Quiet. Actual quiet. I forgot it had a sound.', x: 6, y: 60 }] },
            { shot: shot('peterRoof', [5.8, 1.7, 4.2], [4.5, 1.5, 2], [{ who: 'elder', p: [4.5, 0, 2], yaw: 'cam', pose: 'Pointing' }], { fov: 38 }), balloons: [{ who: 'elder', text: 'Parker! You look terrible. Come hold this ladder.', x: 44, y: 6 }] },
          ],
        }],
      },
      {
        id: 'act3.parkerRoofWalk', act: 'act3', type: 'stroll', char: 'parker', site: 'peterRoof', env: { hour: 8.6, weather: 'clear' },
        text: 'A morning off. Say hello to the neighbours.',
        spawn: [1.2, 0, -2.5, 60],
        npcs: [
          { who: 'elder', name: 'Mr. Delgado', p: [4.5, 0, 2], yaw: 270, clip: 'Arm_Stretch', talkClip: 'Talking', after: 'Idle_Look', talk: [
            L('elder', 'Parker. You were out all week. Your plants nearly died. I watered them. You owe me a plant.'),
            L('parker', 'Thank you, Mr. Delgado. I was, uh, working nights.'),
            L('elder', 'Nights. Sure. Every time that spider fellow has a bad week, you look like a bad week.'),
            L('parker', 'Coincidence. I have the face for bad weeks. It is a known problem.'),
            L('elder', 'Hm. Water your plants.'),
          ] },
          { who: 'kid', name: 'Omar', p: [6, 0, -1.5], yaw: 300, clip: 'Gaming', prop: 'stool', need: false, talk: [
            L('kid', 'Mr. Parker! Did you see Venom? He was on the church! He had TEETH.'),
            L('parker', 'I saw pictures. Lots of teeth. Too many, honestly.'),
            L('kid', 'Spider-Man beat him with a bell. A BELL. I want a bell.'),
            L('parker', 'Everyone wants a bell until they have to carry it up the stairs.'),
          ] },
          { who: 'mj', p: [8, 0, 1.5], yaw: 270, clip: 'Drinking', talkClip: 'Talking', after: 'Happy_Idle', talk: [
            L('mj', 'I brought coffee. I brought two, in case the first one did not take.'),
            L('parker', 'MJ. About this week. About the things I said on the roof.'),
            L('mj', 'That was the suit talking. I know the difference. I have known you a long time.'),
            L('parker', 'I still said them.'),
            L('mj', 'And now you are saying this. Drink the coffee, Parker. The city is still standing. So are you.'),
          ] },
        ],
      },
      {
        id: 'act3.parkerMayCall', act: 'act3', type: 'radio',
        lines: [
          L('may', 'Peter, it is me. The shelter is fine, I am fine, I just wanted to hear you say you are fine.'),
          L('parker', 'I am fine, May. Better than fine. I am on my roof drinking coffee like a person.'),
          L('may', 'Good. Drink the whole thing. Then come get your laundry, it has been here a week.'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 4: the Bugle under curfew
  {
    after: 'act4.mid',
    names: { workerA: 'Hector', vendor: 'Sal' },
    steps: [
      {
        id: 'act4.parkerBugle', act: 'act4', type: 'panels', env: { hour: 14, weather: 'clear' },
        pages: [{
          panels: [
            { shot: shot('bugleFront', [2.2, 1.8, 4.6], [2.4, 1.5, 0.6], [{ who: 'jameson', p: [5, 0, 0], yaw: 'cam', pose: 'Angry_Point' }, { who: 'robbie', p: [8, 0, -1], yaw: 'to:jameson', pose: 'Lean_Wall' }, { who: 'yuri', p: [1, 0, 2], yaw: 'cam', pose: 'Phone' }], { fov: 48 }), caption: 'The Daily Bugle, under curfew. Half the staff cannot get past the checkpoints. Jonah can.', balloons: [{ who: 'jameson', text: 'Four down and the mayor hires an army. Where was the army when the vault blew?', x: 6, y: 6 }] },
            { shot: shot('bugleFront', [-6.4, 1.65, 3.6], [-5, 1.5, 1.2], [{ who: 'parker', p: [-5, 0, 1.2], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'I have the Exchange Street photos. Also a Sable guy took my lens cap.', x: 40, y: 60 }] },
          ],
        }],
      },
      {
        id: 'act4.parkerBugleWalk', act: 'act4', type: 'stroll', char: 'parker', site: 'bugleFront', env: { hour: 14.2, weather: 'clear' },
        text: 'Hand in the Rhino and Scorpion photos. Mind the checkpoints.',
        spawn: [-11, 0, 4, 90],
        npcs: [
          { who: 'cop', p: [-5, 0, 0], yaw: 90, clip: 'Bored', after: 'Idle_Look', need: false, talk: [
            L('cop', 'Press pass? Student card? Sable took my badge seriously for about a day.'),
            L('parker', 'Peter Parker, Bugle. Photos. Mostly of things exploding.'),
            L('cop', 'Good. Somebody should be shooting them. With a camera, I mean. Go on.'),
          ] },
          { who: 'workerA', name: 'Hector', p: [-2, 0, 5], yaw: 0, clip: 'Phone' },
          { who: 'yuri', p: [1, 0, 2], yaw: 200, clip: 'Phone_Pace', talkClip: 'Talking', after: 'Phone', talk: [
            L('yuri', 'You are Parker. The one who always has the picture.'),
            L('parker', 'Captain Watanabe. I get lucky. Right place, right time, a lot.'),
            L('yuri', 'Eight years of lucky. I ran the numbers once. I stopped, because I liked the answer.'),
            L('parker', 'That is the nicest way anyone has ever not said something.'),
            L('yuri', 'Sable has my precinct cuffed to its own desks. So tell your lucky friend something for me.'),
            L('yuri', 'Two of the Six are still out. And the man who armed them is still inside Oscorp.'),
          ] },
          { who: 'jameson', p: [5, 0, 0], yaw: 270, clip: 'Angry_Point', talkClip: 'Yelling', after: 'Angry', talk: [
            L('jameson', 'Parker! Rhino and Scorpion on Exchange Street and you give me the spider shaking hands with a cop?'),
            L('parker', 'He was helping her up. Rhino threw a bus. It is in the frame, behind the handshake.'),
            L('jameson', 'A BUS. Lead with the bus! The bus is the story! Robbie!'),
            L('parker', 'The bus is page one. Got it.'),
            L('jameson', 'And Parker. Off the record. The thing I said on the air. Where is he. Forget it.'),
            L('parker', 'Already forgotten, Mr. Jameson.'),
          ] },
          { who: 'robbie', p: [8, 0, -1], yaw: 240, clip: 'Lean_Wall', after: 'Lean_Wall', need: false, talk: [
            L('robbie', 'He asked where Spider-Man was. On air. In front of the whole city. He has not slept since.'),
            L('parker', 'Does he regret it?'),
            L('robbie', 'He regrets being heard. Different thing. Full rate, Peter. Bus on page one.'),
          ] },
          { who: 'vendor', name: 'Sal', p: [10.5, 0, 4], yaw: 270, clip: 'Idle_Breathing' },
        ],
      },
      {
        id: 'act4.parkerMjText', act: 'act4', type: 'radio',
        lines: [
          L('mj', 'Text from MJ: Neon Square. Tonight. A show nobody booked. Again. He really has one trick.'),
          L('parker', 'One trick and a fog machine. I will be there.'),
        ],
      },
    ],
  },

  // ------------------------------------------------------------------ Act 4: F.E.A.S.T., the evening before Oscorp
  {
    after: 'act4.milesDefend',
    names: { volunteerA: 'Rosa', volunteerB: 'Sam', kid: 'Theo', elder: 'Mr. Okafor' },
    steps: [
      {
        id: 'act4.parkerFeast', act: 'act4', type: 'panels', env: { hour: 19.5, weather: 'overcast' },
        pages: [{
          panels: [
            { shot: shot('shelter', [3.2, 2, 4.2], [-0.4, 1.4, 0.2], [{ who: 'may', p: [0, 0, 0], yaw: 'mix:parker' }, { who: 'parker', p: [-1.4, 0, 0.6], yaw: 'mix:may' }, { who: 'volunteerB', p: [3, 0, -1.5], yaw: 200, pose: 'Sit_Rub_Arm', prop: 'chair' }], { fov: 42 }), caption: 'F.E.A.S.T., evening. Sable came to close the doors. The doors are still open.', balloons: [{ who: 'may', text: 'Your friend held the line by himself. I made him sit down after. He fell asleep in the chair.', x: 46, y: 6 }] },
            { shot: shot('shelter', [-2.6, 1.65, 3], [-1.4, 1.5, 0.6], [{ who: 'parker', p: [-1.4, 0, 0.6], yaw: 'cam' }], { fov: 36 }), balloons: [{ who: 'parker', text: 'He is a good kid. I keep saying it like it is a surprise. It is not a surprise.', x: 6, y: 8 }] },
          ],
        }],
      },
      {
        id: 'act4.parkerFeastWalk', act: 'act4', type: 'stroll', char: 'parker', site: 'shelter', env: { hour: 19.6, weather: 'overcast' },
        text: 'One last evening at the shelter. Say what you came to say.',
        spawn: [-2, 0, 5.5, 90],
        npcs: [
          { who: 'volunteerB', name: 'Sam', p: [-3, 0, 0], yaw: 90, clip: 'Sit_Rub_Arm', prop: 'chair', need: false, talk: [
            L('volunteerB', 'Took a shield to the shoulder. Worth it. They did not get the generator.'),
            L('parker', 'Sam, you are a volunteer. You are allowed to run.'),
            L('volunteerB', 'From a soup kitchen? Peter. Where would I even run to. This is the place you run to.'),
          ] },
          { who: 'volunteerA', name: 'Rosa', p: [0, 0, -2.5], yaw: 160, clip: 'Sit_Dazed', prop: 'chair' },
          { who: 'kid', name: 'Theo', p: [2.5, 0, 3.5], yaw: 330, clip: 'Sit_Idle', prop: 'stool', need: false, talk: [
            L('kid', 'Is the glowing one coming back? He said he would come back.'),
            L('parker', 'He will. He keeps his word. It is kind of his whole thing.'),
            L('kid', 'Is the old one coming back too?'),
            L('parker', 'The old one is standing right... the old one is also coming back, yes.'),
          ] },
          { who: 'elder', name: 'Mr. Okafor', p: [5.5, 0, 0], yaw: 270, clip: 'Sit_Talk', prop: 'bench' },
          { who: 'may', p: [8.5, 0, 2], yaw: 270, clip: 'Happy_Idle', talkClip: 'Talking', after: 'Happy_Idle', talk: [
            L('may', 'You have the look. The one where you are about to say you have to go.'),
            L('parker', 'I have to go.'),
            L('may', 'I know. Oscorp is on every channel. That man with the arms.'),
            L('parker', 'May. If tonight goes sideways. The things I never got around to telling you.'),
            L('may', 'Peter. I have washed that suit. I have washed it for eight years. I know.'),
            L('parker', 'You... know.'),
            L('may', 'I know. Go. Come back. There is soup either way.'),
          ] },
        ],
      },
      {
        id: 'act4.parkerOckCall', act: 'act4', type: 'radio',
        lines: [
          L('yuri', 'Spider-Man. Oscorp Tower. He is climbing it. With the arms.'),
          L('peter', 'On my way. Keep your people off the tower. Especially the top.'),
        ],
      },
    ],
  },
];

// Puts each scene's steps into the story after its step, naming the crowd speakers on their lines
// and balloons (the radio panel and the comic show line.name before the speaker table).
// The scenes were laid out against a landmark's street-front spot; these move them where people
// can stand: the university's quad, and onto the sidewalks of the Bugle and the shelter (the depth
// squeezed to fit the sidewalk; the shelter's mirrored, its building being on the other side).
const REMAP = {
  uniFront: { site: 'uniQuad', sz: 1, flip: false },
  bugleFront: { site: 'bugleWalk', sz: 0.5, flip: false },
  shelter: { site: 'shelterWalk', sz: 0.5, flip: true },
};
const moveP = (r, p) => (r && p ? [p[0], p[1], p[2] * r.sz * (r.flip ? -1 : 1), ...p.slice(3)] : p);
const moveDecor = (r, d) => (d ? d.map((q) => ({ ...q, ...(q.from ? { from: moveP(r, q.from), to: moveP(r, q.to) } : {}), ...(q.p ? { p: moveP(r, q.p) } : {}) })) : d);
const moveYaw = (r, y) => (r && r.flip && typeof y === 'number' ? 180 - y : y);
function relocate(st) {
  const r = REMAP[st.site];
  const s2 = { ...st };
  if (r) {
    s2.site = r.site;
    if (st.spawn) s2.spawn = [st.spawn[0], st.spawn[1], st.spawn[2] * r.sz * (r.flip ? -1 : 1), moveYaw(r, st.spawn[3])];
    if (st.npcs) s2.npcs = st.npcs.map((n) => ({ ...n, p: moveP(r, n.p), yaw: moveYaw(r, n.yaw) }));
    if (st.decor) s2.decor = moveDecor(r, st.decor);
  }
  // Panels carry their decor at the step (the site of their first shot decides the move).
  if (!r && st.decor && st.pages) { const rr = REMAP[st.pages[0].panels[0].shot.at]; if (rr) s2.decor = moveDecor(rr, st.decor); }
  if (st.pages) {
    s2.pages = st.pages.map((pg) => ({ ...pg, panels: pg.panels.map((pn) => {
      const rr = REMAP[pn.shot.at];
      if (!rr) return pn;
      return { ...pn, shot: { ...pn.shot, at: rr.site, cam: moveP(rr, pn.shot.cam), look: moveP(rr, pn.shot.look), cast: pn.shot.cast.map((c) => ({ ...c, p: moveP(rr, c.p), yaw: moveYaw(rr, c.yaw) })) } };
    }) }));
  }
  return s2;
}

export function spliceScenes(steps, scenes = PETER_SCENES) {
  const out = [...steps];
  for (const sc of scenes) {
    const i = out.findIndex((s) => s.id === sc.after);
    if (i < 0) continue;
    const named = (l) => (sc.names?.[l.who] ? { ...l, name: sc.names[l.who] } : l);
    const add = sc.steps.map(relocate).map((st) => ({
      ...st,
      ...(st.lines ? { lines: st.lines.map(named) } : {}),
      ...(st.npcs ? { npcs: st.npcs.map((n) => ({ ...n, ...(n.talk ? { talk: n.talk.map(named) } : {}) })) } : {}),
      ...(st.pages ? { pages: st.pages.map((pg) => ({ ...pg, panels: pg.panels.map((pn) => ({ ...pn, ...(pn.balloons ? { balloons: pn.balloons.map(named) } : {}) })) })) } : {}),
    }));
    out.splice(i + 1, 0, ...add);
  }
  return out;
}
