/* global PQ, PANS, PS, PSUR, PNM, esc, fmtM */

/* =====================================================================
   A BIGGER PRESS ROOM
   ---------------------------------------------------------------------
   "I also want there to be a lot more questions in the press conference
    — a lot more variety."

   The machinery for variety already exists and is good. `pressSeen()`
   remembers the last two hundred and twenty lines you have been asked,
   `pressQuestion` filters them out of the pool, and when the room runs
   dry it forgets the oldest seventy rather than repeating itself
   immediately. There is also a framing system that dresses a repeat
   differently when one is unavoidable.

   So the shortage was never the memory. It was the BANK. Every question
   carries a predicate saying when it applies, and on an ordinary
   Wednesday before an ordinary league game most of them do not — the
   post-match ones are out, the cup-final ones are out, the relegation
   ones are out. What is left is a couple of dozen lines, which the
   memory eats through in a fortnight, and then you are into the
   run-dry branch reading questions you had a month ago.

   This adds twenty-six topics with four phrasings and four answers
   each — a hundred and four new lines — and they are deliberately
   weighted toward the ordinary week rather than the big occasion,
   because the big occasions were already well covered and it is the
   ordinary weeks that repeat. The subjects are the ones a real press
   pack fills a Thursday with: the opposition manager, the referee, the
   pitch, the schedule, rotation, agents, the academy, a player's form,
   his own future, ticket prices, the international break, a fan protest,
   what people are saying on the radio.

   Every answer keeps the game's own four-option shape — a straight bat,
   a defensive one, a combative one and an honest one — because that is
   what the response system reads.
   ===================================================================== */

(function pressQuestions() {
  if (typeof PQ === 'undefined' || !Array.isArray(PQ)) return;
  if (typeof PANS !== 'object' || !PANS) return;

  const someone = (list) => Array.isArray(list) && list.length > 0;

  const BANK = [
    /* ---------------- the week, and the other lot ---------------- */
    {
      id: 'q-oppmgr', w: (F) => F.pre && F.oppMgr,
      q: (F) => [
        'What do you make of ' + PS((F.oppMgr && F.oppMgr.name) || 'the opposition manager') + ' and the job he is doing?',
        'You are up against ' + PS((F.oppMgr && F.oppMgr.name) || 'him') + ' again. What kind of game do you expect?',
        'Do you enjoy the tactical side of facing a manager like that?',
        'He has had things to say this week. Any response?'],
      a: [['🤝 Full respect', 'I have a lot of time for him and for what he is doing there. It will be a proper game of football.'],
        ['🎯 We focus on us', 'I will worry about my own team. If we are at it, the other bench is not my problem.'],
        ['🔥 We will be ready', 'He will have a plan and so will I. That is the job. We are not going there to admire them.'],
        ['😐 Not interested', 'I have not read a word of it and I am not about to start. Ask me about football.']],
    },
    {
      id: 'q-ref', w: (F) => F.pre && F.ref,
      q: () => [
        'The referee has been announced for this one. Any thoughts?',
        'There has been a lot of talk about officiating this season. Where do you stand?',
        'Do you speak to your players about how a particular referee handles a game?',
        'Would you like to see managers able to talk to referees afterwards?'],
      a: [['🤐 Not going there', 'I am not talking about referees before a ball is kicked. It never ends well for anybody.'],
        ['⚖️ They have a hard job', 'It is the hardest job on the pitch and most of them get most of it right. I will leave it there.'],
        ['🔥 Consistency', 'All I ask for is the same decision at both ends. That is not a complaint, it is a standard.'],
        ['🎯 We adapt', 'We look at how a game is likely to be refereed and we prepare for it, like we would the opposition.']],
    },
    {
      id: 'q-pitch', w: (F) => F.pre,
      q: (F) => [
        'The surface at ' + PS(F.opp && F.opp.stadium ? F.opp.stadium : 'their place') + ' has had some criticism. Does that concern you?',
        'Does the state of a pitch change how you set a team up?',
        'Your own pitch — are you happy with it this season?',
        'Some managers blame the surface. Is that ever fair?'],
      a: [['🧊 No excuses', 'It is the same pitch for both teams. I have never once used it as a reason afterwards and I am not starting.'],
        ['🎯 It affects the plan', 'Of course it does. If you cannot trust the bounce you play differently, and we will.'],
        ['🛡️ Player safety', 'My only interest is that nobody gets hurt on it. Beyond that it is what it is.'],
        ['😐 Never thought about it', 'Honestly? It has not come up once this week. We have better things to work on.']],
    },
    {
      id: 'q-schedule', w: (F) => F.pre && F.rest != null && F.rest <= 4,
      q: (F) => [
        'Three games in a week again. Is the schedule sustainable?',
        'You have had ' + (F.rest == null ? 'barely any' : F.rest) + ' days between games. How do you manage that?',
        'Do you think anybody making these fixture lists has ever coached a team?',
        'Does a run like this decide your team for you?'],
      a: [['😠 It is too much', 'Somebody should ask the players what they think, because nobody has. It is relentless and it is not safe.'],
        ['🔄 That is what a squad is for', 'We have a squad for exactly this. Some of them are about to get the chance they have been waiting for.'],
        ['🧊 Everyone has it', 'Every club at this level deals with the same thing. We are not looking for sympathy.'],
        ['🛡️ We manage bodies', 'We will make decisions on physical data, not on reputation. Some big names may sit out and that is fine.']],
    },
    {
      id: 'q-intbreak', w: (F) => F.pre,
      q: () => [
        'The international break is coming. Do you dread them?',
        'How many of yours are away this time, and does it disrupt you?',
        'Is it a chance to work with the ones who stay, or just a nuisance?',
        'Do you speak to international coaches about how your players are used?'],
      a: [['😠 Disruptive', 'You send fit players away and you get tired ones back. That is the honest answer everybody in the game gives privately.'],
        ['📈 A chance to work', 'It is two weeks on the training ground with the lads who stay. I quite like them for that.'],
        ['🤝 Proud of them', 'Any player of mine representing his country is a good thing for this club. I will not begrudge that.'],
        ['🧊 Part of the calendar', 'It is in the schedule, so we plan around it. There is no point complaining about the weather.']],
    },

    /* ---------------- the squad, week to week ---------------- */
    {
      id: 'q-rotation', w: (F) => F.pre && someone(F.bench),
      q: (F) => [
        someone(F.bench) ? PSUR(F.bench[0]) + ' has hardly featured. Is he in your plans?' : 'Is everyone in your plans?',
        'How do you keep a player happy when he is not playing?',
        'Do you tell a player in advance that he is not involved?',
        'Is there a point where a fringe player has to be moved on for his own good?'],
      a: [['🤝 Everyone matters', 'You do not get through a season with eleven players. He knows how highly I rate him and his time is coming.'],
        ['😠 It is on him', 'The shirt is available to anybody who takes it in training. It is not a queue, it is a competition.'],
        ['💬 We talk', 'I tell them the truth to their face on a Friday, even when it is not what they want. They deserve that much.'],
        ['🎯 Patience', 'He is closer than people think. I would ask him to stay patient and keep doing what he is doing.']],
    },
    {
      id: 'q-form-dip', w: (F) => F.pre && someone(F.worst ? [F.worst] : []),
      q: (F) => [
        F.worst ? 'Is ' + PSUR(F.worst) + ' going through a difficult spell?' : 'Is anybody struggling for form?',
        F.worst ? 'How do you get a player like ' + PSUR(F.worst) + ' back to his level?' : 'How do you lift a player who is short of form?',
        'Do you take a struggling player out of the firing line, or play him through it?',
        'How much of a dip is technical and how much of it is between the ears?'],
      a: [['🛡️ Back him publicly', 'He is a top player having a hard month. He will get nothing but support from me and from this building.'],
        ['📈 Work him through it', 'Extra sessions, more video, more of the ball. Form comes back through the grass, not through talking about it.'],
        ['🔄 A rest might help', 'Sometimes a week out of the noise does more than a week of drills. I will decide what he needs.'],
        ['😠 He knows the level', 'He has set a standard here and he is a long way below it. He has heard that from me already.']],
    },
    {
      id: 'q-captain', w: (F) => F.pre && F.capt,
      q: (F) => [
        F.capt ? 'What does ' + PSUR(F.capt) + ' give you as captain that the numbers do not show?' : 'What do you want from a captain?',
        'How much does a dressing room lead itself, and how much comes from you?',
        'Would you ever take the armband off somebody?',
        'Is a captain picked for how he plays or how he speaks?'],
      a: [['❤️ He sets the tone', 'He is the first one in and the last one out, and the young lads copy him. That is worth more than any team talk of mine.'],
        ['💬 They lead each other', 'The best dressing rooms police themselves. Mine does, and I would rather it that way.'],
        ['🎯 It is a football decision', 'The armband goes to the man best placed to have it. That is reviewed like everything else.'],
        ['🧊 It is overrated', 'A captain is a player with a bit of cloth on his arm. The eleven of them win games, not one of them.']],
    },
    {
      id: 'q-academy', w: (F) => F.pre && someone(F.kids),
      q: (F) => [
        someone(F.kids) ? 'How close is ' + PSUR(F.kids[0]) + ' to being a regular?' : 'How close is the next one from the academy?',
        'What is the pathway here for a boy in the under-21s?',
        'Do you have to protect a young player from expectation these days?',
        'Is it harder to break through now than when you were playing?'],
      a: [['🌱 Closer than you think', 'He is training with us every day and he is not out of place. That is usually the sign.'],
        ['🛡️ No rush', 'He will play when he is ready and not a week before. I have seen too many careers ruined by a good headline.'],
        ['🎯 Merit only', 'There is no pathway here other than being good enough. That is the fairest thing I can offer any of them.'],
        ['😠 It is on them', 'The door is open. Whether they walk through it is not something I can do for them.']],
    },
    {
      id: 'q-agents', w: (F) => F.pre && someone(F.expiring),
      q: (F) => [
        someone(F.expiring) ? 'There is talk about ' + PSUR(F.expiring[0]) + '’s contract. Where does that stand?' : 'Where do the contract situations stand?',
        'How much do agents complicate your job?',
        'Would you let a player run down a contract rather than sell?',
        'Does a player in his last year approach a season differently?'],
      a: [['🤐 Club business', 'Contracts are dealt with inside the building and that is where they will stay. I never negotiate through a microphone.'],
        ['🤝 Confident', 'He is happy here, his family are settled and we are talking. I would be surprised if it is not resolved.'],
        ['😠 It is a circus', 'There are people involved in this game who have never kicked a ball and have far too much to say. Draw your own conclusions.'],
        ['🧊 He is professional', 'Whatever happens with his contract he will play the way he always plays. I have no concerns there.']],
    },
    {
      id: 'q-unhappy', w: (F) => F.pre && someone(F.unhappy),
      q: (F) => [
        'Is everybody happy in that dressing room?',
        'There are suggestions of unrest. Anything in that?',
        'How do you handle a player who has told you he wants to leave?',
        'Does one unhappy player affect the rest of a squad?'],
      a: [['🧊 Nothing in it', 'You will always find somebody to tell you a story. There is nothing in it and the group is in a good place.'],
        ['💬 We deal with it', 'If a player has a problem he brings it to me, we sort it, and it stays between us. That is how it works here.'],
        ['😠 They can go', 'Anybody who does not want to be here is free to say so and I will help them find a door. I want willing men only.'],
        ['🛡️ It is human', 'Footballers are people. Some of them are frustrated and I would be worried if they were not. It is managed.']],
    },
    {
      id: 'q-gk', w: (F) => F.pre && F.gk,
      q: (F) => [
        F.gk ? 'Is ' + PSUR(F.gk) + ' your number one for the rest of the season?' : 'Is your goalkeeping position settled?',
        'How much does a settled goalkeeper matter to a defence?',
        'Do you rotate goalkeepers for cup ties, and does that undermine anybody?',
        'What do you look for in a goalkeeper beyond shot-stopping?'],
      a: [['🛡️ He is my keeper', 'He is my goalkeeper and he has my full backing. I do not think that has ever been in question.'],
        ['🎯 Nobody is guaranteed', 'That shirt is earned every week like every other one. He would not want it any other way.'],
        ['📈 With the ball', 'What he does with his feet matters as much as his hands now. That is the modern game, like it or not.'],
        ['😐 It is not a story', 'I have two very good goalkeepers and I sleep fine. I am not sure where this is going.']],
    },

    /* ---------------- you, and the outside world ---------------- */
    {
      id: 'q-your-future', w: (F) => F.pre && F.patience != null && F.patience < 55,
      q: () => [
        'There has been speculation about your position. Have you had assurances?',
        'Do you read what is written about you?',
        'How much does the noise around a manager reach the players?',
        'Do you enjoy the job as much as you thought you would?'],
      a: [['🧊 Not a thought', 'I have not given it one second of my week. I have a game to prepare for and that is a full-time occupation.'],
        ['🤝 The board are supportive', 'I speak to them regularly and there is no issue. I would not insult anybody by pretending results have been good enough.'],
        ['😠 It comes with it', 'Every manager in the country is one bad month from this conversation. It is the job you sign up for.'],
        ['❤️ I love it', 'Best job in football on the best days and the worst on the others. I would not swap it for anything.']],
    },
    {
      id: 'q-criticism', w: (F) => F.pre || F.post,
      q: () => [
        'Some notable ex-players have been critical of how you set up. Any answer?',
        'Do you think punditry has changed the way supporters watch a game?',
        'Does criticism from a former player of this club sting more?',
        'Would you ever pick up the phone to somebody who has had a go?'],
      a: [['🧊 They have a job', 'They are paid to have opinions and I am paid to get results. We will both carry on.'],
        ['😠 Come and do it', 'It is a lot easier from a chair on a Sunday than it is from a touchline on a Tuesday night in February.'],
        ['🤝 Fair enough', 'Some of it is fair. I have said harder things to my players this week than anybody has said on television.'],
        ['😐 I do not watch it', 'I genuinely do not see any of it. My evenings go on footage of the next opponent.']],
    },
    {
      id: 'q-fans', w: (F) => F.fans,
      q: () => [
        'What is your message to supporters travelling on a Tuesday night?',
        'Have you noticed a change in the atmosphere at home games?',
        'What do you say to a supporter paying a lot of money to watch this team?',
        'Do the players understand what this club means to the people who follow it?'],
      a: [['❤️ They are everything', 'They spend money they have worked hard for to follow us. The very least we owe them is effort.'],
        ['🔥 Get behind us', 'We need them with us, especially when it is not going well. That is when a crowd is actually worth something.'],
        ['🎯 We have to earn it', 'You cannot demand support. You earn it with performances and we have not always done that.'],
        ['🛡️ Do not turn on them', 'If they want to have a go, have a go at me. Leave the players alone — they are trying.']],
    },
    {
      id: 'q-money', w: (F) => F.pre && F.budget != null,
      q: (F) => [
        'Are you satisfied with the resources you have been given?',
        'Supporters see the money in this game and wonder where it goes. What would you tell them?',
        'Would you spend ' + (F.budget ? PS(fmtM(F.budget)) : 'what you have') + ' on one player, or spread it?',
        'Do you think the size of a wage bill decides a league table?'],
      a: [['🤝 No complaints', 'I knew what this job was when I took it. I will not stand here asking for sympathy about money.'],
        ['📈 We need more', 'If we want to compete with the clubs above us then eventually the answer is yes, and everybody knows it.'],
        ['🎯 Spend it well', 'It is not what you spend, it is who you buy. I would rather have two right ones than five expensive ones.'],
        ['😠 It is not the whole story', 'If money decided it we would not bother playing the games. Ask anybody who has been beaten by a smaller club.']],
    },

    /* ---------------- after the whistle ---------------- */
    {
      id: 'q-post-firsthalf', w: (F) => F.post,
      q: () => [
        'What did you say to them at half-time?',
        'Was that a game of two halves, and which one was the real you?',
        'Did you consider changing it earlier than you did?',
        'How different was the second half from what you asked for at the break?'],
      a: [['🔥 I was honest', 'I told them exactly what I thought of the first half. It was not a long team talk and it was not a quiet one.'],
        ['🧊 Calm', 'There was no shouting. They knew what was wrong; they needed clarity, not volume.'],
        ['🎯 A tactical change', 'We adjusted where we were picking the ball up and it changed the game. That was the difference.'],
        ['🤝 I backed them', 'I told them I trusted them to sort it out, and they did. That is a good sign about this group.']],
    },
    {
      id: 'q-post-subs', w: (F) => F.post,
      q: () => [
        'Talk us through your substitutions.',
        'Did the bench change the game today?',
        'One of those changes did not work. Would you make it again?',
        'How much of a substitution is planned and how much is instinct?'],
      a: [['🎯 They did their job', 'The lads who came on gave us exactly what we needed. That is what a squad looks like when it is working.'],
        ['🛡️ Legs and minutes', 'It was about fresh legs. There are three games in eight days and I will not burn anybody out.'],
        ['😐 It did not come off', 'It did not work today. I would make it again tomorrow because it was the right call at the time.'],
        ['🔥 We went for it', 'I put another forward on because we were not going to sit there and settle. Nobody can accuse us of that.']],
    },
    {
      id: 'q-post-chances', w: (F) => F.post,
      q: (F) => [
        F.res === 'W' ? 'You might have had more. Does the scoreline flatter them?' : 'Was it a lack of chances or a lack of finishing?',
        'How many clear openings do you think you created?',
        'Are you a manager who trusts the underlying numbers or your eyes?',
        'Do you worry about where the goals come from in this team?'],
      a: [['📈 The chances were there', 'We created plenty. If we take those we are talking about a comfortable afternoon.'],
        ['😠 Not clinical', 'At this level you get punished for that. We have to be far more ruthless and they know it.'],
        ['🎯 The process is right', 'If we keep getting into those areas the goals arrive. I am not panicking about that.'],
        ['🛡️ Credit their keeper', 'Their goalkeeper has had a very good afternoon. Sometimes that is the whole explanation.']],
    },
    {
      id: 'q-post-discipline', w: (F) => F.post && (F.reds || F.oppReds),
      q: (F) => [
        F.reds ? 'Was the red card the turning point?' : 'Did the sending-off change the game?',
        'Have you spoken to the player involved?',
        'Do you think it was a red card, honestly?',
        'Is indiscipline something you have had to address with this group?'],
      a: [['🤐 I will not comment', 'I have not seen it back and I am not going to give you a headline before I have. Ask me in a week.'],
        ['🛡️ Protect the player', 'He is devastated and he does not need me adding to it publicly. We will deal with it inside.'],
        ['😠 It was never a red', 'I thought it was harsh and I think most people in that ground thought the same. I will leave it there.'],
        ['🎯 We were the problem', 'You cannot do that at this level. It let the team down and he knows it before I say a word.']],
    },
    {
      id: 'q-post-nextup', w: (F) => F.post,
      q: () => [
        'How quickly do you have to put this one away?',
        'Does a result like that change anything about next week?',
        'What do you do with the two days after a night like this?',
        'Is the reaction in the next game the thing you judge them on?'],
      a: [['🧊 Straight on', 'It is finished the moment we get on the bus. Everything from tomorrow is about the next one.'],
        ['📈 We will learn from it', 'There is a lot in that game worth watching back, good and bad. We will do exactly that on Monday.'],
        ['🔥 The reaction is everything', 'Anybody can play well when it is going well. I want to see what they are made of on Saturday.'],
        ['❤️ Enjoy it', 'They have worked hard for this. I will let them enjoy tonight before we go again.']],
    },
    {
      id: 'q-post-style', w: (F) => F.post,
      q: () => [
        'Some would say that was not easy on the eye. Does that bother you?',
        'Is there a version of winning that you would not accept?',
        'How much of what we saw is your idea and how much is the players’?',
        'Are you building towards a style, or towards results?'],
      a: [['🧊 Results first', 'Nobody looks at a league table in May and asks whether it was pretty. We won the game.'],
        ['📈 We are getting there', 'What we are building takes time. There were passages in that which are exactly what I want.'],
        ['🔥 That is us', 'That is the identity of this team — aggressive, on the front foot, hard to play against. I am proud of it.'],
        ['😐 Not good enough', 'I did not enjoy watching that either, and I am the one responsible for it.']],
    },

    /* ---------------- filler that always applies ---------------- */
    {
      id: 'open-mood', w: () => true,
      q: () => [
        'How has the mood been around the training ground this week?',
        'Anything you have particularly worked on in the last few days?',
        'Is there a good feeling about the place at the moment?',
        'What has the week looked like for you personally?'],
      a: [['💪 Very good', 'Excellent. Sharp, focused, plenty of noise on the training pitch. You can tell they are looking forward to it.'],
        ['🎯 Businesslike', 'Quiet and serious, which is how I like it before a game like this. Nobody is getting carried away.'],
        ['🛡️ Hard work', 'It has been a demanding week because it needed to be. They will feel the benefit on Saturday.'],
        ['😐 Same as any other', 'Honestly, it looks like every other week. That consistency is the thing I am proudest of.']],
    },
    {
      id: 'open-oneword', w: () => true,
      q: () => [
        'Sum up where this team is right now in one sentence.',
        'If you had to name the one thing that would take this side forward, what is it?',
        'What would a successful season look like from where you are sitting today?',
        'What is the biggest misconception about this team?'],
      a: [['📈 Improving', 'A team that is getting better. Not finished, not close to it, but better than it was and going the right way.'],
        ['🎯 Ruthlessness', 'We need to be more ruthless in both boxes. Everything else is in place.'],
        ['🛡️ Belief', 'They need to believe they belong at this level. The ability has never been the issue.'],
        ['❤️ Together', 'People underestimate how close this group is. That is worth points over a season.']],
    },
    {
      id: 'open-personal', w: () => true,
      q: () => [
        'Do you switch off from football at all, or is it every hour?',
        'Who do you lean on when a week has been difficult?',
        'What did you learn from the manager who influenced you most?',
        'Do you watch other games for pleasure, or only for work?'],
      a: [['⚽ It never stops', 'My family would tell you I am watching a game at midnight when I said I was going to bed. They are right.'],
        ['❤️ My family', 'You need people who do not care what the result was on Saturday. Mine could not tell you the score.'],
        ['🎯 Standards', 'The best one I played under never let a single thing slide. Not one. I have tried to take that with me.'],
        ['😐 It is a job', 'I love it, but it is work. When I am home I try very hard to be home.']],
    },
    {
      id: 'open-history', w: () => true,
      q: (F) => [
        'How aware are the players of the history of this football club?',
        'Does the weight of expectation here help or hurt a young player?',
        'Have you changed anything about the place since you arrived?',
        'What do you want people to say about your time here when it ends?'],
      a: [['❤️ It is everywhere', 'You walk down that corridor every morning past the photographs. You do not need reminding where you are.'],
        ['🛡️ It can weigh on you', 'For a young lad it can be heavy. Part of my job is to take some of that weight off him.'],
        ['📈 Standards inside', 'The things I have changed are small and nobody outside would notice one of them. They add up.'],
        ['🎯 That we tried', 'That we played the right way and we never hid. Trophies would be nice as well.']],
    },
  ];

  /* the game's own shape: a rule with an id, a predicate and phrasings,
     and an answer function keyed by the same id */
  const have = new Set(PQ.map((rule) => rule.id));
  BANK.forEach((entry) => {
    if (have.has(entry.id)) return;
    PQ.push({ id: entry.id, w: entry.w, q: entry.q });
    if (!PANS[entry.id]) PANS[entry.id] = () => entry.a;
  });

  try {
    window.RBSPressQuestions = Object.freeze({ BANK, added: BANK.length });
  } catch (error) { /* no window */ }
}());
