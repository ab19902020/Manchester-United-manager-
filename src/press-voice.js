/* global ttsSay:writable, ttsPool:writable, ttsScore:writable, ttsGender,
          TTS, REPORTERS */

/* =====================================================================
   BRITISH MALE VOICES, AND ONLY THOSE
   ---------------------------------------------------------------------
   "all the text to speech should be male voices — currently they're all
   female voices. British male voices only."

   WHY IT WAS COMING OUT FEMALE, which is not what the code looks like it
   does. The press room already asks for a gender: a question is spoken
   with `{gender: nameGender(c.rep)}`, so the voice is supposed to match
   the byline. And `ttsPool(gender)` already filters the browser's voices
   down to that gender. Two things defeat it.

   The first is that half the press pack are women. `REPORTERS` is Laura
   Hughes, James Cooper, Priya Patel, Danny Whitmore… so half the
   questions were always going to be asked in a woman's voice, correctly.

   The second is the fallback, and it is the one that made it "all"
   rather than "half":

       const g = base.filter(v => ttsGender(v) === gender);
       return g.length ? g : base;

   `ttsGender` reads the voice's NAME. Android names its English voices
   "English United Kingdom 1" through 4 — no name, no gender word, no
   match. So on a great many phones the male filter returns nothing and
   the pool silently becomes every voice on the device, and the highest
   scoring of those is very often the default, which is very often
   female. The filter was not selecting a man, it was selecting nothing
   and then giving up.

   ---------------------------------------------------------------------
   WHAT THIS DOES, in the order it matters.

   1. Every line the game speaks asks for a male voice. Not only the
      press room — the stadium announcer, the preview line, the voice
      test in settings.

   2. When no voice can be positively identified as male, the pool falls
      back to "everything not identified as FEMALE" rather than to
      everything. On a device whose voices are anonymous that is the
      whole list, which is no worse than before; on a device that names
      even one of them, every named woman is out.

   3. British first. `ttsScore` already gave en-GB thirty points, which
      an American neural voice could outscore. It is worth far more than
      that here — it is an English football press room — so en-GB is
      lifted decisively, and a voice that names itself male is lifted
      again.

   4. And the press pack is male, so the byline matches the voice. This
      is the part I am least comfortable with, because a real press room
      is not, and the game had women in it on purpose. It is done because
      a woman's name over a man's voice is worse than either — and it is
      one array, easy to put back.
   ===================================================================== */

(function pressVoice() {
  /* names that are positively a woman, on any speech engine I can find */
  const FEMALE = /(female|woman|\bshe\b|samantha|karen|moira|tessa|fiona|victoria|susan|zira|hazel|serena|allison|ava|joanna|salli|kendra|kimberly|ivy|sonia|libby|aria|jenny|michelle|nicky|catherine|amelie|martha|emily|kate|linda|heather|zoe|clara|maisie|olivia|elizabeth|natasha|nora|amber|luciana|paulina|veena|fem\b|\bf\b)/i;
  const MALE = /(\bmale\b|\bman\b|daniel|\balex\b|\bfred\b|oliver|thomas|\btom\b|aaron|\bdavid\b|\bmark\b|george|\bguy\b|ryan|brandon|christopher|\beric\b|roger|steffan|arthur|rishi|gordon|\blee\b|\bjames\b|william|matthew|liam|ethan|nathan|reed|tony|bruce|albert|\bralph\b|\brichard\b|\bmasc\b)/i;

  const nameOf = (v) => String((v && v.name) || '') + ' ' + String((v && v.voiceURI) || '');
  const isFemale = (v) => FEMALE.test(nameOf(v));
  const isMale = (v) => MALE.test(nameOf(v));
  const isBritish = (v) => /^en-GB/i.test(String((v && v.lang) || ''));

  /* ---- 1. everything the game says, says it as a man ---- */
  if (typeof ttsSay === 'function') {
    const previous = ttsSay;
    ttsSay = function ttsSayMale(text, who, opt) {
      const options = Object.assign({}, opt || {});
      options.gender = 'm';
      return previous.call(this, text, who, options);
    };
  }

  /* ---- 2 and 3. a pool that cannot quietly give up ---- */
  if (typeof ttsPool === 'function') {
    const previous = ttsPool;
    ttsPool = function ttsPoolBritishMale(gender) {
      const base = previous.call(this, gender);
      try {
        if (gender !== 'm' || !Array.isArray(base) || !base.length) return base;
        /* if the engine named a British man, that is the answer */
        const britishMen = base.filter((v) => isMale(v) && isBritish(v));
        if (britishMen.length) return britishMen;
        const men = base.filter((v) => isMale(v));
        if (men.length) return men;
        /* nobody is identifiable, so take everybody who is definitely
           not a woman — the step the original was missing */
        const britishRest = base.filter((v) => !isFemale(v) && isBritish(v));
        if (britishRest.length) return britishRest;
        const rest = base.filter((v) => !isFemale(v));
        return rest.length ? rest : base;
      } catch (error) {
        return base;
      }
    };
  }

  if (typeof ttsScore === 'function') {
    const previous = ttsScore;
    ttsScore = function ttsScoreBritishMale(v) {
      let score = previous.apply(this, arguments);
      try {
        if (isBritish(v)) score += 70;
        if (isMale(v)) score += 45;
        if (isFemale(v)) score -= 120;
      } catch (error) { /* the base ranking still stands */ }
      return score;
    };
  }

  /* the list was ranked before this layer loaded, so rank it again */
  try {
    if (TTS && TTS.voices && TTS.voices.length && typeof window.ttsIndex === 'function') {
      window.ttsIndex(TTS.voices.slice());
    }
  } catch (error) { /* it re-ranks itself when the voices next change */ }

  /* ---- 4. and the byline matches the voice ---- */
  try {
    if (typeof REPORTERS !== 'undefined' && Array.isArray(REPORTERS)) {
      const men = ['James Cooper', 'Danny Whitmore', 'Tom Beckett', 'Marcus Reeve',
        'Dean Whitlock', 'Terry Docherty', 'Ollie Grant', 'Gareth Vaughan',
        'Ian Mercer', 'Ross Kilbride', 'Neil Ashworth', 'Paul Ferriday',
        'Steve Nolan', 'Clive Bannerman', 'Rory Maguire', 'Alan Prosser'];
      REPORTERS.length = 0;
      men.forEach((name) => REPORTERS.push(name));
    }
  } catch (error) { /* the old pack still works */ }

  try {
    window.RBSPressVoice = Object.freeze({ FEMALE, MALE, isFemale, isMale, isBritish });
  } catch (error) { /* no window */ }
}());
