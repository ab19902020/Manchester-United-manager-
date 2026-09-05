/* global G, face:writable, faceSpec, HAIR2, hairPath, hairFixes, kitPattern, kitPaint, hashStr, mulberry */
(function playerPortraits() {
  'use strict';

  // A single portrait composition. The existing appearance data still describes
  // each player; no photographs, network requests or new save fields are needed.
  // Each SVG lives inside an image, so its gradients cannot bind to another
  // player's face and a squad list does not add thousands of drawing nodes.
  const SKIN = {
    pale: ['#efd9c7', '#d8b39a', '#a57a64', '#f9e9d9'],
    fair: ['#e5c4a9', '#c99d80', '#986a54', '#f3dcc5'],
    light: ['#d6ac8a', '#b68567', '#835840', '#ecd0b1'],
    olive: ['#bd9577', '#9b7458', '#6b4c3b', '#ddbc98'],
    tan: ['#ad8161', '#8a6048', '#5e4031', '#cda584'],
    brown: ['#926c51', '#6e4b38', '#452e25', '#b08b6c'],
    deep: ['#74513e', '#53382e', '#34231f', '#947159'],
    dark: ['#543a30', '#3c2924', '#241b19', '#795a47'],
  };
  const CACHE_LIMIT = 192;
  const cache = new Map();
  const safeHex = (value, fallback) => /^#[\da-f]{6}$/i.test(value || '') ? value : fallback;
  const num = (value) => Number(value).toFixed(2);
  const escape = (value) => String(value || '').replace(/[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function mix(a, b, t) {
    const rgb = (v) => [1, 3, 5].map((at) => parseInt(v.slice(at, at + 2), 16));
    const aa = rgb(a), bb = rgb(b);
    return '#' + aa.map((v, i) => Math.round(v + (bb[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }

  function drawing(p, spec, club) {
    const [base, shadow, dark, light] = SKIN[spec.sk] || SKIN.light;
    const hair = HAIR2[spec.hr] || HAIR2.darkbrown;
    const h = { b: safeHex(hair.b, '#251b17'), h: safeHex(hair.h, '#54402f') };
    const colour = safeHex(club && club.c1, '#536875');
    const trim = safeHex(club && club.c2, '#e8eced');
    const kit = p.pos === 'GK' ? '#b9bd52' : colour;
    const rng = mulberry(hashStr('portrait-studio|' + (p.id || 0) + '|' + (p.name || '')));
    const width = { long: 8.5, oval: 9, round: 9.6, square: 9.4, wide: 10 }[spec.jaw] || 9;
    const chin = spec.jaw === 'long' ? 29.1 : spec.jaw === 'round' ? 27.5 : 28.4;
    const jaw = spec.jaw === 'square' || spec.jaw === 'wide' ? 6.2 : 4.8;
    const eyeGap = 3.6 + rng() * 0.5;
    const eyeY = 15.45 + rng() * 0.45;
    const aperture = 0.45 + rng() * 0.18;
    const nose = 1.25 + rng() * 0.55;
    const lip = 2.25 + rng() * 0.5;
    const age = Math.max(16, Math.min(80, Number(p.age) || 25));
    const crown = spec.cut === 'bald' ? 3.1 : 4.1;
    const head = 'M20 ' + crown + ' C' + num(20 - width * .75) + ' ' + crown + ' ' + num(20 - width)
      + ' 6.5 ' + num(20 - width) + ' 13.1 L' + num(20 - width + .7)
      + ' 20.6 Q' + num(20 - width + 1) + ' 24 ' + num(20 - jaw) + ' 26.1 Q20 '
      + num(chin + 3) + ' ' + num(20 + jaw) + ' 26.1 Q' + num(20 + width - 1) + ' 24 '
      + num(20 + width - .7) + ' 20.6 L' + num(20 + width) + ' 13.1 C'
      + num(20 + width) + ' 6.5 ' + num(20 + width * .75) + ' ' + crown + ' 20 ' + crown + 'Z';
    const shoulders = 'M1 40 Q2 34 9 32.6 L15.8 30.4 H24.2 L31 32.6 Q38 34 39 40Z';
    const path = (d, fill, attrs = '') => '<path d="' + d + '" fill="' + fill + '" ' + attrs + '/>';
    const line = (d, stroke, weight, opacity = 1) => path(d, 'none', 'stroke="' + stroke
      + '" stroke-width="' + weight + '" opacity="' + opacity + '" stroke-linecap="round"');
    const gradient = (id, stops, attrs) => '<linearGradient id="' + id + '" ' + attrs + '>'
      + stops.map((s, i) => '<stop offset="' + i / (stops.length - 1) + '" stop-color="' + s + '"/>').join('')
      + '</linearGradient>';
    let art = '<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 40 40">'
      + '<defs>' + gradient('skin', [light, base, shadow], 'x1="0" y1="0" x2="1" y2=".6"')
      + gradient('kit', [mix(kit, '#ffffff', .1), kit, mix(kit, '#000000', .45)], 'x1="0" y1="0" x2="1" y2="1"')
      + gradient('back', [mix(colour, '#66717b', .78), '#101820'], 'x1="0" y1="0" x2="1" y2="1"')
      + '<radialGradient id="cheek"><stop stop-color="' + light + '" stop-opacity=".5"/>'
      + '<stop offset="1" stop-color="' + light + '" stop-opacity="0"/></radialGradient>'
      + '<clipPath id="head">' + path(head, '#fff') + '</clipPath>'
      + '<clipPath id="shirt">' + path(shoulders, '#fff') + '</clipPath></defs>'
      + '<rect width="40" height="40" fill="url(#back)"/>'
      + path('M0 34L40 5V0H35L0 28Z', '#ffffff', 'opacity=".035"')
      + line('M2 36L38 6', '#ffffff', '.12', .12)
      + path(shoulders, 'url(#kit)');
    if (club && p.pos !== 'GK' && typeof kitPaint === 'function' && typeof kitPattern === 'function') {
      art += '<g clip-path="url(#shirt)">' + kitPaint(kitPattern(club), colour, trim) + '</g>';
    }
    art += path('M15.8 25.4H24.2L24.6 30.8Q20 35 15.4 30.8Z', shadow)
      + path('M15.8 26Q20 29 24.2 26V28.4Q20 31.2 15.8 28.4Z', dark, 'opacity=".4"')
      + path('M15.5 30.3Q20 33.4 24.5 30.3L26 31.2Q20 37 14 31.2Z', trim)
      + line('M14.5 31.2Q20 35.2 25.5 31.2', mix(kit, '#000000', .55), '.5')
      + line('M9 33.5L7.7 39M31 33.5L32.3 39', mix(kit, '#ffffff', .4), '.32', .6)
      + path('M27.2 35.2H30V37.5L28.6 38.3L27.2 37.5Z', trim, 'opacity=".85"')
      + '<ellipse cx="' + num(20 - width) + '" cy="17.2" rx="1.55" ry="2.75" fill="' + shadow + '"/>'
      + '<ellipse cx="' + num(20 + width) + '" cy="17.2" rx="1.55" ry="2.75" fill="' + shadow + '"/>'
      + line('M' + num(19.5 - width) + ' 16.1q1.1-.7 1 1.5m' + num(width * 2 - .9) + ' -1.5q-1.1-.7-1 1.5', dark, '.35', .5)
      + path(head, 'url(#skin)')
      + '<g clip-path="url(#head)">'
      + path('M28 8Q25 18 27 22L23 27Q29 26 31 17V7Z', dark, 'opacity=".18"')
      + path('M11 16Q12 22 17 25L17.5 27Q11 25 9 17Z', dark, 'opacity=".10"')
      + '<ellipse cx="15" cy="19.4" rx="4" ry="3.2" fill="url(#cheek)"/>';

    // Facial hair follows the jaw; skin is never painted over it as a mask.
    const beard = spec.beard || 'none';
    if (['full', 'stubble', 'chinstrap'].includes(beard)) {
      const top = beard === 'chinstrap' ? 24.3 : 21.2;
      art += path('M9 16L12 19Q14 ' + top + ' 17 23.9Q20 25.3 23 23.9Q26 ' + top
        + ' 28 19L31 16V32H9Z', h.b, 'opacity="' + (beard === 'stubble' ? '.23' : '.8') + '"');
      if (beard !== 'stubble') art += line('M13 24q1 2 3 2.8M24 26.8q2-1 3-2.8', h.h, '.4', .55);
    }
    if (beard === 'goatee') art += path('M17.8 24.9Q20 25.6 22.2 24.9L22 28.5H18Z', h.b, 'opacity=".8"');
    if (['full', 'goatee', 'moustache'].includes(beard)) {
      art += path('M16.6 23Q17.7 21.8 19.6 22L20 22.5L20.4 22Q22.3 21.8 23.4 23L20.6 23.1L20 22.8L19.4 23.1Z', h.b, 'opacity=".82"');
    }

    const eye = (cx, tilt) => {
      const x0 = cx - 1.8, y = eyeY + tilt;
      const shape = 'M' + num(x0) + ' ' + num(y) + 'Q' + num(cx) + ' ' + num(y - aperture * 1.5)
        + ' ' + num(cx + 1.8) + ' ' + num(y) + 'Q' + num(cx) + ' ' + num(y + aperture) + ' ' + num(x0) + ' ' + num(y) + 'Z';
      return path(shape, '#c6b9a6')
        + '<ellipse cx="' + num(cx) + '" cy="' + num(y - .04) + '" rx=".67" ry="' + num(aperture * .77) + '" fill="#302e24"/>'
        + '<ellipse cx="' + num(cx) + '" cy="' + num(y - .04) + '" rx=".29" ry="' + num(aperture * .69) + '" fill="#100f0d"/>'
        + '<circle cx="' + num(cx - .2) + '" cy="' + num(y - .2) + '" r=".13" fill="#fff" opacity=".9"/>'
        + line('M' + num(x0) + ' ' + num(y) + 'Q' + num(cx) + ' ' + num(y - aperture * 1.5) + ' ' + num(cx + 1.8) + ' ' + num(y), dark, '.3')
        + line('M' + num(x0 + .1) + ' ' + num(y + 1) + 'q1.7.65 3.4-.05', dark, '.22', .28)
        + path('M' + num(x0 - .4) + ' ' + num(y - 1.6) + 'q2.2-1.1 4.3.05l-.2.55q-2-.6-4.1.05Z', h.b, 'opacity=".85"');
    };
    art += eye(20 - eyeGap, -.08) + eye(20 + eyeGap, .08)
      + path('M19.5 15.8L' + num(20 - nose) + ' 20.3Q20 21.4 ' + num(20 + nose) + ' 20.3L20.8 19.5Q19.5 20.2 19.5 15.8Z', shadow, 'opacity=".9"')
      + line('M' + num(20 - nose) + ' 20.4q.7.5 1.1.1m.9 0q.5.4 1.1-.1', dark, '.28', .75)
      + line('M20.25 17.2l.25 2.6', light, '.35', .7)
      + path('M' + num(20 - lip) + ' 23.6Q18.8 23.4 19.4 23.3L20 23.5L20.6 23.3Q21.2 23.4 ' + num(20 + lip)
        + ' 23.6Q20 25 ' + num(20 - lip) + ' 23.6Z', mix(base, '#885651', .4))
      + line('M' + num(20 - lip) + ' 23.6Q20 23.95 ' + num(20 + lip) + ' 23.6', dark, '.26', .9)
      + line('M18.6 24.25Q20 24.55 21.4 24.25', light, '.2', .5)
      + line('M18.3 26q1.7.5 3.4 0', dark, '.25', .24);
    if (age >= 29) {
      const strength = Math.min(.42, .12 + (age - 29) * .018);
      art += line('M16.8 20.7q-.8 1-.9 2.6M23.2 20.7q.8 1 .9 2.6M14.7 11.8q5.3-.7 10.6 0', dark, '.2', strength);
      if (age >= 34) art += line('M12.9 16.2l-1 .5M27.1 16.2l1 .5M15.7 10.7q4.3-.5 8.6 0', dark, '.18', strength);
    }
    art += '</g>';
    if (spec.cut !== 'bald' && typeof hairPath === 'function') {
      // Reuse the current haircut vocabulary, independent of old face markup.
      let cut = hairPath(spec.cut || 'short', h, { b: base, s: shadow, d: dark, l: light });
      if (typeof cut === 'string') {
        if (typeof hairFixes === 'function') cut = hairFixes(cut);
        if (spec.cut === 'buzz' || spec.cut === 'crop') {
          const cap = cut.match(/<path d="([^"]+)"/);
          if (cap) cut = '<defs><clipPath id="haircap">' + path(cap[1], '#fff')
            + '</clipPath></defs><g clip-path="url(#haircap)">' + cut + '</g>';
        }
        art += '<g transform="translate(20 0) scale(' + num(width / 9.1) + ' 1) translate(-20 0)">' + cut + '</g>';
      }
    }
    return art + '</svg>';
  }

  function source(p, spec, club) {
    const key = JSON.stringify([p.id, p.name, p.age, p.pos === 'GK', spec, club && club.c1, club && club.c2,
      club && typeof kitPattern === 'function' ? kitPattern(club) : 'plain']);
    if (cache.has(key)) {
      const value = cache.get(key); cache.delete(key); cache.set(key, value);
      return value;
    }
    const value = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(drawing(p, spec, club));
    cache.set(key, value);
    if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return value;
  }

  const previous = face;
  face = function studioPortrait(p, size) {
    if (!p) return '';
    const px = Math.max(16, Math.min(512, Number(size) || 28));
    try {
      const club = G && G.clubs && G.clubs[p.club];
      const src = source(p, Object.assign({}, faceSpec(p)), club);
      return '<img class="rbs-portrait" src="' + src + '" alt="' + escape(p.name) + '" width="' + px
        + '" height="' + px + '" decoding="async" draggable="false" style="width:' + px + 'px;height:' + px + 'px;flex-shrink:0;display:block;border-radius:20%">';
    } catch (error) { return previous.apply(this, arguments); }
  };

  window.RBSPortraits = Object.freeze({ drawing, source, cacheSize: () => cache.size, cacheLimit: CACHE_LIMIT });
})();
