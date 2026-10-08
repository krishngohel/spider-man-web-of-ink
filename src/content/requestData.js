// Neighborhood requests: free-roam favours for everyday New Yorkers. A giver flags Spider-Man
// down, he does one short task (a gang beat-down or a rooftop fetch), comes back, gets thanked.
// Speaker 'giver' is the requester (the game substitutes `name`); 'peter' is Spider-Man in the suit.
const L = (who, text) => ({ who, text });

export const REQUESTS = [
  {
    id: 'rq01', district: 'hells', giver: 'vendor', name: 'Teo Alcantara', clip: 'Angry',
    title: 'Teo and the Flipped Cart',
    ask: [
      L('giver', 'Spider-Man! Those guys on the corner tipped my cart. Twelve years I have run that cart.'),
      L('peter', 'Twelve years and the onions still made it? That is a quality cart.'),
      L('giver', 'They said it was a toll. A toll! For a sidewalk! Then they took the cash box.'),
      L('peter', 'A sidewalk toll. Bold. Sit tight, Teo. I am going to go pay it back.'),
    ],
    task: { kind: 'gang', faction: 'street', mix: ['brawler', 'brawler', 'gunner'], text: 'Get the cash box back from the crew on the corner.' },
    thanks: [
      L('giver', 'You got it! All of it. Even the quarters. Nobody brings back the quarters.'),
      L('peter', 'The quarters are the heart of the cart. Everyone knows this.'),
      L('giver', 'Free hot dog for life. For you and the suit. The suit eats too, right?'),
      L('peter', 'The suit eats the most, honestly. Thanks, Teo. Keep the onions coming.'),
    ],
  },
  {
    id: 'rq02', district: 'harlem', giver: 'elder', name: 'Mrs. Odette Baptiste', clip: 'Kneel_Idle',
    title: 'Mrs. Baptiste and the Rooftop Cat',
    ask: [
      L('giver', 'Young man. The one with the webs. My Pepper is up on that roof and she will not come down.'),
      L('peter', 'Pepper. Grey tabby, judging me from the ledge? Yeah, I see her.'),
      L('giver', 'She was my Henri\'s cat. He could always call her down. I do not have his whistle.'),
      L('peter', 'Then I will go up and ask her nicely. Cats love me. Mostly. Sometimes.'),
    ],
    task: { kind: 'fetch', item: 'cat', text: 'Bring Pepper down from the roof.', found: 'Got you, Pepper. Claws in. Claws IN. Okay, we are going down anyway.' },
    thanks: [
      L('giver', 'Pepper! Look at you. Look at her, she is pretending she was never scared.'),
      L('peter', 'Cats are great at that. I am learning from her, honestly.'),
      L('giver', 'Henri would have liked you. He said the city needed someone who climbs. Thank you, child.'),
      L('peter', 'Any time, Mrs. Baptiste. Tell Pepper the roof is still there if she needs it.'),
    ],
  },
  {
    id: 'rq03', district: 'midtown', giver: 'studentB', name: 'Imani', clip: 'Phone_Pace',
    title: 'Imani and the Bugle Lunch Run',
    ask: [
      L('giver', 'Oh thank goodness. Spider-Man. I am a Bugle intern and a guy on a scooter just grabbed my bag.'),
      L('peter', 'And threw it up there? Why is it up there?'),
      L('giver', 'He saw the Bugle lanyard and panicked, I think. My press pass is in it. And Mr. Jameson\'s lunch.'),
      L('peter', 'Jameson\'s lunch. So if I do not get it, he blames me on air. Great. Going up.'),
    ],
    task: { kind: 'fetch', item: 'bag', text: 'Fetch Imani\'s bag from the roof before the pastrami goes bad.', found: 'Pass, phone, sandwich. The sandwich is a little flat. Jameson will cope.' },
    thanks: [
      L('giver', 'You are a lifesaver. Day three of the internship and I almost lost the pass.'),
      L('peter', 'Day three? Keep going. Robbie is the one you listen to. Jonah is the weather.'),
      L('giver', 'I am going to pretend you did not say that, and also remember it forever.'),
    ],
  },
  {
    id: 'rq04', district: 'chinatown', giver: 'studentE', name: 'Wen Tao', clip: 'Arguing',
    title: 'Wen and the Noodle Shop Shakedown',
    ask: [
      L('giver', 'Spider-Man, please. Men in suits are in my grandmother\'s noodle shop. They want protection money.'),
      L('peter', 'Suits. Fisk\'s people never got the memo that the boss is away.'),
      L('giver', 'She is eighty one. She hit one with a ladle. He laughed. I think he is going to stop laughing.'),
      L('peter', 'He is. Keep her behind the counter. I will handle the suits.'),
    ],
    task: { kind: 'gang', faction: 'kingpin', mix: ['brawler', 'shield', 'brawler', 'gunner'], text: 'Clear the collectors out of the noodle shop.' },
    thanks: [
      L('giver', 'She watched the whole thing from the window. She says your form is sloppy but your heart is good.'),
      L('peter', 'I will take that. That is the nicest review I have had this year.'),
      L('giver', 'She also says you eat here now. That is not an offer. It is a rule.'),
      L('peter', 'Understood. I know better than to argue with a ladle.'),
    ],
  },
  {
    id: 'rq05', district: 'upper', giver: 'prof', name: 'Dr. Ambrose Vail', clip: 'Pointing',
    title: 'Dr. Vail and the Mutinous Drone',
    ask: [
      L('giver', 'You there. Spider-Man. My drone has landed itself on that roof and refuses my commands.'),
      L('peter', 'Refuses? Like, it is sulking?'),
      L('giver', 'It is a prototype. It has opinions. I may have given it too many opinions.'),
      L('peter', 'Doc, I have met people who build things with opinions. Never ends well. I will grab it.'),
    ],
    task: { kind: 'fetch', item: 'drone', text: 'Recover Dr. Vail\'s drone from the rooftop.', found: 'Got it. It is beeping at me. I think it is swearing in binary.' },
    thanks: [
      L('giver', 'Ah. She flew up there to get a better look at you, I think. She logs everything.'),
      L('peter', 'She? Great. So now a drone has a crush on me. Add it to the list.'),
      L('giver', 'I will cut the fan behaviour. Probably. Thank you. Science owes you a small debt.'),
      L('peter', 'Science can pay me back in not building things that fly off on their own.'),
    ],
  },
  {
    id: 'rq06', district: 'neon', giver: 'studentF', name: 'Jules', clip: 'Sad_Idle',
    title: 'Jules and the Performance Fee',
    ask: [
      L('giver', 'Hey. Spider-Man. Nice to meet you. Terrible day. Some guys just took my guitar.'),
      L('peter', 'Took it how? Like, borrowed it for a song?'),
      L('giver', 'Said busking the square costs a fee. Took the case, the tips, the guitar. Left me the strap.'),
      L('peter', 'They left you the strap. Classy. Wait here, Jules. I am going to go renegotiate.'),
    ],
    task: { kind: 'gang', faction: 'maggia', mix: ['brawler', 'whip', 'gunner', 'brawler', 'jetpack'], text: 'Get Jules\'s guitar back from the Maggia crew in the square.' },
    thanks: [
      L('giver', 'That is her! One string gone but she is okay. Thank you. Seriously. This is my rent.'),
      L('peter', 'Rent. Yeah. I know that one. Play something, then. For the square.'),
      L('giver', 'What do you want to hear?'),
      L('peter', 'Anything that is not a Jameson jingle. Surprise me.'),
    ],
  },
  {
    id: 'rq07', district: 'financial', giver: 'workerA', name: 'Desmond', clip: 'Terrified',
    title: 'Desmond and the Rooftop Ring',
    ask: [
      L('giver', 'Spider-Man. Oh no. Okay. Okay. I need you to not laugh. The ring box is on that roof.'),
      L('peter', 'The ring box. Like, THE ring box?'),
      L('giver', 'I was proposing at lunch. A pigeon hit my hand. The box went up. It did not come down.'),
      L('peter', 'A pigeon. I am not laughing. I am going up. Hold the question, Desmond.'),
    ],
    task: { kind: 'fetch', item: 'box', text: 'Get the ring box down before Desmond\'s lunch break ends.', found: 'Got it. Ring is in. Pigeon is not. Everybody wins.' },
    thanks: [
      L('giver', 'You are the actual best. She is still at the table. She thinks I went to the bathroom.'),
      L('peter', 'Then go. Go now. And Desmond. Hold the box with both hands this time.'),
      L('giver', 'Both hands. Got it. If she says yes, you are at the wedding.'),
      L('peter', 'I will be the one on the ceiling.'),
    ],
  },
  {
    id: 'rq08', district: 'harbor', giver: 'elder', name: 'Sully Brennan', clip: 'Yelling',
    title: 'Sully and the Pier Dogs',
    ask: [
      L('giver', 'Hey! Webs! Over here. Fellas in hunting gear are netting the strays down on pier nine.'),
      L('peter', 'Hunting gear. On a pier. Sure, why not, that is the kind of week it is.'),
      L('giver', 'Those dogs are ours. Forty years I have worked this dock, those dogs have had my lunch for thirty.'),
      L('peter', 'Then nobody takes them without asking the dock first. Keep your head down, Sully.'),
    ],
    task: { kind: 'gang', faction: 'kraven', mix: ['brawler', 'whip', 'gunner', 'brawler'], text: 'Run the hunters off pier nine and free the dogs.' },
    thanks: [
      L('giver', 'They are out! Every one. The big one already stole a sandwich. Good boy.'),
      L('peter', 'A dog that robs you on sight. That is a true New Yorker.'),
      L('giver', 'You want a dog? I got nine. Ten if the brown one keeps coming back.'),
      L('peter', 'My landlord would kill me. Then my aunt would kill him. Then I would still want the dog.'),
    ],
  },
  {
    id: 'rq09', district: 'park', giver: 'kid', name: 'Nico', clip: 'Crying',
    title: 'Nico and the Runaway Kite',
    ask: [
      L('giver', 'Spider-Man! My kite went over the wall onto the building. My mom made it. It took a whole week.'),
      L('peter', 'A whole week? That is not a kite, that is a project. What is on it?'),
      L('giver', 'A spider. You. But with bigger eyes.'),
      L('peter', 'Bigger eyes. Okay. I need to see this. Stay with the bench. I will be right back.'),
    ],
    task: { kind: 'fetch', item: 'kite', text: 'Bring Nico\'s kite down from the rooftop.', found: 'Found it. The eyes are HUGE. I look so worried. I love it.' },
    thanks: [
      L('giver', 'You got it! Is it broken? It is not broken! Can you sign it?'),
      L('peter', 'With what? I do not carry pens. I carry webs. Here. A web on the tail. Lasts an hour.'),
      L('giver', 'An hour is forever. Thank you Spider-Man with normal eyes.'),
      L('peter', 'Normal eyes. The nicest thing anyone has said to me in the park.'),
    ],
  },
  {
    id: 'rq10', district: 'queens', giver: 'volunteerA', name: 'Ngozi', clip: 'Lean_Wall',
    title: 'Ngozi and the Birthday Balloon',
    ask: [
      L('giver', 'Spider-Man. I have been on a twelve hour shift and my son\'s birthday balloon is on that roof.'),
      L('peter', 'Twelve hours. You are the hero here. Which roof?'),
      L('giver', 'The one with the water tower. He turned six. He let go to wave at you, by the way.'),
      L('peter', 'So this is my fault. Understood. Going up.'),
    ],
    task: { kind: 'fetch', item: 'balloon', text: 'Fetch the birthday balloon from the water tower roof.', found: 'Got it. It says SIX. Six is a great age. You get to pick the pizza.' },
    thanks: [
      L('giver', 'He is going to lose his mind. The balloon AND the spider. You just saved a birthday.'),
      L('peter', 'Birthdays are important. I grew up around here. Tell him the nurse mom is the real hero.'),
      L('giver', 'I will tell him you said hi. Now I am going to sleep for nine hours.'),
      L('peter', 'Earned. Go. Happy birthday to the kid.'),
    ],
  },
  {
    id: 'rq11', district: 'queens', giver: 'vendor', name: 'Rafi', clip: 'Disappointed',
    title: 'Rafi and the Pizza Bike',
    ask: [
      L('giver', 'Spider-Man. Hey. They took my bike. My delivery bike. With four pies still on the back.'),
      L('peter', 'Four pies? What kind?'),
      L('giver', 'Two plain, one sausage, one with pineapple, and no I do not judge, the customer pays.'),
      L('peter', 'The pineapple is the real crime, but okay. Where did they go?'),
      L('giver', 'Under the train tracks. Three of them, maybe four. They were laughing.'),
    ],
    task: { kind: 'gang', faction: 'street', mix: ['brawler', 'brute', 'brawler', 'gunner'], text: 'Take the delivery bike back from the crew under the tracks.' },
    thanks: [
      L('giver', 'The bike! The pies! Still warm! How are they still warm?'),
      L('peter', 'I swung fast. Pizza physics. Do not ask me to explain it to Dr. Connors.'),
      L('giver', 'The plain is yours. Both plains. I will tell the customer the Mets lost and he will understand.'),
      L('peter', 'The Mets did lose. He will understand. Thanks, Rafi.'),
    ],
  },
  {
    id: 'rq12', district: 'hells', giver: 'workerB', name: 'Carmen Ortiz', clip: 'Sad_Idle',
    title: 'Carmen and Her Father\'s Hat',
    ask: [
      L('giver', 'Spider-Man. I do not usually ask for help. There is a hat on that fire escape roof. A grey fedora.'),
      L('peter', 'Grey fedora. I see it. Wind took it?'),
      L('giver', 'Wind took it. It was my dad\'s. He wore it to every Mets game and every one of my plays.'),
      L('giver', 'He passed in March. I wear it when the subway is bad. Today the subway was bad.'),
      L('peter', 'Then it is coming home. Give me one minute, Carmen.'),
    ],
    task: { kind: 'fetch', item: 'hat', text: 'Bring Carmen\'s father\'s hat down from the fire escape roof.', found: 'Got it. Still smells like popcorn. Good hat.' },
    thanks: [
      L('giver', 'Thank you. I am not going to cry in front of Spider-Man. I am going to cry on the train.'),
      L('peter', 'The train has seen worse. I promise. Hats off to your dad, Carmen. Sorry. That one got away from me.'),
      L('giver', 'He would have laughed. He laughed at everything. Even you, on the news. Especially you.'),
      L('peter', 'Then I did my job. Take care of that hat.'),
    ],
  },
];
