/* global G, UI, ACTIONS, FORMATIONS, playerById, posPenalty, nextUserMatch,
          fmtDateShort, esc, render, closeModal */
(function matchPreparation() {
  'use strict';

  const bounded = (value, fallback = 0) => Number.isFinite(+value)
    ? Math.max(0, Math.min(100, +value)) : fallback;

  // Advice reads the same players and calendar as the match. It never
  // changes tactics, fitness, morale or the outcome of a fixture.
  function read() {
    const club = G && G.clubs && G.clubs[G.my];
    if (!club || !G.tacs) return null;
    const shape = FORMATIONS[G.tacs.formation] || [];
    const xi = G.tacs.xi || [];
    const alerts = [];
    const seen = new Set();
    const players = [];
    shape.forEach((slot, index) => {
      const p = playerById(xi[index]);
      if (!p || seen.has(p.id)) {
        alerts.push({ index, name: slot[0], reason: p ? 'Selected twice' : 'Empty position', severity: 3 });
        return;
      }
      seen.add(p.id);
      players.push(p);
      let reason = '', severity = 1;
      if (p.club !== G.my || p.loan || p.youth) { reason = 'Unavailable for the first team'; severity = 3; }
      else if (p.injury) { reason = 'Injured · ' + Math.max(0, Math.ceil(p.injury.days || 0)) + ' days'; severity = 3; }
      else if (p.susp > 0) { reason = 'Suspended · ' + p.susp + ' match' + (p.susp === 1 ? '' : 'es'); severity = 3; }
      else if (bounded(p.cond, 100) < 80) { reason = Math.round(bounded(p.cond)) + '% condition · consider rotation'; severity = 2; }
      else if (posPenalty(p, slot[0]) >= 0.08) { reason = 'Unfamiliar at ' + slot[0]; severity = 2; }
      else if (bounded(p.morale, 60) < 45) reason = Math.round(bounded(p.morale)) + '% morale · needs attention';
      else if (bounded(p.sharp, 100) < 60) reason = Math.round(bounded(p.sharp)) + '% sharpness · needs minutes';
      if (reason) alerts.push({ index, name: p.name, reason, severity });
    });
    alerts.sort((a, b) => b.severity - a.severity || a.index - b.index);
    const average = (key, fallback) => players.length
      ? Math.round(players.reduce((sum, p) => sum + bounded(p[key], fallback), 0) / players.length) : 0;
    const fixtures = [...(G.fixtures || []), ...Object.values(G.cups || {}).flatMap((cup) => cup.ties || [])]
      .filter((f) => !f.played && f.day >= G.day && f.day <= G.day + 14 && (f.h === G.my || f.a === G.my))
      .sort((a, b) => a.day - b.day);
    // Some competition integrations share the same fixture object.
    const keys = new Set();
    const upcoming = fixtures.filter((f) => {
      const key = [f.day, f.h, f.a, f.cup || f.div || ''].join(':');
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    });
    const busy = upcoming.some((f, index) => index > 0 && f.day - upcoming[index - 1].day <= 3);
    return { players: players.length, condition: average('cond', 100), morale: average('morale', 60),
      sharpness: average('sharp', 100), alerts, upcoming, busy, next: nextUserMatch() };
  }

  function html() {
    const data = read();
    if (!data) return '';
    const metric = (value, label) => '<div><strong>' + value + '%</strong><span>' + label + '</span></div>';
    const status = data.alerts.length ? data.alerts.length + ' to review' : 'XI ready';
    const fixtures = data.upcoming.slice(0, 4).map((f) => {
      const home = f.h === G.my;
      const opponent = G.clubs[home ? f.a : f.h];
      return '<li><span>' + esc(fmtDateShort(f.day)) + '</span><b>'
        + esc(opponent ? opponent.short || opponent.name : 'Opponent to be confirmed')
        + '</b><span>' + (home ? 'Home' : 'Away') + (f.cup ? ' · Cup' : '') + '</span></li>';
    }).join('');
    return '<section class="sh-panel rbs-prep" id="rbsPreparation" aria-label="Match preparation">'
      + '<div class="sh-head"><span>Match preparation</span><span>' + status + '</span></div>'
      + '<div class="sh-body"><div class="rbs-prep-metrics">' + metric(data.condition, 'XI condition')
      + metric(data.sharpness, 'XI sharpness') + metric(data.morale, 'XI morale') + '</div>'
      + (data.alerts.length ? '<ul class="rbs-prep-alerts">' + data.alerts.slice(0, 4).map((item) =>
        '<li><div><b>' + esc(item.name) + '</b><span>' + esc(item.reason) + '</span></div>'
        + '<button class="btn btn-ghost btn-sm" data-action="prepReview" data-v="' + item.index
        + '" aria-label="Review ' + esc(item.name) + '">Review</button></li>').join('') + '</ul>'
        + (data.alerts.length > 4 ? '<p class="rbs-prep-note">' + (data.alerts.length - 4) + ' more in team selection.</p>' : '')
        : '<p class="rbs-prep-note">No immediate concerns in your starting XI.</p>')
      + '<button class="btn btn-ghost btn-block" data-action="goTactics">Review team selection</button>'
      + (fixtures ? '<div class="rbs-prep-week"><h4>Next 14 days · ' + data.upcoming.length + ' match'
        + (data.upcoming.length === 1 ? '' : 'es') + '</h4><ul>' + fixtures + '</ul>'
        + (data.busy ? '<p class="rbs-prep-note">A short turnaround is coming. Keep cover ready for tired starters.</p>' : '') + '</div>' : '')
      + '</div></section>';
  }

  ACTIONS.prepReview = function prepReview(el) {
    const index = Number(el.dataset.v);
    const shape = G.tacs && FORMATIONS[G.tacs.formation];
    if (!shape || !Number.isInteger(index) || !shape[index]) return;
    closeModal();
    UI.view = 'tactics';
    UI.selSlot = index;
    render();
    ACTIONS.xiSwapOpen();
  };

  function mount() {
    const view = document.getElementById('view');
    if (!view || !G || !G.clubs || !G.tacs || UI.view !== 'home' || G.sacked || view.querySelector('#rbsPreparation')) return;
    const column = view.querySelector(':scope > .home-col');
    const host = column || view;
    const pitch = host.querySelector(':scope > #shPitch');
    const hero = host.querySelector(':scope > .home-hero');
    const anchor = pitch || hero;
    if (anchor) anchor.insertAdjacentHTML('afterend', html());
    else host.insertAdjacentHTML('afterbegin', html());
  }

  function install() {
    const style = document.createElement('style');
    style.id = 'rbs-preparation-style';
    style.textContent = `
.rbs-prep{margin-bottom:12px;min-width:0}
.rbs-prep .sh-head{flex-wrap:wrap;line-height:1.4}
.rbs-prep .sh-head>span:last-child{color:var(--gold);font-size:12px;letter-spacing:0}
.rbs-prep-metrics{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}
.rbs-prep-metrics>div{display:flex;flex-direction:column;gap:5px;border-left:2px solid var(--sh-accent);padding-left:9px}
.rbs-prep-metrics strong{font-size:22px;line-height:1.2;font-variant-numeric:tabular-nums}
.rbs-prep-metrics span,.rbs-prep-note{font-size:12px;line-height:1.5;color:var(--ink-dim,#adb2bb)}
.rbs-prep-alerts,.rbs-prep-week ul{list-style:none;padding:0;margin:0 0 12px}
.rbs-prep-alerts li{display:flex;align-items:center;gap:8px;padding:9px 0;border-top:1px solid var(--sh-line)}
.rbs-prep-alerts li>div{flex:1;min-width:0;overflow-wrap:anywhere}
.rbs-prep-alerts b{display:block;font-size:14px;line-height:1.4}
.rbs-prep-alerts li>div>span{display:block;font-size:12px;line-height:1.5;color:var(--ink-dim,#adb2bb)}
.rbs-prep button{min-height:44px;white-space:normal}
.rbs-prep-week{border-top:1px solid var(--sh-line);padding-top:12px;margin-top:14px}
.rbs-prep-week h4{font-size:13px;margin:0 0 9px}
.rbs-prep-week li{display:grid;grid-template-columns:62px minmax(0,1fr) auto;gap:8px;font-size:12px;line-height:1.5;margin-top:7px}
.rbs-prep-week b{overflow-wrap:anywhere}
`;
    document.head.appendChild(style);
    const previous = window.render;
    window.render = function renderWithPreparation() {
      const result = previous.apply(this, arguments);
      mount();
      return result;
    };
    mount();
  }

  window.RBSPreparation = Object.freeze({ read, html });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
