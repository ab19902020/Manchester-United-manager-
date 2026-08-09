(function authenticFixturesModule(root, factory) {
  const api = factory(root && root.RBSAuthenticFixtureData);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.RBSAuthenticFixtures = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function authenticFixturesFactory(defaultData) {
  const DAY_MS = 24 * 60 * 60 * 1000;

  function fixtureDay(game, date) {
    const epoch = Number(game && game.epoch);
    const instant = Date.parse(`${date}T00:00:00Z`);
    if (!Number.isFinite(epoch) || !Number.isFinite(instant)) return null;
    return Math.round((instant - epoch) / DAY_MS);
  }

  function validateDivision(division, source, clubs) {
    if (!source || source.status !== 'published' || !Array.isArray(source.fixtures)) {
      return { valid: false, reason: 'source is not a published fixture list' };
    }
    const members = clubs.filter((club) => club.league === division);
    const byName = new Map(members.map((club) => [club.name, club]));
    const sourceTeams = new Set(source.teams || []);
    if (members.length !== source.teamCount || sourceTeams.size !== source.teamCount) {
      return { valid: false, reason: `membership count is ${members.length}; source count is ${source.teamCount}` };
    }
    const missing = [...sourceTeams].filter((name) => !byName.has(name));
    const extra = members.map((club) => club.name).filter((name) => !sourceTeams.has(name));
    if (missing.length || extra.length) {
      return { valid: false, reason: `membership mismatch; missing [${missing.join(', ')}], extra [${extra.join(', ')}]` };
    }
    if (source.fixtures.length !== members.length * (members.length - 1)) {
      return { valid: false, reason: `fixture count ${source.fixtures.length} is not n*(n-1)` };
    }
    const pairs = new Set();
    const clubDays = new Set();
    for (const row of source.fixtures) {
      const [date, home, away] = row;
      if (!byName.has(home) || !byName.has(away) || home === away) {
        return { valid: false, reason: `invalid source pairing ${home}/${away}` };
      }
      const pair = `${home}\u0000${away}`;
      if (pairs.has(pair)) return { valid: false, reason: `duplicate source pairing ${home}/${away}` };
      pairs.add(pair);
      for (const name of [home, away]) {
        const key = `${name}\u0000${date}`;
        if (clubDays.has(key)) return { valid: false, reason: `${name} is scheduled twice on ${date}` };
        clubDays.add(key);
      }
    }
    return { valid: true, byName };
  }

  function uniqueKey(clubs, club, meta, division) {
    const base = String(meta.abbreviation || meta.sourceName || division)
      .toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || division;
    let key = base;
    let suffix = 2;
    while (clubs.some((candidate) => candidate !== club && candidate.key === key)) {
      key = `${base}${suffix}`;
      suffix += 1;
    }
    return key;
  }

  function updateIdentity(clubs, club, name, meta, division) {
    club.name = name;
    club.short = (meta && meta.short) || name;
    club.key = uniqueKey(clubs, club, meta || {}, division);
    if (meta && meta.primary) club.c1 = meta.primary;
    if (meta && meta.secondary) club.c2 = meta.secondary;
    if (meta && meta.venue && meta.venue.name) club.stadium = meta.venue.name;
    delete club.abbr;
    delete club.longShort;
  }

  function prepareClubs(clubs, fixtureData) {
    const data = fixtureData || defaultData;
    const report = { prepared: [], skipped: {}, replaced: [] };
    if (!Array.isArray(clubs) || !data || !data.divisions) return report;
    for (const [division, source] of Object.entries(data.divisions)) {
      const membership = source.membership;
      if (!membership || !Array.isArray(membership.pool) || !membership.pool.length) continue;
      const pool = clubs.filter((club) => membership.pool.includes(club.league));
      const targets = [];
      const used = new Set();
      for (const name of source.teams) {
        const club = pool.find((candidate) => !used.has(candidate) && candidate.name === name);
        if (club) {
          used.add(club);
          targets.push({ name, club, replaced: null });
        } else {
          targets.push({ name, club: null, replaced: null });
        }
      }
      const missing = targets.filter((target) => !target.club);
      if (membership.pool.length > 1 && missing.length) {
        report.skipped[division] = `current club pool is missing ${missing.map((target) => target.name).join(', ')}`;
        continue;
      }
      if (membership.pool.length === 1) {
        const spare = pool.filter((club) => !used.has(club));
        if (spare.length !== missing.length) {
          report.skipped[division] = `${missing.length} promoted clubs need ${missing.length} slots; ${spare.length} are available`;
          continue;
        }
        for (const target of missing) {
          target.club = spare.shift();
          target.replaced = target.club.name;
          updateIdentity(clubs, target.club, target.name, source.teamMeta[target.name], division);
          used.add(target.club);
          report.replaced.push({ division, removed: target.replaced, added: target.name });
        }
      }
      const targetClubs = new Set(targets.map((target) => target.club));
      for (const target of targets) {
        const club = target.club;
        club.league = division;
        club.cc = membership.cc;
        club.tier = membership.tier;
        const meta = source.teamMeta && source.teamMeta[target.name];
        if (meta && meta.id) club.espnTeamId = meta.id;
        club.fixtureMembershipSource = source.source;
        club.fixtureMembershipReadDate = source.readDate;
      }
      if (membership.pool.length > 1) {
        const lower = membership.pool[1];
        for (const club of pool) {
          if (targetClubs.has(club)) continue;
          club.league = lower;
          club.cc = membership.cc;
          club.tier = membership.tier + 1;
        }
      }
      report.prepared.push(division);
    }
    return report;
  }

  function apply(game, fixtureData) {
    const data = fixtureData || defaultData;
    const result = { applied: [], skipped: {} };
    if (!game || !Array.isArray(game.clubs) || !Array.isArray(game.fixtures) || !data || !data.divisions) {
      return result;
    }
    game.fixtureSources = {};
    if (game.season !== 1) return result;
    for (const [division, source] of Object.entries(data.divisions)) {
      const checked = validateDivision(division, source, game.clubs);
      if (!checked.valid) {
        result.skipped[division] = checked.reason;
        continue;
      }
      const fixtures = source.fixtures.map(([date, home, away, round, sourceId]) => ({
        r: Number.isFinite(round) ? round : 0,
        day: fixtureDay(game, date),
        h: checked.byName.get(home).i,
        a: checked.byName.get(away).i,
        played: false,
        hs: 0,
        as: 0,
        sc: [],
        div: division,
        authentic: 1,
        sourceId,
      }));
      if (fixtures.some((fixture) => !Number.isFinite(fixture.day))) {
        result.skipped[division] = 'one or more fixture dates could not be mapped to the career epoch';
        continue;
      }
      game.fixtures = game.fixtures.filter((fixture) => fixture.div !== division).concat(fixtures);
      game.fixtureSources[division] = {
        provider: source.provider,
        source: source.source,
        readDate: source.readDate,
        sourceSeason: source.sourceSeason,
        fixtures: source.fixtureCount,
      };
      result.applied.push(division);
    }
    return result;
  }

  return { apply, fixtureDay, prepareClubs, validateDivision };
}));
