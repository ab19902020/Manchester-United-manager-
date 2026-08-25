(function attachSimulationModel(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RBSMatchModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function simulationModelFactory() {
  'use strict';

  const config = Object.freeze({
    targetGoals: 2.8,
    calibrationWindow: 120,
    initialTrim: 0.06,
    openPlayXgScale: 0.13,
    minimumShotXg: 0.02,
    maximumShotXg: 0.75,
    fastSimulationBase: 1.35,
  });

  function clamp(value, minimum, maximum) {
    return Math.max(minimum, Math.min(maximum, value));
  }

  /**
   * Convert the attack-to-keeper quality ratio into an actual probability.
   * The detailed engine records this exact number as xG and then samples it,
   * keeping expected goals and conversion in the same model.
   */
  function shotXg(qualityRatio) {
    const ratio = Number.isFinite(qualityRatio) ? qualityRatio : 1;
    return clamp(
      config.openPlayXgScale * ratio,
      config.minimumShotXg,
      config.maximumShotXg,
    );
  }

  /**
   * Probability that a non-goal effort still forces a save.
   *
   * MEASURED, AND IT WAS OUT BY A FACTOR OF TWO. This runs after the
   * goal roll, so it cannot change a result — which is why it went
   * unexamined while being one of the most visibly wrong numbers in the
   * game. It is on the match report as "On target", on the analytics
   * screen as a percentage, and on every player's own line as "3 (2 OT)".
   *
   * On the shipped build, 400 matches of mid-table against mid-table off
   * a seeded stream with the goal-rate controller pinned:
   *
   *     shots a match       27.5   real about 25.5
   *     shots on target     17.2   real about 8.7
   *     saves               14.0   real about 5.9
   *     corners             13.4   real about 10.3
   *
   * The old curve, clamp(0.38 + ratio*0.22, 0.35, 0.72), put 56% of
   * non-goal efforts on target where real football puts about 26%. The
   * corner surplus was largely a consequence rather than a fault of its
   * own: 52% of saves go behind, so fourteen saves a match were
   * manufacturing six and a half corners.
   *
   * Four replacements were swept over 300 matches on each of three
   * seeds. This one landed shots on target at 8.96, saves at 5.93 and
   * corners at 9.38, and was the most consistent across seeds. Goals
   * fall about 0.10 a match, all of it fewer corners producing fewer
   * corner goals, which the division's goal-rate controller restores.
   *
   * The shape is kept: a better shot against a worse keeper finds the
   * target more often, from about 18% at a hopeless mismatch to 48% at
   * the other end, which is roughly the best accuracy a real player
   * sustains. Nothing in it knows who is playing or what the score is.
   */
  function onTargetChance(qualityRatio) {
    const ratio = Number.isFinite(qualityRatio) ? qualityRatio : 1;
    return clamp(0.13 + ratio * 0.13, 0.10, 0.48);
  }

  function fastBase() {
    return config.fastSimulationBase;
  }

  function regressionBands() {
    return Object.freeze({
      goalsPerMatch: [2.55, 3.05],
      drawRate: [0.2, 0.31],
      goallessRate: [0.04, 0.12],
      modelGap: 0.25,
    });
  }

  return Object.freeze({
    config,
    shotXg,
    onTargetChance,
    fastBase,
    regressionBands,
  });
});
