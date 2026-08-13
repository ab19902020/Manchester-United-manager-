/* global MatchSim, MU, G, drawDugout:writable, advancePlay, pitchTargets, playState,
          dotOf, surname, shirtNo, dugPose, dugWatch, subScan, subStep, sentOffScan,
          sentOffStep, dugSubBoard, DUG, kitPattern */
(function initDugoutRenderer(root) {
  'use strict';

  const FIELD_LENGTH = 105;
  const FIELD_WIDTH = 68;
  const GOAL_WIDTH = 7.32;
  const GOAL_HEIGHT = 2.44;
  const GOAL_DEPTH = 2.35;
  const CAMERA_HEIGHT = 18;
  const CAMERA_BACK = 34;

  const scene = {
    match: null,
    camera: null,
    crowd: null,
    crowdKey: '',
    event: null,
    eventSequence: 0,
    stats: new Map(),
    trail: [],
    officials: null,
    frame: 0,
    lastError: null,
    errorReported: false,
  };

  function limit(value, low, high) {
    return Math.max(low, Math.min(high, value));
  }

  function mix(from, to, amount) {
    return from + (to - from) * amount;
  }

  function easeOut(value) {
    const n = limit(value, 0, 1);
    return 1 - ((1 - n) ** 3);
  }

  function parseHex(value) {
    const text = String(value || '').trim();
    const short = /^#([0-9a-f]{3})$/i.exec(text);
    if (short) return short[1].split('').map((part) => parseInt(part + part, 16));
    const full = /^#([0-9a-f]{6})$/i.exec(text);
    if (full) {
      const number = parseInt(full[1], 16);
      return [(number >> 16) & 255, (number >> 8) & 255, number & 255];
    }
    return [92, 96, 100];
  }

  function rgb(rgbValue) {
    return `rgb(${rgbValue.map((part) => Math.round(limit(part, 0, 255))).join(',')})`;
  }

  function shade(value, factor) {
    return rgb(parseHex(value).map((part) => part * factor));
  }

  function luminance(value) {
    const [r, g, b] = parseHex(value).map((part) => part / 255);
    const channel = (part) => (part <= 0.03928 ? part / 12.92 : ((part + 0.055) / 1.055) ** 2.4);
    return channel(r) * 0.2126 + channel(g) * 0.7152 + channel(b) * 0.0722;
  }

  function colourDistance(left, right) {
    const a = parseHex(left);
    const b = parseHex(right);
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  }

  function inkFor(value) {
    return luminance(value) > 0.42 ? '#101416' : '#f7faf7';
  }

  function resolveKits(home, away) {
    const homePrimary = (home && home.c1) || '#c8102e';
    const homeTrim = (home && home.c2) || '#ffffff';
    let awayPrimary = (away && away.c1) || '#2864b4';
    let awayTrim = (away && away.c2) || '#ffffff';
    if (colourDistance(homePrimary, awayPrimary) < 92) {
      const candidate = awayTrim;
      if (colourDistance(homePrimary, candidate) >= 92) {
        awayPrimary = candidate;
        awayTrim = (away && away.c1) || inkFor(candidate);
      } else {
        awayPrimary = luminance(homePrimary) > 0.34 ? '#151a22' : '#f1f3ee';
        awayTrim = inkFor(awayPrimary);
      }
    }
    return [
      { primary: homePrimary, trim: homeTrim, goalkeeper: '#f4cb23', goalkeeperTrim: '#161b21' },
      { primary: awayPrimary, trim: awayTrim, goalkeeper: '#38bdf8', goalkeeperTrim: '#071c2a' },
    ];
  }

  function classifyEvent(text, className) {
    const line = String(text || '');
    const kind = String(className || '');
    if (kind === 'goal' || /\bgoal\b|buries it|rifles it|slots it home|sends the keeper/i.test(line)) return 'goal';
    if (/\b(saved?|save|parries|parried|tips? it|palms?|blocks? from|equal to it)\b/i.test(line)) return 'save';
    if (/red card|sent off|second yellow/i.test(line)) return 'red';
    if (/yellow card|into the book|booked/i.test(line)) return 'yellow';
    if (/penalty/i.test(line)) return 'penalty';
    if (/corner/i.test(line)) return 'corner';
    if (/scythed|clips? the heels|foul|free kick|brought down|trip|clatter/i.test(line)) return 'foul';
    if (/intercept|cuts? out|reads it|wins? it back|turnover|pounces/i.test(line)) return 'interception';
    if (/tackle|slides? in|stands his man up|smothers the danger|vital toe/i.test(line)) return 'tackle';
    if (/dribbl|dances? past|beats? (?:his|a) man|solo run|to the byline/i.test(line)) return 'dribble';
    if (/shoot|shot|drive|header|wide|over the bar|off target|woodwork/i.test(line)) return 'shot';
    if (/through ball|slips? it through|disguised ball|cross(?:es)?|switch(?:es)? the play|one-two|\bpass(?:es|ed|ing)?\b/i.test(line)) return 'pass';
    if (/injur|physio|pulls? up|is down/i.test(line)) return 'injury';
    return kind === 'big' ? 'moment' : null;
  }

  const EVENT_PRIORITY = {
    goal: 10,
    red: 9,
    penalty: 8,
    save: 7,
    shot: 6,
    yellow: 5,
    foul: 5,
    tackle: 4,
    interception: 4,
    dribble: 3,
    corner: 3,
    pass: 2,
    injury: 2,
    moment: 1,
  };

  const EVENT_TITLE = {
    goal: 'GOAL',
    save: 'SAVE',
    shot: 'CHANCE',
    tackle: 'TACKLE WON',
    interception: 'INTERCEPTION',
    dribble: 'DRIBBLE',
    pass: 'PASSING MOVE',
    foul: 'FOUL',
    yellow: 'YELLOW CARD',
    red: 'RED CARD',
    penalty: 'PENALTY',
    corner: 'CORNER',
    injury: 'STOPPAGE',
    moment: 'BIG MOMENT',
  };

  function cameraTarget(width, height, state) {
    const requestedX = Number(state.ballX);
    const requestedY = Number(state.ballY);
    const ballX = limit(Number.isFinite(requestedX) ? requestedX : FIELD_LENGTH / 2, 0, FIELD_LENGTH);
    const ballY = limit(Number.isFinite(requestedY) ? requestedY : FIELD_WIDTH / 2, 0, FIELD_WIDTH);
    const velocity = Math.max(0, Number(state.velocity) || 0);
    const nearGoal = Math.min(ballX, FIELD_LENGTH - ballX);
    let zoom = nearGoal < 17 ? 1.82 : nearGoal < 29 ? 1.70 : 1.60;
    if (velocity > 17) zoom -= 0.28;
    else if (velocity > 9) zoom -= 0.14;
    if (state.done || state.halfTime) zoom = 1.22;
    if (state.reducedMotion) zoom = Math.min(zoom, 1.52);
    const lead = limit(Number(state.leadX) || 0, -8, 8);
    const x = limit(ballX + lead * 0.18, 15, 90);
    const y = limit(ballY, 8, 60);
    const focal = height * 1.36 * zoom;
    const focusLine = height * (state.done || state.halfTime ? 0.61 : 0.64);
    const horizon = focusLine - (CAMERA_HEIGHT * focal) / (y + CAMERA_BACK);
    return { width, height, x, y, zoom, focal, horizon, cameraHeight: CAMERA_HEIGHT, back: CAMERA_BACK };
  }

  function projectPoint(camera, worldX, worldY, worldHeight) {
    const depth = Math.max(4, Number(worldY) + camera.back);
    const scale = camera.focal / depth;
    return {
      x: camera.width / 2 + (Number(worldX) - camera.x) * scale,
      y: camera.horizon + (camera.cameraHeight - (Number(worldHeight) || 0)) * scale,
      scale,
    };
  }

  function currentCamera(width, height, match) {
    const ball = MU.ball || { x: 52.5, y: 34 };
    const targetBall = MU.ballT || ball;
    const play = typeof playState === 'function' ? playState() : {};
    const target = cameraTarget(width, height, {
      ballX: ball.x,
      ballY: ball.y,
      velocity: Math.hypot((targetBall.x || ball.x) - ball.x, (targetBall.y || ball.y) - ball.y),
      leadX: play.to ? play.to.x - ball.x : 0,
      done: match.done,
      halfTime: match.stage === 'HT',
      reducedMotion: !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches),
    });
    if (!scene.camera) scene.camera = { x: target.x, y: target.y, zoom: target.zoom };
    scene.camera.x = mix(scene.camera.x, target.x, 0.065);
    scene.camera.y = mix(scene.camera.y, target.y, 0.045);
    scene.camera.zoom = mix(scene.camera.zoom, target.zoom, 0.035);
    return cameraTarget(width, height, {
      ballX: scene.camera.x,
      ballY: scene.camera.y,
      velocity: 0,
      done: match.done,
      halfTime: match.stage === 'HT',
    });
  }

  /* cameraTarget computes focal from zoom. This finaliser keeps the smoothed
     focal/horizon instead of snapping those two values back to the target. */
  function smoothedCamera(width, height, match) {
    const target = currentCamera(width, height, match);
    const focal = height * 1.36 * scene.camera.zoom;
    const focusLine = height * (match.done || match.stage === 'HT' ? 0.61 : 0.64);
    return {
      ...target,
      x: scene.camera.x,
      y: scene.camera.y,
      zoom: scene.camera.zoom,
      focal,
      horizon: focusLine - (CAMERA_HEIGHT * focal) / (scene.camera.y + CAMERA_BACK),
    };
  }

  function pathRoundRect(context, x, y, width, height, radius) {
    const r = Math.min(Math.abs(width) / 2, Math.abs(height) / 2, Math.max(0, radius));
    context.beginPath();
    if (typeof context.roundRect === 'function') {
      context.roundRect(x, y, width, height, r);
      return;
    }
    context.moveTo(x + r, y);
    context.lineTo(x + width - r, y);
    context.quadraticCurveTo(x + width, y, x + width, y + r);
    context.lineTo(x + width, y + height - r);
    context.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
    context.lineTo(x + r, y + height);
    context.quadraticCurveTo(x, y + height, x, y + height - r);
    context.lineTo(x, y + r);
    context.quadraticCurveTo(x, y, x + r, y);
    context.closePath();
  }

  function fillQuad(context, a, b, c, d, colour) {
    context.beginPath();
    context.moveTo(a.x, a.y);
    context.lineTo(b.x, b.y);
    context.lineTo(c.x, c.y);
    context.lineTo(d.x, d.y);
    context.closePath();
    if (colour) context.fillStyle = colour;
    context.fill();
  }

  function lineWorld(context, camera, points, colour, width) {
    context.beginPath();
    points.forEach((point, index) => {
      const projected = projectPoint(camera, point[0], point[1], point[2] || 0);
      if (index) context.lineTo(projected.x, projected.y);
      else context.moveTo(projected.x, projected.y);
    });
    context.strokeStyle = colour;
    context.lineWidth = width;
    context.stroke();
  }

  function arcWorld(context, camera, cx, cy, radius, start, end, colour, width) {
    const points = [];
    for (let index = 0; index <= 52; index += 1) {
      const angle = start + ((end - start) * index) / 52;
      points.push([cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius]);
    }
    lineWorld(context, camera, points, colour, width);
  }

  function seedFrom(text) {
    let value = 2166136261;
    const source = String(text || 'dugout');
    for (let index = 0; index < source.length; index += 1) {
      value ^= source.charCodeAt(index);
      value = Math.imul(value, 16777619);
    }
    return value >>> 0;
  }

  function seeded(seed) {
    let value = seed >>> 0;
    return function next() {
      value += 0x6d2b79f5;
      let result = value;
      result = Math.imul(result ^ (result >>> 15), result | 1);
      result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
      return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
    };
  }

  function crowdTexture(width, home, away) {
    const key = `${Math.round(width / 100)}|${home.key || home.name}|${away.key || away.name}`;
    if (scene.crowd && scene.crowdKey === key) return scene.crowd;
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(420, Math.round(width * 1.7));
    canvas.height = Math.max(150, Math.round(width * 0.34));
    const context = canvas.getContext('2d');
    const random = seeded(seedFrom(key));
    const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#121923');
    gradient.addColorStop(1, '#242d36');
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const colours = [home.c1, home.c2 || '#e7ecef', away.c1, '#aeb5bc', '#6f7780', '#d8b79b'];
    const dot = Math.max(2, canvas.width / 520);
    for (let index = 0; index < 2100; index += 1) {
      const x = random() * canvas.width;
      const y = random() * canvas.height;
      const tierShade = 0.45 + (y / canvas.height) * 0.55;
      context.globalAlpha = (0.35 + random() * 0.60) * tierShade;
      context.fillStyle = colours[Math.floor(random() * colours.length)];
      context.fillRect(x, y, dot, dot * (1.05 + random() * 0.55));
    }
    context.globalAlpha = 1;
    for (let tier = 1; tier <= 3; tier += 1) {
      const y = (canvas.height * tier) / 4;
      context.fillStyle = 'rgba(0,0,0,.42)';
      context.fillRect(0, y, canvas.width, Math.max(4, canvas.height * 0.025));
      context.fillStyle = 'rgba(255,255,255,.05)';
      context.fillRect(0, y, canvas.width, 1);
    }
    scene.crowd = canvas;
    scene.crowdKey = key;
    return canvas;
  }

  function drawStadium(context, camera, home, away) {
    const { width, height } = camera;
    let gradient = context.createLinearGradient(0, 0, 0, height * 0.52);
    gradient.addColorStop(0, '#02050a');
    gradient.addColorStop(0.55, '#07111d');
    gradient.addColorStop(1, '#142331');
    context.fillStyle = gradient;
    context.fillRect(0, 0, width, height);

    const farLeft = projectPoint(camera, 0, FIELD_WIDTH, 0);
    const farRight = projectPoint(camera, FIELD_LENGTH, FIELD_WIDTH, 0);
    const farY = Math.max(height * 0.20, Math.min(farLeft.y, farRight.y));
    const roofY = Math.max(height * 0.035, farY - height * 0.30);
    context.fillStyle = '#070b11';
    context.fillRect(0, roofY, width, height * 0.055);
    context.fillStyle = 'rgba(223,235,248,.10)';
    context.fillRect(0, roofY + height * 0.052, width, 2);

    const texture = crowdTexture(width, home, away);
    context.save();
    context.globalAlpha = 0.86;
    context.drawImage(texture, -width * 0.08, roofY + height * 0.055, width * 1.16,
      Math.max(20, farY - roofY - height * 0.055));
    context.restore();

    [0.06, 0.34, 0.66, 0.94].forEach((position) => {
      const x = width * position;
      const y = roofY - height * 0.015;
      const glow = context.createRadialGradient(x, y, 0, x, y, width * 0.22);
      glow.addColorStop(0, 'rgba(255,250,225,.45)');
      glow.addColorStop(0.16, 'rgba(212,232,255,.13)');
      glow.addColorStop(1, 'rgba(212,232,255,0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, width, Math.max(farY, height * 0.40));
      context.fillStyle = '#dce8f4';
      for (let row = 0; row < 2; row += 1) {
        for (let column = 0; column < 5; column += 1) {
          context.fillRect(x - width * 0.018 + column * width * 0.008,
            y + row * height * 0.009, width * 0.006, height * 0.006);
        }
      }
    });

    const boardTop = farY - height * 0.037;
    const sponsors = [home.short, 'THE RESULTS BUSINESS', away.short, 'MATCHDAY', 'FOOTBALL'];
    for (let index = 0; index < 10; index += 1) {
      const x = (index * width) / 10;
      context.fillStyle = index % 3 === 0 ? home.c1 : index % 3 === 2 ? away.c1 : '#101820';
      context.fillRect(x, boardTop, width / 10 - 1, height * 0.038);
      context.fillStyle = '#f5f7f4';
      context.globalAlpha = 0.88;
      context.font = `800 ${Math.max(7, Math.round(height * 0.013))}px Inter, sans-serif`;
      context.textAlign = 'center';
      context.fillText(String(sponsors[index % sponsors.length] || '').toUpperCase(),
        x + width / 20, boardTop + height * 0.026);
    }
    context.globalAlpha = 1;
  }

  function drawPitch(context, camera) {
    const { width, height } = camera;
    const corners = [
      projectPoint(camera, 0, FIELD_WIDTH, 0),
      projectPoint(camera, FIELD_LENGTH, FIELD_WIDTH, 0),
      projectPoint(camera, FIELD_LENGTH, 0, 0),
      projectPoint(camera, 0, 0, 0),
    ];
    const gradient = context.createLinearGradient(0, corners[0].y, 0, height);
    gradient.addColorStop(0, '#17622d');
    gradient.addColorStop(0.50, '#23783a');
    gradient.addColorStop(1, '#155c2b');
    fillQuad(context, corners[0], corners[1], corners[2], corners[3], gradient);

    context.save();
    context.beginPath();
    context.moveTo(corners[0].x, corners[0].y);
    corners.slice(1).forEach((corner) => context.lineTo(corner.x, corner.y));
    context.closePath();
    context.clip();
    for (let x = 0; x < FIELD_LENGTH; x += 10.5) {
      const index = Math.floor(x / 10.5);
      const colour = index % 2 ? 'rgba(255,255,255,.038)' : 'rgba(0,24,6,.045)';
      fillQuad(context,
        projectPoint(camera, x, FIELD_WIDTH, 0),
        projectPoint(camera, Math.min(FIELD_LENGTH, x + 10.5), FIELD_WIDTH, 0),
        projectPoint(camera, Math.min(FIELD_LENGTH, x + 10.5), 0, 0),
        projectPoint(camera, x, 0, 0), colour);
    }
    for (let y = 0; y < FIELD_WIDTH; y += 8.5) {
      if (Math.floor(y / 8.5) % 2 === 0) continue;
      fillQuad(context,
        projectPoint(camera, 0, y + 8.5, 0),
        projectPoint(camera, FIELD_LENGTH, y + 8.5, 0),
        projectPoint(camera, FIELD_LENGTH, y, 0),
        projectPoint(camera, 0, y, 0), 'rgba(255,255,255,.018)');
    }
    const light = context.createRadialGradient(width * 0.50, height * 0.56, 0,
      width * 0.50, height * 0.56, width * 0.72);
    light.addColorStop(0, 'rgba(255,250,218,.075)');
    light.addColorStop(1, 'rgba(255,250,218,0)');
    context.fillStyle = light;
    context.fillRect(0, 0, width, height);
    context.restore();

    const chalk = 'rgba(248,252,246,.88)';
    const lineWidth = Math.max(1.2, width * 0.0018);
    lineWorld(context, camera, [[0, 0], [105, 0], [105, 68], [0, 68], [0, 0]], chalk, lineWidth);
    lineWorld(context, camera, [[52.5, 0], [52.5, 68]], chalk, lineWidth);
    arcWorld(context, camera, 52.5, 34, 9.15, 0, Math.PI * 2, chalk, lineWidth);
    [[0, 16.5], [105, 88.5]].forEach(([goalX, boxX]) => {
      lineWorld(context, camera, [[goalX, 13.85], [boxX, 13.85], [boxX, 54.15], [goalX, 54.15]], chalk, lineWidth);
      const sixX = goalX === 0 ? 5.5 : 99.5;
      lineWorld(context, camera, [[goalX, 24.85], [sixX, 24.85], [sixX, 43.15], [goalX, 43.15]], chalk, lineWidth);
      const penaltyX = goalX === 0 ? 11 : 94;
      const spot = projectPoint(camera, penaltyX, 34, 0);
      context.fillStyle = chalk;
      context.beginPath();
      context.arc(spot.x, spot.y, Math.max(1.2, spot.scale * 0.09), 0, Math.PI * 2);
      context.fill();
      arcWorld(context, camera, penaltyX, 34, 9.15,
        goalX === 0 ? -0.93 : Math.PI - 0.93,
        goalX === 0 ? 0.93 : Math.PI + 0.93, chalk, lineWidth);
    });
    const centre = projectPoint(camera, 52.5, 34, 0);
    context.fillStyle = chalk;
    context.beginPath();
    context.arc(centre.x, centre.y, Math.max(1.2, centre.scale * 0.09), 0, Math.PI * 2);
    context.fill();

    [[5.5, 34], [99.5, 34]].forEach(([x, y]) => {
      const point = projectPoint(camera, x, y, 0);
      const radius = Math.max(8, point.scale * 7.5);
      const wear = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, radius);
      wear.addColorStop(0, 'rgba(132,96,48,.12)');
      wear.addColorStop(1, 'rgba(132,96,48,0)');
      context.fillStyle = wear;
      context.fillRect(point.x - radius, point.y - radius / 2, radius * 2, radius);
    });
  }

  function goalGeometry(camera, goalX) {
    const direction = goalX === 0 ? -1 : 1;
    const nearY = (FIELD_WIDTH - GOAL_WIDTH) / 2;
    const farY = nearY + GOAL_WIDTH;
    const backX = goalX + direction * GOAL_DEPTH;
    return {
      frontBottomA: projectPoint(camera, goalX, nearY, 0),
      frontBottomB: projectPoint(camera, goalX, farY, 0),
      frontTopA: projectPoint(camera, goalX, nearY, GOAL_HEIGHT),
      frontTopB: projectPoint(camera, goalX, farY, GOAL_HEIGHT),
      backBottomA: projectPoint(camera, backX, nearY, 0),
      backBottomB: projectPoint(camera, backX, farY, 0),
      backTopA: projectPoint(camera, backX, nearY, GOAL_HEIGHT * 0.92),
      backTopB: projectPoint(camera, backX, farY, GOAL_HEIGHT * 0.92),
      goalX,
      backX,
      nearY,
      farY,
    };
  }

  function drawGoalNet(context, camera, geometry) {
    const net = 'rgba(241,247,244,.25)';
    context.save();
    context.fillStyle = 'rgba(236,244,242,.055)';
    fillQuad(context, geometry.frontTopA, geometry.frontTopB, geometry.backTopB, geometry.backTopA);
    fillQuad(context, geometry.backTopA, geometry.backTopB, geometry.backBottomB, geometry.backBottomA);
    context.strokeStyle = net;
    context.lineWidth = Math.max(0.7, camera.width * 0.00075);
    for (let index = 0; index <= 8; index += 1) {
      const y = mix(geometry.nearY, geometry.farY, index / 8);
      lineWorld(context, camera, [[geometry.goalX, y, GOAL_HEIGHT], [geometry.backX, y, GOAL_HEIGHT * 0.92], [geometry.backX, y, 0]], net, context.lineWidth);
    }
    for (let index = 1; index <= 5; index += 1) {
      const h = (GOAL_HEIGHT * index) / 6;
      lineWorld(context, camera, [[geometry.goalX, geometry.nearY, h], [geometry.goalX, geometry.farY, h]], net, context.lineWidth);
      lineWorld(context, camera, [[geometry.backX, geometry.nearY, h * 0.92], [geometry.backX, geometry.farY, h * 0.92]], net, context.lineWidth);
    }
    context.restore();
  }

  function drawGoalFrame(context, camera, geometry) {
    const postWidth = Math.max(2.2, geometry.frontBottomA.scale * 0.105);
    const white = '#f8faf8';
    lineWorld(context, camera, [
      [geometry.goalX, geometry.nearY, 0],
      [geometry.goalX, geometry.nearY, GOAL_HEIGHT],
      [geometry.goalX, geometry.farY, GOAL_HEIGHT],
      [geometry.goalX, geometry.farY, 0],
    ], white, postWidth);
    lineWorld(context, camera, [[geometry.backX, geometry.nearY, 0], [geometry.backX, geometry.nearY, GOAL_HEIGHT * 0.92]],
      'rgba(238,244,242,.55)', Math.max(1.2, postWidth * 0.56));
    lineWorld(context, camera, [[geometry.backX, geometry.farY, 0], [geometry.backX, geometry.farY, GOAL_HEIGHT * 0.92]],
      'rgba(238,244,242,.55)', Math.max(1.2, postWidth * 0.56));
  }

  function roundedLine(context, fromX, fromY, toX, toY, width, colour) {
    context.beginPath();
    context.moveTo(fromX, fromY);
    context.lineTo(toX, toY);
    context.lineWidth = width;
    context.lineCap = 'round';
    context.strokeStyle = colour;
    context.stroke();
  }

  function patternForClub(club) {
    try {
      if (typeof kitPattern === 'function') return kitPattern(club);
    } catch (error) { /* use deterministic fallback */ }
    const value = seedFrom((club && (club.key || club.name)) || 'club') % 8;
    return value === 0 ? 'stripe' : value === 1 ? 'hoop' : value === 2 ? 'sash' : 'plain';
  }

  function playerBodyMetrics(player, projectedScale) {
    const heightM = limit(Number(player && player.p && player.p.heightCm) / 100 || 1.82, 1.66, 2.03);
    const weight = Number(player && player.p && player.p.weightKg);
    const bmi = weight > 0 ? weight / (heightM ** 2) : 22.4;
    return {
      height: projectedScale * heightM,
      width: limit(0.92 + (bmi - 22) * 0.035, 0.82, 1.18),
    };
  }

  function fallbackPose(speed, phase) {
    const swing = Math.sin(phase) * limit(speed * 10 + 0.20, 0.20, 1);
    return { legA: swing * 0.52, legB: -swing * 0.52, armA: -swing * 0.66, armB: swing * 0.66, rot: 0, lift: 0, bob: 0, down: 0 };
  }

  function playerPose(dot, speed, now) {
    const swing = Math.sin(now / 115 + dot.pl.p.id) * limit(speed * 9 + 0.18, 0.18, 1);
    const bob = Math.abs(Math.cos(now / 115 + dot.pl.p.id)) * Math.min(1, speed * 7);
    try {
      if (typeof dugPose === 'function') return dugPose(dot.pl.p.id, speed, swing, bob, (dot.vx || 0) >= 0 ? 1 : -1);
    } catch (error) { /* fall through */ }
    return fallbackPose(speed, now / 115 + dot.pl.p.id);
  }

  function drawPlayer(context, camera, dot, club, kit, now) {
    if (!dot || !dot.pl || !dot.pl.p || dot._gone) return;
    const point = projectPoint(camera, dot.x, dot.y, 0);
    const metrics = playerBodyMetrics(dot.pl, point.scale);
    if (metrics.height < 10 || point.x < -metrics.height || point.x > camera.width + metrics.height) return;
    const height = metrics.height;
    const unit = height / 8.15;
    const speed = Math.hypot(dot.vx || 0, dot.vy || 0);
    const pose = playerPose(dot, speed, now);
    const goalkeeper = dot.pl.slot === 'GK';
    const primary = goalkeeper ? kit.goalkeeper : kit.primary;
    const trim = goalkeeper ? kit.goalkeeperTrim : kit.trim;
    const skinPalette = ['#f0c4a0', '#dba57d', '#bd825a', '#955f3d', '#704329', '#4c2d1e'];
    const hairPalette = ['#181310', '#2b1c13', '#4b3320', '#72502b', '#0e1011'];
    const identity = Math.abs(Number(dot.pl.p.id) || 0);
    const skin = skinPalette[identity % skinPalette.length];
    const hair = hairPalette[Math.floor(identity / 3) % hairPalette.length];
    const lift = (pose.lift || 0) * unit;
    const groundY = point.y - lift;
    const lean = (pose.rot || 0) * unit * 2.8 + limit((dot.vx || 0) * 1.7, -unit * 0.65, unit * 0.65);
    const hipY = groundY - unit * (3.35 - (pose.down || 0) * 0.7);
    const shoulderY = groundY - unit * (6.0 - (pose.down || 0) * 0.72);
    const bodyX = point.x + lean;
    const widthFactor = metrics.width;
    const alpha = dot.pl.off && !dot._sbOff ? 0.42 : 1;

    context.save();
    context.globalAlpha *= alpha;
    const shadow = context.createRadialGradient(point.x, point.y, 0, point.x, point.y, unit * 2.2);
    shadow.addColorStop(0, 'rgba(0,0,0,.46)');
    shadow.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = shadow;
    context.beginPath();
    context.ellipse(point.x, point.y + unit * 0.08, unit * 2.15, unit * 0.66, 0, 0, Math.PI * 2);
    context.fill();

    if (scene.event && scene.event.primary === dot.pl && scene.event.until > now) {
      const glow = 0.55 + Math.sin(now / 105) * 0.18;
      context.strokeStyle = `rgba(251,225,34,${glow})`;
      context.lineWidth = Math.max(1.2, unit * 0.18);
      context.beginPath();
      context.ellipse(point.x, point.y, unit * 1.8, unit * 0.60, 0, 0, Math.PI * 2);
      context.stroke();
    }

    const legData = [
      { side: -1, angle: pose.legA || 0 },
      { side: 1, angle: pose.legB || 0 },
    ];
    legData.forEach(({ side, angle }) => {
      const hipX = bodyX + side * unit * 0.42 * widthFactor;
      const kneeX = hipX + Math.sin(angle) * unit * 1.25;
      const kneeY = hipY + Math.cos(angle) * unit * 1.35;
      const lowerAngle = -angle * 0.56 + limit(speed * 1.2, 0, 0.35) * -Math.sign(angle || side);
      const ankleX = kneeX + Math.sin(lowerAngle) * unit * 1.38;
      const ankleY = kneeY + Math.cos(lowerAngle) * unit * 1.43;
      roundedLine(context, hipX, hipY, kneeX, kneeY, unit * 0.78, shade(trim, 0.82));
      roundedLine(context, kneeX, kneeY, ankleX, ankleY, unit * 0.58, '#eef2ec');
      roundedLine(context, ankleX - unit * 0.03, ankleY, ankleX + side * unit * 0.78, ankleY + unit * 0.10,
        unit * 0.36, '#101419');
    });

    const torsoPath = () => {
      context.beginPath();
      context.moveTo(bodyX - unit * 1.03 * widthFactor, shoulderY + unit * 0.34);
      context.quadraticCurveTo(bodyX, shoulderY - unit * 0.18,
        bodyX + unit * 1.03 * widthFactor, shoulderY + unit * 0.34);
      context.lineTo(bodyX + unit * 0.72 * widthFactor, hipY + unit * 0.13);
      context.lineTo(bodyX - unit * 0.72 * widthFactor, hipY + unit * 0.13);
      context.closePath();
    };
    torsoPath();
    const jersey = context.createLinearGradient(bodyX - unit, shoulderY, bodyX + unit, hipY);
    jersey.addColorStop(0, shade(primary, 1.18));
    jersey.addColorStop(0.54, primary);
    jersey.addColorStop(1, shade(primary, 0.64));
    context.fillStyle = jersey;
    context.fill();

    const pattern = goalkeeper ? 'plain' : patternForClub(club);
    if (pattern !== 'plain' && colourDistance(primary, trim) > 40) {
      context.save();
      torsoPath();
      context.clip();
      context.fillStyle = trim;
      context.globalAlpha *= 0.72;
      if (pattern === 'stripe') {
        for (let index = -2; index <= 2; index += 2) {
          context.fillRect(bodyX + index * unit * 0.38, shoulderY - unit, unit * 0.32, unit * 4);
        }
      } else if (pattern === 'hoop') {
        for (let index = 0; index < 3; index += 1) {
          context.fillRect(bodyX - unit * 1.3, shoulderY + unit * (0.45 + index * 0.82), unit * 2.6, unit * 0.34);
        }
      } else {
        context.beginPath();
        context.moveTo(bodyX - unit * 1.2, shoulderY);
        context.lineTo(bodyX - unit * 0.72, shoulderY);
        context.lineTo(bodyX + unit * 1.1, hipY);
        context.lineTo(bodyX + unit * 0.60, hipY);
        context.closePath();
        context.fill();
      }
      context.restore();
    }

    context.fillStyle = shade(trim, 0.82);
    pathRoundRect(context, bodyX - unit * 0.80 * widthFactor, hipY - unit * 0.12,
      unit * 1.60 * widthFactor, unit * 0.83, unit * 0.18);
    context.fill();

    const arms = [
      { side: -1, angle: pose.armA || 0 },
      { side: 1, angle: pose.armB || 0 },
    ];
    arms.forEach(({ side, angle }) => {
      const shoulderX = bodyX + side * unit * 0.88 * widthFactor;
      const upperLength = unit * 1.22;
      const elbowX = shoulderX + Math.sin(angle) * upperLength;
      const elbowY = shoulderY + unit * 0.55 + Math.cos(angle) * upperLength;
      const bend = angle * 0.52 - side * 0.12;
      const handX = elbowX + Math.sin(bend) * unit * 1.02;
      const handY = elbowY + Math.cos(bend) * unit * 1.02;
      roundedLine(context, shoulderX, shoulderY + unit * 0.52, elbowX, elbowY, unit * 0.58, primary);
      roundedLine(context, elbowX, elbowY, handX, handY, unit * 0.43, skin);
      context.fillStyle = goalkeeper ? '#eff6ff' : skin;
      context.beginPath();
      context.arc(handX, handY, unit * (goalkeeper ? 0.31 : 0.22), 0, Math.PI * 2);
      context.fill();
    });

    context.fillStyle = shade(skin, 0.88);
    pathRoundRect(context, bodyX - unit * 0.20, shoulderY - unit * 0.34, unit * 0.40, unit * 0.54, unit * 0.14);
    context.fill();
    const headY = shoulderY - unit * 0.92;
    const headRadius = unit * 0.68;
    const faceGradient = context.createRadialGradient(bodyX - headRadius * 0.30, headY - headRadius * 0.35,
      headRadius * 0.08, bodyX, headY, headRadius);
    faceGradient.addColorStop(0, shade(skin, 1.12));
    faceGradient.addColorStop(1, shade(skin, 0.82));
    context.fillStyle = faceGradient;
    context.beginPath();
    context.ellipse(bodyX, headY, headRadius * 0.88, headRadius, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = hair;
    context.beginPath();
    context.arc(bodyX, headY - headRadius * 0.22, headRadius * 0.91, Math.PI * 1.02, Math.PI * 2.02);
    context.fill();

    const looking = Math.abs(dot.vx || 0) < 0.004 ? (dot.si === 0 ? 1 : -1) : Math.sign(dot.vx);
    const movingAway = (dot.vy || 0) > 0.0015;
    if (!movingAway && height > 24) {
      context.fillStyle = 'rgba(25,20,17,.72)';
      context.beginPath();
      context.arc(bodyX + looking * headRadius * 0.31, headY - headRadius * 0.04, Math.max(0.7, unit * 0.07), 0, Math.PI * 2);
      context.fill();
    } else if (height > 30) {
      let number = '';
      try { number = shirtNo(dot.pl.p, club) || ''; } catch (error) { number = ''; }
      if (number) {
        context.font = `900 ${Math.max(8, Math.round(unit * 1.28))}px Inter, sans-serif`;
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillStyle = inkFor(primary);
        context.globalAlpha *= 0.88;
        context.fillText(String(number), bodyX, shoulderY + unit * 1.42);
      }
    }
    context.restore();
  }

  function drawOfficial(context, camera, official, now, assistant) {
    const point = projectPoint(camera, official.x, official.y, 0);
    const height = point.scale * 1.78;
    if (height < 9 || point.x < -height || point.x > camera.width + height) return;
    const unit = height / 8;
    const phase = Math.sin(now / 135 + official.phase);
    const hip = point.y - unit * 3.25;
    const shoulder = point.y - unit * 5.75;
    context.save();
    context.fillStyle = 'rgba(0,0,0,.38)';
    context.beginPath();
    context.ellipse(point.x, point.y, unit * 1.45, unit * 0.52, 0, 0, Math.PI * 2);
    context.fill();
    [-1, 1].forEach((side) => {
      roundedLine(context, point.x + side * unit * 0.34, hip,
        point.x + side * unit * 0.34 + phase * side * unit * 0.50, point.y - unit * 0.22,
        unit * 0.54, '#101419');
    });
    const shirt = context.createLinearGradient(point.x - unit, shoulder, point.x + unit, hip);
    shirt.addColorStop(0, '#343b44');
    shirt.addColorStop(1, '#090c0f');
    context.fillStyle = shirt;
    pathRoundRect(context, point.x - unit * 0.76, shoulder, unit * 1.52, hip - shoulder + unit * 0.25, unit * 0.24);
    context.fill();
    roundedLine(context, point.x, shoulder + unit * 0.15, point.x + unit * 0.95, shoulder + unit * 1.70,
      unit * 0.40, '#d6a57d');
    context.fillStyle = '#d6a57d';
    context.beginPath();
    context.arc(point.x, shoulder - unit * 0.58, unit * 0.57, 0, Math.PI * 2);
    context.fill();
    if (assistant) {
      context.fillStyle = '#f4d11f';
      context.beginPath();
      context.moveTo(point.x + unit * 0.92, shoulder + unit * 1.35);
      context.lineTo(point.x + unit * 2.15, shoulder + unit * 1.00);
      context.lineTo(point.x + unit * 2.08, shoulder + unit * 2.02);
      context.closePath();
      context.fill();
    }
    context.restore();
  }

  function updateOfficials(match) {
    if (!scene.officials) {
      scene.officials = {
        referee: { x: 52.5, y: 40, phase: 1.7 },
        assistantFar: { x: 45, y: 67.2, phase: 3.1 },
        assistantNear: { x: 60, y: 0.8, phase: 5.2 },
      };
    }
    const ball = MU.ball || { x: 52.5, y: 34 };
    const referee = scene.officials.referee;
    referee.x = mix(referee.x, limit(ball.x - (ball.x - 52.5) * 0.16, 8, 97), 0.035);
    referee.y = mix(referee.y, limit(ball.y + (ball.y < 34 ? 7 : -7), 6, 62), 0.035);
    [scene.officials.assistantFar, scene.officials.assistantNear].forEach((official, index) => {
      const side = match.sides[index];
      const defenders = side.onfield.filter((player) => !player.off && player.slot !== 'GK')
        .map((player) => dotOf(player)).filter(Boolean)
        .sort((left, right) => left.x - right.x);
      const target = defenders.length > 1 ? defenders[index ? defenders.length - 2 : 1].x : ball.x;
      official.x = mix(official.x, limit(target, 3, 102), 0.045);
      official.y = index ? 0.8 : 67.2;
    });
  }

  function drawPassLane(context, camera, play, now) {
    if (!play || play.mode !== 'pass' || !play.from || !play.to || !play.ms) return;
    const progress = limit((now - play.t0) / play.ms, 0, 1);
    context.save();
    context.setLineDash([Math.max(3, camera.width * 0.006), Math.max(3, camera.width * 0.008)]);
    context.strokeStyle = 'rgba(255,255,255,.22)';
    context.lineWidth = Math.max(1, camera.width * 0.0015);
    context.beginPath();
    for (let index = 0; index <= 24; index += 1) {
      const t = index / 24;
      const height = Math.sin(Math.PI * t) * (play.lofted ? 3.4 : 0.28);
      const point = projectPoint(camera, mix(play.from.x, play.to.x, t), mix(play.from.y, play.to.y, t), height);
      if (index) context.lineTo(point.x, point.y);
      else context.moveTo(point.x, point.y);
    }
    context.globalAlpha = 0.35 + (1 - progress) * 0.45;
    context.stroke();
    context.restore();
  }

  function drawBall(context, camera, now) {
    const ball = MU.ball || { x: 52.5, y: 34 };
    const height = Number(MU.ballH) || 0;
    const ground = projectPoint(camera, ball.x, ball.y, 0);
    const point = projectPoint(camera, ball.x, ball.y, height);
    const radius = Math.max(2.1, point.scale * 0.112);
    scene.trail.push({ x: ball.x, y: ball.y, height, at: now });
    while (scene.trail.length > 9) scene.trail.shift();

    context.save();
    scene.trail.slice(0, -1).forEach((entry, index) => {
      const trailPoint = projectPoint(camera, entry.x, entry.y, entry.height);
      context.globalAlpha = (index / scene.trail.length) * 0.16;
      context.fillStyle = '#ffffff';
      context.beginPath();
      context.arc(trailPoint.x, trailPoint.y, radius * (0.28 + index / scene.trail.length * 0.38), 0, Math.PI * 2);
      context.fill();
    });
    context.globalAlpha = 1;
    const lift = limit(height / 5, 0, 1);
    context.fillStyle = `rgba(0,0,0,${0.40 - lift * 0.20})`;
    context.beginPath();
    context.ellipse(ground.x, ground.y, radius * (1.30 - lift * 0.45), radius * 0.48, 0, 0, Math.PI * 2);
    context.fill();
    const ballGradient = context.createRadialGradient(point.x - radius * 0.38, point.y - radius * 0.42,
      radius * 0.08, point.x, point.y, radius);
    ballGradient.addColorStop(0, '#ffffff');
    ballGradient.addColorStop(0.72, '#edf0eb');
    ballGradient.addColorStop(1, '#9ba29e');
    context.fillStyle = ballGradient;
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#172027';
    context.beginPath();
    for (let index = 0; index < 5; index += 1) {
      const angle = -Math.PI / 2 + (index * Math.PI * 2) / 5 + now / 420;
      const x = point.x + Math.cos(angle) * radius * 0.38;
      const y = point.y + Math.sin(angle) * radius * 0.38;
      if (index) context.lineTo(x, y);
      else context.moveTo(x, y);
    }
    context.closePath();
    context.fill();
    context.restore();
  }

  function eventPlayers(match, text) {
    const line = String(text || '');
    return match.sides.flatMap((side) => side.onfield)
      .filter((player) => player && player.p && player.p.name && line.includes(player.p.name))
      .sort((left, right) => right.p.name.length - left.p.name.length);
  }

  function publishEvent(type, match, side, players, now, source) {
    if (!type || !match) return;
    const current = scene.event;
    const priority = EVENT_PRIORITY[type] || 0;
    if (current && current.until > now && current.priority > priority && now - current.at < 1100) return;
    const sideIndex = side === match.sides[0] ? 0 : side === match.sides[1] ? 1 : null;
    scene.eventSequence += 1;
    scene.event = {
      id: scene.eventSequence,
      type,
      priority,
      sideIndex,
      primary: players && players[0] ? players[0] : null,
      secondary: players && players[1] ? players[1] : null,
      at: now,
      until: now + (type === 'goal' ? 3000 : type === 'red' ? 2400 : 1700),
      source: source || 'engine',
    };
  }

  function scanRecordedStats(match, now) {
    if (!match || (scene.event && scene.event.until > now && scene.event.priority >= 5)) return;
    let best = null;
    match.sides.forEach((side, sideIndex) => side.onfield.forEach((player) => {
      const stats = player.ms;
      if (!stats) return;
      const previous = scene.stats.get(player.p.id) || {};
      const candidates = [
        ['dribble', (stats.drbW || 0) - (previous.drbW || 0), 4],
        ['tackle', (stats.takW || 0) - (previous.takW || 0), 4],
        ['interception', (stats.intc || 0) - (previous.intc || 0), 4],
        ['pass', (stats.key || 0) - (previous.key || 0), 3],
        ['pass', (stats.pasC || 0) - (previous.pasC || 0), 1],
      ];
      candidates.forEach(([type, delta, weight]) => {
        if (delta > 0 && (!best || weight > best.weight)) best = { type, player, side, sideIndex, weight };
      });
      scene.stats.set(player.p.id, {
        drbW: stats.drbW || 0,
        takW: stats.takW || 0,
        intc: stats.intc || 0,
        key: stats.key || 0,
        pasC: stats.pasC || 0,
      });
    }));
    if (best && (!scene.event || scene.event.until <= now || best.weight >= 3)) {
      publishEvent(best.type, match, best.side, [best.player], now, 'recorded-stat');
    }
  }

  function drawFocusLabel(context, camera, match, play, now) {
    const event = scene.event && scene.event.until > now ? scene.event : null;
    const player = (event && event.primary) || (play && play.holder) || null;
    if (!player || !player.p) return;
    const dot = dotOf(player);
    if (!dot) return;
    const point = projectPoint(camera, dot.x, dot.y, 1.98);
    if (point.x < -80 || point.x > camera.width + 80 || point.y < 40 || point.y > camera.height - 15) return;
    let name = player.p.name;
    try { name = surname(player.p.name); } catch (error) { name = player.p.name; }
    const stats = player.ms || {};
    const statBits = [];
    if (stats.pas) statBits.push(`PAS ${stats.pasC || 0}/${stats.pas}`);
    if (stats.tak) statBits.push(`TAC ${stats.takW || 0}/${stats.tak}`);
    if (stats.drb) statBits.push(`DRB ${stats.drbW || 0}/${stats.drb}`);
    if (stats.sav) statBits.push(`SAV ${stats.sav}`);
    const headline = event ? EVENT_TITLE[event.type] || 'LIVE' : 'ON THE BALL';
    const detail = `${name}${statBits.length ? `  ·  ${statBits.slice(0, 2).join('  ·  ')}` : ''}`;
    const titleSize = Math.max(8, Math.round(camera.height * 0.015));
    const detailSize = Math.max(9, Math.round(camera.height * 0.020));
    context.save();
    context.font = `900 ${detailSize}px Inter, sans-serif`;
    const width = Math.min(camera.width * 0.52, Math.max(camera.width * 0.19, context.measureText(detail).width + 24));
    const height = titleSize + detailSize + 17;
    const x = limit(point.x - width / 2, 8, camera.width - width - 8);
    const y = limit(point.y - height - 8, 8, camera.height - height - 8);
    pathRoundRect(context, x, y, width, height, height * 0.19);
    context.fillStyle = 'rgba(5,10,8,.88)';
    context.fill();
    const colour = event && event.sideIndex != null
      ? G.clubs[match.sides[event.sideIndex].ci].c1 : '#fbe122';
    context.fillStyle = colour;
    context.fillRect(x, y, Math.max(4, width * 0.022), height);
    context.textAlign = 'left';
    context.textBaseline = 'top';
    context.font = `900 ${titleSize}px Inter, sans-serif`;
    context.fillStyle = '#fbe122';
    context.fillText(headline, x + 13, y + 7);
    context.font = `800 ${detailSize}px Inter, sans-serif`;
    context.fillStyle = '#f4f7f3';
    context.fillText(detail, x + 13, y + titleSize + 10, width - 20);
    context.restore();
  }

  function drawScoreBug(context, camera, match, home, away) {
    const width = camera.width;
    const height = camera.height;
    const boxHeight = Math.max(29, height * 0.064);
    const scoreWidth = Math.min(width * 0.50, Math.max(190, width * 0.39));
    const minuteWidth = Math.max(58, width * 0.105);
    const x = width * 0.022;
    const y = height * 0.024;
    context.save();
    pathRoundRect(context, x, y, scoreWidth, boxHeight, boxHeight * 0.22);
    context.fillStyle = 'rgba(3,8,7,.90)';
    context.fill();
    context.fillStyle = home.c1;
    context.fillRect(x, y, Math.max(5, scoreWidth * 0.027), boxHeight);
    context.fillStyle = away.c1;
    context.fillRect(x + scoreWidth - Math.max(5, scoreWidth * 0.027), y, Math.max(5, scoreWidth * 0.027), boxHeight);
    context.font = `900 ${Math.max(11, Math.round(boxHeight * 0.47))}px Inter, sans-serif`;
    context.textBaseline = 'middle';
    context.textAlign = 'center';
    context.fillStyle = '#f5f8f4';
    context.fillText(`${home.short}  ${match.fix.hs} – ${match.fix.as}  ${away.short}`,
      x + scoreWidth / 2, y + boxHeight * 0.52);
    pathRoundRect(context, x + scoreWidth + 5, y, minuteWidth, boxHeight, boxHeight * 0.22);
    context.fillStyle = 'rgba(3,8,7,.90)';
    context.fill();
    context.fillStyle = '#fbe122';
    context.fillText(match.done ? 'FT' : match.stage === 'HT' ? 'HT' : `${match.dispMin()}'`,
      x + scoreWidth + 5 + minuteWidth / 2, y + boxHeight * 0.52);
    context.restore();
  }

  function drawWeather(context, camera, match, now) {
    const weather = match.fix && match.fix.ctx && match.fix.ctx.wx;
    if (!weather || !/rain|Heavy pitch|Freezing/i.test(weather.k || '')) return;
    const snow = /Freezing/i.test(weather.k || '');
    const count = snow ? 80 : 130;
    if (!scene.weather || scene.weather.snow !== snow || scene.weather.drops.length !== count) {
      const random = seeded(seedFrom(`${match.fix.h}|${match.fix.a}|${weather.k}`));
      scene.weather = { snow, drops: Array.from({ length: count }, () => ({
        x: random() * camera.width,
        y: random() * camera.height,
        speed: (snow ? 0.0015 : 0.010) * camera.height * (0.75 + random()),
        length: (snow ? 1 : 0.020 * camera.height * (0.7 + random())),
        drift: random() * Math.PI * 2,
      })) };
    }
    context.save();
    if (snow) context.fillStyle = 'rgba(245,250,255,.55)';
    else {
      context.strokeStyle = 'rgba(188,216,240,.28)';
      context.lineWidth = Math.max(1, camera.width * 0.0011);
      context.beginPath();
    }
    scene.weather.drops.forEach((drop) => {
      if (snow) {
        context.beginPath();
        context.arc(drop.x, drop.y, Math.max(1, camera.width * 0.0017), 0, Math.PI * 2);
        context.fill();
      } else {
        context.moveTo(drop.x, drop.y);
        context.lineTo(drop.x - camera.width * 0.005, drop.y + drop.length);
      }
      drop.y += drop.speed;
      drop.drift += 0.025;
      drop.x += snow ? Math.sin(drop.drift) * camera.width * 0.00045 : -camera.width * 0.0011;
      if (drop.y > camera.height + drop.length) {
        drop.y = -drop.length;
        drop.x = (drop.x + camera.width * 0.57 + now * 0.001) % camera.width;
      }
    });
    if (!snow) context.stroke();
    context.restore();
  }

  function resetForMatch(match) {
    scene.match = match;
    scene.camera = null;
    scene.crowd = null;
    scene.crowdKey = '';
    scene.event = null;
    scene.stats.clear();
    scene.trail.length = 0;
    scene.officials = null;
    scene.weather = null;
    scene.frame = 0;
    scene.lastError = null;
    scene.errorReported = false;
  }

  function advanceVisualMatch(match, now) {
    if (!match.done) {
      advancePlay(now);
      pitchTargets();
    }
    try { if (typeof dugWatch === 'function') dugWatch(); } catch (error) { /* visual extra */ }
    try { if (typeof subScan === 'function') subScan(); } catch (error) { /* visual extra */ }
    try { if (typeof subStep === 'function') subStep(); } catch (error) { /* visual extra */ }
    try { if (typeof sentOffScan === 'function') sentOffScan(); } catch (error) { /* visual extra */ }
    try { if (typeof sentOffStep === 'function') sentOffStep(); } catch (error) { /* visual extra */ }
    const play = typeof playState === 'function' ? playState() : {};
    (MU.dots || []).forEach((dot) => {
      const ease = dot.pl.off ? 0.045 : play.holder === dot.pl ? 0.18 : 0.068;
      const oldX = dot.x;
      const oldY = dot.y;
      dot.x += ((dot.tx == null ? dot.x : dot.tx) - dot.x) * ease;
      dot.y += ((dot.ty == null ? dot.y : dot.ty) - dot.y) * ease;
      dot.vx = (dot.vx || 0) * 0.72 + (dot.x - oldX) * 0.28;
      dot.vy = (dot.vy || 0) * 0.72 + (dot.y - oldY) * 0.28;
    });
    const movement = play.mode === 'pass' || play.mode === 'carry' ? 1 : 0.20;
    MU.ball.x += ((MU.ballT.x == null ? MU.ball.x : MU.ballT.x) - MU.ball.x) * movement;
    MU.ball.y += ((MU.ballT.y == null ? MU.ball.y : MU.ballT.y) - MU.ball.y) * movement;
    MU.ball.x = limit(MU.ball.x, 0.4, FIELD_LENGTH - 0.4);
    MU.ball.y = limit(MU.ball.y, 0.8, FIELD_WIDTH - 0.8);
    let ballHeight = 0;
    if (play.mode === 'pass' && play.from && play.to && play.ms) {
      const progress = limit((now - play.t0) / play.ms, 0, 1);
      const distance = Math.hypot(play.to.x - play.from.x, play.to.y - play.from.y);
      ballHeight = Math.sin(Math.PI * progress) * (play.lofted ? Math.min(8, distance * 0.20) : Math.min(1.4, distance * 0.035));
    }
    MU.ballH = ballHeight;
    scanRecordedStats(match, now);
    return play;
  }

  function renderFrame() {
    const canvas = document.getElementById('dugCanvas');
    const match = MU && MU.m;
    if (!canvas || !match) return;
    if (scene.match !== match) resetForMatch(match);
    const context = canvas.getContext('2d');
    const width = canvas.width;
    const height = canvas.height;
    const now = performance.now();
    const home = G.clubs[match.sides[0].ci];
    const away = G.clubs[match.sides[1].ci];
    const kits = resolveKits(home, away);
    const play = advanceVisualMatch(match, now);
    const camera = smoothedCamera(width, height, match);
    scene.frame += 1;

    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, width, height);
    let shakeX = 0;
    let shakeY = 0;
    try {
      if (DUG.shake && now < DUG.shake) {
        const strength = (DUG.shake - now) / 700;
        shakeX = (Math.random() * 2 - 1) * width * 0.008 * strength;
        shakeY = (Math.random() * 2 - 1) * height * 0.008 * strength;
      }
    } catch (error) { /* optional legacy celebration state */ }
    context.translate(shakeX, shakeY);
    drawStadium(context, camera, home, away);
    drawPitch(context, camera);
    const goals = [goalGeometry(camera, 0), goalGeometry(camera, FIELD_LENGTH)];
    goals.forEach((goal) => drawGoalNet(context, camera, goal));
    drawPassLane(context, camera, play, now);
    updateOfficials(match);

    const entities = (MU.dots || []).map((dot) => ({ kind: 'player', y: dot.y, dot }));
    Object.values(scene.officials).forEach((official, index) => {
      entities.push({ kind: 'official', y: official.y, official, assistant: index > 0 });
    });
    entities.push({ kind: 'ball', y: MU.ball.y });
    entities.sort((left, right) => right.y - left.y);
    entities.forEach((entity) => {
      if (entity.kind === 'ball') drawBall(context, camera, now);
      else if (entity.kind === 'official') drawOfficial(context, camera, entity.official, now, entity.assistant);
      else {
        const sideIndex = entity.dot.si == null ? 0 : entity.dot.si;
        const club = G.clubs[match.sides[sideIndex].ci];
        drawPlayer(context, camera, entity.dot, club, kits[sideIndex], now);
      }
    });
    goals.forEach((goal) => drawGoalFrame(context, camera, goal));
    drawFocusLabel(context, camera, match, play, now);
    drawWeather(context, camera, match, now);

    const vignette = context.createRadialGradient(width * 0.5, height * 0.54, width * 0.27,
      width * 0.5, height * 0.54, width * 0.86);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,.42)');
    context.fillStyle = vignette;
    context.fillRect(-shakeX, -shakeY, width, height);
    drawScoreBug(context, camera, match, home, away);
    try { if (typeof dugSubBoard === 'function') dugSubBoard(context, width, height, now); } catch (error) { /* optional */ }
    context.setTransform(1, 0, 0, 1, 0, 0);
  }

  function install() {
    if (typeof drawDugout !== 'function' || typeof MatchSim !== 'function') return false;
    if (root.RBSDugoutRenderer && root.RBSDugoutRenderer.installed) return true;
    const legacyDraw = drawDugout;
    const previousSay = MatchSim.prototype.say;
    MatchSim.prototype.say = function sayWithDugoutEvent(minute, side, text, className) {
      const result = previousSay.apply(this, arguments);
      try {
        if (MU && MU.m === this) {
          const type = classifyEvent(text, className);
          if (type) publishEvent(type, this, side, eventPlayers(this, text), performance.now(), 'engine');
        }
      } catch (error) { /* commentary remains authoritative */ }
      return result;
    };
    drawDugout = function drawBroadcastDugout() {
      try {
        renderFrame();
      } catch (error) {
        scene.lastError = error;
        if (!scene.errorReported) {
          scene.errorReported = true;
          if (root.console && typeof root.console.error === 'function') root.console.error('Dugout renderer fallback', error);
        }
        legacyDraw.apply(this, arguments);
      }
    };
    return true;
  }

  const api = {
    cameraTarget,
    classifyEvent,
    colourDistance,
    install,
    installed: false,
    projectPoint,
    resolveKits,
    scene,
  };

  if (root) root.RBSDugoutRenderer = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  api.installed = install();
}(typeof window !== 'undefined' ? window : globalThis));
