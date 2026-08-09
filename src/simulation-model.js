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

  /** Probability that a non-goal effort still forces a save. */
  function onTargetChance(qualityRatio) {
    const ratio = Number.isFinite(qualityRatio) ? qualityRatio : 1;
    return clamp(0.38 + ratio * 0.22, 0.35, 0.72);
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
