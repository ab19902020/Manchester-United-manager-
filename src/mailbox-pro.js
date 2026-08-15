/* global G, UI, ACTIONS, renderMailbox:writable, render, toast, esc, mailList */

/* =====================================================================
   A MAILBOX YOU CAN ACTUALLY KEEP
   ---------------------------------------------------------------------
   "a few massive issues in landscape mode I can't see the mailbox …
    you should be able to delete mail, you should be able to ignore mail,
    have an important bit where you click on important … it needs to be a
    real mailbox you can look after and have organised properly."

   ---------------------------------------------------------------------
   WHY IT VANISHED IN LANDSCAPE, measured at 844x390 before changing
   anything. The sheet came back 520 wide and 343 tall with 598px of
   content in it, in a viewport 844 wide. Two separate faults:

     it is using the PORTRAIT sheet — 520px of a 844px screen, with 324
     wasted either side, while the height it does not have is the axis
     it is starved on

     and TWO filter rows are drawn, one on top of the other:

         All · ⚠️ Decisions · 💷 Transfers · 👕 Squad · 🏛️ Board · 📰 Media
         📥 All · 🏛️ Boardroom · 🔁 Transfers · 👥 Squad · 📰 Media · ⚽ Results

   The second one is not a design choice, it is two layers that both
   added folders without knowing about each other — `gameplay-balance.js`
   has MAIL_TABS and `mailbox.js` has FOLDERS, and they file the same
   letters into nearly the same boxes. Between the two of them, the
   header and the "read the unread" button, 343px of sheet had about
   sixty left for mail. One message was partly visible. That is the
   "can't see the mailbox".

   So: one row of folders, and in landscape the sheet takes the width it
   has been ignoring.

   ---------------------------------------------------------------------
   AND THE THINGS A MAILBOX IS SUPPOSED TO DO

     ⭐ important   marked by you, and a folder that shows only those
     🗑 delete      one letter, or every read letter at once
     🔕 ignore      mute a whole kind of post; muted kinds file
                    themselves away on arrival instead of arriving

   ONE RULE OVERRIDES ALL THREE. A letter that is waiting on a decision
   cannot be deleted, cannot be muted and cannot be filed out of sight,
   because the season does not move on until it is answered and a
   mailbox that lets you throw those away is a mailbox that bricks the
   save. `mailbox.js` already protects them from the folders; this
   extends the same protection to the bin.
   ===================================================================== */

(function mailboxPro() {
  const MUTABLE = ['news', 'info', 'match', 'award', 'train', 'scout'];

  function store() {
    if (!G.mailPrefs) G.mailPrefs = { mute: {} };
    if (!G.mailPrefs.mute) G.mailPrefs.mute = {};
    return G.mailPrefs;
  }

  function blocking(m) {
    return !!(m && m.actions && m.actions.length);
  }

  function find(id) {
    return (G.inbox || []).filter((m) => m.id === id)[0]
      || (G.archive || []).filter((m) => m.id === id)[0] || null;
  }

  /* ---------------------------------------------------------------
     THE ACTIONS
     --------------------------------------------------------------- */
  ACTIONS.mailStar = function mailStar(el) {
    try {
      const m = find(el.dataset.id);
      if (!m) return;
      m.star = !m.star;
      renderMailbox();
    } catch (error) { /* the letter is unchanged */ }
  };

  ACTIONS.mailBin = function mailBin(el) {
    try {
      const m = find(el.dataset.id);
      if (!m) return;
      if (blocking(m)) {
        toast('That one needs an answer before it can go.');
        return;
      }
      G.inbox = (G.inbox || []).filter((x) => x.id !== m.id);
      G.archive = (G.archive || []).filter((x) => x.id !== m.id);
      if (!m.read) G.unread = Math.max(0, (G.unread || 0) - 1);
      if (UI.mailView === m.id) UI.mailView = null;
      UI.mailOrder = null;
      renderMailbox();
      render();
    } catch (error) { /* the letter stays */ }
  };

  ACTIONS.mailBinRead = function mailBinRead() {
    try {
      const before = (G.inbox || []).length;
      G.inbox = (G.inbox || []).filter((m) => !m.read || blocking(m) || m.star);
      const gone = before - G.inbox.length;
      UI.mailOrder = null;
      renderMailbox();
      render();
      toast(gone ? gone + ' cleared' : 'Nothing to clear');
    } catch (error) { /* nothing cleared */ }
  };

  ACTIONS.mailMute = function mailMute(el) {
    try {
      const kind = el.dataset.v;
      if (!kind) return;
      const prefs = store();
      prefs.mute[kind] = !prefs.mute[kind];
      toast(prefs.mute[kind] ? 'Muted — these will file themselves away'
        : 'Unmuted — these will come to the inbox again');
      renderMailbox();
    } catch (error) { /* still noisy */ }
  };

  /* ---------------------------------------------------------------
     A MUTED KIND FILES ITSELF ON ARRIVAL
     ---------------------------------------------------------------
     It is archived rather than dropped: "ignore" should mean "not in my
     face", not "destroyed", and a muted round-up is still there if you
     go looking for it. A letter that needs answering is never muted, no
     matter what the setting says. */
  if (typeof window.mail === 'function') {
    const previous = window.mail;
    window.mail = function mailMuted(type) {
      const result = previous.apply(this, arguments);
      try {
        const prefs = store();
        if (!prefs.mute[type]) return result;
        /* `mail()` UNSHIFTS. The first cut of this read
           `box[box.length - 1]` and quietly muted the oldest letter in
           the tray instead of the one that had just arrived — the mute
           looked like it did nothing at all. The newest is at the front. */
        const box = G.inbox || [];
        const fresh = box[0];
        if (!fresh || fresh.type !== type || blocking(fresh)) return result;
        G.inbox = box.slice(1);
        fresh.read = true;
        fresh.muted = true;
        G.archive = G.archive || [];
        G.archive.unshift(fresh);
        G.unread = Math.max(0, (G.unread || 0) - 1);
      } catch (error) { /* it stays in the inbox */ }
      return result;
    };
  }

  /* ---------------------------------------------------------------
     THE SCREEN
     --------------------------------------------------------------- */
  function style() {
    if (document.getElementById('mailProCSS')) return;
    const tag = document.createElement('style');
    tag.id = 'mailProCSS';
    tag.textContent = [
      /* one row of folders. The duplicate is gameplay-balance's, and it
         is hidden rather than deleted because its filter still works and
         something else may yet call it. */
      '#sheetBody .chips[data-mailtabs]{display:none!important}',
      /* the tools that hang off a letter */
      '.mp-row{display:flex;gap:4px;align-items:center;flex:0 0 auto;margin-left:6px}',
      '.mp-btn{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;',
      ' justify-content:center;font-size:14px;line-height:1;border:1px solid var(--chalk-strong);',
      ' background:rgba(255,255,255,.04);cursor:pointer;flex:0 0 auto}',
      '.mp-btn.on{background:rgba(251,225,34,.18);border-color:rgba(251,225,34,.55)}',
      '.mp-bar{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}',
      /* LANDSCAPE: take the width the sheet has been ignoring. Measured
         at 844x390 the sheet was 520 wide and 343 tall with 598px of
         content — starved on the one axis it could not grow on while
         leaving 324px unused on the one it could. */
      '@media (orientation:landscape) and (max-width:1023px){',
      ' #modalHost .sheet{max-width:none!important;width:calc(100vw - 24px)!important;',
      '  margin:0 auto!important}',
      ' #sheetBody{max-height:calc(100vh - 12px)!important}',
      '}',
    ].join('');
    document.head.appendChild(tag);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', style, { once: true });
  } else {
    style();
  }

  /* decorate whatever renderMailbox has just drawn, rather than
     rebuilding it — six layers write this screen */
  if (typeof renderMailbox === 'function') {
    const previous = renderMailbox;
    renderMailbox = function renderMailboxPro() {
      const result = previous.apply(this, arguments);
      try { decorate(); } catch (error) { /* the plain mailbox still works */ }
      return result;
    };
  }

  function decorate() {
    const body = document.getElementById('sheetBody');
    if (!body) return;

    /* mark the duplicate folder row so the stylesheet can hide it: it is
       the one whose chips fire mailFilter */
    body.querySelectorAll('.chips').forEach((row) => {
      if (row.querySelector('[data-action="mailFilter"]')) row.setAttribute('data-mailtabs', '1');
    });

    const rows = body.querySelectorAll('[data-action="mailOpen"][data-id]');
    if (rows.length) {
      /* the tray: a star and a bin on every letter */
      rows.forEach((row) => {
        if (row.querySelector('.mp-row')) return;
        const id = row.dataset.id;
        const m = find(id);
        if (!m) return;
        const tools = document.createElement('span');
        tools.className = 'mp-row';
        tools.innerHTML = '<button class="mp-btn' + (m.star ? ' on' : '') + '"'
          + ' data-action="mailStar" data-id="' + esc(String(id)) + '"'
          + ' title="Important">' + (m.star ? '⭐' : '☆') + '</button>'
          + (blocking(m) ? ''
            : '<button class="mp-btn" data-action="mailBin" data-id="' + esc(String(id)) + '"'
              + ' title="Delete">🗑</button>');
        row.appendChild(tools);
      });

      /* and a bar above them for the things that act on the whole tray */
      if (!body.querySelector('.mp-bar')) {
        const first = rows[0].parentElement;
        if (first) {
          const bar = document.createElement('div');
          bar.className = 'mp-bar';
          const prefs = store();
          const muted = MUTABLE.filter((k) => prefs.mute[k]).length;
          bar.innerHTML = '<button class="chip" data-action="mailBinRead">🗑 Clear read</button>'
            + '<button class="chip' + (UI.mailStarOnly ? ' on' : '') + '"'
            + ' data-action="mailStarOnly">⭐ Important</button>'
            + '<button class="chip" data-action="mailMuteSheet">🔕 Ignore'
            + (muted ? ' · ' + muted : '') + '</button>';
          first.insertBefore(bar, first.firstChild);
        }
      }
    }

    /* the reader gets the same two, where a letter is open */
    const back = body.querySelector('[data-action="mailBack"]');
    if (back && UI.mailView && !back.parentElement.querySelector('.mp-row')) {
      const m = find(UI.mailView);
      if (m) {
        const tools = document.createElement('span');
        tools.className = 'mp-row';
        tools.innerHTML = '<button class="mp-btn' + (m.star ? ' on' : '') + '"'
          + ' data-action="mailStar" data-id="' + esc(String(m.id)) + '">'
          + (m.star ? '⭐' : '☆') + '</button>'
          + (blocking(m) ? ''
            : '<button class="mp-btn" data-action="mailBin" data-id="'
              + esc(String(m.id)) + '">🗑</button>');
        back.parentElement.insertBefore(tools, back.nextSibling);
      }
    }
  }

  /* ---- the Important folder, and the ignore sheet ---- */
  ACTIONS.mailStarOnly = function mailStarOnly() {
    UI.mailStarOnly = !UI.mailStarOnly;
    UI.mailOrder = null;
    renderMailbox();
  };

  if (typeof mailList === 'function') {
    const previous = mailList;
    mailList = function mailListStarred() {
      const out = previous.apply(this, arguments) || [];
      try {
        if (!UI.mailStarOnly) return out;
        /* a decision still shows, always — see the rule at the top */
        const kept = out.filter((m) => m.star || blocking(m));
        return kept.length ? kept : out;
      } catch (error) {
        return out;
      }
    };
  }

  ACTIONS.mailMuteSheet = function mailMuteSheet() {
    try {
      const prefs = store();
      const label = {
        news: '📰 Newspaper round-ups', info: 'ℹ️ Club notices',
        match: '⚽ Match reports', award: '🏆 Awards',
        train: '🏋️ Training notes', scout: '🔭 Scout reports',
      };
      const rows = MUTABLE.map((kind) => '<div class="mail" data-action="mailMute" data-v="' + kind + '">'
        + '<div class="ic">' + (prefs.mute[kind] ? '🔕' : '🔔') + '</div>'
        + '<div style="flex:1;min-width:0"><div class="tt">' + (label[kind] || kind) + '</div>'
        + '<div class="bd">' + (prefs.mute[kind] ? 'Filed away on arrival' : 'Comes to the inbox')
        + '</div></div></div>').join('');
      window.openModal('<h3>What to ignore</h3>'
        + '<div class="small muted" style="margin:6px 0 12px;line-height:1.55">'
        + 'A muted kind is filed straight into the archive instead of the inbox. '
        + 'It is not deleted — you can still go and read it. Anything waiting on '
        + 'a decision from you is never muted.</div>'
        + '<div class="card tight">' + rows + '</div>'
        + '<button class="btn btn-ghost btn-block" style="margin-top:10px" '
        + 'data-action="mailbox">‹ Back to the inbox</button>');
    } catch (error) { /* the inbox is unchanged */ }
  };

  /* ---------------------------------------------------------------
     WORTH KNOWING SHOULD STOP KNOWING IT
     ---------------------------------------------------------------
     "it should remove the things to know once that task has been
     completed. It shouldn't just stay there once you've done it or it's
     past its time."

     Most of that card already clears itself, because it is rebuilt from
     live state on every render: pick your eleven and "your eleven is not
     picked" goes, renew the contract and "in his last year" goes, and
     answering a letter sets `m.actions = null` which drops it out of the
     list that feeds the card.

     The one that never goes is the letter you never answer. An optional
     letter — a friendly asking for a game, a country sounding you out —
     keeps its actions for ever, so it sits on the home screen until the
     ninety-message inbox cap eventually pushes it out, which can be
     months. That is the "past its time" case.

     It gets a shelf life. Two weeks is long enough that nothing you
     meant to come back to is snatched away, and short enough that the
     card is about this fortnight. The LETTER IS NOT TOUCHED — it stays
     in the inbox with its options intact, and you can still open it and
     take them. All that expires is its claim on the front page. */
  const SHELF = 14;

  if (typeof window.attnKnow === 'function') {
    const previous = window.attnKnow;
    window.attnKnow = function attnKnowFresh() {
      const out = previous.apply(this, arguments) || [];
      try {
        const live = (m) => !!(m && m.actions && m.actions.length
          && ((G.day || 0) - (m.day || 0)) <= SHELF);
        const kept = out.filter((item) => (item && item.mid) ? live(find(item.mid)) : true);

        /* AND BACKFILL, or expiring one leaves a hole. The card takes
           only the first two optional letters, and it takes them before
           this filter can see them — so dropping a stale one would
           silently shrink the card while a perfectly good third letter
           sat in the tray unmentioned. */
        const shown = new Set(kept.map((item) => item.mid).filter(Boolean));
        const want = out.filter((item) => item && item.mid).length;
        if (shown.size < want) {
          const blocked = new Set((typeof window.blockingMails === 'function'
            ? window.blockingMails() : []).map((m) => m.id));
          (G.inbox || []).forEach((m) => {
            if (shown.size >= want) return;
            if (shown.has(m.id) || blocked.has(m.id) || !live(m)) return;
            shown.add(m.id);
            kept.push({
              k: 'opt' + m.id,
              icon: '✉️',
              t: String(m.title || 'Something to look at').replace(/^[^\w£]*\s*/, ''),
              s: 'Yours to take or leave.',
              act: 'nav',
              v: 'home',
              cta: 'Open',
              mid: m.id,
            });
          });
        }
        return kept;
      } catch (error) {
        return out;
      }
    };
  }

  /* RBSMailboxPro, not RBSMailbox. `mailbox.js` already exports
     RBSMailbox with counts(), folderOf() and FOLDERS, and its own test
     reads them — the first cut of this file took that name and broke
     "the mailbox files letters into folders" without touching a line of
     the code it tests. */
  try {
    window.RBSMailboxPro = Object.freeze({ MUTABLE, SHELF, store, blocking, find });
  } catch (error) { /* no window */ }
}());
