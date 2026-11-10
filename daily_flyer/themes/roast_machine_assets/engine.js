/* Roast Machine: local, curated comedy. No requests, storage, or HTML rendering. */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RoastMachine = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  function option(value, label, mild, mediumA, mediumB, savageA, savageB) {
    return { value: value, label: label, lines: { mild: [mild, mediumA], medium: [mediumA, mediumB], savage: [savageA, savageB] } };
  }

  var bank = {
    personality: [
      option('overconfident', 'Overconfident',
        'You bring a lot of confidence to situations that have specifically requested competence.',
        'You have the confidence of someone who has never been asked a follow-up question.',
        'You say “trust me” at precisely the moment everyone starts making a backup plan.',
        'You carry yourself like the last five people who corrected you were all wrong.',
        'Your confidence is incredible. It must be exhausting for the evidence.'),
      option('overthinker', 'Overthinker',
        'You give every decision the attention usually reserved for naming a royal baby.',
        'You can turn “what do you want for dinner?” into a documentary with no conclusion.',
        'You need a second opinion about whether to get a second opinion.',
        'A waiter saying “I’ll give you another minute” is basically renewing your lease.',
        'You could overthink a coin toss until both sides asked to be left out of it.'),
      option('know_it_all', 'Know-it-all',
        'You do not interrupt. You provide unsolicited bonus material.',
        'Even your apologies start with “Actually…”',
        'You hear a casual conversation and immediately start marking it out of ten.',
        'Being right is your favorite hobby. Shame it remains mostly aspirational.',
        'You have turned knowing one fact into a hostage situation for everyone at the table.'),
      option('dramatic', 'Dramatic',
        'A minor inconvenience becomes a very compelling episode when you tell it.',
        'You do not tell a story. You schedule a season finale.',
        'You describe a delayed package like a betrayal spanning three generations.',
        'The way you retell getting the wrong coffee, you would think the barista needed a lawyer.',
        'You could make an automatic door opening late sound like a personal vendetta.'),
      option('laid_back', 'Laid-back',
        'Your favorite pace is “we’ll see.”',
        'Calling you laid-back is generous. Furniture makes more decisions.',
        'You have a relaxed attitude toward plans, deadlines, and the concept of momentum.',
        'You are not going with the flow. The flow has been trying to shake you off for weeks.',
        'You put the “eventually” in absolutely everything.'),
      option('competitive', 'Too competitive',
        'You bring playoff intensity to games with cartoon animals.',
        'You treat a friendly game like your family name is engraved on the trophy.',
        'Nobody has ever said “it’s just a game” to you only once.',
        'You could turn a charity raffle into an inquiry about the integrity of the draw.',
        'You lose a board game and suddenly everyone is watching a press conference.'),
      option('people_pleaser', 'People-pleaser',
        'You apologize when somebody else bumps into you. Excellent customer service.',
        'You say “no worries” with the exhausted tone of someone who has collected all the worries.',
        'You would write a thank-you note to someone for letting you hold their bags.',
        'You could get cut off in traffic and wonder whether you should send an apology basket.',
        'Your boundaries are less a fence and more a polite suggestion painted on the pavement.'),
      option('main_character', 'Needs the spotlight',
        'You do enjoy an entrance, even when the occasion is buying milk.',
        'You do not enter a room. You wait for it to notice the trailer.',
        'Somehow even somebody else’s story ends up featuring a flashback to your life.',
        'You treat your friends like a supporting cast that keeps forgetting its lines.',
        'You could attend a surprise party for someone else and still look disappointed by the reveal.')
    ],
    job: [
      option('office', 'Office work',
        'You have an impressive collection of ways to say “any update?”',
        'Your greatest professional skill is making “just circling back” sound like a threat.',
        'You have attended enough meetings to qualify as office furniture.',
        'You spend eight hours saying “happy to help” and the rest of the day explaining why you are not.',
        'You could turn a two-word answer into a twelve-person email chain and call it alignment.'),
      option('tech', 'Tech / engineering',
        'You have probably considered automating a chore that would take thirty seconds.',
        'You can automate half the office and still lose the thing you put down twelve seconds ago.',
        'Your solution to a simple problem comes with three dependencies and a setup guide.',
        'You spent a weekend automating a five-minute task. Congratulations on breaking even in 2049.',
        'You call it an elegant solution because “an entire Saturday you’ll never get back” sounds bad in the readme.'),
      option('sales', 'Sales',
        'Even choosing a restaurant with you feels like the beginning of a pitch.',
        'You pitch dinner plans like the restaurant is paying commission.',
        'You have definitely said “let’s connect” to somebody you already know.',
        'You do not make friends. You move people through a pipeline until they agree to brunch.',
        'You could sell ice to somebody in winter, then follow up six times to ask about the ice.'),
      option('manager', 'Manager',
        'You have a remarkable ability to find a meeting inside any question.',
        'You turned asking somebody a question into a meeting with a pre-read.',
        'You ask for a quick update and somehow everyone leaves with homework.',
        'You say “I’ll give you five minutes back” like you personally invented their afternoon.',
        'You could watch someone carry a sofa upstairs and ask whether they have considered moving it.'),
      option('student', 'Student',
        'Your stationery is considerably more prepared than you are.',
        'Your study technique is buying new notebooks until the deadline gets scared.',
        'You highlight so much that the important part is apparently the whole book.',
        'Your revision timetable has achieved more than your revision.',
        'You have opened the document, changed the font, and decided that was a productive evening.'),
      option('creative', 'Creative work',
        'You have a very personal relationship with the phrase “almost finished.”',
        'You call it a process because “staring until the deadline gets close” looks bad on an invoice.',
        'There are twelve files called “final,” and none of them are being entirely honest.',
        'You have spent more time explaining the concept than the client will spend looking at it.',
        'Your inspiration has excellent timing: it arrives exactly when a deposit starts looking refundable.'),
      option('hands_on', 'Skilled trades',
        'You can spot a crooked shelf from a different postcode.',
        'You inspect every shelf in someone else’s house and have an unfinished one at home.',
        'You say “who did this?” in every building you enter, including buildings you worked on.',
        'You own the right tool for every job except finishing the one you started at home.',
        'Your own house is a showroom for the phrase “when I get a minute.”'),
      option('hospitality', 'Hospitality',
        'Your professional smile has done more overtime than you have.',
        'You can manage twelve tables but apparently not one group-chat plan.',
        'You say “no problem” at work so often that it no longer means anything after your shift.',
        'You can carry six drinks at once and still make getting yourself a glass of water an ordeal.',
        'You have a professional customer-service voice that your friends have never once qualified to hear.')
    ],
    hobby: [
      option('gaming', 'Gaming',
        'Your digital achievements are extremely impressive to other people with the same digital achievements.',
        'You spent a month earning a virtual cape and still sit in a chair you found on the curb.',
        'You say “one more game” with the confidence of a person who has never looked at a clock.',
        'You have mastered complex fictional economies and still act ambushed by your own bedtime.',
        'Your character has perfect equipment. Your dinner is being eaten over a keyboard.'),
      option('gym', 'Gym / fitness',
        'You have found a way to include protein in most conversations.',
        'You have a six-day split and a one-sentence personality.',
        'You manage to mention leg day more often than some people mention their own children.',
        'Your workout is ninety minutes long because forty of them are spent making sure we know about it.',
        'You do not finish a workout until somebody who was not there has heard about it.'),
      option('golf', 'Golf',
        'Your hobby involves paying money to go looking for something you just had.',
        'You pay to spend four hours getting humbled by grass.',
        'You bought a new club because apparently the old one was responsible for your decisions.',
        'Every round is an expensive investigation into whether it was the wind, the club, or anybody but you.',
        'You have spent thousands establishing that a small stationary ball is in charge.'),
      option('fantasy_sports', 'Fantasy sports',
        'You have a detailed strategy for athletes who have never heard of you.',
        'You say “my team” about a collection of men whose security would ask you to leave.',
        'You put more research into the waiver wire than the last actual decision you had to make.',
        'You refer to a stranger’s hamstring as “devastating news for us.”',
        'You are the general manager of a spreadsheet and somehow the press conferences are unbearable.'),
      option('cars', 'Cars / modifications',
        'Your car has a much clearer five-year plan than you do.',
        'You call it a build. The rest of us call it the reason your check-engine light has seniority.',
        'You have explained horsepower to people who only asked whether there was room in the back.',
        'You spent real money making your car louder so it could announce the same bad decisions from farther away.',
        'Your car has three driving modes and you have one conversation.'),
      option('cooking', 'Cooking / food',
        'Dinner with you includes a small seminar at no extra charge.',
        'Every dinner comes with a lecture and one ingredient nobody asked you to explain.',
        'You cannot serve a sandwich without establishing where the bread went to school.',
        'You bought restaurant-grade equipment to make one meal and leave the kitchen looking like a crime scene.',
        'You do not ask whether people liked dinner. You cross-examine them until the answer has enough detail.'),
      option('diy', 'DIY / projects',
        'You have a very optimistic relationship with the phrase “quick weekend job.”',
        'You own six kinds of drill bit and one unfinished room.',
        'Your projects follow three stages: research, shopping, and living around it.',
        'You call it a work in progress because “permanent obstacle in the hallway” does not fit on the vision board.',
        'You have turned “I could make that” into a warning the household recognizes immediately.'),
      option('music', 'Music / instruments',
        'You are only one more piece of equipment away from practicing.',
        'You have enough gear to headline a festival and a set list that ends after the intro.',
        'You describe a new purchase as “essential to the sound” of the same four songs.',
        'Your equipment needs its own room. Your repertoire could fit on a sticky note.',
        'The sound you are chasing appears to be the notification confirming another order.')
    ],
    chat: [
      option('never_replies', 'Never replies',
        'Your replies arrive with the reassuring pace of a handwritten letter.',
        'Your friends can see you posting stories. The witness-protection act is not working.',
        'You leave people on read long enough for the original question to become history.',
        'A message to you is less a conversation and more a note left in a time capsule.',
        'You say “just saw this” about a message you have had enough time to frame.'),
      option('instant', 'Replies instantly',
        'You reply before the other person has quite finished regretting the message.',
        'You reply so fast people feel like they have called customer service.',
        'Your phone does not need notifications. You are already looking.',
        'You answer so quickly the typing bubble looks unemployed.',
        'The group chat has a faster response team than most airports, and unfortunately it is you.'),
      option('memes', 'Sends memes',
        'You have a picture saved for every feeling except an original thought.',
        'You have not expressed an original thought since the screenshot button was invented.',
        'You treat sending a meme like it counts as catching up properly.',
        'Your contribution to the conversation is somebody else’s joke with worse image quality.',
        'You send “this is so us” because making us read the actual conversation would be too demanding.'),
      option('voice_notes', 'Long voice notes',
        'Your voice notes could benefit from chapter titles.',
        'Your voice notes should come with an intermission and parking validation.',
        'You answer “what time?” with an audio documentary.',
        'You send a six-minute voice note to avoid typing seven words, then ask whether we listened.',
        'Your friends do not need headphones. They need a producer willing to make cuts.'),
      option('paragraphs', 'Paragraph texter',
        'Every message arrives looking suspiciously like homework.',
        'You answer “what time?” with chapters.',
        'You text like there is a minimum word count and a bibliography due.',
        'Your messages need an executive summary for people who would like to remain your friend.',
        'You have made “see more” the most threatening phrase in the group chat.'),
      option('cancels', 'Cancels plans',
        'You are excellent at the theoretical side of hanging out.',
        'You say “we should do something soon” like a government making a promise.',
        'Your calendar is full of exciting first drafts.',
        'You make plans so you can experience the thrill of getting out of them.',
        'Your friends invite you as a courtesy to the version of you that exists in the group chat.'),
      option('corrects', 'Corrects everyone',
        'You provide footnotes for stories nobody intended to publish.',
        'Nobody asked for a fact-checker, but you have appointed yourself for life.',
        'You have interrupted a joke to correct the geography.',
        'You fact-check the punchline and still wonder why the conversation went quiet.',
        'You bring citations to a group chat where the highest form of argument is a raccoon picture.'),
      option('reactions', 'Only reacts',
        'You keep the emoji economy running almost single-handedly.',
        'You have reduced friendship to holding your thumb on a message.',
        'You reacted with a thumbs-up to a question that needed an actual answer.',
        'Your friends have shared whole life updates and received the emotional range of a lift button.',
        'You use a heart reaction like it is a legally binding promise that you read any of it.')
    ],
    style: [
      option('athleisure', 'Athleisure',
        'Your outfit is ready for a much more active afternoon than you are.',
        'You are dressed for a workout that keeps getting rescheduled.',
        'Your clothes suggest a personal trainer. Your plans suggest a sofa.',
        'You dress like you are being sponsored by an activity you keep avoiding.',
        'Those performance fabrics are putting in a lot of effort for a trip to the fridge.'),
      option('hoodie', 'Same hoodie',
        'That hoodie has earned a place in the family photographs.',
        'That hoodie has met more of your friends than your parents have.',
        'Your wardrobe rotation is whichever side of the chair the hoodie landed on.',
        'Your hoodie is less an outfit and more a long-term tenancy.',
        'That hoodie has survived more phases of your life than most of your opinions.'),
      option('business_casual', 'Business casual',
        'You look prepared for a meeting that may never happen.',
        'You look like you might offer us a competitive mortgage rate.',
        'Even on a weekend, your outfit is waiting for somebody to say “quick sync.”',
        'You have dressed for a regional sales conference at a barbecue.',
        'Every outfit says you could help us switch energy providers before dessert.'),
      option('overdressed', 'Always overdressed',
        'You make everyone wonder whether they missed a line on the invitation.',
        'You dress for a promotion at places where you are not employed.',
        'You turn a trip to the pub into an audition for the opening credits.',
        'You wore an outfit with a backstory to an event with paper plates.',
        'You arrive so overdressed the host starts apologizing for the furniture.'),
      option('sneakers', 'Sneakerhead',
        'Your shoes get more careful handling than most museum exhibits.',
        'You protect your shoes like they know your banking password.',
        'You bought walking shoes that are apparently too important to walk in.',
        'Your footwear has a better emergency evacuation plan than your home.',
        'You spend the whole night avoiding puddles in shoes that cost more than the night out.'),
      option('all_black', 'All black',
        'Getting dressed must be wonderfully straightforward.',
        'All that black and somehow the outfit still says “forgot to do laundry.”',
        'You describe identical black shirts as different moods.',
        'You call it a signature look. The washing machine calls it one load.',
        'You have built a wardrobe around the hope that lint is not visible in photographs.'),
      option('band_shirts', 'Band shirts',
        'Your wardrobe has excellent memories of concerts you attended a while ago.',
        'Your wardrobe has been on a farewell tour since college.',
        'You own shirts from bands that have reunited more recently than you bought clothes.',
        'Your shirts have outlasted three drummers, two reunion tours, and your interest in ironing.',
        'You dress like the merch table at a festival that lost its funding in 2008.'),
      option('thrift', 'Thrift-store finds',
        'Your outfits always have a previous chapter.',
        'You call it curated. A yard sale calls it inventory.',
        'You can find hidden gems, although the hiding is doing quite a lot of work.',
        'You put together an outfit that makes the mannequin feel better about being naked.',
        'You explain that it is vintage with the urgency of somebody who knows it needs explaining.')
    ],
    habit: [
      option('late', 'Always late',
        'Your arrival time is more of a suggestion than an appointment.',
        'People tell you the start time minus your personality.',
        '“On my way” is a geographical theory when you say it.',
        'Your friends have developed an entirely separate time zone to get you somewhere on schedule.',
        'You are so committed to being late that arriving on time would feel out of character.'),
      option('sore_loser', 'Sore loser',
        'You take a little while to appreciate the educational value of losing.',
        'You do not lose games. You launch investigations.',
        'You congratulate the winner through what sounds like a lengthy appeal process.',
        'The game ends, but your campaign to have the result overturned is just getting started.',
        'You can find a loophole in any rule except the one that says you lost.'),
      option('indecisive', 'Indecisive',
        'You like to keep your options open until everybody else is hungry.',
        'Ordering lunch with you makes jury duty look decisive.',
        'You have been “easy either way” for twenty minutes and rejected both ways.',
        'You could hold up a queue at a vending machine with one item left.',
        'You ask for recommendations as if you are assembling a panel you intend to ignore.'),
      option('shortcuts', 'Bad shortcuts',
        'Your shortcuts tend to include some lovely unexpected scenery.',
        'Your shortcuts need their own overnight accommodation.',
        'You say “I know a quicker way” just before everybody stops recognizing the road.',
        'You do not save time. You redistribute it into petrol stations nobody wanted to visit.',
        'Your sense of direction has confidence that should be studied under controlled conditions.'),
      option('gear', 'All gear, no practice',
        'You approach every new hobby through its accessories department.',
        'You buy equipment for the person you plan to become and leave it for the person you are.',
        'Your hobbies have excellent packaging and very little wear.',
        'You have mistaken a shopping basket for personal development.',
        'You have all the gear because apparently “an actual interest” was out of stock.'),
      option('monday', 'Starts on Monday',
        'Monday holds an impressive number of your future achievements.',
        'You say “I’ll start Monday” like Mondays are a limited-edition release.',
        'Your to-do list has been renewed for another season.',
        'Monday has filed a restraining order.',
        'You have spent so long preparing to turn your life around that you have completed a full circle.'),
      option('long_stories', 'Long stories',
        'You do like to establish the setting before anything happens.',
        'You went out for milk and came back with a director’s cut.',
        '“Long story short” is your way of announcing the second act.',
        'Your stories include so much background that the actual event has time to happen again.',
        'You tell us what everyone was wearing in a story whose ending is that you missed the bus.'),
      option('phone', 'Always on the phone',
        'You check your phone with the dedication of somebody expecting extremely important news.',
        'You have the screen time of an airport departures board.',
        'Your phone battery has a more demanding schedule than most executives.',
        'You cannot watch a ninety-second video without checking a second screen for something shorter.',
        'You have turned being present into something your phone occasionally interrupts.')
    ]
  };

  var labels = { personality: 'Personality', job: 'Day job', hobby: 'Hobby', chat: 'Group chat behavior', style: 'Dress code', habit: 'Signature bad habit' };
  var traitIds = Object.keys(labels);
  var fields = traitIds.map(function (id) {
    return { id: id, label: labels[id], options: [{ value: '', label: 'Skip' }].concat(bank[id].map(function (entry) { return { value: entry.value, label: entry.label }; })) };
  });
  fields.push({ id: 'occasion', label: 'Occasion', options: [
    { value: 'just_because', label: 'Just because' }, { value: 'birthday', label: 'Birthday' },
    { value: 'game_night', label: 'Game night' }, { value: 'group_chat', label: 'For the group chat' },
    { value: 'work_sendoff', label: 'Work send-off' }, { value: 'wedding', label: 'Wedding toast' },
    { value: 'reunion', label: 'Reunion' }
  ] });
  fields.push({ id: 'heat', label: 'Heat', options: [
    { value: 'mild', label: 'Mild' }, { value: 'medium', label: 'Medium' },
    { value: 'savage', label: 'Savage' }
  ] });

  var combinations = [];
  function combo(requirements, mild, medium, savage) { combinations.push({ requirements: requirements, lines: { mild: [mild], medium: [medium], savage: [savage] } }); }
  combo({ job: 'tech', habit: 'late' }, 'You can measure latency in milliseconds. Getting to brunch remains a mystery.', 'You can calculate latency in milliseconds; somehow brunch still has a forty-minute outage.', 'You monitor server response times while making your friends wait long enough to qualify as an incident.');
  combo({ job: 'sales', hobby: 'gym' }, 'Even your protein shake sounds like it comes with a referral code.', 'Even your protein shake has a referral code.', 'You cannot finish a set without trying to convert the person spotting you into a warm lead.');
  combo({ personality: 'overthinker', habit: 'indecisive' }, 'You approach a lunch menu like a decision that may need judicial review.', 'A waiter saying “I’ll give you another minute” is basically renewing your lease.', 'You have made choosing a sandwich such a process that the bread will need replacing before you decide.');
  combo({ hobby: 'golf', habit: 'sore_loser' }, 'Golf provides you with four hours of opportunities to dispute the result.', 'You have spent thousands proving the grass has better composure.', 'The ball is stationary, the hole has not moved, and somehow you are still looking for somebody to blame.');
  combo({ hobby: 'cars', habit: 'gear' }, 'Your car’s upgrades are progressing rather faster than your plans for using them.', 'You have upgraded everything except the excuse you give when it will not start.', 'You bought enough parts to build a second car and somehow only made the first one less reliable.');
  combo({ hobby: 'music', habit: 'gear' }, 'Your collection is growing faster than the set list.', 'Your pedalboard has more settings than your songs have chords.', 'You have spent enough on equipment to hire somebody who would actually practice.');
  combo({ hobby: 'cooking', personality: 'know_it_all' }, 'We asked whether dinner was ready and learned a great deal about tomatoes.', 'We asked whether dinner was ready, not for the tomato’s family history.', 'The food went cold while you explained why everyone else cooks it wrong.');
  combo({ chat: 'instant', habit: 'late' }, 'You answer the invitation immediately and arrive considerably more gradually.', 'You answer in three seconds and arrive in three business days.', 'Your thumbs are the only part of you that has ever arrived anywhere on time.');
  combo({ style: 'hoodie', hobby: 'gym' }, 'That hoodie has heard about every workout, whether it came along or not.', 'You have a different exercise for every muscle and one hoodie for every occasion.', 'You rotate muscle groups more often than you rotate the one item of clothing containing them.');
  combo({ job: 'manager', chat: 'paragraphs' }, 'Even your texts seem to come with a few follow-up actions.', 'Even your texts have action items nobody agreed to.', 'You send a group-chat message and somehow everyone has a deadline, an owner, and less respect for their evening.');
  combo({ habit: 'phone', chat: 'memes' }, 'Your photo gallery is doing an excellent job of keeping the chat supplied.', 'You produce so many screenshots your gallery should be paying a salary.', 'You spend eight hours on your phone and still outsource every joke to somebody else’s screenshot.');
  combo({ personality: 'competitive', habit: 'sore_loser' }, 'Your commitment to the result does continue well beyond the end of the game.', 'You treat losing at game night like a court decision you intend to appeal.', 'You demand a rematch with the confidence of someone who learned absolutely nothing from the first defeat.');
  combo({ personality: 'know_it_all', chat: 'corrects' }, 'Your friends have become very careful about using the word “roughly.”', 'You fact-check a casual conversation like someone is paying you, which tragically nobody is.', 'You can be technically correct and still be the reason everyone starts a second group chat.');
  combo({ personality: 'dramatic', habit: 'long_stories' }, 'Your small inconveniences arrive with a full supporting cast.', 'Your story about a missing parcel has a larger cast than most period dramas.', 'You could describe a slow lift for so long that the audience would rather take the stairs and leave.');
  combo({ hobby: 'gaming', habit: 'monday' }, 'Your real-life quest log does have quite a few unfinished entries.', 'You complete every side quest except the one labeled “do the thing you promised.”', 'You have earned a hundred fictional achievements while the real-life task next to you celebrates another birthday.');
  combo({ hobby: 'diy', personality: 'overconfident' }, 'You say “how hard can it be?” with remarkable optimism and very few measurements.', 'You say “how hard can it be?” and the house immediately loses resale value.', 'You watched half a tutorial and gave the load-bearing wall a look it did not deserve.');
  combo({ style: 'business_casual', job: 'sales' }, 'Your weekend outfit looks ready to follow up on an opportunity.', 'Even on your day off, you look like you are about to ask who handles our procurement.', 'Your entire appearance is an unsolicited offer to discuss flexible finance options.');
  combo({ style: 'overdressed', personality: 'main_character' }, 'You dress like there will be an establishing shot.', 'You dressed for the red carpet at an event where the carpet is mostly crisps.', 'You arrive dressed for an acceptance speech at a party nobody has announced your name at.');
  combo({ personality: 'laid_back', habit: 'monday' }, 'Your plans and your pace have reached a very comfortable agreement to do nothing today.', 'You are so relaxed about starting Monday that even Monday has stopped checking in.', 'You have spent years going with the flow and still somehow ended up in the same chair.');
  combo({ hobby: 'fantasy_sports', personality: 'competitive' }, 'Your fantasy league receives a very real amount of your attention.', 'You treat fantasy football like a front-office job that inexplicably requires no qualifications.', 'You have all the stress of running a sports franchise and all the authority of someone refreshing a website.');
  combo({ hobby: 'music', style: 'band_shirts' }, 'Your wardrobe and your equipment both suggest a very ambitious tour schedule.', 'Between the band shirts and the gear, everything is ready except the songs.', 'You have been dressing for the encore for years and still cannot make it through the bridge.');
  combo({ chat: 'voice_notes', habit: 'long_stories' }, 'Your voice notes and your stories are helping everyone improve their attention span.', 'Your “quick voice note” has a plot, a subplot, and a listener checking how much is left.', 'You took the one story that needed editing and sent it in the only format nobody can skim.');
  combo({ style: 'athleisure', habit: 'monday' }, 'Your exercise clothes are doing an excellent job of waiting until Monday.', 'You have dressed for the workout you have been postponing since the last pair wore out.', 'Your trainers have crossed more shopping-center floors than finish lines, and Monday would like its name back.');

  var detailHooks = [];
  function hook(id, label, pattern, mild, medium, savage, covers) {
    detailHooks.push({ id: id, label: label, pattern: pattern, lines: { mild: [mild], medium: [medium], savage: [savage] }, covers: covers || {} });
  }
  hook('guitars', 'Guitars and gear', /\b(guitars?|pedalboards?|guitar pedals?|four chords?|three chords?)\b/i,
    'The guitar collection is developing beautifully. The repertoire will catch up eventually.', 'Your guitars have their own room. Your repertoire could fit on a sticky note.', 'You have spent so much chasing tone that actually learning the song would feel like cheating.', { hobby: 'music' });
  hook('car_mods', 'Car modifications', /\b(turbo|downpipes?|intercooler|coilovers?|exhaust|car mods?|modif(?:y|ied|ying) (?:the |a |his |her |their |my )?car|stage [123]|tuned? car)\b/i,
    'Every car modification comes with a fresh explanation of why this one was necessary.', 'You describe modifications as “almost finished” in the same way the motorway describes roadworks.', 'You have spent a small fortune making a traffic jam sound more aggressive.', { hobby: 'cars' });
  hook('coffee', 'Coffee obsession', /\b(coffee|espresso|caffeine|cold brew|aeropress|pour[ -]over|barista)\b/i,
    'Your coffee order has developed a fairly detailed specification.', 'You do not drink coffee. You make being tired everybody else’s research project.', 'You have turned hot bean water into a personality with a monthly equipment budget.');
  hook('karaoke', 'Karaoke confidence', /\b(karaoke|open mic|sings? loudly|singing loudly)\b/i,
    'Karaoke has given your confidence a wonderfully supportive environment.', 'You approach karaoke like the record label is hiding behind the nacho machine.', 'You sing with the confidence of someone who has never been on the listening side of it.');
  hook('fantasy', 'Fantasy-team management', /\b(fantasy (?:football|baseball|basketball|hockey|sports)|waiver wire|fantasy league|fantasy team)\b/i,
    'Your fantasy team receives the kind of care normally reserved for national infrastructure.', 'You refer to a stranger’s hamstring as “devastating news for us.”', 'You are the general manager of a spreadsheet and somehow the press conferences are unbearable.', { hobby: 'fantasy_sports' });
  hook('audio', 'Audiophile equipment', /\b(audiophile|vinyl|turntable|headphones|hi[ -]fi|speaker cables?|lossless|tube amps?)\b/i,
    'You have a very attentive relationship with sounds most of us had not noticed.', 'You bought equipment expensive enough to hear the artist’s regrets.', 'You spent a month’s budget to hear a slightly clearer version of a song you already knew was badly mixed.');
  hook('film_quotes', 'Movie quotes', /\b(movie quotes?|film quotes?|quotes? movies|quotes? films|quot(?:ing|es) (?:the office|anchorman|star wars|lord of the rings|monty python))\b/i,
    'You have found a film quote for nearly every conversation.', 'You have memorized entire films and still somehow miss the cue that the conversation has moved on.', 'Your personality has a screenplay, and somebody else wrote every line.');
  hook('spreadsheets', 'Spreadsheet enthusiasm', /\b(spreadsheets?|excel|pivot tables?|google sheets|budget tracker)\b/i,
    'You have probably considered making a spreadsheet of your spreadsheets.', 'You cannot organize lunch without a sheet, three tabs, and conditional formatting.', 'You built a dashboard for a decision that normal people make by pointing at a menu.');
  hook('tabs', 'Too many browser tabs', /\b(browser tabs?|\d+ (?:open )?tabs|too many tabs|tabs open|open tabs)\b/i,
    'Your browser is keeping quite a lot of future plans warm.', 'Your browser tabs are a museum of things you meant to get back to.', 'You have enough open tabs to run a small airport and still cannot find the thing you opened thirty seconds ago.');
  hook('plants', 'Houseplant collection', /\b(houseplants?|house plants?|succulents?|monstera|plant parent|indoor plants?|plant collection)\b/i,
    'Your windowsills have become rather competitive real estate.', 'You do not have a living room. You have a greenhouse with a television.', 'You have given every plant a name and every guest a lecture about not touching the leaves.');
  hook('grilling', 'Grill supervision', /\b(grill(?:ing|s)?|barbecu(?:e|ing)|bbq|brisket|smokers?|smoked meat|pellet grill)\b/i,
    'Your barbecue comes with the sort of supervision usually found at a rocket launch.', 'You stand over the grill like flipping a burger requires clearance from mission control.', 'You spent fourteen hours cooking meat so you could spend the next fourteen telling us about it.', { hobby: 'cooking' });
  hook('travel', 'Travel stories', /\b(travel(?:s|ing|ling)?|backpack(?:ing|er)?|visited \d+ countries|passport|airport lounge|city break)\b/i,
    'You return from every trip with plenty of material for the rest of us.', 'You spent a week abroad and came home saying the local pronunciation of things we already understood.', 'You have been to twenty places and somehow brought the same conversation back from all of them.');
  hook('late', 'Questionable timekeeping', /\b(always late|often late|running late|late (?:to|for|again)|never on time|shows? up late|\d+ minutes? late|(?:five|5|ten|10) minutes? away)\b/i,
    'Your friends have learned to treat the meeting time as a negotiation.', 'When you say “five minutes,” everyone else hears “start without me.”', 'You arrive late enough to ask how it went instead of where to sit.', { habit: 'late' });
  hook('gym', 'Gym talk', /\b(gym|workouts?|protein|leg day|bench press|crossfit|lifting weights)\b/i,
    'A conversation with you usually gets a few reps of gym news.', 'You have found a way to mention protein in conversations about parking.', 'The hardest part of your workout is finding somebody who has not heard about it yet.', { hobby: 'gym' });
  hook('running', 'Running stories', /\b(marathons?|half[ -]marathons?|running(?!\s+(?:late|behind|out|low|short|away)\b)|strava|5k|10k|ultramarathon)\b/i,
    'You have turned going outside into some very detailed statistics.', 'You do not go for a run. You prepare content for everyone who did not.', 'Your legs cover miles; your conversation covers the same one run indefinitely.');
  hook('cycling', 'Cycling equipment', /\b(cycling|cyclist|road bikes?|mountain bik(?:e|ing)|peloton|bicycle)\b/i,
    'Your bike gets an excellent standard of care.', 'You bought a bike lighter than your shopping bags and will explain every gram.', 'You spent thousands saving twelve grams and still pack enough equipment for a polar expedition.');
  hook('gaming', 'Gaming hours', /\b(gam(?:ing|er)|video games?|playstation|xbox|minecraft|fortnite|call of duty|steam library)\b/i,
    'Your “one more game” has developed into a rather flexible unit of time.', 'Your game library is enormous for someone who only plays the same two things.', 'You can manage sixteen buttons in a firefight but somehow the washing machine remains too complicated.', { hobby: 'gaming' });
  hook('golf', 'Golf excuses', /\b(golf|putter|fairway|tee times?|driving range)\b/i,
    'Golf has given you a lovely variety of explanations for where a ball went.', 'You have bought so many clubs that the ball should be paying membership.', 'The clubs cost a fortune and the excuses still come free.', { hobby: 'golf' });
  hook('sourdough', 'Sourdough maintenance', /\b(sourdough|bread starter|sourdough starter|bakes? bread|bread making)\b/i,
    'Your bread has a more carefully managed schedule than most house guests.', 'You adopted a jar of flour and somehow it became the most demanding relationship in the house.', 'You are raising a jar of bacteria with a more reliable feeding schedule than your own lunch.', { hobby: 'cooking' });
  hook('cooking', 'Kitchen commentary', /\b(cook(?:ing|s)?|chef|foodie|recipe|meal prep|air fryer|cast iron)\b/i,
    'Every meal comes with a little background reading.', 'You explain a recipe like we have bought tickets to hear it.', 'You follow one recipe and start looking at the kitchen like the Michelin inspector is due.', { hobby: 'cooking' });
  hook('diy', 'Unfinished projects', /\b(diy|woodwork|woodworking|home improvement|unfinished projects?|renovating|power tools?)\b/i,
    'Your projects keep the house full of exciting possibilities and a few loose parts.', 'Your projects follow three stages: research, shopping, and living around it.', 'You have turned a weekend project into a feature of the floor plan.', { hobby: 'diy' });
  hook('shopping', 'Impulse purchases', /\b(impulse buy(?:s|ing)?|amazon packages?|online shopping|shopping addiction|buys? (?:random|useless|unnecessary) things)\b/i,
    'Your delivery driver is becoming a reliable part of the weekly routine.', 'You treat “add to cart” like it is a form of making progress.', 'You have confused receiving parcels with developing interests.', { habit: 'gear' });
  hook('snooze', 'Alarm negotiations', /\b(snooze|alarms?|sleeps? in|oversleeps?|not a morning person)\b/i,
    'You like to hear several opinions from the alarm before getting up.', 'Your alarm clock has made more empty threats than a tired parent.', 'You set six alarms like the seventh version of you will suddenly respect an appointment.');
  hook('snoring', 'Volume while asleep', /\b(snores?|snoring)\b/i,
    'You continue contributing to the conversation after everyone has gone to sleep.', 'You sleep like a piece of farm machinery that somebody forgot to switch off.', 'You could save the household a fortune by renting yourself out as a harbor foghorn.');
  hook('trivia', 'Trivia intensity', /\b(trivia|pub quiz|jeopardy|quiz night)\b/i,
    'You keep some impressively obscure facts ready for a very specific evening.', 'You know the capital of everywhere except the conversation you are currently interrupting.', 'You spent years collecting facts so you could argue about a six-dollar bar voucher.');
  hook('photography', 'Photographing everything', /\b(photograph(?:y|er|ing)|takes? (?:too many )?(?:photos|pictures)|camera gear|dslr|mirrorless)\b/i,
    'You make sure every outing comes with a generous amount of documentation.', 'You take forty photos of dinner and let the food do the cooling.', 'You bought professional camera equipment to take a sharper picture of something everyone else has already finished eating.');
  hook('pets', 'Pet stories', /\b(cat|cats|dog|dogs|pet|pets|dog parent|cat dad|cat mom)\b/i,
    'Your pet gets a healthy amount of representation in conversations it did not attend.', 'Your pet has appeared in more of your conversations than some of the people having them.', 'You show people pet photos with the confidence of someone who thinks the next one will finally be different.');
  hook('board_games', 'Board-game rules', /\b(board games?|boardgames?|catan|monopoly|risk|warhammer|tabletop)\b/i,
    'Your idea of a relaxed evening comes with a useful rulebook.', 'You say “it’s really simple” and put a forty-page manual on the table.', 'Your friends agreed to game night and somehow enrolled in a certification course.');
  hook('craft_beer', 'Craft-beer commentary', /\b(craft beer|ipa|microbrew|microbrewery|beer snob|homebrew)\b/i,
    'Choosing a beer with you comes with a little more background than usual.', 'You cannot order a pint without giving it a character reference.', 'You paid extra for a beer that tastes like a lawn and then explained why we are wrong.');
  hook('sports', 'Sports commentary', /\b(football|baseball|basketball|hockey|soccer|watches? sports|sports fan)\b/i,
    'Your advice to the television is extremely generous.', 'You coach professional athletes from a sofa with a dip stain on it.', 'You can spot every mistake made by elite athletes except the one where you think they can hear you.');
  hook('lyrics', 'Confidently wrong lyrics', /\b(wrong lyrics|misheard lyrics|forgets? (?:the )?lyrics|makes? up (?:the )?lyrics)\b/i,
    'You bring some personal interpretation to the lyrics.', 'You sing the wrong lyrics with the confidence of the person who wrote them.', 'You have been performing a completely different song over the correct instrumental for years.');
  hook('packing', 'Packing for every possibility', /\b(overpacks?|overpacking|packs? too much|too many suitcases|packing list)\b/i,
    'You prepare for a weekend with an admirable range of contingencies.', 'You pack for two nights like the destination might stop selling clothes.', 'Your suitcase has backup outfits for emergencies the rest of us would simply go home from.');
  hook('directions', 'Dubious navigation', /\b(gets? lost|bad (?:at|with) directions|no sense of direction|ignores? (?:the )?(?:gps|satnav)|shortcut|lost in ikea)\b/i,
    'Your route occasionally includes some opportunities for discovery.', 'You do not get lost. You provide the car with a surprise itinerary.', 'You argue with a satellite that has one job and a considerably better view.', { habit: 'shortcuts' });
  hook('podcasts', 'Podcast recommendations', /\b(podcasts?|listens? to podcasts)\b/i,
    'You have a podcast recommendation ready for almost every silence.', 'You say “I heard on a podcast” like you have completed postgraduate research.', 'You listened to two people talk for ninety minutes and came out thinking the expertise was contagious.');
  hook('astrology', 'Horoscope explanations', /\b(astrology|horoscopes?|star signs?|mercury retrograde|zodiac)\b/i,
    'You have given the planets quite a few responsibilities in your diary.', 'You blame a planet for things that could have been solved with a calendar reminder.', 'Mercury is millions of miles away and still catching blame for a text you chose to send.');
  hook('sneakers', 'Sneaker collection', /\b(sneakers?|trainers?|jordans|shoe collection)\b/i,
    'Your shoes are very well looked after for something designed to touch the floor.', 'You have shoes for every occasion except an occasion involving actual dirt.', 'You buy shoes to avoid wearing them, which is a bold new interpretation of what shoes are for.', { style: 'sneakers' });
  hook('pickles', 'Pickleball enthusiasm', /\b(pickleball)\b/i,
    'Pickleball has given you a lively new subject to bring up.', 'You discovered pickleball and started talking like a recently appointed ambassador.', 'You picked the sport with the least intimidating name and still found a way to take it too seriously.');
  hook('voice_notes', 'Long voice notes', /\b(voice notes?|voice messages?|audio messages?)\b/i,
    'Your voice messages do offer generous value in minutes.', 'Your “quick voice note” has its own beginning, middle, and intermission.', 'You send seven minutes of audio to avoid writing a sentence, then make it everyone else’s time-management problem.', { chat: 'voice_notes' });
  hook('phone', 'Screen time', /\b(screen time|always on (?:their |his |her |the |a )?phone|phone addict|scroll(?:ing|s) (?:all|for hours)|doomscroll)\b/i,
    'Your phone gets a very reassuring level of attention.', 'Your phone battery knows more about commitment than your to-do list.', 'You are so glued to that screen that eye contact feels like a premium feature.', { habit: 'phone' });
  hook('leave_read', 'Unanswered messages', /\b(left (?:me |us |them )?on read|leaves? (?:everyone|people|me|us|them) on read|never repl(?:ies|y)|doesn.t reply)\b/i,
    'Your messages have a relaxed relationship with turnaround time.', 'You leave people on read long enough for “any plans tonight?” to become an archaeological question.', 'You say “sorry, just saw this” with a straight face and a publicly visible story posted six hours earlier.', { chat: 'never_replies' });

  // Notes are never treated as instructions. Only these ordinary behavioral hooks,
  // or tightly bounded, screened object phrases, can contribute to a roast.
  var sensitive = /\b(?:cancer|tumou?r|leukemia|dementia|autism|autistic|disab(?:led|ility)|depress(?:ed|ion)|suicid\w*|self[ -]harm|overdose|assault|abuse|abusive|molest\w*|rape|rapist|sex(?:ual)?|porn\w*|nudes?|naked|traffick\w*|murder\w*|kill\w*|dead|died|death|miscarriage|infertil\w*|genocide|nazi|terroris\w*|criminal|arrest\w*|convict\w*|felon\w*|stole|steal\w*|ssn|social security|credit card|bank account|medical records?|tax (?:forms?|returns?|records?)|passports? (?:numbers?|details?)|home address|phone number|password|private photos?|immigra\w*|race|racist|religion|muslim|jewish|christian|hindu|buddhis\w*|gay|lesbian|transgender|straight people|women|woman|men|child(?:ren)?|minor|underage|diabetes|bipolar|schizo\w*|adhd|ptsd|eating disorder|anorex\w*|bulimi\w*)\b/i;
  var identifiers = /(?:https?:\/\/|www\.|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\b\d[\d ()+.-]{6,}\d\b|\b\d{1,6}\s+(?:[a-z]+\s+){0,3}(?:street|avenue|road|drive|lane|boulevard|court|way|st|rd|ave)\b)/i;
  var negation = /\b(?:doesn.t|does not|don.t|do not|isn.t|is not|aren.t|are not|not|never|no longer|hates?|dislikes?|can.t stand)\b[^.!?;]{0,35}$/i;

  function safeObject(raw) {
    var value = raw.split(/\b(?:and|but|because|although|while|who|that|which|when|where|for|from|at|with)\b/i)[0]
      .replace(/\s+(?:(?:every|each)\s+(?:day|week|month|year|morning|night|weekend)|daily|weekly|monthly)\b.*$/i, '')
      .replace(/[“”"‘’]/g, '').replace(/^[\s:-]+|[\s,:-]+$/g, '').replace(/^(?:a |an |the |some )/i, '');
    if (value.length < 3 || value.length > 55 || value.split(/\s+/).length > 8 || !/^[a-z0-9][a-z0-9' -]*$/i.test(value)) return null;
    if (sensitive.test(value) || identifiers.test(value) || /\b(?:people|person|human|girl|boy|sister|brother|mother|father|wife|husband|partner|girlfriend|boyfriend|ex|boss|coworker|colleague|employee|neighbor|neighbour|pictures?|photos?|videos?|records?|documents?|files?|data|information|secrets?|addresses?|ids?|identities|numbers?|drugs?|cocaine|heroin|guns?|weapons?|bombs?|knives|slurs?|hate|fat|ugly|bald|stupid|worthless)\b/i.test(value)) return null;
    return value.toLowerCase();
  }

  function readDetails(raw) {
    var text = typeof raw === 'string' ? raw.slice(0, 600).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ') : '';
    var segments = text.split(/[!?;\n]|\.(?=\s|$)/).map(function (segment) { return segment.trim(); }).filter(function (segment) {
      return segment && !sensitive.test(segment) && !identifiers.test(segment);
    });
    var found = [];
    detailHooks.forEach(function (entry) {
      var match = segments.some(function (segment) {
        var m = entry.pattern.exec(segment);
        // A phrase such as “never on time” already includes its own negation.
        // Only preceding negation cancels an otherwise affirmative detail.
        return m && !negation.test(segment.slice(Math.max(0, m.index - 50), m.index));
      });
      if (match) found.push(entry);
    });

    // Prefer the more specific version when two hooks describe the same detail.
    var ids = found.map(function (entry) { return entry.id; });
    var lessSpecific = [];
    if (ids.indexOf('fantasy') !== -1) lessSpecific.push('sports');
    if (ids.indexOf('grilling') !== -1 || ids.indexOf('sourdough') !== -1) lessSpecific.push('cooking');
    if (ids.indexOf('lyrics') !== -1) lessSpecific.push('karaoke');
    found = found.filter(function (entry) { return lessSpecific.indexOf(entry.id) === -1; });

    if (!found.length) {
      for (var i = 0; i < segments.length; i += 1) {
        var segment = segments[i];
        var collected = /\b(?:collects?|collecting|hoards?|hoarding|owns?|owning|buys?|buying|has a collection of)\s+([^.!?;]{3,75})/i.exec(segment);
        var obsession = /\b(?:obsessed with|talks? about|talking about|won.t stop talking about|can.t stop talking about|loves?|loves? collecting)\s+([^.!?;]{3,75})/i.exec(segment);
        var match = collected || obsession;
        if (!match || negation.test(segment.slice(Math.max(0, match.index - 40), match.index))) continue;
        var subject = safeObject(match[1]);
        if (!subject) continue;
        var isCollection = !!collected;
        found.push({
          id: 'custom_object', label: isCollection ? 'Collection: ' + subject : 'Obsession: ' + subject,
          covers: {}, lines: {
            mild: [isCollection ? 'That interest in ' + subject + ' started as a hobby. It is gradually becoming part of the floor plan.' : 'You have made ' + subject + ' a surprisingly regular item on everyone else’s conversational agenda.'],
            medium: [isCollection ? 'You call it a passion for ' + subject + '. The rest of the house calls it losing shelf space.' : 'Somehow you made ' + subject + ' a compulsory subject for everyone who knows you.'],
            savage: [isCollection ? 'At this point, your interest in ' + subject + ' comes with an eviction notice for everything else you own.' : 'Nobody objects to ' + subject + '. They object to the forty-minute lecture that comes free with knowing you.']
          }
        });
        break;
      }
    }
    return { supplied: !!text.trim(), matches: found };
  }

  var openers = {
    just_because: ['{name}, we have gathered the evidence. Unfortunately, most of it came from you.', '{name}, somebody pressed the button. Here is what fell out.', '{name}, take a seat. You have supplied plenty of material.', '{name}, this was meant to be difficult. Then we read the brief.', '{name}, consider this a very informal performance review.'],
    birthday: ['Happy birthday, {name}. Another year older, another year of fresh material.', '{name}, happy birthday. We considered getting you a present, but the material was right here.', 'Happy birthday, {name}. Let’s celebrate the one thing you do consistently: getting older.', '{name}, another birthday. We saved you a slice and a few observations.'],
    game_night: ['{name}, before game night begins, let’s get one thing on the scoreboard.', '{name}, welcome to game night. The first round is apparently this.', '{name}, put the controller down. This bit does not have a difficulty setting.', '{name}, the game has not started and you have already provided the entertainment.'],
    group_chat: ['{name}, this one is going straight in the group chat.', '{name}, the group chat has requested the floor.', '{name}, consider this the message everybody will actually read.', '{name}, somebody screenshot this. We finally have a message worth pinning.'],
    work_sendoff: ['{name}, congratulations on the next chapter. We have a few notes on this one.', '{name}, before you leave, there are a few things that did not fit on the card.', '{name}, a farewell speech should be heartfelt. We have gone with accurate.', '{name}, the leaving card ran out of room, so we put the rest here.'],
    wedding: ['Raise a glass to {name}. We have been given a microphone and very little supervision.', '{name}, a wedding toast is all about celebrating what makes you special. Bear with us.', 'A toast to {name}. We promise to keep this shorter than the seating-plan discussion.', '{name}, we were told to say something memorable. Nobody specified flattering.'],
    reunion: ['{name}, it is good to see you. Some things have changed. We will try to find one.', '{name}, a reunion is a wonderful chance to discover how consistent people have been.', '{name}, all this time apart and somehow the material has stayed remarkably fresh.', '{name}, welcome back. We kept your seat and a few observations.']
  };
  var generic = {
    mild: ['You have the energy of someone who says “quick question” and means it optimistically.', 'You bring a reassuring amount of personality to a very ordinary errand.', 'You seem like the sort of person who waves back before checking whether the wave was for you.', 'You have definitely opened the fridge twice to see whether the choices improved.', 'You give the impression of someone who reads the instructions just after they would have helped.', 'You seem like you would make a very detailed plan and then improvise the important bit.'],
    medium: ['You look like you ask the waiter what is good and then order the same thing as always.', 'You have the energy of someone who says “quick question” just as everyone puts their coat on.', 'You seem like the sort of person who claps once and says “right” without having a plan.', 'You have definitely said “I knew that” after learning something for the first time.', 'You give the impression of someone who reads a message three times and still asks the question it answered.', 'You look like you keep a box because it is a really good box.', 'You seem like you would walk into a room, forget why, and blame the layout.'],
    savage: ['You have the confidence of a person who was told “good effort” and missed the tone.', 'You give the impression of someone who makes a simple task feel like a group punishment.', 'You seem like you would argue with the instructions and then blame the manufacturer.', 'You look like you say “let me play devil’s advocate” when nobody even wanted your regular opinion.', 'You have the energy of someone whose “quick question” makes people pretend they have a train to catch.', 'You seem like the person who says “we should do this more often” and is privately the reason we do not.', 'You look like you have strong opinions about things you have just heard of.']
  };
  var closers = {
    mild: ['There. A light toasting. You have survived worse group photos.', 'Take a bow. Slowly, so we can all pretend this was planned.', 'All said with affection. You do make it easy, though.', 'You are a good sport. We are assuming that until informed otherwise.', 'That is your roast. Best enjoyed with friends who know exactly what we mean.'],
    medium: ['There. Finally, a group project where you supplied all the material.', 'You can appeal, but the appeal may be read aloud.', 'Take a bow. We would ask for a speech, but we have all got things to do.', 'We roast because we care. Also because you keep giving us material.', 'That is your roast. No need to thank us; a brief period of reflection will do.'],
    savage: ['Take a bow. It is the most useful movement you have made in this conversation.', 'You can complain, but please keep it shorter than the list of reasons this worked.', 'There. Your friends have been workshopping that look on their faces for years.', 'No need to reply immediately. Give the self-awareness a chance to arrive first.', 'That is the roast. You did most of the preparation yourself.']
  };

  function cleanName(raw) {
    var name = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50) : '';
    if (!name || identifiers.test(name)) return 'Your friend';
    return name;
  }
  function makeRandom(rng) {
    return function () {
      var value;
      try { value = Number(rng()); } catch (_) { value = 0.5; }
      return Number.isFinite(value) ? Math.min(0.999999999, Math.max(0, value)) : 0.5;
    };
  }
  function generate(input, options) {
    input = input && typeof input === 'object' ? input : {};
    options = options && typeof options === 'object' ? options : {};
    var random = makeRandom(typeof options.rng === 'function' ? options.rng : Math.random);
    var name = cleanName(input.name);
    var heat = ['mild', 'medium', 'savage'].indexOf(input.heat) === -1 ? 'medium' : input.heat;
    var occasion = Object.prototype.hasOwnProperty.call(openers, input.occasion) ? input.occasion : 'just_because';
    var chosen = {};
    traitIds.forEach(function (id) {
      var found = bank[id].find(function (entry) { return entry.value === input[id]; });
      if (found) chosen[id] = found;
    });
    var notes = readDetails(input.details);
    var previous = typeof options.previous === 'string' ? options.previous : '';
    var output;
    for (var attempt = 0; attempt < 7; attempt += 1) {
      var pick = function (items) { return items[(Math.floor(random() * items.length) + attempt) % items.length]; };
      var shuffle = function (items) {
        var copy = items.slice();
        for (var s = copy.length - 1; s > 0; s -= 1) {
          var swap = (Math.floor(random() * (s + 1)) + attempt) % (s + 1);
          var item = copy[s]; copy[s] = copy[swap]; copy[swap] = item;
        }
        return copy;
      };
      var covered = {};
      // Preserve the specificity order for notes; use two independent details at most.
      var usableNotes = notes.matches.slice(0, 2);
      usableNotes.forEach(function (entry) {
        Object.keys(entry.covers).forEach(function (id) {
          if (chosen[id] && chosen[id].value === entry.covers[id]) covered[id] = true;
        });
      });
      var body = [];
      var combos = shuffle(combinations.filter(function (entry) {
        return Object.keys(entry.requirements).every(function (id) { return chosen[id] && chosen[id].value === entry.requirements[id] && !covered[id]; });
      }));
      combos.forEach(function (entry) {
        var ids = Object.keys(entry.requirements);
        if (ids.some(function (id) { return covered[id]; })) return;
        body.push(pick(entry.lines[heat]));
        ids.forEach(function (id) { covered[id] = true; });
      });
      shuffle(traitIds).forEach(function (id) {
        if (chosen[id] && !covered[id]) body.push(pick(chosen[id].lines[heat]));
      });
      usableNotes.forEach(function (entry) { body.push(pick(entry.lines[heat])); });
      var fillers = shuffle(generic[heat]);
      for (var f = 0; body.length < 3 && f < fillers.length; f += 1) {
        if (body.indexOf(fillers[f]) === -1) body.push(fillers[f]);
      }
      var opener = pick(openers[occasion]).replace('{name}', name);
      var closing = pick(closers[heat]);
      var midpoint = Math.ceil(body.length / 2);
      var paragraphs = [opener + ' ' + body.slice(0, midpoint).join(' ')];
      if (body.length > midpoint) paragraphs.push(body.slice(midpoint).join(' '));
      paragraphs.push(closing);
      output = { name: name, paragraphs: paragraphs, text: paragraphs.join('\n\n'), heat: heat, matchedDetails: usableNotes.map(function (entry) { return entry.label; }) };
      if (notes.supplied && !usableNotes.length) output.detailNote = 'That extra detail did not give the machine a usable angle. Try a habit, hobby, or a line like “collects antique doorknobs” or “always late.”';
      if (output.text !== previous) return output;
    }
    // A deliberately fixed RNG can still never strand the “Roast again” action.
    output.paragraphs[output.paragraphs.length - 1] = 'Encore complete. Apparently the material was renewable.';
    output.text = output.paragraphs.join('\n\n');
    return output;
  }

  return { fields: fields, generate: generate };
}));
