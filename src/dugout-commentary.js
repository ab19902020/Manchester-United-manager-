/* global MU */

/* =====================================================================
   DUGOUT COMMENTARY — the words, next to the football
   ---------------------------------------------------------------------
   You could read the commentary on the Commentary tab or you could watch
   the match in the dugout, and not both. So a goal went in, the feed
   said a goal had gone in, and the two were in different rooms.

   A broadcast never makes you choose. This is the ticker along the
   bottom of the 3D view: the last few lines of the same feed the rest
   of the game reads, newest first, with the important ones marked. It
   is the engine's own text — nothing is written here, and nothing is
   summarised — so what it says and what the pictures show are the same
   event by construction.
   ===================================================================== */

(function dugoutCommentary() {
  const KEEP = 4;

  function tone(entry) {
    const raw = String((entry && entry.text) || '').replace(/<[^>]*>/g, '');
    if (entry && entry.cls === 'goal') return 'goal';
    if (/sent off|second yellow|red card/i.test(raw)) return 'red';
    if (/yellow card|booked/i.test(raw)) return 'card';
    if (/\bVAR\b|penalty|from the spot/i.test(raw)) return 'var';
    if (/save|parr|palm|tip|post|crossbar|woodwork/i.test(raw)) return 'near';
    return '';
  }

  function host() {
    /* the 3D canvas sits inside the match body; the ticker rides on the
       same element so it moves and hides with the view it belongs to */
    return document.getElementById('mBody') || document.getElementById('matchScreen');
  }

  function bar() {
    let el = document.getElementById('dugFeed');
    if (el) return el;
    const parent = host();
    if (!parent) return null;
    el = document.createElement('div');
    el.id = 'dugFeed';
    el.className = 'dug-feed';
    parent.appendChild(el);
    return el;
  }

  let lastKey = '';

  function paint() {
    try {
      const match = MU && MU.m;
      const el = bar();
      if (!el) return;
      const showing = MU && MU.tab === 'dugout' && match && match.feed;
      el.classList.toggle('on', !!showing);
      if (!showing) return;

      const lines = match.feed.slice(-KEEP).reverse();
      const key = lines.map((e) => (e.min + '|' + e.text)).join('~');
      if (key === lastKey) return;
      lastKey = key;

      el.innerHTML = lines.map((entry, index) => {
        const min = entry.min == null ? '' : String(entry.min) + "'";
        const text = String(entry.text || '');
        return '<div class="dug-line' + (index === 0 ? ' lead' : '') + '" data-tone="' + tone(entry) + '">'
          + '<span class="dug-min">' + min + '</span>'
          + '<span class="dug-txt">' + text + '</span></div>';
      }).join('');
    } catch (error) { /* the match is more important than the ticker */ }
  }

  (function style() {
    try {
      if (document.getElementById('dugFeedCSS')) return;
      const tag = document.createElement('style');
      tag.id = 'dugFeedCSS';
      tag.textContent = [
        '.dug-feed{position:absolute;left:0;right:0;bottom:0;z-index:40;',
        ' display:none;flex-direction:column;gap:2px;padding:10px 12px 12px;',
        ' pointer-events:none;',
        ' background:linear-gradient(180deg,rgba(6,8,10,0) 0%,rgba(6,8,10,.72) 42%,rgba(6,8,10,.93) 100%)}',
        '.dug-feed.on{display:flex}',
        '.dug-line{display:flex;gap:8px;align-items:baseline;',
        ' font:600 11px/1.35 var(--body);color:rgba(255,255,255,.52);',
        ' overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
        '.dug-line.lead{font-weight:800;font-size:12.5px;color:#fff}',
        '.dug-min{flex:0 0 auto;font-weight:800;font-size:10px;color:rgba(255,255,255,.4);',
        ' min-width:26px;text-align:right;font-variant-numeric:tabular-nums}',
        '.dug-line.lead .dug-min{color:rgba(255,255,255,.7)}',
        '.dug-txt{min-width:0;overflow:hidden;text-overflow:ellipsis}',
        '.dug-line[data-tone="goal"].lead{color:#8dffc0}',
        '.dug-line[data-tone="red"].lead{color:#ff8f86}',
        '.dug-line[data-tone="card"].lead{color:#ffe86b}',
        '.dug-line[data-tone="var"].lead{color:#9cccff}',
        '.dug-line[data-tone="near"].lead{color:#ffd28a}',
        /* the 3D canvas keeps its own captions clear of the ticker */
        '.rbs-3d-active .dug-feed{padding-bottom:14px}',
      ].join('');
      document.head.appendChild(tag);
    } catch (error) { /* unstyled is still readable */ }
  }());

  try { setInterval(paint, 180); } catch (error) { /* no timers */ }

  try { window.RBSDugFeed = Object.freeze({ paint, tone }); } catch (error) { /* no window */ }
}());
