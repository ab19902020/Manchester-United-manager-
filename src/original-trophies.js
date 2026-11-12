/* global THREE, TB, tMaterials, tLathe2, tS, tRibbons, tStar, tBeads, tLeagueCup */

/* =====================================================================
   ORIGINAL TROPHIES
   ---------------------------------------------------------------------
   Every competition in this game is invented, so the silverware has to
   be too. The sculpts that used to stand in the trophy room were modelled
   on particular real cups, measured off photographs; a real trophy is
   somebody's design, and a game that is going to be sold cannot put one
   in a glass case and call it its own.

   So each competition gets a cup that was designed here. They are built
   from one small parametric builder -- a foot, a turned profile, a rim,
   and then whichever of handles, lid, finial and ribbons that design
   calls for -- which is also how a silversmith works: the same lathe,
   a different drawing each time. No two share a silhouette, so the room
   still reads at a glance, and none of them is a copy of anything.

   This file only replaces entries in the builder registry. The hall,
   the plinths, the engraving and the heights are untouched.
   ===================================================================== */
(function originalTrophies() {
  'use strict';
  if (typeof TB === 'undefined') return;

  function handle(mat, pts, radius) {
    const curve = new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(p[0], p[1], 0)));
    return new THREE.Mesh(new THREE.TubeGeometry(curve, tS(24, 60), radius, tS(8, 12), false), mat);
  }

  /* o.tint      body colour
     o.profile   [[radius, height], ...] from the top of the foot to the rim
     o.facets    lathe segments, for a cut-sided bowl instead of a round one
     o.handles   {n, pts, r, offset} -- pts in the radial plane
     o.lid       [[radius, height], ...] and o.finial 'ball' | 'star' | 'spire'
     o.band      height of a contrasting collar round the bowl
     o.ribbon    [colour, colour], o.word                                   */
  function cup(o) {
    const M = tMaterials();
    const g = new THREE.Group();
    const body = new THREE.MeshStandardMaterial({ color: o.tint, metalness: 1, roughness: o.rough || 0.14 });
    const trim = o.trim === 'gold' ? M.goldWarm : M.silverSoft;

    g.add(tLathe2(o.foot || [[4.6, 0], [4.6, 0.9], [4.1, 1.2], [3.0, 1.6], [2.2, 2.0]], M.dark));
    g.add(tLathe2(o.profile, body, o.facets || tS(36, 96)));

    const top = o.profile[o.profile.length - 1];
    const rim = new THREE.Mesh(new THREE.TorusGeometry(top[0], 0.17, tS(10, 22), o.facets || tS(56, 112)), trim);
    rim.position.y = top[1];
    rim.rotation.x = Math.PI / 2;
    g.add(rim);

    if (o.band) {
      const at = o.band;
      const collar = new THREE.Mesh(new THREE.TorusGeometry(at[0], 0.22, tS(10, 20), o.facets || tS(56, 112)), trim);
      collar.position.y = at[1];
      collar.rotation.x = Math.PI / 2;
      g.add(collar);
      if (typeof tBeads === 'function' && !o.facets) g.add(tBeads(at[1] + 0.45, at[0] + 0.02, tS(22, 44), 0.09, trim));
    }

    if (o.handles) {
      const h = o.handles;
      for (let k = 0; k < h.n; k++) {
        const holder = new THREE.Group();
        holder.add(handle(h.trim ? trim : body, h.pts, h.r || 0.3));
        holder.rotation.y = (h.offset || 0) + (k / h.n) * Math.PI * 2;
        g.add(holder);
      }
    }

    if (o.lid) {
      g.add(tLathe2(o.lid, body, o.facets || tS(30, 80)));
      const tip = o.lid[o.lid.length - 1];
      if (o.finial === 'star' && typeof tStar === 'function') {
        const star = tStar(1.25, 0.55, 0.3, M.goldWarm);
        star.position.y = tip[1] + 1.2;
        g.add(star);
      } else if (o.finial === 'spire') {
        const spire = new THREE.Mesh(new THREE.ConeGeometry(0.5, 2.2, tS(10, 20)), trim);
        spire.position.y = tip[1] + 1.0;
        g.add(spire);
      } else {
        const ball = new THREE.Mesh(new THREE.SphereGeometry(0.7, tS(14, 28), tS(10, 20)), trim);
        ball.position.y = tip[1] + 0.6;
        g.add(ball);
      }
    }

    if (o.ribbon && typeof tRibbons === 'function') {
      tRibbons(g, { a: o.ribbon[0], b: o.ribbon[1], word: o.word || 'CHAMPIONS', r: top[0] - 0.4, y: top[1] - 0.8, len: 7 });
    }
    return g;
  }

  const LOOP = [[5.0, 13.6], [7.6, 12.9], [7.7, 10.2], [5.0, 9.6]];
  const EAR = [[4.2, 12.4], [6.0, 13.6], [6.6, 11.0], [4.6, 8.4]];
  const LOW = [[6.2, 9.6], [8.2, 9.2], [8.0, 7.2], [5.6, 6.6]];

  /* the league title: a tall gilt urn, lidded, with a star on top */
  TB.PL = () => cup({
    tint: 0xf1cc6a, trim: 'silver',
    profile: [[2.2, 2.0], [1.25, 3.0], [1.0, 4.6], [1.9, 5.4], [1.15, 6.2], [2.7, 7.8], [4.5, 9.8], [5.1, 11.8], [4.7, 13.6]],
    band: [4.55, 9.9],
    handles: { n: 2, pts: [[4.6, 13.2], [7.2, 12.8], [7.4, 10.0], [4.7, 9.8]], r: 0.3 },
    lid: [[4.7, 13.65], [4.9, 14.0], [4.2, 14.9], [2.6, 15.7], [1.2, 16.2], [0.6, 16.5]],
    finial: 'star',
    ribbon: ['#b3121d', '#5a060c'], word: 'CHAMPIONS',
  });

  /* the oldest cup in the country: three handles, no lid, wide open */
  TB.FA = () => cup({
    tint: 0xe9edf1, trim: 'silver',
    profile: [[2.2, 2.0], [1.5, 2.8], [1.2, 4.0], [2.0, 4.8], [1.3, 5.6], [3.4, 7.2], [5.6, 9.4], [6.0, 11.6], [5.6, 13.8]],
    band: [5.75, 10.2],
    handles: { n: 3, pts: LOOP.map((p) => [p[0] + 0.6, p[1]]), r: 0.32, offset: Math.PI / 6 },
    ribbon: ['#1c3f94', '#0a1c46'], word: 'WINNERS',
  });

  /* the League Cup: a slim two-eared vase */
  TB.LC = () => cup({
    tint: 0xd9dee4, trim: 'silver',
    profile: [[2.2, 2.0], [1.6, 2.6], [1.3, 3.6], [1.7, 4.2], [1.4, 5.0], [3.0, 7.0], [3.9, 9.6], [3.5, 12.2], [4.3, 14.2]],
    handles: { n: 2, pts: EAR, r: 0.26 },
    ribbon: ['#127a4d', '#06301e'], word: 'WINNERS',
  });

  /* the Champions Cup: a cut-sided chalice with a spired lid and no handles */
  TB.CL = () => cup({
    tint: 0xf4f6f8, trim: 'gold', facets: 10, rough: 0.1,
    foot: [[5.0, 0], [5.0, 0.6], [4.4, 1.0], [2.8, 1.5], [1.8, 2.0]],
    profile: [[1.8, 2.0], [1.2, 3.2], [1.05, 5.6], [1.6, 6.4], [1.2, 7.0], [3.6, 8.6], [5.2, 10.8], [5.6, 13.0], [5.3, 14.6]],
    band: [5.5, 12.2],
    lid: [[5.3, 14.65], [5.4, 15.0], [4.4, 16.0], [2.6, 16.9], [1.0, 17.4], [0.5, 17.6]],
    finial: 'spire',
  });

  /* the Continental Cup: a low, broad gilt bowl carried on two handles */
  TB.EL = () => cup({
    tint: 0xe8c063, trim: 'silver',
    foot: [[4.8, 0], [4.8, 0.8], [4.0, 1.2], [2.6, 1.7], [2.0, 2.0]],
    profile: [[2.0, 2.0], [1.5, 2.8], [1.4, 4.0], [2.2, 4.8], [4.6, 6.0], [6.4, 7.6], [6.9, 9.4], [6.6, 10.6]],
    band: [6.8, 9.0],
    handles: { n: 2, pts: LOW, r: 0.34, trim: true },
    ribbon: ['#c8641e', '#6b2f08'], word: 'WINNERS',
  });

  /* the Federation Cup: a small bronze goblet */
  TB.EC = () => cup({
    tint: 0xc98f52, trim: 'silver', rough: 0.2,
    profile: [[2.2, 2.0], [1.4, 2.8], [1.0, 5.2], [1.5, 5.8], [1.1, 6.4], [2.8, 8.0], [4.0, 10.4], [4.2, 12.4]],
    band: [4.15, 11.2],
    handles: { n: 2, pts: [[4.0, 12.0], [5.6, 11.6], [5.6, 9.6], [3.6, 9.2]], r: 0.24 },
  });

  /* the World Championship: a lidded cup with four handles, silver and gold */
  TB.WC = () => cup({
    tint: 0xf3d27a, trim: 'silver',
    profile: [[2.2, 2.0], [1.4, 3.0], [1.2, 4.4], [2.0, 5.2], [1.3, 6.0], [3.2, 7.6], [4.6, 9.8], [4.8, 11.8], [4.4, 13.0]],
    band: [4.75, 11.0],
    handles: { n: 4, pts: [[4.4, 12.6], [6.2, 12.2], [6.3, 10.2], [4.5, 9.8]], r: 0.24, offset: Math.PI / 4, trim: true },
    lid: [[4.4, 13.05], [4.6, 13.4], [3.8, 14.4], [2.2, 15.2], [1.0, 15.7], [0.6, 15.9]],
    finial: 'ball',
  });

  /* the European Championship: a shallow dish on a tall stem */
  TB.EURO = () => cup({
    tint: 0xeef1f4, trim: 'gold',
    profile: [[2.2, 2.0], [1.3, 3.0], [1.0, 6.4], [1.6, 7.2], [1.1, 8.0], [1.4, 9.4], [4.8, 10.8], [6.6, 12.0], [7.0, 13.0]],
    band: [1.6, 7.2],
  });

  /* the champions' cups of the other countries: one family, told apart by metal */
  if (typeof tLeagueCup === 'function') {
    TB.ESP = () => tLeagueCup(0xffd35c);
    TB.ITA = () => tLeagueCup(0xbfe3ff);
    TB.GER = () => tLeagueCup(0xf2f4f6);
    TB.FRA = () => tLeagueCup(0xc9d8ff);
  }

  /* World Player of the Year: a gold star on a turned column */
  TB.ballon = function worldPlayer() {
    const M = tMaterials();
    const g = new THREE.Group();
    g.add(tLathe2([[3.6, 0], [3.6, 1.2], [3.0, 1.6], [1.6, 2.2], [1.0, 3.0], [0.8, 7.4], [1.3, 8.0], [1.0, 8.6]], M.dark));
    const collar = new THREE.Mesh(new THREE.TorusGeometry(1.25, 0.16, tS(10, 20), tS(40, 80)), M.goldWarm);
    collar.position.y = 8.0;
    collar.rotation.x = Math.PI / 2;
    g.add(collar);
    if (typeof tStar === 'function') {
      const star = tStar(3.4, 1.5, 0.7, M.gold);
      star.position.y = 12.0;
      g.add(star);
    } else {
      const ball = new THREE.Mesh(new THREE.SphereGeometry(2.4, 32, 24), M.gold);
      ball.position.y = 11.2;
      g.add(ball);
    }
    return g;
  };
})();
