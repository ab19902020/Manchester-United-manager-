/* global G, autoPick, playerById, FORMATIONS, nextUserFixture, esc, RBSAiTactics */

/* =====================================================================
   WHO YOU ARE PLAYING, AND HOW THEY SET UP
   ---------------------------------------------------------------------
   Every club in the world now has a way of playing -- a pressing side, a
   deep block, a team that gets it wide -- and until this file there was
   no way to find out what it was before kick-off. The fixture on the
   home screen gave you two crests, a date and a ground. You could be
   out-thought and never know why.

   That also left the two things built before it half-finished: the
   touchline sheet lets you mark a man out of the game, and the
   instructions let you press high or drop off, but choosing between them
   was guesswork against an opponent you could not see.

   THE REPORT CANNOT LIE, because it is not a description written
   alongside the engine -- it is the engine's own answer. It asks
   `RBSAiTactics.style()` the same question `_side` will ask when the
   match starts, from the same eleven `autoPick` will choose, so if the
   report says they press high then they press high. A scouting note
   maintained separately from the thing it describes is wrong the day
   somebody changes a threshold.

   It reads their shape and their danger man too, because those are the
   first two things anybody actually wants, and it says how the two clubs
   stand -- a side that fancies it plays differently from one hanging on.
   ===================================================================== */
(function oppositionReport() {
  'use strict';
  if (typeof window === 'undefined') return;

  function safe(fn, fallback) {
    try { return fn(); } catch (error) { return fallback; }
  }

  /* The eleven they will actually pick, in the shape they will pick it,
     which is what `_side` does when the match starts. */
  function likelyXI(ci) {
    const club = G.clubs[ci];
    if (!club) return null;
    const shape = (club.tacs && club.tacs.formation) || '4-2-3-1';
    const slots = (typeof FORMATIONS === 'object' && FORMATIONS[shape]) || null;
    if (!slots) return null;
    const ids = safe(function () { return autoPick(ci, shape); }, null);
    if (!ids || !ids.length) return null;
    const onfield = [];
    for (let i = 0; i < slots.length && i < ids.length; i++) {
      const p = ids[i] != null ? playerById(ids[i]) : null;
      if (p) onfield.push({ p: p, slot: slots[i][0], off: false });
    }
    return onfield.length ? { shape: shape, onfield: onfield } : null;
  }

  /* `read` takes the stored attributes and never touches the sim it is
     handed, so a report can be produced without playing anything. */
  function planFor(ci, oppCi) {
    const A = window.RBSAiTactics;
    if (!A || typeof A.read !== 'function' || typeof A.style !== 'function') return null;
    const xi = likelyXI(ci);
    if (!xi) return null;
    const q = A.read(null, xi);
    if (!q) return null;
    const mine = (G.clubs[ci] || {}).rep || 0;
    const other = (G.clubs[oppCi] || {}).rep || 0;
    return { shape: xi.shape, xi: xi.onfield, style: A.style(q, (mine - other) / 1400) };
  }

  /* The man you have to deal with: their best outfielder, nudged by what
     he has actually done this season. */
  function danger(xi) {
    let best = null, bv = -1;
    for (let i = 0; i < xi.length; i++) {
      const p = xi[i].p;
      if (!p || xi[i].slot === 'GK') continue;
      const st = p.stats || {};
      const v = (p.ovr || 0) + (st.goals || 0) * 1.6 + (st.assists || 0) * 1.1;
      if (v > bv) { bv = v; best = xi[i]; }
    }
    return best;
  }

  function shortName(p) {
    return safe(function () { return window.surname ? window.surname(p.name) : p.name; }, p.name);
  }

  /* Football English, two or three clauses. Everything here is read off
     the plan the match will use, so nothing can drift. */
  /* HOW THEY DEFEND IS ONE IDEA, NOT TWO. Pressing and the defensive
     line are separate instructions in the engine and were read out
     separately here, which produced "they press high, drop deep" -- two
     true facts that make no sense side by side. A side that presses hard
     from a deep block is a real thing, and it has a name; so does a side
     that squeezes the pitch. The pair is described together. */
  function shapeLine(t) {
    const high = t.press === 'High';
    const low = t.press === 'Low';
    if (t.line === 'High') {
      if (high) return 'squeeze the pitch and press high';
      if (low) return 'push the line up but let you play';
      return 'push the line up';
    }
    if (t.line === 'Deep') {
      if (high) return 'defend from a deep block, pressing in bursts';
      if (low) return 'sit in and soak it up';
      return 'drop into a deep block';
    }
    if (high) return 'press hard from a standard line';
    if (low) return 'sit off and keep their shape';
    return '';
  }

  /* TWO SENTENCES, THE WAY A SCOUT WRITES IT: what they do without the
     ball, then what they do with it. Running them into one line produced
     "they squeeze the pitch and press high and swarm you when they lose
     it" -- the shape phrase already carries an "and", so joining another
     onto it reads like a list nobody finished. */
  function sentence(t) {
    const out = [];
    const shape = shapeLine(t);
    if (shape) out.push('They ' + shape + '.');

    const ball = [];
    if (t.passStyle === 'Short') ball.push('pass it around you');
    else if (t.passStyle === 'Direct') ball.push('go long');
    if (t.width === 'Wide') ball.push('get it wide');
    else if (t.width === 'Narrow') ball.push('come through the middle');
    if (t.tempo === 'Fast') ball.push('play at a lick');
    else if (t.tempo === 'Slow') ball.push('slow it right down');

    if (ball.length) {
      const trimmed = ball.slice(0, 2);
      out.push('In possession they ' + trimmed.join(' and ') + '.');
    }
    if (t.counter === 'Counter-press') {
      out.push('Lose it and they swarm you.');
    }
    if (!out.length) return 'No strong habits — they will take the game as it comes.';
    return out.join(' ');
  }

  /* and the things worth a warning of their own */
  function flags(t) {
    const out = [];
    if (t.trap === 'On') out.push('offside trap');
    if (t.tackling === 'Aggressive') out.push('they go in hard');
    else if (t.tackling === 'Cautious') out.push('they stay on their feet');
    if (t.marking === 'Man') out.push('man-marking at set pieces');
    if (t.timeWaste === 'On') out.push('they will see a lead out');
    return out;
  }

  function block(myCi, oppCi, home) {
    const plan = planFor(oppCi, myCi);
    if (!plan) return '';
    const star = danger(plan.xi);
    const t = plan.style;
    const f = flags(t);
    return '<div class="opr">'
      + '<div class="opr-h">' + esc(G.clubs[oppCi].short || G.clubs[oppCi].name)
      + ' · ' + esc(plan.shape) + (home ? '' : ' · at their place') + '</div>'
      + '<div class="opr-l">' + esc(sentence(t)) + '</div>'
      + (star ? '<div class="opr-m">Watch ' + esc(shortName(star.p)) + ' — '
        + esc(star.slot) + ', ' + (star.p.ovr | 0) + '</div>' : '')
      + (f.length ? '<div class="opr-f">' + f.map(function (x) {
        return '<span>' + esc(x) + '</span>';
      }).join('') + '</div>' : '')
      + '</div>';
  }

  const ANCHOR = /(<div class="fx-meta">[\s\S]*?<\/div><\/div>)/;

  function inject(html) {
    if (typeof html !== 'string' || html.indexOf('fx-meta') < 0) return html;
    if (html.indexOf('class="opr"') >= 0) return html;
    return safe(function () {
      const nf = nextUserFixture();
      if (!nf) return html;
      const home = nf.h === G.my;
      const extra = block(G.my, home ? nf.a : nf.h, home);
      if (!extra) return html;
      return ANCHOR.test(html) ? html.replace(ANCHOR, '$1' + extra) : html;
    }, html);
  }

  function css() {
    if (document.getElementById('rbs-opr')) return;
    const st = document.createElement('style');
    st.id = 'rbs-opr';
    st.textContent = [
      '.opr{margin-top:9px;padding:10px 12px;border-radius:12px;',
      ' background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08)}',
      '.opr-h{font-size:10px;font-weight:800;letter-spacing:.7px;text-transform:uppercase;opacity:.55}',
      '.opr-l{font-size:12.5px;font-weight:600;line-height:1.45;margin-top:4px}',
      '.opr-m{font-size:11.5px;margin-top:5px;opacity:.78;font-weight:700}',
      '.opr-f{display:flex;flex-wrap:wrap;gap:5px;margin-top:7px}',
      '.opr-f span{font-size:9.5px;font-weight:700;letter-spacing:.3px;padding:3px 7px;',
      ' border-radius:20px;background:rgba(251,225,34,.12);color:#e8d78a}',
    ].join('');
    (document.head || document.documentElement).appendChild(st);
  }

  function install() {
    css();
    if (typeof window.vHome !== 'function') return false;
    const passHome = window.vHome;
    window.vHome = function vHomeWithAScoutingNote() {
      return inject(passHome.apply(this, arguments));
    };
    return true;
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', install);
  } else if (!install()) {
    window.setTimeout(install, 0);
  }

  window.RBSOppositionReport = {
    planFor: planFor, sentence: sentence, flags: flags, danger: danger, block: block,
  };
})();
