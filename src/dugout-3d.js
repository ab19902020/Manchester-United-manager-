/* global MatchSim, MU, G, ACTIONS, drawDugout:writable, advancePlay, pitchTargets, playState,
          dotOf, dugWatch, dugPose, subScan, subStep, sentOffScan, sentOffStep,
          surname, shirtNo */
(function initDugout3D(root) {
  'use strict';

  const FIELD_LENGTH = 105;
  const FIELD_WIDTH = 68;
  const MAJOR_ACTIONS = new Set(['goal', 'save', 'shot', 'penalty', 'red', 'yellow', 'injury', 'substitution']);
  const ACTION_PRIORITY = {
    goal: 10,
    red: 9,
    penalty: 8,
    save: 8,
    shot: 7,
    injury: 7,
    yellow: 6,
    substitution: 6,
    tackle: 5,
    interception: 5,
    dribble: 4,
    turnover: 3,
    pass: 2,
    possession: 1,
  };
  const ACTION_LABEL = {
    goal: 'GOAL',
    save: 'SAVE',
    shot: 'SHOT',
    penalty: 'PENALTY',
    red: 'RED CARD',
    yellow: 'YELLOW CARD',
    injury: 'STOPPAGE',
    substitution: 'SUBSTITUTION',
    tackle: 'TACKLE WON',
    interception: 'INTERCEPTION',
    dribble: 'DRIBBLE',
    turnover: 'POSSESSION LOST',
    pass: 'PASSING MOVE',
    possession: 'IN POSSESSION',
  };
  const STAT_KEYS = ['pas', 'pasC', 'key', 'sh', 'sot', 'tak', 'takW', 'intc', 'drb', 'drbW', 'sav'];

  const state = {
    installed: false,
    loading: false,
    threeReady: false,
    disabled: false,
    match: null,
    canvas: null,
    hud: null,
    hudContext: null,
    renderer: null,
    scene3D: null,
    camera: null,
    world: null,
    players: new Map(),
    officials: [],
    materials: new Map(),
    geometries: {},
    crowd: null,
    scoreboard: null,
    scoreboardKey: '',
    rain: null,
    ball: null,
    ballShadow: null,
    indicator: null,
    quality: null,
    cameraPosition: null,
    cameraTarget: null,
    frame: 0,
    lastFrameAt: 0,
    lastError: null,
    errorReported: false,
    fallbackDraw: null,
    timeline: {
      match: null,
      snapshot: null,
      queue: [],
      current: null,
      sequence: 0,
      engineEvents: [],
      lastMinute: -1,
    },
    performance: {
      samples: 0,
      total: 0,
      adjusted: false,
    },
  };

  function limit(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mix(from, to, amount) {
    return from + (to - from) * amount;
  }

  function smoothAmount(dt, speed) {
    return 1 - Math.exp(-Math.max(0, dt) * speed);
  }

  function number(value, fallback) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function seedFrom(text) {
    let value = 2166136261;
    const source = String(text || 'broadcast');
    for (let index = 0; index < source.length; index += 1) {
      value ^= source.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function seeded(seed) {
    let value = seed >>> 0;
    return function random() {
      value += 0x6D2B79F5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function speedBudget(speed, significant) {
    const value = Number(speed);
    if (value === 6) {
      return significant
        ? { windowMs: 2800, maxActions: 2, routine: 1 }
        : { windowMs: 0, maxActions: 0, routine: 0 };
    }
    if (value === 4 || value === 8) {
      return { windowMs: significant ? 800 : 650, maxActions: 1, routine: significant ? 0 : 1 };
    }
    if (value === 2 || value === 3) {
      return { windowMs: significant ? 1550 : 1450, maxActions: 3, routine: significant ? 1 : 3 };
    }
    if (value === 0 || value === 9) return { windowMs: 0, maxActions: 0, routine: 0 };
    return { windowMs: significant ? 3000 : 2850, maxActions: significant ? 3 : 6, routine: significant ? 2 : 6 };
  }

  function actionDuration(type, share, speed) {
    const minimum = {
      pass: 420,
      turnover: 460,
      dribble: 620,
      tackle: 680,
      interception: 560,
      shot: 900,
      save: 1100,
      goal: 1900,
      penalty: 1500,
      yellow: 900,
      red: 1300,
      injury: 1100,
      substitution: 1000,
      possession: 460,
    }[type] || 520;
    const value = Number(speed);
    const decisive = MAJOR_ACTIONS.has(type);
    const scale = value === 4 || value === 8 ? 0.55 : value === 2 || value === 3 ? 0.72 : 1;
    const floor = decisive ? minimum : minimum * scale;
    return Math.max(floor, share);
  }

  function expandByCount(records, type, maximum) {
    const source = records.filter((record) => record.type === type && number(record.count, 1) > 0);
    const expanded = [];
    let round = 0;
    while (expanded.length < maximum) {
      let added = false;
      source.forEach((record) => {
        if (expanded.length >= maximum || number(record.count, 1) <= round) return;
        expanded.push({ ...record, count: 1 });
        added = true;
      });
      if (!added) break;
      round += 1;
    }
    return expanded;
  }

  function compactAnalytics(records, speed) {
    const input = Array.isArray(records) ? records.filter((record) => record && record.type) : [];
    const major = input.filter((record) => MAJOR_ACTIONS.has(record.type));
    const significant = major.length > 0;
    const budget = speedBudget(speed, significant);
    if (!budget.maxActions) return [];

    const chosen = [];
    const routineLimit = significant ? Math.min(budget.routine, Math.max(0, budget.maxActions - 1)) : budget.routine;
    const nonPass = input
      .filter((record) => !MAJOR_ACTIONS.has(record.type) && record.type !== 'pass')
      .sort((left, right) => (ACTION_PRIORITY[right.type] || 0) - (ACTION_PRIORITY[left.type] || 0));
    const passes = expandByCount(input, 'pass', routineLimit);

    if (significant) {
      const lead = [...nonPass, ...passes]
        .sort((left, right) => (ACTION_PRIORITY[right.type] || 0) - (ACTION_PRIORITY[left.type] || 0))
        .slice(0, routineLimit);
      chosen.push(...lead);
      chosen.push(major.sort((left, right) => (ACTION_PRIORITY[right.type] || 0) - (ACTION_PRIORITY[left.type] || 0))[0]);
    } else {
      chosen.push(...nonPass.slice(0, routineLimit));
      if (chosen.length < routineLimit) chosen.push(...passes.slice(0, routineLimit - chosen.length));
      if (!chosen.length && input.length) chosen.push({ ...input[0], type: input[0].type || 'possession' });
    }

    const trimmed = chosen.slice(0, budget.maxActions);
    const rawShare = trimmed.length ? budget.windowMs / trimmed.length : 0;
    return trimmed.map((record, index) => ({
      ...record,
      visualIndex: index,
      duration: actionDuration(record.type, rawShare, speed),
      priority: ACTION_PRIORITY[record.type] || 0,
    }));
  }

  function cameraSpec(ball, action, sideIndex, wide) {
    const fieldX = limit(number(ball && ball.x, FIELD_LENGTH / 2), 0, FIELD_LENGTH) - FIELD_LENGTH / 2;
    const fieldZ = limit(number(ball && ball.y, FIELD_WIDTH / 2), 0, FIELD_WIDTH) - FIELD_WIDTH / 2;
    const direction = sideIndex === 1 ? -1 : 1;
    const type = action && action.type;
    if (type === 'goal' || type === 'shot' || type === 'save' || type === 'penalty') {
      return {
        mode: 'cinematic',
        position: [limit(fieldX - direction * 13, -42, 42), 5.35, -38.6],
        target: [limit(fieldX + direction * 7.5, -50, 50), 1.12, limit(fieldZ * 0.9, -25, 25)],
        fov: 39,
      };
    }
    if (wide) {
      return {
        mode: 'wide',
        position: [limit(fieldX * 0.32, -25, 25), 10.9, -42.6],
        target: [fieldX, 0.92, limit(fieldZ * 0.52, -17, 17)],
        fov: 44,
      };
    }
    return {
      mode: 'broadcast',
      position: [limit(fieldX - direction * 7, -42, 42), 7.6, -40.8],
      target: [limit(fieldX + direction * 8, -49, 49), 1.05, limit(fieldZ * 0.78, -24, 24)],
      fov: 41,
    };
  }

  function qualityProfile(width, deviceMemory, pixelRatio) {
    const memory = number(deviceMemory, 4);
    const small = number(width, 390) < 520;
    const constrained = memory <= 3;
    return {
      pixelRatio: Math.min(number(pixelRatio, 1), constrained ? 1.15 : small ? 1.45 : 1.65),
      shadows: !constrained && !small,
      shadowSize: small ? 1024 : 1536,
      crowdPoints: constrained ? 1500 : small ? 2600 : 4000,
      rainPoints: constrained ? 260 : 520,
      compactPlayers: constrained || small,
    };
  }

  function classifyEvent(text, className) {
    const base = root.RBSDugoutRenderer;
    if (base && typeof base.classifyEvent === 'function') return base.classifyEvent(text, className);
    const line = String(text || '');
    if (String(className || '') === 'goal' || /\bgoal\b/i.test(line)) return 'goal';
    if (/save|parr|tip|palm/i.test(line)) return 'save';
    if (/shot|shoot|header|wide|bar/i.test(line)) return 'shot';
    if (/tackle|slides? in/i.test(line)) return 'tackle';
    if (/intercept|cuts? out/i.test(line)) return 'interception';
    if (/dribbl|dances? past|beats? (?:his|a) man/i.test(line)) return 'dribble';
    if (/pass|cross|through ball/i.test(line)) return 'pass';
    if (/red card|sent off/i.test(line)) return 'red';
    if (/yellow|booked|book/i.test(line)) return 'yellow';
    if (/penalty/i.test(line)) return 'penalty';
    if (/substitution|replaces|change/i.test(line)) return 'substitution';
    if (/injur|physio|treatment/i.test(line)) return 'injury';
    return null;
  }

  function liveMatch(match) {
    try { return !!(match && typeof MU !== 'undefined' && MU && MU.m === match); } catch (error) { return false; }
  }

  function matchPlayer(match, id) {
    if (!match || id == null) return null;
    for (const side of match.sides || []) {
      const found = (side.onfield || []).find((player) => player && player.p && player.p.id === id);
      if (found) return found;
    }
    return null;
  }

  function playerSideIndex(match, player) {
    if (!match || !player) return null;
    const index = match.sides.findIndex((side) => (side.onfield || []).includes(player));
    return index >= 0 ? index : null;
  }

  function namedPlayers(match, text) {
    const line = String(text || '');
    return (match.sides || []).flatMap((side) => side.onfield || [])
      .filter((player) => player && player.p && player.p.name && line.includes(player.p.name))
      .sort((left, right) => right.p.name.length - left.p.name.length);
  }

  function emptyStats(player) {
    const stats = (player && player.ms) || {};
    const snapshot = {};
    STAT_KEYS.forEach((key) => { snapshot[key] = number(stats[key], 0); });
    snapshot.yc = number(player && player.yc, 0);
    snapshot.off = !!(player && player.off);
    return snapshot;
  }

  function matchSnapshot(match) {
    const players = new Map();
    (match.sides || []).forEach((side) => (side.onfield || []).forEach((player) => {
      if (player && player.p) players.set(player.p.id, emptyStats(player));
    }));
    return {
      players,
      hs: number(match.fix && match.fix.hs, 0),
      as: number(match.fix && match.fix.as, 0),
      scorers: ((match.fix && match.fix.sc) || []).length,
      feed: (match.feed || []).length,
    };
  }

  function record(type, player, sideIndex, count, extra) {
    return {
      type,
      actorId: player && player.p ? player.p.id : null,
      sideIndex,
      count: Math.max(1, number(count, 1)),
      ...(extra || {}),
    };
  }

  function analyticsDelta(before, match) {
    if (!before || !match) return [];
    let records = [];
    const shotActors = [];
    const keepers = [];
    (match.sides || []).forEach((side, sideIndex) => (side.onfield || []).forEach((player) => {
      if (!player || !player.p) return;
      const previous = before.players.get(player.p.id) || {};
      const current = emptyStats(player);
      const delta = (key) => Math.max(0, number(current[key], 0) - number(previous[key], 0));
      if (delta('pasC')) records.push(record('pass', player, sideIndex, delta('pasC'), { keyPasses: delta('key') }));
      const misses = Math.max(0, delta('pas') - delta('pasC'));
      if (misses) records.push(record('turnover', player, sideIndex, misses));
      if (delta('drb')) records.push(record('dribble', player, sideIndex, delta('drb'), {
        wonCount: delta('drbW'),
      }));
      if (delta('tak')) records.push(record('tackle', player, sideIndex, delta('tak'), {
        wonCount: delta('takW'),
      }));
      if (delta('intc')) records.push(record('interception', player, sideIndex, delta('intc')));
      if (delta('sh')) {
        shotActors.push(player);
        records.push(record('shot', player, sideIndex, delta('sh'), { onTargetCount: delta('sot') }));
      }
      if (delta('sav')) {
        keepers.push(player);
        records.push(record('save', player, sideIndex, delta('sav')));
      }
      if (current.yc > number(previous.yc, 0)) records.push(record('yellow', player, sideIndex, 1));
      if (current.off && !previous.off && player.sentOff) records.push(record('red', player, sideIndex, 1));
    }));

    const scoreChanged = number(match.fix.hs, 0) > before.hs || number(match.fix.as, 0) > before.as;
    const scorers = (match.fix.sc || []).slice(before.scorers);
    if (scoreChanged && scorers.length) {
      const scorer = scorers[scorers.length - 1];
      const player = matchPlayer(match, scorer.pid);
      const sideIndex = match.sides.findIndex((side) => side.ci === scorer.ci);
      records = records.filter((entry) => entry.type !== 'shot' && entry.type !== 'save');
      records.push(record('goal', player, sideIndex >= 0 ? sideIndex : playerSideIndex(match, player), 1, {
        scorerName: scorer.name,
      }));
    } else if (keepers.length) {
      const keeper = keepers[keepers.length - 1];
      const keeperSide = playerSideIndex(match, keeper);
      records = records.filter((entry) => entry.type !== 'shot' && entry.type !== 'save');
      records.push(record('save', keeper, keeperSide, 1, {
        secondaryId: shotActors.length ? shotActors[shotActors.length - 1].p.id : null,
        attackingSide: keeperSide == null ? null : 1 - keeperSide,
      }));
    }

    const lines = (match.feed || []).slice(before.feed);
    lines.forEach((entry) => {
      const type = classifyEvent(entry.text, entry.cls);
      if (!type) return;
      const players = namedPlayers(match, entry.text);
      const sideIndex = (match.sides || []).findIndex((side) => side.ci === entry.ci);
      const duplicate = records.some((item) => item.type === type && (item.actorId == null || !players[0] || item.actorId === players[0].p.id));
      if (!duplicate && (MAJOR_ACTIONS.has(type) || type === 'tackle' || type === 'interception' || type === 'dribble')) {
        records.push(record(type, players[0] || null, sideIndex >= 0 ? sideIndex : playerSideIndex(match, players[0]), 1, {
          secondaryId: players[1] && players[1].p ? players[1].p.id : null,
          text: entry.text,
        }));
      }
    });
    return records;
  }

  function resetTimeline(match) {
    state.timeline.match = match;
    state.timeline.snapshot = matchSnapshot(match);
    state.timeline.queue.length = 0;
    state.timeline.current = null;
    state.timeline.engineEvents.length = 0;
    state.timeline.lastMinute = number(match && match.min, -1);
  }

  function enqueueActions(actions, match) {
    if (!Array.isArray(actions) || !actions.length || !match) return;
    const hasMajor = actions.some((action) => MAJOR_ACTIONS.has(action.type));
    if (hasMajor) {
      state.timeline.queue = state.timeline.queue.filter((action) => MAJOR_ACTIONS.has(action.type));
      if (state.timeline.current && !MAJOR_ACTIONS.has(state.timeline.current.type)) state.timeline.current = null;
    } else if (state.timeline.queue.length > 6) {
      state.timeline.queue = state.timeline.queue.filter((action) => MAJOR_ACTIONS.has(action.type));
    }
    actions.forEach((action) => {
      state.timeline.sequence += 1;
      state.timeline.queue.push({
        ...action,
        id: state.timeline.sequence,
        minute: number(match.min, 0),
      });
    });
  }

  function installAnalyticsHooks() {
    if (typeof MatchSim !== 'function' || !MatchSim.prototype || MatchSim.prototype._rbs3dAnalytics) return;
    MatchSim.prototype._rbs3dAnalytics = true;
    const previousTick = MatchSim.prototype.tickOnce;
    MatchSim.prototype.tickOnce = function tickOnceWithBroadcastPlan() {
      const live = liveMatch(this);
      if (live && state.timeline.match !== this) resetTimeline(this);
      const before = live ? matchSnapshot(this) : null;
      this._rbs3dCollecting = live;
      const result = previousTick.apply(this, arguments);
      this._rbs3dCollecting = false;
      if (live) {
        const records = analyticsDelta(before, this);
        const engine = state.timeline.engineEvents.splice(0);
        engine.forEach((event) => {
          const duplicate = records.find((entry) => entry.type === event.type
            && (entry.actorId == null || event.actorId == null || entry.actorId === event.actorId));
          if (duplicate) {
            if (duplicate.secondaryId == null && event.secondaryId != null) duplicate.secondaryId = event.secondaryId;
            if (!duplicate.text && event.text) duplicate.text = event.text;
          } else if (MAJOR_ACTIONS.has(event.type)) records.push(event);
        });
        let speed = 1;
        try { speed = number(MU.speed, 1); } catch (error) { speed = 1; }
        enqueueActions(compactAnalytics(records, speed), this);
        state.timeline.snapshot = matchSnapshot(this);
        state.timeline.lastMinute = number(this.min, state.timeline.lastMinute);
      }
      return result;
    };

    const previousSay = MatchSim.prototype.say;
    MatchSim.prototype.say = function sayWithBroadcastPlan(minute, side, text, className) {
      const result = previousSay.apply(this, arguments);
      if (!liveMatch(this)) return result;
      const type = classifyEvent(text, className);
      if (!type) return result;
      const players = namedPlayers(this, text);
      const sideIndex = side === this.sides[0] ? 0 : side === this.sides[1] ? 1 : playerSideIndex(this, players[0]);
      const event = record(type, players[0] || null, sideIndex, 1, {
        secondaryId: players[1] && players[1].p ? players[1].p.id : null,
        text,
      });
      if (this._rbs3dCollecting) state.timeline.engineEvents.push(event);
      else enqueueActions(compactAnalytics([event], number(MU && MU.speed, 1)), this);
      return result;
    };
  }

  function surfaceMaterial(options) {
    const THREE = root.THREE;
    if (state.quality && state.quality.compactPlayers) {
      const source = options || {};
      const compactOptions = {};
      ['color', 'map', 'emissive', 'emissiveIntensity', 'transparent', 'opacity', 'side', 'vertexColors',
        'depthWrite', 'depthTest', 'alphaTest'].forEach((key) => {
        if (source[key] != null) compactOptions[key] = source[key];
      });
      return new THREE.MeshLambertMaterial(compactOptions);
    }
    return new THREE.MeshStandardMaterial(options);
  }

  function material(key, options) {
    if (state.materials.has(key)) return state.materials.get(key);
    const value = surfaceMaterial(options);
    state.materials.set(key, value);
    return value;
  }

  function geometry(key, factory) {
    if (!state.geometries[key]) state.geometries[key] = factory();
    return state.geometries[key];
  }

  function mesh(geometryValue, materialValue, shadows) {
    const object = new root.THREE.Mesh(geometryValue, materialValue);
    object.castShadow = shadows !== false && !!(state.quality && state.quality.shadows);
    object.receiveShadow = shadows !== false;
    return object;
  }

  function capsuleGeometry(radius, totalLength, radialSegments) {
    const THREE = root.THREE;
    if (typeof THREE.CapsuleGeometry === 'function') {
      return new THREE.CapsuleGeometry(radius, Math.max(0.04, totalLength - radius * 2), 5, radialSegments || 10);
    }
    const halfCylinder = Math.max(0.02, totalLength - radius * 2) / 2;
    const points = [];
    for (let index = 0; index <= 5; index += 1) {
      const angle = -Math.PI / 2 + (index / 5) * Math.PI / 2;
      points.push(new THREE.Vector2(Math.cos(angle) * radius, -halfCylinder + Math.sin(angle) * radius));
    }
    for (let index = 0; index <= 5; index += 1) {
      const angle = (index / 5) * Math.PI / 2;
      points.push(new THREE.Vector2(Math.cos(angle) * radius, halfCylinder + Math.sin(angle) * radius));
    }
    return new THREE.LatheGeometry(points, radialSegments || 10);
  }

  function addMesh(parent, geometryValue, materialValue, position, rotation, shadows) {
    const object = mesh(geometryValue, materialValue, shadows);
    if (position) object.position.set(position[0], position[1], position[2]);
    if (rotation) object.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(object);
    return object;
  }

  function makePitchTexture() {
    const THREE = root.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 1536;
    canvas.height = 992;
    const context = canvas.getContext('2d');
    const random = seeded(seedFrom('dugout-grass'));
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#2e873e');
    gradient.addColorStop(0.52, '#237735');
    gradient.addColorStop(1, '#17612d');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const stripeWidth = canvas.width / 12;
    for (let index = 0; index < 12; index += 1) {
      context.fillStyle = index % 2 ? 'rgba(255,255,255,.035)' : 'rgba(0,35,10,.052)';
      context.fillRect(index * stripeWidth, 0, stripeWidth, canvas.height);
    }
    for (let index = 0; index < 22000; index += 1) {
      const alpha = 0.015 + random() * 0.025;
      context.fillStyle = random() > 0.48 ? `rgba(222,247,213,${alpha})` : `rgba(0,42,14,${alpha})`;
      context.fillRect(random() * canvas.width, random() * canvas.height, 1, 2 + random() * 3);
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = state.renderer && state.renderer.capabilities ? Math.min(4, state.renderer.capabilities.getMaxAnisotropy()) : 2;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }

  function lineMaterial() {
    if (!state.materials.has('pitch-line')) {
      state.materials.set('pitch-line', new root.THREE.MeshBasicMaterial({ color: 0xf5f8ef }));
    }
    return state.materials.get('pitch-line');
  }

  function addPitchLine(parent, length, width, x, z, rotation) {
    return addMesh(parent, new root.THREE.BoxGeometry(length, 0.024, Math.max(0.14, width)), lineMaterial(),
      [x, 0.035, z], [0, rotation || 0, 0], false);
  }

  function curveLine(parent, radius, start, length, x, z, scaleZ) {
    const THREE = root.THREE;
    const curve = new THREE.EllipseCurve(0, 0, radius, radius * (scaleZ || 1), start, start + length, false, 0);
    const points = curve.getPoints(64).map((point) => new THREE.Vector3(point.x + x, 0.045, point.y + z));
    const closed = Math.abs(length - Math.PI * 2) < 0.01;
    const path = new THREE.CatmullRomCurve3(points, closed, 'catmullrom', 0.35);
    const geometryValue = new THREE.TubeGeometry(path, 64, 0.062, 4, closed);
    const line = mesh(geometryValue, lineMaterial(), false);
    parent.add(line);
    return line;
  }

  function buildPitch(parent) {
    const THREE = root.THREE;
    const pitch = mesh(
      new THREE.PlaneGeometry(FIELD_LENGTH, FIELD_WIDTH, 1, 1),
      surfaceMaterial({ map: makePitchTexture(), color: 0x609c66, roughness: 0.96, metalness: 0 }),
      false,
    );
    pitch.rotation.x = -Math.PI / 2;
    pitch.receiveShadow = true;
    parent.add(pitch);

    const apron = mesh(new THREE.PlaneGeometry(128, 88), material('apron', { color: 0x174d29, roughness: 1 }), false);
    apron.rotation.x = -Math.PI / 2;
    apron.position.y = -0.035;
    apron.receiveShadow = true;
    parent.add(apron);

    addPitchLine(parent, FIELD_LENGTH, 0.11, 0, -FIELD_WIDTH / 2, 0);
    addPitchLine(parent, FIELD_LENGTH, 0.11, 0, FIELD_WIDTH / 2, 0);
    addPitchLine(parent, FIELD_WIDTH, 0.11, -FIELD_LENGTH / 2, 0, Math.PI / 2);
    addPitchLine(parent, FIELD_WIDTH, 0.11, FIELD_LENGTH / 2, 0, Math.PI / 2);
    addPitchLine(parent, FIELD_WIDTH, 0.09, 0, 0, Math.PI / 2);
    curveLine(parent, 9.15, 0, Math.PI * 2, 0, 0, 1);

    [-1, 1].forEach((side) => {
      const goalLine = side * FIELD_LENGTH / 2;
      const areaCentre = goalLine - side * 8.25;
      addPitchLine(parent, 16.5, 0.09, areaCentre, -20.16, 0);
      addPitchLine(parent, 16.5, 0.09, areaCentre, 20.16, 0);
      addPitchLine(parent, 40.32, 0.09, goalLine - side * 16.5, 0, Math.PI / 2);
      addPitchLine(parent, 5.5, 0.09, goalLine - side * 2.75, -9.16, 0);
      addPitchLine(parent, 5.5, 0.09, goalLine - side * 2.75, 9.16, 0);
      addPitchLine(parent, 18.32, 0.09, goalLine - side * 5.5, 0, Math.PI / 2);
      curveLine(parent, 9.15, side > 0 ? Math.PI * 0.63 : -Math.PI * 0.37, Math.PI * 0.74,
        goalLine - side * 11, 0, 1);
      addMesh(parent, new THREE.CylinderGeometry(0.11, 0.11, 0.035, 12), lineMaterial(), [goalLine - side * 11, 0.055, 0], null, false);
    });

    curveLine(parent, 1, 0, Math.PI / 2, -FIELD_LENGTH / 2, -FIELD_WIDTH / 2, 1);
    curveLine(parent, 1, Math.PI / 2, Math.PI / 2, FIELD_LENGTH / 2, -FIELD_WIDTH / 2, 1);
    curveLine(parent, 1, Math.PI, Math.PI / 2, FIELD_LENGTH / 2, FIELD_WIDTH / 2, 1);
    curveLine(parent, 1, Math.PI * 1.5, Math.PI / 2, -FIELD_LENGTH / 2, FIELD_WIDTH / 2, 1);

    addMesh(parent, new THREE.CylinderGeometry(0.11, 0.11, 0.035, 12), lineMaterial(), [0, 0.055, 0], null, false);
    buildCornerFlags(parent);
    buildGoals(parent);
  }

  function buildCornerFlags(parent) {
    const THREE = root.THREE;
    const corners = [
      [-FIELD_LENGTH / 2, -FIELD_WIDTH / 2, 0],
      [FIELD_LENGTH / 2, -FIELD_WIDTH / 2, Math.PI / 2],
      [FIELD_LENGTH / 2, FIELD_WIDTH / 2, Math.PI],
      [-FIELD_LENGTH / 2, FIELD_WIDTH / 2, -Math.PI / 2],
    ];
    const poles = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.025, 0.025, 1.5, 7),
      new THREE.MeshBasicMaterial({ color: 0xf4f5ee }), corners.length);
    const flagGeometry = new THREE.BufferGeometry();
    flagGeometry.setAttribute('position', new THREE.Float32BufferAttribute([
      0, 0, 0,
      0.5, -0.14, 0,
      0, -0.36, 0,
    ], 3));
    const flags = new THREE.InstancedMesh(flagGeometry,
      new THREE.MeshBasicMaterial({ color: 0xf6d51f, side: THREE.DoubleSide }), corners.length);
    const transform = new THREE.Object3D();
    corners.forEach(([x, z, rotation], index) => {
      transform.position.set(x, 0.75, z);
      transform.rotation.set(0, 0, 0);
      transform.updateMatrix();
      poles.setMatrixAt(index, transform.matrix);
      transform.position.set(x, 1.47, z);
      transform.rotation.set(0, rotation, 0);
      transform.updateMatrix();
      flags.setMatrixAt(index, transform.matrix);
    });
    poles.instanceMatrix.needsUpdate = true;
    flags.instanceMatrix.needsUpdate = true;
    parent.add(poles, flags);
  }

  function buildGoals(parent) {
    const THREE = root.THREE;
    const postGeometry = geometry('goal-post', () => new THREE.CylinderGeometry(0.082, 0.082, 2.44, 12));
    const barGeometry = geometry('goal-bar', () => new THREE.CylinderGeometry(0.082, 0.082, 7.32, 12));
    const postMaterial = material('goal-post', { color: 0xffffff, roughness: 0.3, metalness: 0.12 });
    const netMaterial = new THREE.LineBasicMaterial({ color: 0xf8fbff, transparent: true, opacity: 0.68 });
    [-1, 1].forEach((side) => {
      const group = new THREE.Group();
      const frontX = side * FIELD_LENGTH / 2;
      const backX = frontX + side * 2.35;
      [-3.66, 3.66].forEach((z) => addMesh(group, postGeometry, postMaterial, [frontX, 1.22, z], null, true));
      addMesh(group, barGeometry, postMaterial, [frontX, 2.44, 0], [Math.PI / 2, 0, 0], true);
      const lines = [];
      for (let y = 0; y <= 2.44; y += 0.305) {
        lines.push(new THREE.Vector3(frontX, y, -3.66), new THREE.Vector3(backX, y * 0.88, -4.1));
        lines.push(new THREE.Vector3(frontX, y, 3.66), new THREE.Vector3(backX, y * 0.88, 4.1));
        lines.push(new THREE.Vector3(backX, y * 0.88, -4.1), new THREE.Vector3(backX, y * 0.88, 4.1));
      }
      for (let z = -4.1; z <= 4.11; z += 0.45) {
        lines.push(new THREE.Vector3(frontX, 0, limit(z, -3.66, 3.66)), new THREE.Vector3(frontX, 2.44, limit(z, -3.66, 3.66)));
        lines.push(new THREE.Vector3(backX, 0, z), new THREE.Vector3(backX, 2.14, z));
        lines.push(new THREE.Vector3(frontX, 2.44, limit(z, -3.66, 3.66)), new THREE.Vector3(backX, 2.14, z));
      }
      const netGeometry = new THREE.BufferGeometry().setFromPoints(lines);
      group.add(new THREE.LineSegments(netGeometry, netMaterial));
      parent.add(group);
    });
  }

  function addSeatBank(group, definition, standIndex, homeColour, awayColour) {
    const THREE = root.THREE;
    const spacing = definition.width > 110 ? 1.42 : 1.36;
    const columns = Math.floor((definition.width - 5) / spacing);
    const rows = 27;
    const seats = new THREE.InstancedMesh(
      new THREE.PlaneGeometry(0.76, 0.34),
      surfaceMaterial({ color: 0xffffff, roughness: 0.72, metalness: 0.03, side: THREE.DoubleSide }),
      columns * rows,
    );
    seats.castShadow = false;
    seats.receiveShadow = true;
    const dummy = new THREE.Object3D();
    const random = seeded(seedFrom(`${standIndex}|seat-bank`));
    const palette = [
      new THREE.Color(homeColour),
      new THREE.Color(homeColour),
      new THREE.Color(awayColour),
      new THREE.Color('#d8dee6'),
      new THREE.Color('#1c2b3c'),
    ];
    let instance = 0;
    for (let tier = 0; tier < 3; tier += 1) {
      const tierWidth = definition.width - tier * 4;
      const tierColumns = Math.max(1, Math.floor((tierWidth - 5) / spacing));
      const offset = (columns - tierColumns) / 2;
      for (let row = 0; row < 9; row += 1) {
        for (let column = 0; column < columns; column += 1) {
          const visibleColumn = column - offset;
          const withinTier = visibleColumn >= 0 && visibleColumn < tierColumns;
          dummy.position.set(
            withinTier ? (visibleColumn - (tierColumns - 1) / 2) * spacing : 0,
            1.73 + tier * 5.5 + row * 0.46,
            tier * 6.5 + row * 0.72 - 0.43,
          );
          dummy.rotation.set(-0.12, 0, 0);
          dummy.scale.set(withinTier ? 1 : 0.001, withinTier ? 1 : 0.001, withinTier ? 1 : 0.001);
          dummy.updateMatrix();
          seats.setMatrixAt(instance, dummy.matrix);
          if (typeof seats.setColorAt === 'function') {
            let colourIndex = random() < 0.12 ? 3 : standIndex % 2;
            if (random() < 0.11) colourIndex = 4;
            if (random() < 0.08) colourIndex = standIndex % 2 ? 0 : 2;
            seats.setColorAt(instance, palette[colourIndex]);
          }
          instance += 1;
        }
      }
    }
    seats.instanceMatrix.needsUpdate = true;
    if (seats.instanceColor) seats.instanceColor.needsUpdate = true;
    group.add(seats);
  }

  function updateScoreboard(match) {
    const board = state.scoreboard;
    if (!board || !match) return;
    const key = `${match.fix.hs}|${match.fix.as}|${match.dispMin()}|${match.stage}|${match.done}`;
    if (key === state.scoreboardKey) return;
    state.scoreboardKey = key;
    const context = board.context;
    const home = G.clubs[match.sides[0].ci];
    const away = G.clubs[match.sides[1].ci];
    context.clearRect(0, 0, board.canvas.width, board.canvas.height);
    context.fillStyle = '#07101b';
    context.fillRect(0, 0, board.canvas.width, board.canvas.height);
    context.fillStyle = '#f6d51f';
    context.fillRect(0, 0, board.canvas.width, 12);
    context.fillStyle = '#eef5fa';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.font = '900 35px Arial, sans-serif';
    context.fillText(`${home.short || home.name}   ${match.fix.hs} – ${match.fix.as}   ${away.short || away.name}`, 256, 76);
    context.fillStyle = '#8ca5b9';
    context.font = '800 25px Arial, sans-serif';
    const clock = match.done ? 'FULL TIME' : match.stage === 'HT' ? 'HALF TIME' : `${match.dispMin()}'`;
    context.fillText(clock, 256, 135);
    board.texture.needsUpdate = true;
  }

  function buildScoreboard(parent, match) {
    const THREE = root.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 192;
    const texture = new THREE.CanvasTexture(canvas);
    const group = new THREE.Group();
    group.position.set(0, 15.1, 47.9);
    group.rotation.y = Math.PI;
    addMesh(group, new THREE.BoxGeometry(15.6, 6.5, 0.48), material('scoreboard-frame', {
      color: 0x0b1118, roughness: 0.38, metalness: 0.58,
    }), [0, 0, 0.18], null, false);
    const screen = addMesh(group, new THREE.PlaneGeometry(14.6, 5.5), new THREE.MeshBasicMaterial({ map: texture }),
      [0, 0, 0.43], null, false);
    screen.castShadow = false;
    parent.add(group);
    state.scoreboard = { canvas, context: canvas.getContext('2d'), texture, group };
    state.scoreboardKey = '';
    updateScoreboard(match);
  }

  function buildStands(parent, home, away) {
    const THREE = root.THREE;
    const concrete = material('concrete', { color: 0x263543, roughness: 0.9, metalness: 0.02 });
    const dark = material('stadium-dark', { color: 0x111820, roughness: 0.66, metalness: 0.25 });
    const roof = material('roof', { color: 0x0b1118, roughness: 0.42, metalness: 0.52 });
    const homeColour = (home && home.c1) || '#b5122a';
    const awayColour = (away && away.c1) || '#2f65b4';
    const standDefs = [
      { x: 0, z: -49, width: 134, depth: 22, rotate: Math.PI },
      { x: 0, z: 49, width: 134, depth: 22, rotate: 0 },
      { x: -69, z: 0, width: 100, depth: 20, rotate: -Math.PI / 2 },
      { x: 69, z: 0, width: 100, depth: 20, rotate: Math.PI / 2 },
    ];
    standDefs.forEach((definition, standIndex) => {
      const group = new THREE.Group();
      group.position.set(definition.x, 0, definition.z);
      group.rotation.y = definition.rotate;
      const stepRows = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 0.34, 0.86), concrete, 27);
      const tierBases = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), dark, 3);
      stepRows.castShadow = false;
      stepRows.receiveShadow = true;
      tierBases.castShadow = false;
      tierBases.receiveShadow = true;
      const rowTransform = new THREE.Object3D();
      let rowInstance = 0;
      for (let tier = 0; tier < 3; tier += 1) {
        const tierWidth = definition.width - tier * 4;
        const tierDepth = 6.4;
        const baseY = 1.4 + tier * 5.5;
        const baseZ = tier * 6.5;
        for (let step = 0; step < 9; step += 1) {
          rowTransform.position.set(0, baseY + step * 0.46, baseZ + step * 0.72);
          rowTransform.scale.set(tierWidth, 1, 1);
          rowTransform.updateMatrix();
          stepRows.setMatrixAt(rowInstance, rowTransform.matrix);
          rowInstance += 1;
        }
        rowTransform.position.set(0, baseY - 0.2, baseZ + 5);
        rowTransform.scale.set(tierWidth + 2, 0.55, tierDepth + 6);
        rowTransform.updateMatrix();
        tierBases.setMatrixAt(tier, rowTransform.matrix);
      }
      stepRows.instanceMatrix.needsUpdate = true;
      tierBases.instanceMatrix.needsUpdate = true;
      group.add(tierBases);
      group.add(stepRows);
      addSeatBank(group, definition, standIndex, homeColour, awayColour);
      addMesh(group, new THREE.BoxGeometry(definition.width + 6, 0.72, 20), roof,
        [0, 18.8, 11], [-0.055, 0, 0], false);
      addMesh(group, new THREE.BoxGeometry(definition.width + 4, 1.05, 0.6),
        material(`trim-${standIndex}`, { color: standIndex % 2 ? awayColour : homeColour, roughness: 0.55 }),
        [0, 13.4, 7.8], null, false);
      parent.add(group);
    });

    const boardMaterial = material('board-shell', { color: 0x111722, roughness: 0.42, metalness: 0.2 });
    const boardShells = new THREE.InstancedMesh(new THREE.BoxGeometry(9.5, 1.25, 0.18), boardMaterial, 22);
    const homeBoards = new THREE.InstancedMesh(new THREE.PlaneGeometry(9.1, 0.9),
      new THREE.MeshBasicMaterial({ color: homeColour, side: THREE.DoubleSide }), 11);
    const awayBoards = new THREE.InstancedMesh(new THREE.PlaneGeometry(9.1, 0.9),
      new THREE.MeshBasicMaterial({ color: awayColour, side: THREE.DoubleSide }), 11);
    const boardTransform = new THREE.Object3D();
    let shellIndex = 0;
    for (let column = 0; column < 11; column += 1) {
      const x = -50 + column * 10;
      [-37.1, 37.1].forEach((z, index) => {
        boardTransform.position.set(x, 0.68, z);
        boardTransform.rotation.set(0, 0, 0);
        boardTransform.scale.set(1, 1, 1);
        boardTransform.updateMatrix();
        boardShells.setMatrixAt(shellIndex, boardTransform.matrix);
        shellIndex += 1;
        boardTransform.position.set(x, 0.68, z + (index ? -0.11 : 0.11));
        boardTransform.rotation.set(0, index ? Math.PI : 0, 0);
        boardTransform.updateMatrix();
        (index ? awayBoards : homeBoards).setMatrixAt(column, boardTransform.matrix);
      });
    }
    boardShells.instanceMatrix.needsUpdate = true;
    homeBoards.instanceMatrix.needsUpdate = true;
    awayBoards.instanceMatrix.needsUpdate = true;
    parent.add(boardShells, homeBoards, awayBoards);

    buildCrowd(parent, home, away);
    buildFloodlights(parent);
  }

  function buildCrowd(parent, home, away) {
    const THREE = root.THREE;
    const random = seeded(seedFrom(`${home && home.name}|${away && away.name}|crowd`));
    const count = state.quality.crowdPoints;
    const positions = new Float32Array(count * 3);
    const colours = new Float32Array(count * 3);
    const palette = [
      new THREE.Color((home && home.c1) || '#c8102e'),
      new THREE.Color((away && away.c1) || '#2864b4'),
      new THREE.Color('#d8dde2'),
      new THREE.Color('#17202b'),
      new THREE.Color('#e2b56d'),
    ];
    const stands = [
      { x: 0, z: -49, width: 134, rotate: Math.PI },
      { x: 0, z: 49, width: 134, rotate: 0 },
      { x: -69, z: 0, width: 100, rotate: -Math.PI / 2 },
      { x: 69, z: 0, width: 100, rotate: Math.PI / 2 },
    ];
    const up = new THREE.Vector3(0, 1, 0);
    for (let index = 0; index < count; index += 1) {
      const standIndex = random() < 0.64 ? Math.floor(random() * 2) : 2 + Math.floor(random() * 2);
      const stand = stands[standIndex];
      const tier = Math.floor(random() * 3);
      const row = Math.floor(random() * 9);
      const tierWidth = stand.width - tier * 4;
      const local = new THREE.Vector3(
        -tierWidth / 2 + 2.5 + random() * (tierWidth - 5),
        1.98 + tier * 5.5 + row * 0.46,
        tier * 6.5 + row * 0.72 - 0.58,
      );
      local.applyAxisAngle(up, stand.rotate);
      positions[index * 3] = local.x + stand.x;
      positions[index * 3 + 1] = local.y;
      positions[index * 3 + 2] = local.z + stand.z;
      const colour = palette[Math.floor(random() * palette.length)];
      colours[index * 3] = colour.r;
      colours[index * 3 + 1] = colour.g;
      colours[index * 3 + 2] = colour.b;
    }
    const crowdGeometry = new THREE.BufferGeometry();
    crowdGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    crowdGeometry.setAttribute('color', new THREE.BufferAttribute(colours, 3));
    const crowd = new THREE.Points(crowdGeometry, new THREE.PointsMaterial({
      size: 0.29,
      sizeAttenuation: true,
      vertexColors: true,
      transparent: true,
      opacity: 0.96,
    }));
    parent.add(crowd);
    state.crowd = crowd;
  }

  function buildFloodlights(parent) {
    const THREE = root.THREE;
    const poleMaterial = material('flood-pole', { color: 0x222c35, roughness: 0.38, metalness: 0.62 });
    const lampMaterial = material('flood-lamp', { color: 0xeaf5ff, emissive: 0xd7ebff, emissiveIntensity: 2.4, roughness: 0.2 });
    [[-62, -43], [62, -43], [-62, 43], [62, 43]].forEach(([x, z]) => {
      addMesh(parent, new THREE.CylinderGeometry(0.28, 0.46, 25, 8), poleMaterial, [x, 12.5, z], null, false);
      const rack = addMesh(parent, new THREE.BoxGeometry(8, 2.1, 0.55), lampMaterial, [x, 25, z], [0, x < 0 ? -0.12 : 0.12, 0], false);
      rack.castShadow = false;
    });
  }

  function buildLighting(scene) {
    const THREE = root.THREE;
    scene.add(new THREE.HemisphereLight(0xaed4ff, 0x102419, 0.74));
    scene.add(new THREE.AmbientLight(0x9eb1c4, 0.16));
    const key = new THREE.DirectionalLight(0xfff8e7, 1.18);
    key.position.set(-22, 38, -25);
    key.castShadow = !!state.quality.shadows;
    if (key.castShadow) {
      key.shadow.mapSize.width = state.quality.shadowSize;
      key.shadow.mapSize.height = state.quality.shadowSize;
      key.shadow.camera.left = -58;
      key.shadow.camera.right = 58;
      key.shadow.camera.top = 46;
      key.shadow.camera.bottom = -46;
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 110;
      key.shadow.bias = -0.0007;
    }
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xb7d2ef, 0.38);
    fill.position.set(35, 24, 32);
    scene.add(fill);
  }

  function kitSet(home, away) {
    const base = root.RBSDugoutRenderer;
    if (base && typeof base.resolveKits === 'function') return base.resolveKits(home, away);
    return [
      { primary: (home && home.c1) || '#c8102e', trim: (home && home.c2) || '#ffffff', goalkeeper: '#f6d21f', goalkeeperTrim: '#171b20' },
      { primary: (away && away.c1) || '#2474bf', trim: (away && away.c2) || '#ffffff', goalkeeper: '#38bdf8', goalkeeperTrim: '#071c2a' },
    ];
  }

  function skinColour(player) {
    const palette = ['#f1c7a5', '#dfa77f', '#c88a63', '#a66c49', '#7b4b31', '#503020'];
    return palette[Math.abs(number(player && player.p && player.p.id, 0)) % palette.length];
  }

  function hairColour(player) {
    const palette = ['#171311', '#2b1c14', '#49311f', '#6d4c2b', '#0e1012'];
    return palette[Math.floor(Math.abs(number(player && player.p && player.p.id, 0)) / 3) % palette.length];
  }

  function addLimbSegment(parent, radius, length, colour, name) {
    const THREE = root.THREE;
    const pivot = new THREE.Group();
    pivot.name = `${name}Pivot`;
    const limb = mesh(capsuleGeometry(radius, length, 8),
      surfaceMaterial({ color: colour, roughness: 0.72 }), true);
    limb.position.y = -length / 2;
    pivot.add(limb);
    parent.add(pivot);
    return { pivot, limb, length };
  }

  function shirtTexture(player, club, kit, goalkeeper) {
    const THREE = root.THREE;
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const context = canvas.getContext('2d');
    context.fillStyle = goalkeeper ? kit.goalkeeper : kit.primary;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = goalkeeper ? kit.goalkeeperTrim : kit.trim;
    context.globalAlpha = 0.82;
    const pattern = Math.abs(seedFrom((club && club.name) || 'club')) % 4;
    if (pattern === 0) {
      for (let x = 16; x < canvas.width; x += 54) context.fillRect(x, 0, 18, canvas.height);
    } else if (pattern === 1) {
      for (let y = 24; y < canvas.height; y += 58) context.fillRect(0, y, canvas.width, 17);
    } else if (pattern === 2) {
      context.save();
      context.translate(40, -30);
      context.rotate(-0.42);
      context.fillRect(0, 0, 54, 380);
      context.restore();
    } else {
      context.fillRect(0, 0, canvas.width, 16);
      context.fillRect(0, canvas.height - 14, canvas.width, 14);
    }
    context.globalAlpha = 1;
    context.fillStyle = '#ffffff';
    context.strokeStyle = 'rgba(0,0,0,.55)';
    context.lineWidth = 8;
    context.font = '900 82px Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    let numberText = String((Math.abs(number(player && player.p && player.p.id, 0)) % 30) + 1);
    try { if (typeof shirtNo === 'function') numberText = String(shirtNo(player.p)); } catch (error) { /* stable fallback */ }
    context.strokeText(numberText, 128, 126);
    context.fillText(numberText, 128, 126);
    const texture = new THREE.CanvasTexture(canvas);
    texture.anisotropy = state.renderer && state.renderer.capabilities ? Math.min(4, state.renderer.capabilities.getMaxAnisotropy()) : 2;
    return texture;
  }

  function createPlayerModel(player, club, kit) {
    const THREE = root.THREE;
    const group = new THREE.Group();
    const rootBody = new THREE.Group();
    group.add(rootBody);
    const goalkeeper = player.slot === 'GK';
    const realHeight = limit(number(player.p && player.p.heightCm, 182) / 100, 1.67, 2.02);
    const realWeight = limit(number(player.p && player.p.weightKg, 75), 56, 105);
    const widthScale = limit(0.94 + ((realWeight / (realHeight * realHeight)) - 22.4) * 0.022, 0.84, 1.16);
    const scale = realHeight / 1.82;
    const skin = skinColour(player);
    const hair = hairColour(player);
    const kitPrimary = goalkeeper ? kit.goalkeeper : kit.primary;
    const kitTrim = goalkeeper ? kit.goalkeeperTrim : kit.trim;
    const shirtMap = shirtTexture(player, club, kit, goalkeeper);
    const shirtMaterial = surfaceMaterial({ map: shirtMap, color: 0xffffff, roughness: 0.66, metalness: 0.01 });
    const shortsMaterial = surfaceMaterial({ color: kitTrim, roughness: 0.72 });
    const sockMaterial = surfaceMaterial({ color: kitTrim, roughness: 0.82 });
    const skinMaterial = surfaceMaterial({ color: skin, roughness: 0.76 });
    const hairMaterial = surfaceMaterial({ color: hair, roughness: 0.9 });
    const bootMaterial = surfaceMaterial({ color: 0x101419, roughness: 0.54 });

    const hips = new THREE.Group();
    hips.position.y = 0.92 * scale;
    rootBody.add(hips);
    const shorts = mesh(new THREE.BoxGeometry(0.52 * widthScale, 0.34, 0.34), shortsMaterial, true);
    shorts.position.y = 0.01;
    hips.add(shorts);

    const torso = mesh(capsuleGeometry(0.29 * widthScale, 0.94, 12), shirtMaterial, true);
    torso.position.y = 0.48 * scale;
    torso.scale.y = scale;
    hips.add(torso);

    const head = mesh(new THREE.SphereGeometry(0.145, 14, 12), skinMaterial, true);
    head.position.y = 1.13 * scale;
    head.scale.set(0.90, 1.08, 0.94);
    hips.add(head);
    const compact = !!(state.quality && state.quality.compactPlayers);
    if (!compact) {
      const neck = mesh(new THREE.CylinderGeometry(0.085, 0.092, 0.14, 10), skinMaterial, true);
      neck.position.y = 0.97 * scale;
      hips.add(neck);
      const hairCap = mesh(new THREE.SphereGeometry(0.148, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.53), hairMaterial, true);
      hairCap.position.y = 1.18 * scale;
      hairCap.scale.set(0.92, 0.78, 0.96);
      hips.add(hairCap);
    }

    let leftLeg;
    let rightLeg;
    let leftLower;
    let rightLower;
    let leftArm;
    let rightArm;
    let leftForearm;
    let rightForearm;
    if (compact) {
      leftLeg = addLimbSegment(hips, 0.083, 0.91 * scale, sockMaterial.color, 'leftLeg');
      leftLeg.pivot.position.set(-0.15 * widthScale, -0.10, 0);
      rightLeg = addLimbSegment(hips, 0.083, 0.91 * scale, sockMaterial.color, 'rightLeg');
      rightLeg.pivot.position.set(0.15 * widthScale, -0.10, 0);
      leftArm = addLimbSegment(hips, 0.062, 0.65 * scale, kitPrimary, 'leftArm');
      leftArm.pivot.position.set(-0.34 * widthScale, 0.71 * scale, 0);
      leftArm.pivot.rotation.z = -0.18;
      rightArm = addLimbSegment(hips, 0.062, 0.65 * scale, kitPrimary, 'rightArm');
      rightArm.pivot.position.set(0.34 * widthScale, 0.71 * scale, 0);
      rightArm.pivot.rotation.z = 0.18;
      leftLower = { pivot: new THREE.Group() };
      rightLower = { pivot: new THREE.Group() };
      leftForearm = { pivot: new THREE.Group() };
      rightForearm = { pivot: new THREE.Group() };
    } else {
      leftLeg = addLimbSegment(hips, 0.09, 0.48 * scale, shortsMaterial.color, 'leftUpperLeg');
      leftLeg.pivot.position.set(-0.15 * widthScale, -0.12, 0);
      leftLower = addLimbSegment(leftLeg.pivot, 0.074, 0.48 * scale, sockMaterial.color, 'leftLowerLeg');
      leftLower.pivot.position.y = -0.46 * scale;
      const leftBoot = mesh(new THREE.BoxGeometry(0.16, 0.10, 0.28), bootMaterial, true);
      leftBoot.position.set(0, -0.48 * scale, 0.08);
      leftLower.pivot.add(leftBoot);

      rightLeg = addLimbSegment(hips, 0.09, 0.48 * scale, shortsMaterial.color, 'rightUpperLeg');
      rightLeg.pivot.position.set(0.15 * widthScale, -0.12, 0);
      rightLower = addLimbSegment(rightLeg.pivot, 0.074, 0.48 * scale, sockMaterial.color, 'rightLowerLeg');
      rightLower.pivot.position.y = -0.46 * scale;
      const rightBoot = mesh(new THREE.BoxGeometry(0.16, 0.10, 0.28), bootMaterial, true);
      rightBoot.position.set(0, -0.48 * scale, 0.08);
      rightLower.pivot.add(rightBoot);

      leftArm = addLimbSegment(hips, 0.067, 0.36 * scale, kitPrimary, 'leftUpperArm');
      leftArm.pivot.position.set(-0.34 * widthScale, 0.71 * scale, 0);
      leftArm.pivot.rotation.z = -0.18;
      leftForearm = addLimbSegment(leftArm.pivot, 0.056, 0.34 * scale, skinMaterial.color, 'leftForearm');
      leftForearm.pivot.position.y = -0.34 * scale;
      const leftHand = mesh(new THREE.SphereGeometry(goalkeeper ? 0.082 : 0.062, 10, 8),
        goalkeeper ? surfaceMaterial({ color: 0xf2f6ff, roughness: 0.62 }) : skinMaterial, true);
      leftHand.position.y = -0.34 * scale;
      leftForearm.pivot.add(leftHand);

      rightArm = addLimbSegment(hips, 0.067, 0.36 * scale, kitPrimary, 'rightUpperArm');
      rightArm.pivot.position.set(0.34 * widthScale, 0.71 * scale, 0);
      rightArm.pivot.rotation.z = 0.18;
      rightForearm = addLimbSegment(rightArm.pivot, 0.056, 0.34 * scale, skinMaterial.color, 'rightForearm');
      rightForearm.pivot.position.y = -0.34 * scale;
      const rightHand = mesh(new THREE.SphereGeometry(goalkeeper ? 0.082 : 0.062, 10, 8),
        goalkeeper ? surfaceMaterial({ color: 0xf2f6ff, roughness: 0.62 }) : skinMaterial, true);
      rightHand.position.y = -0.34 * scale;
      rightForearm.pivot.add(rightHand);
    }

    const shadow = mesh(new THREE.CircleGeometry(0.43 * widthScale, 18),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.26, depthWrite: false }), false);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.018;
    group.add(shadow);

    group.userData = {
      player,
      club,
      kit,
      rootBody,
      hips,
      torso,
      head,
      leftLeg: leftLeg.pivot,
      rightLeg: rightLeg.pivot,
      leftLower: leftLower.pivot,
      rightLower: rightLower.pivot,
      leftArm: leftArm.pivot,
      rightArm: rightArm.pivot,
      leftForearm: leftForearm.pivot,
      rightForearm: rightForearm.pivot,
      shadow,
      phase: (number(player.p && player.p.id, 1) % 13) * 0.41,
      currentX: 0,
      currentZ: 0,
      velocityX: 0,
      velocityZ: 0,
      opacityMaterials: [shirtMaterial, shortsMaterial, sockMaterial, skinMaterial, hairMaterial],
    };
    return group;
  }

  function createOfficialModel(assistant) {
    const fakePlayer = { p: { id: assistant ? 91002 : 91001, heightCm: 180, weightKg: 73 }, slot: 'MC' };
    const kit = assistant
      ? { primary: '#f6d32b', trim: '#111827', goalkeeper: '#f6d32b', goalkeeperTrim: '#111827' }
      : { primary: '#41c4e8', trim: '#101820', goalkeeper: '#41c4e8', goalkeeperTrim: '#101820' };
    return createPlayerModel(fakePlayer, { name: assistant ? 'Assistant' : 'Referee' }, kit);
  }

  function buildPlayers(parent, match, home, away) {
    const kits = kitSet(home, away);
    state.players.clear();
    (match.sides || []).forEach((side, sideIndex) => (side.onfield || []).forEach((player) => {
      if (!player || !player.p) return;
      const model = createPlayerModel(player, G.clubs[side.ci], kits[sideIndex]);
      const dot = typeof dotOf === 'function' ? dotOf(player) : null;
      const worldX = number(dot && dot.x, player.hx || FIELD_LENGTH / 2) - FIELD_LENGTH / 2;
      const worldZ = number(dot && dot.y, player.hy || FIELD_WIDTH / 2) - FIELD_WIDTH / 2;
      model.position.set(worldX, 0, worldZ);
      model.userData.currentX = worldX;
      model.userData.currentZ = worldZ;
      parent.add(model);
      state.players.set(player.p.id, model);
    }));

    const referee = createOfficialModel(false);
    referee.position.set(0, 0, 4);
    parent.add(referee);
    const assistantA = createOfficialModel(true);
    assistantA.position.set(-16, 0, -35.3);
    parent.add(assistantA);
    const assistantB = createOfficialModel(true);
    assistantB.position.set(16, 0, 35.3);
    parent.add(assistantB);
    state.officials = [referee, assistantA, assistantB];
  }

  function ensurePlayerModels(match) {
    const home = G.clubs[match.sides[0].ci];
    const away = G.clubs[match.sides[1].ci];
    const kits = kitSet(home, away);
    (match.sides || []).forEach((side, sideIndex) => (side.onfield || []).forEach((player) => {
      if (!player || !player.p || state.players.has(player.p.id)) return;
      const model = createPlayerModel(player, G.clubs[side.ci], kits[sideIndex]);
      const dot = typeof dotOf === 'function' ? dotOf(player) : null;
      model.position.set(number(dot && dot.x, FIELD_LENGTH / 2) - FIELD_LENGTH / 2, 0,
        number(dot && dot.y, FIELD_WIDTH / 2) - FIELD_WIDTH / 2);
      state.world.add(model);
      state.players.set(player.p.id, model);
    }));
  }

  function buildBall(parent) {
    const THREE = root.THREE;
    const ball = mesh(new THREE.SphereGeometry(0.22, 18, 14),
      surfaceMaterial({ color: 0xf7f8f4, roughness: 0.54, metalness: 0.01 }), true);
    ball.position.set(0, 0.22, 0);
    parent.add(ball);
    const panels = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.225, 1)),
      new THREE.LineBasicMaterial({ color: 0x20272d, transparent: true, opacity: 0.55 }));
    ball.add(panels);
    const shadow = mesh(new THREE.CircleGeometry(0.24, 16),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32, depthWrite: false }), false);
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = 0.016;
    parent.add(shadow);
    const indicator = new THREE.Mesh(new THREE.RingGeometry(0.62, 0.76, 32),
      new THREE.MeshBasicMaterial({ color: 0xfbe122, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false }));
    indicator.rotation.x = -Math.PI / 2;
    indicator.position.y = 0.028;
    parent.add(indicator);
    state.ball = ball;
    state.ballShadow = shadow;
    state.indicator = indicator;
  }

  function actionActor(action, match) {
    return matchPlayer(match, action && action.actorId);
  }

  function actionSide(action, match) {
    if (action && action.type === 'save' && action.attackingSide != null) return action.attackingSide;
    if (action && action.sideIndex != null) return action.sideIndex;
    return playerSideIndex(match, actionActor(action, match));
  }

  function relatedPlayer(match, actor, sideIndex, opponent, actionId) {
    if (!match || sideIndex == null) return null;
    const sourceSide = opponent ? match.sides[1 - sideIndex] : match.sides[sideIndex];
    if (!sourceSide) return null;
    const actorDot = actor && typeof dotOf === 'function' ? dotOf(actor) : null;
    const direction = sideIndex === 1 ? -1 : 1;
    const random = seeded(seedFrom(`${actionId}|support`));
    const candidates = (sourceSide.onfield || [])
      .filter((player) => player && player.p && player !== actor && !player.off)
      .map((player) => {
        const dot = typeof dotOf === 'function' ? dotOf(player) : null;
        if (!dot || !actorDot) return { player, score: player.slot === 'GK' ? 100 : random() };
        const distance = Math.hypot(dot.x - actorDot.x, dot.y - actorDot.y);
        if (opponent) return { player, score: distance + random() * 1.5 };
        const forward = (dot.x - actorDot.x) * direction;
        const preferred = Math.abs(distance - 14) + (forward < -4 ? 18 : 0) + (player.slot === 'GK' ? 30 : 0);
        return { player, score: preferred + random() * 2.5 };
      })
      .sort((left, right) => left.score - right.score);
    return candidates.length ? candidates[0].player : null;
  }

  function beginNextAction(now, match) {
    if (state.timeline.current && now < state.timeline.current.endsAt) return state.timeline.current;
    state.timeline.current = null;
    const next = state.timeline.queue.shift();
    if (!next) return null;
    const actor = actionActor(next, match);
    const attackingSide = actionSide(next, match);
    const defendingSide = next.type === 'save'
      ? (next.sideIndex != null ? next.sideIndex : attackingSide == null ? null : 1 - attackingSide)
      : (attackingSide == null ? null : 1 - attackingSide);
    let other = matchPlayer(match, next.secondaryId);
    if (!other && next.type === 'pass') other = relatedPlayer(match, actor, attackingSide, false, next.id);
    if (!other && ['tackle', 'interception', 'dribble'].includes(next.type)) {
      other = relatedPlayer(match, actor, attackingSide, true, next.id);
    }
    const play = typeof playState === 'function' ? playState() : null;
    const actorDot = actor && typeof dotOf === 'function' ? dotOf(actor) : null;
    const otherDot = other && typeof dotOf === 'function' ? dotOf(other) : null;
    next.actor = actor;
    next.attackingSide = attackingSide;
    next.defendingSide = defendingSide;
    next.secondary = other;
    if (other && other.p) next.secondaryId = other.p.id;
    next.startedAt = now;
    next.endsAt = now + number(next.duration, 800);
    next.from = next.type === 'save' && otherDot
      ? { x: otherDot.x, y: otherDot.y }
      : actorDot ? { x: actorDot.x, y: actorDot.y }
      : { x: number(MU.ball && MU.ball.x, FIELD_LENGTH / 2), y: number(MU.ball && MU.ball.y, FIELD_WIDTH / 2) };
    next.to = next.type !== 'save' && otherDot ? { x: otherDot.x, y: otherDot.y } : null;
    if (!next.to && play && play.to) next.to = { x: play.to.x, y: play.to.y };
    if (!next.to) {
      const direction = attackingSide === 1 ? -1 : 1;
      const distance = next.type === 'shot' || next.type === 'goal' || next.type === 'save' ? 22 : next.type === 'pass' ? 13 : 7;
      next.to = {
        x: limit(next.from.x + direction * distance, 1, 104),
        y: limit(next.from.y + (seeded(seedFrom(`${next.id}|to`))() * 18 - 9), 3, 65),
      };
    }
    if (next.type === 'shot' || next.type === 'goal' || next.type === 'save' || next.type === 'penalty') {
      next.to.x = attackingSide === 1 ? 0.4 : 104.6;
      next.to.y = limit(34 + (seeded(seedFrom(`${next.id}|goal`))() * 6.4 - 3.2), 30.7, 37.3);
    }
    state.timeline.current = next;
    return next;
  }

  function actionProgress(action, now) {
    if (!action) return 0;
    return limit((now - action.startedAt) / Math.max(1, action.endsAt - action.startedAt), 0, 1);
  }

  function activeAction(now, match) {
    return beginNextAction(now, match);
  }

  function safePose(playerId, speed, swing, bob, facing) {
    try {
      if (typeof dugPose === 'function') return dugPose(playerId, speed, swing, bob, facing);
    } catch (error) { /* basic running pose */ }
    return {
      legA: swing * 0.58,
      legB: -swing * 0.58,
      armA: -swing * 0.70,
      armB: swing * 0.70,
      rot: 0,
      lift: 0,
      bob,
      down: 0,
    };
  }

  function setMaterialOpacity(model, opacity) {
    if (!model || !model.userData || !model.userData.opacityMaterials) return;
    model.userData.opacityMaterials.forEach((value) => {
      value.transparent = opacity < 0.999;
      value.opacity = opacity;
    });
  }

  function updatePlayer(model, dot, now, dt, action, match) {
    if (!model || !dot || !dot.pl || !model.userData) return;
    const data = model.userData;
    const targetX = number(dot.x, FIELD_LENGTH / 2) - FIELD_LENGTH / 2;
    const targetZ = number(dot.y, FIELD_WIDTH / 2) - FIELD_WIDTH / 2;
    const oldX = data.currentX;
    const oldZ = data.currentZ;
    const easing = dot.pl.off ? 2.0 : 7.2;
    const amount = smoothAmount(dt, easing);
    data.currentX = mix(data.currentX, targetX, amount);
    data.currentZ = mix(data.currentZ, targetZ, amount);
    data.velocityX = mix(data.velocityX, (data.currentX - oldX) / Math.max(dt, 0.016), 0.24);
    data.velocityZ = mix(data.velocityZ, (data.currentZ - oldZ) / Math.max(dt, 0.016), 0.24);
    const speed = limit(Math.hypot(data.velocityX, data.velocityZ) / 7.5, 0, 1);

    /* ---- how this particular man runs ----
       Everybody shared one gait, so twenty-two players moved like one
       player copied twenty-two times, which is most of why a crowded
       midfield read as a diagram. These are seeded from the player's
       own id, so they are his for the life of the save and the same
       every time you watch him: a short quick stride, a long loping
       one, arms high or low, a slight lean. The numbers stay narrow —
       this is meant to be recognisable, not comic. */
    if (data.gait == null) {
      const rng = seeded(seedFrom('gait|' + dot.pl.p.id));
      data.gait = {
        cadence: 0.82 + rng() * 0.42,
        stride: 0.80 + rng() * 0.45,
        arms: 0.68 + rng() * 0.72,
        bounce: 0.72 + rng() * 0.62,
        lean: (rng() - 0.5) * 0.13,
        offset: rng() * Math.PI * 2,
      };
    }
    const gait = data.gait;
    data.phase += dt * (2.7 + speed * 8.4) * gait.cadence;
    const swing = Math.sin(data.phase + gait.offset) * (0.10 + speed * 0.85) * gait.stride;
    const bob = Math.abs(Math.cos(data.phase + gait.offset)) * speed * 0.035 * gait.bounce;
    let facing = Math.abs(data.velocityX) + Math.abs(data.velocityZ) > 0.04 ? Math.atan2(data.velocityX, data.velocityZ) : model.rotation.y;
    if (action && action.to && (action.actorId === dot.pl.p.id || action.secondaryId === dot.pl.p.id)) {
      const destinationX = action.to.x - FIELD_LENGTH / 2;
      const destinationZ = action.to.y - FIELD_WIDTH / 2;
      facing = Math.atan2(destinationX - data.currentX, destinationZ - data.currentZ);
    }
    model.rotation.y = mix(model.rotation.y, facing, smoothAmount(dt, 6));
    let pose = safePose(dot.pl.p.id, speed, swing, bob, data.velocityX >= 0 ? 1 : -1);
    /* the arms and the lean are his too, and only while he is moving —
       a man standing still should not be leaning into a sprint */
    pose = {
      ...pose,
      armA: number(pose.armA, 0) * gait.arms,
      armB: number(pose.armB, 0) * gait.arms,
      rot: number(pose.rot, 0) + gait.lean * speed,
    };

    if (action && action.actorId === dot.pl.p.id) {
      const progress = actionProgress(action, now);
      if (action.type === 'shot' || action.type === 'pass' || action.type === 'penalty') {
        const kick = Math.sin(limit(progress * 1.5, 0, 1) * Math.PI);
        pose = { ...pose, legA: 1.15 * kick - 0.2, legB: -0.18, armA: -0.7 * kick, armB: 0.52 * kick, rot: -0.10 * kick };
      } else if (action.type === 'goal') {
        if (progress < 0.34) {
          const kick = Math.sin(limit(progress / 0.34, 0, 1) * Math.PI);
          pose = { ...pose, legA: 1.18 * kick - 0.2, legB: -0.18, armA: -0.7 * kick, armB: 0.52 * kick, rot: -0.10 * kick };
        } else {
          const celebrate = Math.sin(limit((progress - 0.34) / 0.28, 0, 1) * Math.PI / 2);
          pose = { ...pose, armA: -2.1 * celebrate, armB: -2.1 * celebrate, lift: 0.10 * Math.abs(Math.sin(progress * Math.PI * 5)) };
        }
      } else if (action.type === 'tackle' || action.type === 'interception') {
        const slide = Math.sin(limit(progress * 1.25, 0, 1) * Math.PI);
        pose = { ...pose, legA: 1.05 * slide, legB: 0.22 * slide, armA: -0.75 * slide, armB: 0.58 * slide, down: 0.42 * slide };
      } else if (action.type === 'dribble') {
        const feint = Math.sin(progress * Math.PI * 2);
        pose = { ...pose, legA: 0.38 + feint * 0.25, legB: -0.25, armA: -0.55, armB: 0.42, rot: feint * 0.2 };
      }
    }

    if (action && action.secondaryId === dot.pl.p.id) {
      const progress = actionProgress(action, now);
      if (action.type === 'save') {
        const kick = Math.sin(limit(progress / 0.38, 0, 1) * Math.PI);
        pose = { ...pose, legA: 1.1 * kick - 0.18, legB: -0.16, armA: -0.62 * kick, armB: 0.46 * kick };
      } else if (action.type === 'tackle' || action.type === 'interception') {
        const stumble = Math.sin(progress * Math.PI);
        pose = { ...pose, legA: -0.34 * stumble, legB: 0.42 * stumble, armA: 0.85 * stumble, armB: -0.72 * stumble, rot: -0.26 * stumble };
      }
    }

    if (action && action.type === 'save' && dot.pl.slot === 'GK') {
      const keeperSide = playerSideIndex(match, dot.pl);
      if (action.actorId === dot.pl.p.id || (action.actorId == null && keeperSide === action.defendingSide)) {
        const progress = actionProgress(action, now);
        const dive = Math.sin(progress * Math.PI);
        pose = { ...pose, armA: -1.25 * dive, armB: -1.10 * dive, legA: 0.3 * dive, legB: -0.2 * dive, rot: dive * 0.82, lift: dive * 0.72 };
      }
    }

    data.rootBody.position.y = 0.13 + number(pose.lift, 0) * 0.35 + number(pose.bob, 0);
    data.hips.position.y = 0.92 - number(pose.down, 0) * 0.45;
    data.hips.rotation.z = number(pose.rot, 0) * 0.34;
    data.leftLeg.rotation.x = number(pose.legA, 0);
    data.rightLeg.rotation.x = number(pose.legB, 0);
    data.leftLower.rotation.x = Math.max(0, -number(pose.legA, 0)) * 0.72;
    data.rightLower.rotation.x = Math.max(0, -number(pose.legB, 0)) * 0.72;
    data.leftArm.rotation.x = number(pose.armA, 0);
    data.rightArm.rotation.x = number(pose.armB, 0);
    data.leftForearm.rotation.x = Math.abs(number(pose.armA, 0)) * 0.22;
    data.rightForearm.rotation.x = Math.abs(number(pose.armB, 0)) * 0.22;
    model.position.set(data.currentX, 0, data.currentZ);
    setMaterialOpacity(model, dot.pl.off ? 0.28 : 1);
    model.visible = !dot._gone;
  }

  function updateOfficials(now, dt, match) {
    if (!state.officials.length) return;
    const ballX = number(MU.ball && MU.ball.x, FIELD_LENGTH / 2) - FIELD_LENGTH / 2;
    const ballZ = number(MU.ball && MU.ball.y, FIELD_WIDTH / 2) - FIELD_WIDTH / 2;
    const targets = [
      [limit(ballX - 8, -42, 42), limit(ballZ + 8, -24, 24)],
      [limit(ballX - 12, -48, 48), -35.1],
      [limit(ballX + 12, -48, 48), 35.1],
    ];
    state.officials.forEach((official, index) => {
      const data = official.userData;
      const target = targets[index];
      const dot = {
        x: target[0] + FIELD_LENGTH / 2,
        y: target[1] + FIELD_WIDTH / 2,
        pl: data.player,
      };
      updatePlayer(official, dot, now, dt, null, match);
    });
  }

  /* ---------------------------------------------------------------
     THE BALL BELONGS TO A PLAYER
     ---------------------------------------------------------------
     This is the reason the dugout did not look like football, and it
     was one cause rather than several. Two systems were placing things
     and they never agreed:

       the player models eased toward their 2D dot positions, with
       their own smoothing and their own lag

       the ball either followed a separately-eased 2D ball position, or
       — during a staged action — flew between `from` and `to`
       coordinates that were SNAPSHOTTED ONCE when the action began

     So by the time a pass landed, the receiver had moved on and the
     ball arrived where he used to be. Nothing was ever at anybody's
     feet, and because nothing was at anybody's feet, none of the
     animation the file already had — the slide tackles, the kick
     swings, the keeper's dive, the goal celebration — read as
     connected to an object. It looked like men running near a ball.

     Both ends are taken from the live model instead. In possession the
     ball is planted at the carrier's feet, a little in front of him in
     the direction he is facing, and it inherits its smoothness from
     him rather than easing separately. In flight it is recomputed
     every frame from where the passer and the receiver actually are,
     so the ball follows the man it was played to.
     --------------------------------------------------------------- */
  function modelFor(pl) {
    try { return pl && pl.p ? state.players.get(pl.p.id) : null; } catch (error) { return null; }
  }

  /* just ahead of the boot, in the direction he is running */
  function footPoint(model, reach) {
    if (!model) return null;
    const out = number(reach, 0.62);
    return {
      x: model.position.x + FIELD_LENGTH / 2 + Math.sin(model.rotation.y) * out,
      y: model.position.z + FIELD_WIDTH / 2 + Math.cos(model.rotation.y) * out,
    };
  }

  function updateBall(now, action) {
    if (!state.ball || !MU || !MU.ball) return;
    const play = typeof playState === 'function' ? playState() : null;
    const carrier = play && play.holder;
    const carrierModel = modelFor(carrier);
    let x = number(MU.ball.x, FIELD_LENGTH / 2);
    let z = number(MU.ball.y, FIELD_WIDTH / 2);
    let height = Math.max(0.22, number(MU.ballH, 0) + 0.22);
    let inFlight = false;

    if (action && ['pass', 'shot', 'goal', 'save', 'penalty'].includes(action.type)) {
      const progress = actionProgress(action, now);
      const eased = progress < 0.5 ? 2 * progress * progress : 1 - ((-2 * progress + 2) ** 2) / 2;
      /* live where a man is involved, the staged point where one is not
         — a shot at goal is aimed at the goal, not at a player */
      const from = footPoint(modelFor(action.actor), 0.5) || action.from;
      const to = (action.type === 'pass' ? footPoint(modelFor(action.secondary), 0.35) : null) || action.to;
      x = mix(from.x, to.x, eased);
      z = mix(from.y, to.y, eased);
      const distance = Math.hypot(to.x - from.x, to.y - from.y);
      const loft = action.type === 'pass' ? Math.min(1.8, distance * 0.045) : Math.min(2.2, distance * 0.032);
      height = 0.22 + Math.sin(Math.PI * progress) * loft;
      if (action.type === 'save' && progress > 0.72) {
        x += (action.defendingSide === 1 ? -1 : 1) * (progress - 0.72) * 8;
        height += (progress - 0.72) * 1.2;
      }
      MU.ball.x = x;
      MU.ball.y = z;
      inFlight = true;
    }

    if (!inFlight && carrierModel) {
      const foot = footPoint(carrierModel, 0.62);
      x = foot.x;
      z = foot.y;
      height = 0.22;
      MU.ball.x = x;
      MU.ball.y = z;
    }
    state.ball.position.set(x - FIELD_LENGTH / 2, height, z - FIELD_WIDTH / 2);
    state.ball.rotation.x += 0.08;
    state.ball.rotation.z += 0.11;
    state.ballShadow.position.set(x - FIELD_LENGTH / 2, 0.017, z - FIELD_WIDTH / 2);
    const shadowScale = limit(1.15 - height * 0.10, 0.55, 1.05);
    state.ballShadow.scale.set(shadowScale, shadowScale, shadowScale);
    const holderModel = carrierModel;
    state.indicator.visible = !!holderModel;
    if (holderModel) {
      state.indicator.position.set(holderModel.position.x, 0.027, holderModel.position.z);
      const pulse = 0.96 + Math.sin(now / 140) * 0.05;
      state.indicator.scale.set(pulse, pulse, pulse);
    }
  }

  function updateCamera(dt, action, match) {
    const sideIndex = actionSide(action, match);
    const ball = MU && MU.ball ? MU.ball : { x: FIELD_LENGTH / 2, y: FIELD_WIDTH / 2 };
    const wide = !action || ['possession', 'pass', 'turnover'].includes(action.type) || match.done || match.stage === 'HT';
    const spec = cameraSpec(ball, action, sideIndex == null ? 0 : sideIndex, wide);
    const THREE = root.THREE;
    const position = new THREE.Vector3(spec.position[0], spec.position[1], spec.position[2]);
    const target = new THREE.Vector3(spec.target[0], spec.target[1], spec.target[2]);
    if (!state.cameraPosition) state.cameraPosition = position.clone();
    if (!state.cameraTarget) state.cameraTarget = target.clone();
    const amount = smoothAmount(dt, action && MAJOR_ACTIONS.has(action.type) ? 2.7 : 1.8);
    state.cameraPosition.lerp(position, amount);
    state.cameraTarget.lerp(target, amount);
    state.camera.position.copy(state.cameraPosition);
    state.camera.lookAt(state.cameraTarget);
    state.camera.fov = mix(state.camera.fov, spec.fov, amount);
    state.camera.updateProjectionMatrix();
  }

  function updateRain(now) {
    if (!state.rain || !state.rain.geometry) return;
    const positions = state.rain.geometry.attributes.position.array;
    for (let index = 0; index < positions.length; index += 6) {
      positions[index + 1] -= 0.48;
      positions[index] -= 0.04;
      positions[index + 4] -= 0.48;
      positions[index + 3] -= 0.04;
      if (positions[index + 1] < 0) {
        const x = -65 + Math.random() * 130;
        const y = 12 + Math.random() * 30;
        const z = -48 + Math.random() * 96;
        positions[index] = x;
        positions[index + 1] = y;
        positions[index + 2] = z;
        positions[index + 3] = x + 0.12;
        positions[index + 4] = y - 0.82;
        positions[index + 5] = z + 0.04;
      }
    }
    state.rain.geometry.attributes.position.needsUpdate = true;
    state.rain.rotation.y = Math.sin(now / 5000) * 0.04;
  }

  function buildRain(parent, match) {
    const weather = match && match.fix && match.fix.ctx && match.fix.ctx.wx;
    if (!weather || !/rain|heavy pitch/i.test(String(weather.k || ''))) return;
    const THREE = root.THREE;
    const random = seeded(seedFrom(`${match.fix.h}|${match.fix.a}|rain`));
    const count = state.quality.rainPoints;
    const positions = new Float32Array(count * 6);
    for (let index = 0; index < count; index += 1) {
      const offset = index * 6;
      const x = -65 + random() * 130;
      const y = 2 + random() * 40;
      const z = -48 + random() * 96;
      positions[offset] = x;
      positions[offset + 1] = y;
      positions[offset + 2] = z;
      positions[offset + 3] = x + 0.12;
      positions[offset + 4] = y - 0.82;
      positions[offset + 5] = z + 0.04;
    }
    const rainGeometry = new THREE.BufferGeometry();
    rainGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const rain = new THREE.LineSegments(rainGeometry, new THREE.LineBasicMaterial({
      color: 0xb9d8ef,
      transparent: true,
      opacity: 0.34,
      depthWrite: false,
    }));
    parent.add(rain);
    state.rain = rain;
  }

  function createHud(canvas) {
    const parent = canvas.parentElement;
    if (!parent) return;
    parent.classList.add('rbs-3d-active');
    if (root.getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    const hud = document.createElement('canvas');
    hud.className = 'rbs-dugout-hud';
    hud.setAttribute('aria-hidden', 'true');
    Object.assign(hud.style, {
      position: 'absolute',
      left: `${canvas.offsetLeft}px`,
      top: `${canvas.offsetTop}px`,
      width: `${canvas.clientWidth}px`,
      height: `${canvas.clientHeight}px`,
      pointerEvents: 'none',
      borderRadius: canvas.style.borderRadius || '14px',
      zIndex: '2',
    });
    parent.appendChild(hud);
    state.hud = hud;
    state.hudContext = hud.getContext('2d');
  }

  function roundedRect(context, x, y, width, height, radius) {
    context.beginPath();
    if (typeof context.roundRect === 'function') context.roundRect(x, y, width, height, radius);
    else {
      context.moveTo(x + radius, y);
      context.lineTo(x + width - radius, y);
      context.quadraticCurveTo(x + width, y, x + width, y + radius);
      context.lineTo(x + width, y + height - radius);
      context.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
      context.lineTo(x + radius, y + height);
      context.quadraticCurveTo(x, y + height, x, y + height - radius);
      context.lineTo(x, y + radius);
      context.quadraticCurveTo(x, y, x + radius, y);
    }
    context.closePath();
  }

  function playerDisplayName(player) {
    if (!player || !player.p) return '';
    try { if (typeof surname === 'function') return surname(player.p.name); } catch (error) { /* full name */ }
    return player.p.name;
  }

  function actionLabel(action) {
    if (!action) return 'LIVE';
    if (action.type === 'tackle' && !number(action.wonCount, 0)) return 'CHALLENGE';
    if (action.type === 'shot' && number(action.onTargetCount, 0)) return 'SHOT ON TARGET';
    if (action.type === 'pass' && number(action.keyPasses, 0)) return 'KEY PASS';
    return ACTION_LABEL[action.type] || 'LIVE';
  }

  function drawHud(match, action, width, height, now) {
    const context = state.hudContext;
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    const scale = Math.max(0.72, Math.min(width / 780, height / 560));
    const home = G.clubs[match.sides[0].ci];
    const away = G.clubs[match.sides[1].ci];
    const top = 18 * scale;
    const left = 18 * scale;
    const scoreWidth = Math.min(width * 0.55, 335 * scale);
    const scoreHeight = 46 * scale;
    roundedRect(context, left, top, scoreWidth, scoreHeight, 7 * scale);
    context.fillStyle = 'rgba(6,10,16,.91)';
    context.fill();
    context.fillStyle = home.c1 || '#c8102e';
    context.fillRect(left, top, 7 * scale, scoreHeight);
    context.fillStyle = away.c1 || '#2864b4';
    context.fillRect(left + scoreWidth - 7 * scale, top, 7 * scale, scoreHeight);
    context.fillStyle = '#f4f7f3';
    context.font = `900 ${16 * scale}px Inter, Arial, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'left';
    context.fillText(home.short || home.name, left + 17 * scale, top + scoreHeight / 2);
    context.textAlign = 'center';
    context.fillText(`${match.fix.hs}  –  ${match.fix.as}`, left + scoreWidth / 2, top + scoreHeight / 2);
    context.textAlign = 'right';
    context.fillText(away.short || away.name, left + scoreWidth - 17 * scale, top + scoreHeight / 2);

    const clockWidth = 78 * scale;
    roundedRect(context, left + scoreWidth + 8 * scale, top, clockWidth, scoreHeight, 7 * scale);
    context.fillStyle = 'rgba(6,10,16,.91)';
    context.fill();
    context.fillStyle = '#fbe122';
    context.font = `900 ${17 * scale}px Inter, Arial, sans-serif`;
    context.textAlign = 'center';
    const clock = match.done ? 'FT' : match.stage === 'HT' ? 'HT' : `${match.dispMin()}'`;
    context.fillText(clock, left + scoreWidth + 8 * scale + clockWidth / 2, top + scoreHeight / 2);

    const totalPossession = Math.max(1, number(match.poss[0], 1) + number(match.poss[1], 1));
    const homePossession = Math.round(number(match.poss[0], 1) / totalPossession * 100);
    const possessionY = top + scoreHeight + 7 * scale;
    const possessionWidth = scoreWidth + clockWidth + 8 * scale;
    roundedRect(context, left, possessionY, possessionWidth, 5 * scale, 2.5 * scale);
    context.fillStyle = 'rgba(0,0,0,.55)';
    context.fill();
    context.fillStyle = home.c1 || '#c8102e';
    context.fillRect(left, possessionY, possessionWidth * homePossession / 100, 5 * scale);
    context.fillStyle = away.c1 || '#2864b4';
    context.fillRect(left + possessionWidth * homePossession / 100, possessionY,
      possessionWidth * (100 - homePossession) / 100, 5 * scale);

    if (action) {
      const actor = actionActor(action, match);
      const stats = (actor && actor.ms) || {};
      const label = actionLabel(action);
      const statBits = [];
      if (stats.pas) statBits.push(`PAS ${stats.pasC || 0}/${stats.pas}`);
      if (stats.tak) statBits.push(`TAC ${stats.takW || 0}/${stats.tak}`);
      if (stats.drb) statBits.push(`DRB ${stats.drbW || 0}/${stats.drb}`);
      if (stats.sav) statBits.push(`SAV ${stats.sav}`);
      const name = actor ? playerDisplayName(actor) : action.scorerName || '';
      const boxWidth = Math.min(width - 28 * scale, Math.max(220 * scale, (name.length * 10 + 165) * scale));
      const boxHeight = 50 * scale;
      const boxX = (width - boxWidth) / 2;
      const boxY = height - boxHeight - 20 * scale;
      roundedRect(context, boxX, boxY, boxWidth, boxHeight, 7 * scale);
      context.fillStyle = 'rgba(5,9,14,.88)';
      context.fill();
      context.fillStyle = action.type === 'goal' ? '#fbe122' : '#8fd6ff';
      context.font = `900 ${10 * scale}px Inter, Arial, sans-serif`;
      context.textAlign = 'left';
      context.fillText(label, boxX + 14 * scale, boxY + 15 * scale);
      context.fillStyle = '#f4f7f3';
      context.font = `900 ${15 * scale}px Inter, Arial, sans-serif`;
      context.fillText(name || 'MATCH ACTION', boxX + 14 * scale, boxY + 34 * scale);
      if (statBits.length) {
        context.fillStyle = 'rgba(235,242,238,.72)';
        context.font = `800 ${10 * scale}px Inter, Arial, sans-serif`;
        context.textAlign = 'right';
        context.fillText(statBits.slice(0, 2).join('  ·  '), boxX + boxWidth - 14 * scale, boxY + 34 * scale);
      }
    }

    if (action && action.type === 'goal') {
      const progress = actionProgress(action, now);
      const alpha = Math.sin(progress * Math.PI);
      context.save();
      context.globalAlpha = alpha;
      context.fillStyle = 'rgba(251,225,34,.12)';
      context.fillRect(0, 0, width, height);
      context.strokeStyle = '#fbe122';
      context.lineWidth = 5 * scale;
      context.strokeRect(8 * scale, 8 * scale, width - 16 * scale, height - 16 * scale);
      context.restore();
    }
  }

  function syncCanvasSize() {
    if (!state.canvas || !state.renderer || !state.hud) return;
    const canvas = state.canvas;
    const cssWidth = Math.max(1, canvas.clientWidth || number(canvas.style.width.replace('px', ''), 390));
    const cssHeight = Math.max(1, canvas.clientHeight || number(canvas.style.height.replace('px', ''), Math.round(cssWidth * 0.74)));
    const renderWidth = Math.max(1, Math.round(cssWidth * state.quality.pixelRatio));
    const renderHeight = Math.max(1, Math.round(cssHeight * state.quality.pixelRatio));
    if (canvas.width !== renderWidth || canvas.height !== renderHeight) {
      state.renderer.setPixelRatio(1);
      state.renderer.setSize(renderWidth, renderHeight, false);
      state.camera.aspect = renderWidth / renderHeight;
      state.camera.updateProjectionMatrix();
    }
    if (state.hud.width !== renderWidth || state.hud.height !== renderHeight) {
      state.hud.width = renderWidth;
      state.hud.height = renderHeight;
    }
    state.hud.style.left = `${canvas.offsetLeft}px`;
    state.hud.style.top = `${canvas.offsetTop}px`;
    state.hud.style.width = `${cssWidth}px`;
    state.hud.style.height = `${cssHeight}px`;
  }

  function disposeObject(object) {
    if (!object || typeof object.traverse !== 'function') return;
    object.traverse((child) => {
      if (child.geometry && typeof child.geometry.dispose === 'function') child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : child.material ? [child.material] : [];
      materials.forEach((value) => {
        if (value.map && typeof value.map.dispose === 'function') value.map.dispose();
        if (typeof value.dispose === 'function') value.dispose();
      });
    });
  }

  function replaceWebGLCanvas(canvas) {
    if (!canvas || !canvas.parentElement) return null;
    const replacement = canvas.cloneNode(false);
    canvas.parentElement.replaceChild(replacement, canvas);
    return replacement;
  }

  function destroyScene() {
    if (state.canvas && state.canvas.parentElement) state.canvas.parentElement.classList.remove('rbs-3d-active');
    if (state.scene3D) disposeObject(state.scene3D);
    if (state.renderer && typeof state.renderer.dispose === 'function') state.renderer.dispose();
    if (state.hud && state.hud.parentElement) state.hud.parentElement.removeChild(state.hud);
    state.renderer = null;
    state.scene3D = null;
    state.camera = null;
    state.world = null;
    state.canvas = null;
    state.hud = null;
    state.hudContext = null;
    state.players.clear();
    state.officials = [];
    state.materials.clear();
    state.geometries = {};
    state.ball = null;
    state.ballShadow = null;
    state.indicator = null;
    state.rain = null;
    state.crowd = null;
    state.scoreboard = null;
    state.scoreboardKey = '';
    state.cameraPosition = null;
    state.cameraTarget = null;
  }

  function initialiseScene(canvas, match) {
    if (!root.THREE || !canvas || !match) return false;
    destroyScene();
    const THREE = root.THREE;
    const width = Math.max(320, canvas.clientWidth || 390);
    state.quality = qualityProfile(width, root.navigator && root.navigator.deviceMemory, root.devicePixelRatio || 1);
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: width >= 520,
      alpha: false,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.78;
    renderer.shadowMap.enabled = !!state.quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x6592be);
    scene.fog = new THREE.FogExp2(0x6a8aa7, 0.00225);
    const camera = new THREE.PerspectiveCamera(47, 1, 0.12, 360);
    camera.position.set(-10, 18, -52);
    const world = new THREE.Group();
    scene.add(world);
    state.renderer = renderer;
    state.scene3D = scene;
    state.camera = camera;
    state.world = world;
    state.canvas = canvas;
    state.match = match;
    state.frame = 0;
    state.lastFrameAt = performance.now();
    state.lastError = null;
    state.errorReported = false;
    canvas.setAttribute('role', 'img');
    canvas.setAttribute('aria-label', 'Live three-dimensional football match');
    canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault();
      state.lastError = new Error('The WebGL context was lost; Dugout switched to its 2D fallback.');
      state.disabled = true;
      const lostCanvas = canvas;
      setTimeout(() => {
        try { destroyScene(); } catch (error) { state.lastError = error; }
        replaceWebGLCanvas(lostCanvas);
      }, 0);
    }, { once: true });
    buildLighting(scene);
    const home = G.clubs[match.sides[0].ci];
    const away = G.clubs[match.sides[1].ci];
    buildPitch(world);
    buildStands(world, home, away);
    buildScoreboard(world, match);
    buildPlayers(world, match, home, away);
    buildBall(world);
    buildRain(world, match);
    createHud(canvas);
    syncCanvasSize();
    resetTimeline(match);
    return true;
  }

  function advanceLiveScene(match, now, dt) {
    if (!match.done && match.stage !== 'HT') {
      try { if (typeof advancePlay === 'function') advancePlay(now); } catch (error) { /* renderer remains read-only */ }
      try { if (typeof pitchTargets === 'function') pitchTargets(); } catch (error) { /* retain current shape */ }
    }
    try { if (typeof dugWatch === 'function') dugWatch(); } catch (error) { /* legacy pose extras */ }
    try { if (typeof subScan === 'function') subScan(); } catch (error) { /* visual extra */ }
    try { if (typeof subStep === 'function') subStep(); } catch (error) { /* visual extra */ }
    try { if (typeof sentOffScan === 'function') sentOffScan(); } catch (error) { /* visual extra */ }
    try { if (typeof sentOffStep === 'function') sentOffStep(); } catch (error) { /* visual extra */ }
    const play = typeof playState === 'function' ? playState() : null;
    (MU.dots || []).forEach((dot) => {
      const easing = dot.pl && dot.pl.off ? 0.045 : play && play.holder === dot.pl ? 0.18 : 0.068;
      const oldX = number(dot.x, FIELD_LENGTH / 2);
      const oldY = number(dot.y, FIELD_WIDTH / 2);
      dot.x += (number(dot.tx, dot.x) - dot.x) * easing;
      dot.y += (number(dot.ty, dot.y) - dot.y) * easing;
      dot.vx = number(dot.vx, 0) * 0.72 + (dot.x - oldX) * 0.28;
      dot.vy = number(dot.vy, 0) * 0.72 + (dot.y - oldY) * 0.28;
    });
    const movement = play && (play.mode === 'pass' || play.mode === 'carry') ? 1 : 0.20;
    MU.ball.x += (number(MU.ballT && MU.ballT.x, MU.ball.x) - MU.ball.x) * movement;
    MU.ball.y += (number(MU.ballT && MU.ballT.y, MU.ball.y) - MU.ball.y) * movement;
    MU.ball.x = limit(MU.ball.x, 0.4, FIELD_LENGTH - 0.4);
    MU.ball.y = limit(MU.ball.y, 0.8, FIELD_WIDTH - 0.8);
    ensurePlayerModels(match);
    const action = activeAction(now, match);
    (MU.dots || []).forEach((dot) => {
      if (!dot || !dot.pl || !dot.pl.p) return;
      const model = state.players.get(dot.pl.p.id);
      if (model) updatePlayer(model, dot, now, dt, action, match);
    });
    updateOfficials(now, dt, match);
    updateBall(now, action);
    updateCamera(dt, action, match);
    updateRain(now);
    return action;
  }

  function monitorPerformance(dt) {
    if (!state.quality || state.performance.adjusted || dt <= 0 || dt > 0.25) return;
    state.performance.samples += 1;
    state.performance.total += dt;
    if (state.performance.samples < 180) return;
    const fps = state.performance.samples / state.performance.total;
    if (fps < 28 && state.quality.pixelRatio > 1) {
      state.quality.pixelRatio = Math.max(1, state.quality.pixelRatio * 0.82);
      state.performance.adjusted = true;
      syncCanvasSize();
    }
  }

  function renderFrame() {
    const canvas = document.getElementById('dugCanvas');
    const match = MU && MU.m;
    if (!canvas || !match || !state.threeReady || state.disabled) return false;
    if (state.canvas !== canvas || state.match !== match || !state.renderer) initialiseScene(canvas, match);
    if (!state.renderer || !state.scene3D || !state.camera) return false;
    syncCanvasSize();
    if (canvas.parentElement) {
      const callouts = canvas.parentElement.querySelectorAll('.mcall-i');
      for (let index = 0; index < callouts.length - 1; index += 1) callouts[index].remove();
    }
    const now = performance.now();
    const dt = limit((now - state.lastFrameAt) / 1000, 0.001, 0.05);
    state.lastFrameAt = now;
    const action = advanceLiveScene(match, now, dt);
    if (state.crowd) state.crowd.rotation.y = Math.sin(now / 4800) * 0.0007;
    updateScoreboard(match);
    state.renderer.render(state.scene3D, state.camera);
    drawHud(match, action, state.hud.width, state.hud.height, now);
    state.frame += 1;
    monitorPerformance(dt);
    return true;
  }

  function loadThree() {
    if (root.THREE) {
      state.threeReady = true;
      return Promise.resolve(root.THREE);
    }
    if (state.loading) return state.loading;
    if (typeof document === 'undefined') return Promise.reject(new Error('No browser document.'));
    const timeout = (milliseconds) => new Promise((resolve, reject) => {
      setTimeout(() => reject(new Error('Three.js load timed out.')), milliseconds);
    });
    const load = (source) => new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[data-rbs-three="${source}"]`);
      if (existing) {
        if (root.THREE) resolve();
        else {
          existing.addEventListener('load', resolve, { once: true });
          existing.addEventListener('error', reject, { once: true });
        }
        return;
      }
      const script = document.createElement('script');
      script.src = source;
      script.async = true;
      script.dataset.rbsThree = source;
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Could not load ${source}.`));
      document.head.appendChild(script);
    });
    state.loading = Promise.race([load('vendor/three.min.js'), timeout(8000)])
      .then(() => {
        if (!root.THREE) throw new Error('Three.js loaded without a global THREE object.');
        state.threeReady = true;
        return root.THREE;
      })
      .catch((error) => {
        state.loading = false;
        state.disabled = true;
        state.lastError = error;
        return Promise.reject(error);
      });
    return state.loading;
  }

  function install() {
    if (typeof drawDugout !== 'function' || state.installed) return !!state.installed;
    if (typeof document !== 'undefined' && !document.getElementById('rbs-dugout-3d-style')) {
      const style = document.createElement('style');
      style.id = 'rbs-dugout-3d-style';
      style.textContent = '.rbs-3d-active .mcall{top:68px;align-items:flex-end}'
        + '.rbs-3d-active .mcall-i{max-width:68%;padding:5px 9px;font-size:10.5px;line-height:1.25;text-align:left}'
        + '.rbs-3d-active .mcall-i.goal{font-size:11.5px;letter-spacing:.8px}';
      document.head.appendChild(style);
    }
    installAnalyticsHooks();
    if (typeof ACTIONS === 'object' && ACTIONS && typeof ACTIONS.mtab === 'function' && !ACTIONS.mtab._rbs3dTabs) {
      const previousTab = ACTIONS.mtab;
      const wrappedTab = function switchMatchViewWithSelectedTab() {
        const result = previousTab.apply(this, arguments);
        try {
          document.querySelectorAll('.mtabs [data-action="mtab"]').forEach((button) => {
            button.classList.toggle('on', button.dataset.v === MU.tab);
          });
          const matchBody = document.getElementById('mBody');
          if (matchBody && MU.tab !== 'dugout') matchBody.classList.remove('rbs-3d-active');
        } catch (error) { /* tab styling never blocks the match */ }
        return result;
      };
      wrappedTab._rbs3dTabs = true;
      ACTIONS.mtab = wrappedTab;
    }
    const fallback = drawDugout;
    state.fallbackDraw = fallback;
    const webglAvailable = typeof root.WebGLRenderingContext !== 'undefined'
      || typeof root.WebGL2RenderingContext !== 'undefined';
    if (!webglAvailable) state.disabled = true;
    drawDugout = function drawThreeDimensionalDugout() {
      try {
        if (state.threeReady && !state.disabled) {
          if (renderFrame()) return;
        } else if (!state.loading && !state.disabled) {
          loadThree().catch(() => {});
        }
        if (!state.disabled) {
          const pendingCanvas = document.getElementById('dugCanvas');
          if (pendingCanvas) pendingCanvas.style.background = 'linear-gradient(180deg,#4979a2 0%,#163d26 100%)';
          return;
        }
      } catch (error) {
        state.lastError = error;
        if (!state.errorReported) {
          state.errorReported = true;
          if (root.console && typeof root.console.error === 'function') root.console.error('3D Dugout fallback', error);
        }
        const failedCanvas = state.canvas || document.getElementById('dugCanvas');
        destroyScene();
        replaceWebGLCanvas(failedCanvas);
        state.disabled = true;
      }
      return fallback.apply(this, arguments);
    };
    state.installed = true;
    if (!state.disabled) loadThree().catch(() => {});
    return true;
  }

  const api = {
    ACTION_LABEL,
    analyticsDelta,
    cameraSpec,
    classifyEvent,
    compactAnalytics,
    install,
    installed: false,
    qualityProfile,
    renderFrame,
    speedBudget,
    state,
  };

  if (root) root.RBSDugout3D = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  api.installed = install();
}(typeof window !== 'undefined' ? window : globalThis));
