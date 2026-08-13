/* global MatchSim */
(function initMatchRatings(root) {
  'use strict';

  /*
   * A save is valuable, but ten routine saves are not ten separate goals.
   * The legacy engine awarded every ordinary stop about +0.22 forever. That
   * linear reward made a busy goalkeeper almost unbeatable in the ratings.
   * These are marginal rewards: the first interventions matter most and the
   * curve flattens as volume rises.
   */
  function saveReward(number) {
    const n = Math.max(1, Number(number) || 1);
    if (n <= 3) return 0.10;
    if (n <= 6) return 0.07;
    if (n <= 9) return 0.045;
    return 0.025;
  }

  function saveRewardTotal(saves) {
    let total = 0;
    for (let number = 1; number <= Math.max(0, Number(saves) || 0); number += 1) {
      total += saveReward(number);
    }
    return total;
  }

  const PENALTY_SAVE_REWARD = 0.42;

  function replaceSaveDelta(keeper, saveCount, previousRating, additionalSaves) {
    if (!keeper || !Number.isFinite(previousRating) || additionalSaves <= 0) return;
    let reward = 0;
    for (let index = 1; index <= additionalSaves; index += 1) {
      reward += saveReward(saveCount + index);
    }
    keeper.rating = previousRating + reward;
    keeper._rbsSaveCount = saveCount + additionalSaves;
  }

  function install() {
    if (typeof MatchSim !== 'function' || !MatchSim.prototype) return false;
    const prototype = MatchSim.prototype;
    if (prototype._rbsBalancedRatings) return true;
    prototype._rbsBalancedRatings = true;

    const previousShotEvent = prototype.shotEvent;
    prototype.shotEvent = function shotEventWithDiminishingSaveReward(A, D) {
      const keeper = this.gk(D);
      const beforeSaves = Number(D && D.st && D.st.sv) || 0;
      const beforeRating = keeper && Number(keeper.rating);
      const beforeKeeperSaves = keeper && (Number(keeper._rbsSaveCount) || 0);
      const result = previousShotEvent.apply(this, arguments);
      const afterSaves = Number(D && D.st && D.st.sv) || 0;
      replaceSaveDelta(keeper, beforeKeeperSaves, beforeRating, afterSaves - beforeSaves);
      return result;
    };

    const previousPenaltyEvent = prototype.penaltyEvent;
    prototype.penaltyEvent = function penaltyEventWithBoundedSaveReward(A, D) {
      const keeper = this.gk(D);
      const beforeSaves = Number(D && D.st && D.st.sv) || 0;
      const beforeRating = keeper && Number(keeper.rating);
      const result = previousPenaltyEvent.apply(this, arguments);
      const afterSaves = Number(D && D.st && D.st.sv) || 0;
      if (keeper && Number.isFinite(beforeRating) && afterSaves > beforeSaves) {
        keeper.rating = beforeRating + PENALTY_SAVE_REWARD;
        keeper._rbsSaveCount = (Number(keeper._rbsSaveCount) || 0) + (afterSaves - beforeSaves);
      }
      return result;
    };

    return true;
  }

  const api = {
    PENALTY_SAVE_REWARD,
    install,
    saveReward,
    saveRewardTotal,
  };

  if (root) root.RBSMatchRatings = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  install();
}(typeof window !== 'undefined' ? window : globalThis));
