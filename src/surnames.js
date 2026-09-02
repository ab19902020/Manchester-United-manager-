/* =====================================================================
   DE LIGT, NOT LIGT
   ---------------------------------------------------------------------
   Wherever the game has room for one word it takes the last one:

       function surname(n){ const p=String(n).split(' ');
                            return p.length>1 ? p[p.length-1] : n }

   Which is right for most of a squad and wrong for the players a
   supporter would notice first. On the team shape on the home screen,
   Matthijs de Ligt is labelled "Ligt". Put Kevin De Bruyne, Virgil van
   Dijk or Achraf Hakimi's team-mates through it and you get "Bruyne",
   "Dijk", "Weghorst" -- names no commentator has ever said out loud.

   A surname carrying a particle is one name, not two: the tussenvoegsel
   in Dutch, the nobiliary particle in French, Spanish and Portuguese,
   the Arabic article. The rule is simply to keep walking back while the
   word in front is one of them, so "Matthijs de Ligt" gives "de Ligt"
   and "Vincent Aboubakar" still gives "Aboubakar".

   The particle is printed the way the name itself spells it -- van Dijk
   keeps its small v mid-name -- except at the start of the label, where
   it is capitalised the way a shirt or a team sheet would: De Ligt, Van
   Dijk. That is what makes it read as a name rather than a fragment.

   Everything the page does with the result is unchanged; this only
   decides where the name is cut. Anyone with a single name -- Rodrygo,
   Casemiro, Fred -- comes back exactly as before.
   ===================================================================== */
(function surnames() {
  'use strict';
  if (typeof window === 'undefined') return;
  if (typeof window.surname !== 'function') return;

  /* The particles that belong to the name behind them. Dutch, German,
     the Romance languages, the Arabic article, and the Irish and Scots
     prefixes that are written apart. */
  const PARTICLE = {
    de: 1, del: 1, della: 1, dello: 1, degli: 1, di: 1, da: 1, das: 1, dos: 1, du: 1,
    van: 1, von: 1, der: 1, den: 1, ter: 1, ten: 1, af: 1, av: 1,
    le: 1, la: 1, les: 1, lo: 1, li: 1,
    al: 1, el: 1, bin: 1, ibn: 1, abu: 1, ben: 1,
    mac: 1, mc: 1, ap: 1, ni: 1, nic: 1, san: 1, santa: 1, st: 1,
  };

  function isParticle(word) {
    if (!word) return false;
    const w = word.toLowerCase().replace(/[.']/g, '');
    return PARTICLE[w] === 1;
  }

  /* A name is capitalised at the head of a label even when it is spelled
     small inside the full name: van Dijk on his passport, Van Dijk on
     the back of the shirt. */
  function head(word) {
    if (!word) return word;
    return word.charAt(0).toUpperCase() + word.slice(1);
  }

  const passSurname = window.surname;

  window.surname = function surnameWithItsParticles(n) {
    try {
      const parts = String(n == null ? '' : n).trim().split(/\s+/).filter(Boolean);
      if (parts.length < 2) return passSurname(n);

      /* walk back over the particles in front of the final name */
      let i = parts.length - 1;
      while (i > 1 && isParticle(parts[i - 1])) i--;

      /* `i > 1` above keeps the first word as a given name: "De Bruyne"
         on its own would otherwise swallow the lot and return the whole
         string for a two-word name that happens to start with one. */
      if (i === parts.length - 1) return passSurname(n);

      const out = parts.slice(i);
      out[0] = head(out[0]);
      return out.join(' ');
    } catch (error) {
      return passSurname(n);
    }
  };

  window.RBSSurnames = { isParticle: isParticle, of: window.surname };
})();
