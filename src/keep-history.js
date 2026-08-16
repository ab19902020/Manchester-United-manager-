/* global trimCareers:writable, trimFixtures:writable */

/* =====================================================================
   THE WORLD KEEPS ITS PAST
   ---------------------------------------------------------------------
   "I need to understand the world. It can't forget anything from the
    seasons. Keep it all there."

   A save was throwing two things away, and neither was visible until you
   went looking for something that used to be there.

   1. `trimCareers()` — every player's match history, kept in proportion
      to how close he was to you:

          KEEP_MINE = 24    your own squad
          KEEP_DIV  = 4     the division you play in
          KEEP_REST = 0     the other 460 clubs

      Agent One measured it: 1,160 players outside the manager's division
      had a match log and a save carried none of them. Open a rival
      striker's record after a reload and it was empty.

   2. `trimFixtures()` — the scorers and events of every played match in
      the world that you were not in. Nine thousand fixtures a season,
      and after a save nobody scored in any of them.

   Both were reasonable calls when the save had to fit a browser and
   nothing read the data. The director has decided otherwise, and he is
   right: a career you run for thirty years is a world with a past, and a
   game that forgets who scored is not one you can understand.

   ---------------------------------------------------------------------
   TWO THINGS I GOT WRONG ON THE WAY, BOTH FROM A BAD MEASUREMENT.

   My first check said only 5,801 of 12,701 log entries reached the file
   and I went looking for a third trimmer. I found two candidates and
   nearly shipped a guard against one of them: a cap in `dailyTickCore`
   that cuts a rival's log to eighteen entries every nine days. The guard
   walked all ten thousand players on every day tick to put back anything
   the cap shortened.

   It did nothing, and measuring with and without it proved that:

       with the guard     mem 12,765   over 18: 0   written 12,765
       without it         mem 12,712   over 18: 0   written 12,712

   The cap never bites, because a rival only logs matches against YOUR
   club — the average rival carries about six entries and none reaches
   eighteen. The guard came out again.

   And the shortfall was never real. The packer stores the log at
   `pk.indexOf('log') + 2`, and I was reading `+ 0` — a different field
   that happened to hold an array. Read at the right offset, the written
   total equals the in-memory total exactly. Two trimmers were the whole
   problem.

   `shedForSlot()` still empties rival logs, but only on the legacy
   localStorage path, which physically cannot hold a save this size. The
   primary store is IndexedDB and it keeps everything.

   ---------------------------------------------------------------------
   THIS REPLACES RATHER THAN WRAPS, DELIBERATELY.

   Everywhere else in this repository, replacing a function instead of
   wrapping it is the bug — it silently discards every layer beneath.
   Here the whole purpose is to stop the trimming happening at all, and a
   wrapper cannot: by the time it runs, the base has already emptied the
   arrays. So each trimmer becomes a no-op that returns the no-op restore
   its callers expect.

   The consequence, stated plainly: **saves get bigger.** That is the
   trade the director asked for, with his eyes open. The measurement is
   in the commit message and in `scripts/measure-stored-save.cjs`, which
   reads the record straight out of IndexedDB rather than guessing.
   ===================================================================== */

(function keepHistory() {
  const noop = () => {};

  /* -------------------------------------------------------------------
     THE ONE THAT MATTERED MOST WAS NOT A SAVE TRIMMER AT ALL
     -------------------------------------------------------------------
     Neutralising the two save-time trimmers took the written history
     from nothing to about half. The other half was already gone before
     any save happened:

         dailyTickCore -> every 9 days
           (G.clubs||[]).forEach(c => { if (c.i===G.my) return;
             (c.players||[]).forEach(p => {
               if (p.log && p.log.length > 18) p.log.length = 18 }) })

     Every rival player's match log was cut to eighteen entries WHILE
     PLAYING, in memory. A save cannot keep what the world no longer
     has, which is why a rival striker's record looked short even with
     the save path fixed. Measured: 12,718 log entries in memory against
     5,787 reaching the file, and the gap was this.

     The cap is removed for everybody. The engine's own rolling limit of
     sixty entries — applied to your players and theirs alike, where a
     match is logged — stays: sixty covers a full season including cups,
     and career TOTALS in `p.car` are cumulative and never truncated, so
     the long record of a thirty-year career survives either way.
     ------------------------------------------------------------------- */
  /* the callers do `const restore = trimCareers(); ...; restore();`, so
     each of these has to hand back something callable */
  if (typeof trimCareers === 'function') {
    trimCareers = function trimCareersKeepEverything() { return noop; };
  }
  if (typeof trimFixtures === 'function') {
    trimFixtures = function trimFixturesKeepEverything() { return noop; };
  }

  try {
    window.RBSKeepHistory = Object.freeze({
      keepsCareers: true,
      keepsFixtures: true,
    });
  } catch (error) { /* no window */ }
}());
