/* global G, ACTIONS, playerById, calcEff, posPenalty, potOf, esc, fmtW,
          openModal, openProfile, TECH, MENT, PHYS, ATTR_LABEL */
(function playerComparison() {
  'use strict';

  function known(p) { return p && (p.club === G.my || p.scouted); }
  function candidates(source) {
    const club = G.clubs && G.clubs[G.my];
    return (club ? club.players : []).filter((p) => p.id !== source.id && !p.loan && !p.youth)
      .slice().sort((a, b) => posPenalty(a, source.pos) - posPenalty(b, source.pos)
        || calcEff(b, source.pos) - calcEff(a, source.pos));
  }

  function attributes(p) {
    return Object.assign({}, p.attrs || {}, window.RBSAttributes ? window.RBSAttributes.attrsOf(p) : {});
  }

  function rows(a, b) {
    const aa = attributes(a), bb = attributes(b);
    const extra = window.RBSAttributes;
    const keys = [...new Set([...TECH, ...MENT, ...PHYS,
      ...(extra ? (a.pos === 'GK' ? extra.GK_KEYS : extra.OUT_KEYS) : [])])];
    return keys.map((key) => ({ label: ATTR_LABEL[key] || key, key,
      a: !known(a) ? null : (Number.isFinite(+aa[key]) ? +aa[key] : null),
      b: !known(b) ? null : (Number.isFinite(+bb[key]) ? +bb[key] : null) }));
  }

  function open(sourceId, compareId) {
    const source = playerById(sourceId);
    if (!source) return;
    const pool = candidates(source);
    const other = pool.find((p) => p.id === compareId) || pool[0];
    if (!other) return;
    const details = known(source) && known(other);
    const cell = (value) => value == null ? '—' : esc(String(value));
    const row = (label, a, b, delta) => '<tr><th scope="row">' + esc(label) + '</th><td>' + cell(a)
      + '</td><td>' + cell(b) + '</td><td' + (delta > 0 ? ' class="rbs-compare-plus"' : '') + '>'
      + (delta == null ? '—' : delta > 0 ? '+' + delta : String(delta)) + '</td></tr>';
    const summary = [row('Age', source.age, other.age),
      row('Ability', details ? source.ovr : null, other.ovr, details ? source.ovr - other.ovr : null),
      row('Potential', details ? potOf(source) : null, potOf(other), details ? potOf(source) - potOf(other) : null),
      row('Current wage', fmtW(source.wage || 0), fmtW(other.wage || 0)),
      row('Condition', details ? Math.round(source.cond || 0) + '%' : null, Math.round(other.cond || 0) + '%'),
      row('At ' + source.pos, details ? Math.round(calcEff(source, source.pos)) : null,
        Math.round(calcEff(other, source.pos)))].join('');
    const options = pool.map((p) => '<option value="' + p.id + '"' + (p.id === other.id ? ' selected' : '')
      + '>' + esc(p.name) + ' · ' + esc(p.pos) + '</option>').join('');
    openModal('<section class="rbs-compare"><h3>Player comparison</h3>'
      + '<p class="rbs-compare-note">' + esc(source.name) + ' against your squad. Compare the attributes that suit the role.</p>'
      + '<label for="rbsCompareChoice">Compare with</label><select id="rbsCompareChoice" data-source="'
      + source.id + '">' + options + '</select>'
      + (!details ? '<p class="rbs-compare-note">Scout ' + esc(source.name) + ' for a detailed ability and attribute comparison.</p>' : '')
      + '<table><caption>Difference shows ' + esc(source.name) + ' relative to ' + esc(other.name) + '.</caption>'
      + '<thead><tr><th scope="col">Player</th><th scope="col">' + esc(source.name) + '</th><th scope="col">'
      + esc(other.name) + '</th><th scope="col">Diff.</th></tr></thead><tbody>' + summary
      + '<tr class="rbs-compare-divider"><th colspan="4">Attributes · out of 20</th></tr>'
      + rows(source, other).map((r) => row(r.label, r.a, r.b, r.a == null || r.b == null ? null
        : Math.round((r.a - r.b) * 10) / 10)).join('') + '</tbody></table>'
      + '<button class="btn btn-ghost btn-block" data-action="profile" data-id="' + source.id
      + '">Back to player profile</button></section>');
  }

  ACTIONS.comparePlayer = (element) => open(Number(element.dataset.id));
  document.addEventListener('change', (event) => {
    if (event.target.id === 'rbsCompareChoice') open(Number(event.target.dataset.source), Number(event.target.value));
  });

  function install() {
    const previous = window.openProfile;
    window.openProfile = function profileWithComparison(pid) {
      const result = previous.apply(this, arguments);
      const player = playerById(pid);
      const sheet = document.getElementById('sheetBody');
      if (player && sheet && candidates(player).length && !sheet.querySelector('[data-action="comparePlayer"]')) {
        const title = sheet.querySelector('h3');
        const button = '<button class="btn btn-ghost btn-block rbs-compare-open" data-action="comparePlayer" data-id="'
          + player.id + '">Compare with my squad</button>';
        const header = title && title.closest('.row');
        if (header) header.insertAdjacentHTML('afterend', button);
        else if (title) title.insertAdjacentHTML('afterend', button);
        else sheet.insertAdjacentHTML('afterbegin', button);
      }
      return result;
    };
    const style = document.createElement('style');
    style.id = 'rbs-comparison-style';
    style.textContent = `
.rbs-compare-open{margin:10px 0;min-height:44px}
.rbs-compare{min-width:0}
.rbs-compare label{display:block;font-size:14px;font-weight:700;margin:12px 0 6px}
.rbs-compare select{width:100%;min-height:44px;font-size:14px}
.rbs-compare table{width:100%;table-layout:fixed;border-collapse:collapse;margin:16px 0;font-size:13px}
.rbs-compare th,.rbs-compare td{padding:9px 5px;line-height:1.4;border-bottom:1px solid var(--chalk);overflow-wrap:anywhere}
.rbs-compare th{text-align:left;font-weight:600}
.rbs-compare thead th{font-size:12px;vertical-align:bottom}
.rbs-compare thead th:first-child{width:30%}
.rbs-compare thead th:last-child{width:13%}
.rbs-compare td{text-align:center;font-variant-numeric:tabular-nums}
.rbs-compare-plus{color:var(--green);font-weight:800}
.rbs-compare-note,.rbs-compare caption{font-size:12px;line-height:1.5;color:var(--ink-dim,#adb2bb);text-align:left;margin:8px 0}
.rbs-compare-divider th{padding-top:18px;color:var(--gold)}
.rbs-compare button{min-height:44px}
`;
    document.head.appendChild(style);
  }

  window.RBSComparison = Object.freeze({ candidates, rows, open });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install);
  else install();
})();
