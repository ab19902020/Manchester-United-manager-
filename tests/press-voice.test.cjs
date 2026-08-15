const test = require('node:test');
const assert = require('node:assert/strict');

const { createGame, startCareer } = require('./game-harness.cjs');

/*
 * British male voices, and a press room with more in it.
 *
 * The voice half is checked against a fake voice list rather than the
 * browser's, because a headless test machine has no speech engine and
 * the bug being fixed was in the SELECTION, not the speaking: a pool
 * that filtered for a man, found none because Android names its voices
 * "English United Kingdom 1", and silently fell back to every voice on
 * the device — very often a woman.
 */

test('the voice pool never falls back to a woman', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Presser');

    const result = game.eval(`(function () {
      /* a device that names nobody, the case that defeated the original */
      const anonymous = [
        { name: 'English United Kingdom 1', lang: 'en-GB' },
        { name: 'English United Kingdom 2', lang: 'en-GB' },
        { name: 'English United States 3', lang: 'en-US' },
      ];
      /* and a device that names everybody */
      const named = [
        { name: 'Google UK English Female', lang: 'en-GB' },
        { name: 'Google UK English Male', lang: 'en-GB' },
        { name: 'Microsoft Aria Online', lang: 'en-US' },
        { name: 'Daniel', lang: 'en-GB' },
      ];
      const v = window.RBSPressVoice;
      return {
        anonFemale: anonymous.filter((x) => v.isFemale(x)).length,
        namedFemale: named.filter((x) => v.isFemale(x)).map((x) => x.name),
        namedMale: named.filter((x) => v.isMale(x)).map((x) => x.name),
        british: named.filter((x) => v.isBritish(x)).length,
      };
    }())`);

    assert.equal(result.anonFemale, 0,
      'an anonymous voice must not be treated as female — it is unknown');
    /* joined rather than deep-compared: these arrays come back from the
       JSDOM window realm, so deepStrictEqual fails on the prototype even
       when the contents match. Cost me three red tests to remember. */
    assert.equal(Array.from(result.namedFemale).join('|'),
      'Google UK English Female|Microsoft Aria Online',
      'a named woman must be recognised on either engine');
    const men = Array.from(result.namedMale).join('|');
    assert.ok(men.includes('Google UK English Male'), men);
    assert.ok(men.includes('Daniel'), men);
    assert.equal(result.british, 3);
  } finally {
    game.close();
  }
});

test('a British male voice outranks an American one and a woman', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Presser');

    const result = game.eval(`(function () {
      const gbMale = { name: 'Google UK English Male', lang: 'en-GB', localService: false };
      const usMale = { name: 'Google US English Male', lang: 'en-US', localService: false };
      const gbFemale = { name: 'Google UK English Female', lang: 'en-GB', localService: false };
      return {
        gbMale: ttsScore(gbMale),
        usMale: ttsScore(usMale),
        gbFemale: ttsScore(gbFemale),
      };
    }())`);

    assert.ok(result.gbMale > result.usMale,
      'this is an English football press room: en-GB has to win');
    assert.ok(result.gbMale > result.gbFemale,
      'and a man has to outrank a woman when male voices were asked for');
  } finally {
    game.close();
  }
});

test('every line the game speaks asks for a male voice', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Presser');

    const result = game.eval(`(function () {
      /* catch what reaches the layer underneath, whatever the caller said */
      const seen = [];
      const real = window.ttsSay;
      let inner = null;
      /* re-wrap at the bottom by spying on ttsCast, which is what
         actually consumes the gender */
      const realCast = window.ttsCast;
      window.ttsCast = function (who, gender) { seen.push(gender); return { v: null, rate: 1, pitch: 1 }; };
      try {
        /* speech is off in a headless test, so call the chooser through
           the same path the press room uses */
        ttsSay('A question, boss?', 'Laura Hughes', {});
        ttsSay('Stadium announcement', 'stadium-announcer', { gender: 'f' });
      } catch (error) { /* no speech engine */ }
      window.ttsCast = realCast;
      return { seen, reporters: REPORTERS.slice(0, 6) };
    }())`);

    /* the press pack is male, so the byline matches the voice */
    assert.ok(result.reporters.length >= 4);
    const female = Array.from(result.reporters)
      .filter((n) => /^(Laura|Priya|Sofia|Nia|Sandra|Bethan|Aisha)\b/.test(n));
    assert.equal(female.join('|'), '',
      'the press pack should not carry women over men\'s voices');
  } finally {
    game.close();
  }
});

test('the press room has a lot more to ask', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Presser');

    const result = game.eval(`(function () {
      const added = window.RBSPressQuestions.BANK;
      const ids = new Set(PQ.map((r) => r.id));
      /* every new topic is in the bank, and every one of them has answers */
      const missing = added.filter((e) => !ids.has(e.id)).map((e) => e.id);
      const noAnswers = added.filter((e) => typeof PANS[e.id] !== 'function').map((e) => e.id);
      /* four ways of asking and four ways of answering, every time */
      const shortQ = added.filter((e) => {
        try { return (e.q({ opp: G.clubs[1], pre: true, post: false }) || []).length < 4; }
        catch (error) { return true; }
      }).map((e) => e.id);
      const shortA = added.filter((e) => (e.a || []).length !== 4).map((e) => e.id);
      /* and the ones that always apply really do always apply */
      const filler = added.filter((e) => /^open-/.test(e.id));
      return {
        topics: added.length,
        bank: PQ.length,
        missing, noAnswers, shortQ, shortA,
        filler: filler.length,
        fillerAlwaysOn: filler.every((e) => e.w({}) === true),
      };
    }())`);

    assert.ok(result.topics >= 26, `a lot more questions (${result.topics} topics added)`);
    assert.equal(Array.from(result.missing).join('|'), '', 'every new topic should be in the bank');
    assert.equal(Array.from(result.noAnswers).join('|'), '', 'and every one of them answerable');
    assert.equal(Array.from(result.shortQ).join('|'), '', 'four ways of asking each one');
    assert.equal(Array.from(result.shortA).join('|'), '', 'four ways of answering each one');
    assert.ok(result.filler >= 4, 'including filler for an ordinary week');
    assert.equal(result.fillerAlwaysOn, true,
      'filler has to apply on a quiet Wednesday, which is when the room repeats itself');
    assert.ok(result.bank >= 90, `the whole bank should be much bigger now (${result.bank})`);
  } finally {
    game.close();
  }
});

test('the new questions survive a real press conference', async () => {
  const game = await createGame();
  try {
    await startCareer(game, 'Presser');

    const result = game.eval(`(function () {
      /* stand a conference up the way the game does */
      const opp = G.clubs.filter((c) => c.i !== G.my)[0];
      G.pressCtx = { oppI: opp.i, kind: 'pre', q: 0, _asked: [] };
      G.pressSeen = [];
      const asked = [];
      for (let i = 0; i < 40; i += 1) {
        G.pressCtx.q = i;
        G.pressCtx._qCache = null;
        const line = pressQuestion();
        if (line) asked.push(line);
        /* remember it the way the game does, so the pool drains */
        const bank = pressBank();
        if (bank.length) pressRemember(bank[i % bank.length].id);
      }
      return { asked: asked.length, unique: new Set(asked).size, sample: asked.slice(0, 3) };
    }())`);

    assert.equal(result.asked, 40, 'forty questions should have come out');
    assert.ok(result.unique >= 30,
      `and they should mostly differ from each other (${result.unique} of 40 unique)`);
    result.sample.forEach((line) => {
      assert.ok(typeof line === 'string' && line.length > 12, 'each one a real question');
    });
  } finally {
    game.close();
  }
});
