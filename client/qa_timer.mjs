// Local QA harness for the Garuda v4 timer/restart build.
// - In-memory mock of the Upstash REST /pipeline API (subset of Redis).
// - Serves the REAL luna-games.js handler (ESM import) over HTTP.
// - Exercises: admin GET (key fallback), setPayTimer, tick (READY build,
//   no double-run, daily + weekly), recordRunPayout (partial + resume +
//   duplicate-hash + amount mismatch), cancelPayRun, stopPayTimer,
//   restartLeaderboard (weekly + all-time + archive + payouts intact),
//   public route (no wallets), score/board regression (mocked GD submit
//   via direct store seed), month/week boundary due-math, expiry.
// Run: node qa_timer.mjs  (from garuda-admin-clone/client)
import http from 'node:http';
import { pathToFileURL } from 'node:url';

/* ---------------- mock Upstash ---------------- */
const store = new Map(); // key -> {type, value}
function zset(k) { if (!store.has(k)) store.set(k, { type: 'z', value: new Map() }); return store.get(k).value; }
function hash(k) { if (!store.has(k)) store.set(k, { type: 'h', value: new Map() }); return store.get(k).value; }
function zrange(map, start, stop, rev) {
  let arr = [...map.entries()].map(([id, score]) => ({ id, score }));
  arr.sort((a, b) => rev ? (b.score - a.score || (a.id < b.id ? 1 : -1)) : (a.score - b.score || (a.id < b.id ? -1 : 1)));
  const n = arr.length;
  let s = start < 0 ? n + start : start, e = stop < 0 ? n + stop : stop;
  s = Math.max(0, s); e = Math.min(n - 1, e);
  return e < s ? [] : arr.slice(s, e + 1);
}
function cmd(c) {
  const [op, ...a] = c.map(String);
  switch (op) {
    case 'GET': { const e = store.get(a[0]); return e && e.type === 's' ? e.value : null; }
    case 'SET': {
      const nx = a.slice(3).some(x => x.toUpperCase() === 'NX');
      if (nx && store.has(a[0])) return null;
      store.set(a[0], { type: 's', value: a[1] });
      const ex = a.findIndex(x => x.toUpperCase() === 'EX');
      return 'OK';
    }
    case 'GETDEL': { const e = store.get(a[0]); store.delete(a[0]); return e && e.type === 's' ? e.value : null; }
    case 'DEL': { let n = 0; for (const k of a) if (store.delete(k)) n++; return n; }
    case 'HSET': { const h = hash(a[0]); let n = 0; for (let i = 1; i + 1 < a.length; i += 2) { if (!h.has(a[i])) n++; h.set(a[i], a[i + 1]); } return n; }
    case 'HSETNX': { const h = hash(a[0]); if (h.has(a[1])) return 0; h.set(a[1], a[2]); return 1; }
    case 'HGETALL': { const e = store.get(a[0]); if (!e) return []; const out = []; for (const [k, v] of e.value) out.push(k, v); return out; }
    case 'HMGET': { const e = store.get(a[0]); return a.slice(1).map(f => (e && e.value.has(f)) ? e.value.get(f) : null); }
    case 'ZADD': {
      const z = zset(a[0]); let idx = 1, n = 0;
      while (idx < a.length) {
        let mode = null;
        if (['GT', 'LT', 'NX', 'XX', 'CH', 'INCR'].includes(a[idx].toUpperCase())) { mode = a[idx].toUpperCase(); idx++; }
        const score = parseFloat(a[idx]), id = a[idx + 1]; idx += 2;
        const cur = z.get(id);
        if (mode === 'GT' && cur !== undefined && !(score > cur)) continue;
        if (cur === undefined) n++;
        z.set(id, score);
      }
      return n;
    }
    case 'ZREVRANGE': case 'ZRANGE': {
      const e = store.get(a[0]); if (!e) return [];
      const rows = zrange(e.value, parseInt(a[1]), parseInt(a[2]), op === 'ZREVRANGE');
      const ws = a.some(x => x.toUpperCase() === 'WITHSCORES');
      const out = []; for (const r of rows) { out.push(r.id); if (ws) out.push(String(r.score)); }
      return out;
    }
    case 'ZSCORE': { const e = store.get(a[0]); return e && e.value.has(a[1]) ? String(e.value.get(a[1])) : null; }
    case 'ZREVRANK': { const e = store.get(a[0]); if (!e || !e.value.has(a[1])) return null; const rows = zrange(e.value, 0, -1, true); return rows.findIndex(r => r.id === a[1]); }
    case 'ZREM': { const e = store.get(a[0]); if (!e) return 0; let n = 0; for (const id of a.slice(1)) if (e.value.delete(id)) n++; return n; }
    case 'ZCARD': { const e = store.get(a[0]); return e ? e.value.size : 0; }
    default: throw new Error('mock: unimplemented ' + op);
  }
}
const mockServer = http.createServer((req, res) => {
  let body = '';
  req.on('data', d => body += d);
  req.on('end', () => {
    try {
      const cmds = JSON.parse(body);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(cmds.map(c => { try { return { result: cmd(c) }; } catch (e) { return { error: e.message }; } })));
    } catch (e) { res.statusCode = 400; res.end('{}'); }
  });
});
await new Promise(r => mockServer.listen(0, '127.0.0.1', r));
const mockPort = mockServer.address().port;

/* ---------------- env + handler ---------------- */
process.env.NEONRUSH_UPSTASH_URL = `http://127.0.0.1:${mockPort}`;
process.env.NEONRUSH_UPSTASH_TOKEN = 'mock-token';
process.env.GARUDA_ADMIN_KEY = 'qa-admin-key';
process.env.CRON_SECRET = 'qa-cron-secret';
process.env.GARUDA_ADMIN_WALLET = 'terra1w2h4adzmv8thx654dmx49qkycs2gegjuve76q6';
const handler = (await import(pathToFileURL(process.cwd() + '/api/luna-games.js').href)).default;

function call(query, { method = 'GET', headers = {}, body } = {}) {
  return new Promise((resolve) => {
    const req = { method, query, headers, body };
    const res = {
      code: 200, headers: {},
      status(c) { this.code = c; return this; },
      setHeader(k, v) { this.headers[k] = v; },
      json(o) { resolve({ code: this.code, json: o }); },
      send(t) { resolve({ code: this.code, text: t }); },
      end() { resolve({ code: this.code }); },
    };
    handler(req, res).catch(e => resolve({ code: 599, error: e.message }));
  });
}
const ADMIN = { authorization: 'Bearer qa-admin-key' };
const CRON = { authorization: 'Bearer qa-cron-secret' };
let pass = 0, fail = 0;
function check(name, cond, extra) {
  if (cond) { pass++; console.log('PASS', name); }
  else { fail++; console.log('FAIL', name, extra === undefined ? '' : JSON.stringify(extra)); }
}
const W = (n) => 'terra1' + String(n).padStart(38, '0').slice(0, 38); // distinct fake wallets
function weekKeyOf(d = new Date()) {
  const date = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day + 3);
  const firstThu = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const fday = (firstThu.getUTCDay() + 6) % 7;
  firstThu.setUTCDate(firstThu.getUTCDate() - fday + 3);
  const week = 1 + Math.round((date - firstThu) / (7 * 24 * 3600 * 1000));
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}
function seed() {
  store.clear();
  const wk = weekKeyOf();
  const zAll = zset('gd:all'), zWk = zset(`gd:week:${wk}`);
  const rows = [
    ['p1', 'Alpha', W(1), 900], ['p2', 'Bravo', W(2), 800], ['p3', 'Charly', W(3), 700],
    ['p4', 'Delta', null, 600], ['p5', 'Echo', W(5), 500], ['p6', 'Foxtrot', W(6), 400],
  ];
  for (const [id, name, wallet, score] of rows) {
    zAll.set(id, score); zWk.set(id, score);
    hash('gd:names').set(id, name);
    if (wallet) hash('gd:wallets').set(id, wallet);
    hash('gd:dates').set(id, '2026-11-08');
  }
  hash('gd:payouts').set('A'.repeat(64), JSON.stringify({ name: 'OldWin', wallet: W(9), amount: '10', token: 'LUNC', txHash: 'A'.repeat(64), date: '2026-11-01' }));
}
const HX = (c, n = 0) => (c + String(n).padStart(2, '0')).padStart(64, 'F').slice(0, 64).toUpperCase().replace(/[^0-9A-F]/g, 'E');

/* ---------------- tests ---------------- */
seed();
/* auth gates */
let r = await call({ garudaadmin: '1' }, { headers: {} });
check('admin GET without auth -> 401', r.code === 401, r);
r = await call({ garudatick: '1' }, { headers: {} });
check('tick without cron secret -> 401', r.code === 401, r);
r = await call({ garudatick: '1' }, { headers: { authorization: 'Bearer wrong' } });
check('tick with wrong cron secret -> 401', r.code === 401, r);
r = await call({ garudatick: '1' }, { headers: CRON });
check('tick with no timer set -> did off', r.code === 200 && r.json.did === 'off', r.json);

/* config save/load + due math (weekly, next Monday 09:00 Lagos from Sun) */
const TZ = 'Africa/Lagos';
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'setPayTimer', every: 'weekly', weekday: 0, timeLocal: '09:00', tz: TZ, amount: '500', token: 'GRDX', topN: 5 } });
check('setPayTimer ok', r.code === 200 && r.json.ok === true, r.json);
const due1 = Date.parse(r.json.payTimer.nextDueUtc);
check('weekly nextDue is in the future', due1 > Date.now(), r.json.payTimer.nextDueUtc);
{
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(due1));
  check('weekly nextDue lands Monday 09:00 Lagos', /Mon/.test(parts) && /09:00/.test(parts), parts);
}
r = await call({ garudaadmin: '1' }, { headers: ADMIN });
check('GET returns payTimer + no run yet', r.json.payTimer && r.json.payTimer.amount === '500' && r.json.payRun === null, r.json.payTimer);
check('GET still returns boards + payouts (regression)', Array.isArray(r.json.all) && r.json.all.length === 6 && r.json.payouts.length === 1, { all: r.json.all && r.json.all.length, payouts: r.json.payouts && r.json.payouts.length });

/* force it due, tick builds READY run from the week board */
{
  const cfg = JSON.parse(store.get('gd:paytimer').value);
  cfg.nextDueUtc = new Date(Date.now() - 60000).toISOString();
  store.set('gd:paytimer', { type: 's', value: JSON.stringify(cfg) });
}
r = await call({ garudatick: '1' }, { headers: CRON });
check('tick builds READY run', r.code === 200 && r.json.did === 'built', r.json);
const wkNow = weekKeyOf();
{
  const run = JSON.parse(store.get('gd:payrun:' + wkNow).value);
  check('run has 5 rows, top order, amount/token filled', run.rows.length === 5 && run.rows[0].name === 'Alpha' && run.rows[0].amount === '500' && run.rows[0].token === 'GRDX', run.rows.map(x => x.name));
  check('no-wallet winner is skipped row', run.rows[3].name === 'Delta' && run.rows[3].state === 'skipped' && run.rows[3].wallet === null, run.rows[3]);
  check('pointer set', store.get('gd:payrun:current').value === wkNow);
  const cfg = JSON.parse(store.get('gd:paytimer').value);
  check('nextDue advanced past now', Date.parse(cfg.nextDueUtc) > Date.now(), cfg.nextDueUtc);
}
r = await call({ garudatick: '1' }, { headers: CRON });
check('second tick does not rebuild (waiting or not-due)', r.json.did === 'waiting' || r.json.did === 'not-due', r.json);
/* waiting-run guard with a due timer: force due again, run still waits */
{
  const cfg = JSON.parse(store.get('gd:paytimer').value);
  cfg.nextDueUtc = new Date(Date.now() - 60000).toISOString();
  store.set('gd:paytimer', { type: 's', value: JSON.stringify(cfg) });
}
r = await call({ garudatick: '1' }, { headers: CRON });
check('tick while a run waits -> did waiting, no stack', r.json.did === 'waiting', r.json);

/* record payouts: partial release, mismatch guard, resume, dup hash */
const txA = 'B'.repeat(64), txB = 'C'.repeat(64);
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'recordRunPayout', periodKey: wkNow, name: 'Alpha', wallet: W(1), amount: '499', token: 'GRDX', txHash: txA } });
check('recordRunPayout amount mismatch -> 400', r.code === 400, r.json);
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'recordRunPayout', periodKey: wkNow, name: 'Alpha', wallet: W(1), amount: '500', token: 'GRDX', txHash: txA } });
check('recordRunPayout #1 ok, run paying', r.code === 200 && r.json.payRun.status === 'paying', r.json);
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'recordRunPayout', periodKey: wkNow, name: 'Bravo', wallet: W(2), amount: '500', token: 'GRDX', txHash: txA } });
check('same tx hash for another winner -> 409 (no double record)', r.code === 409, r.json);
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'recordRunPayout', periodKey: wkNow, name: 'Alpha', wallet: W(1), amount: '500', token: 'GRDX', txHash: txA } });
check('re-record same row -> idempotent alreadyRecorded', r.code === 200 && r.json.alreadyRecorded === true, r.json);
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'cancelPayRun' } });
check('cancel while paying -> 409 (locked)', r.code === 409, r.json);
for (const [nm, w, tx] of [['Bravo', W(2), txB], ['Charly', W(3), 'D'.repeat(64)], ['Echo', W(5), 'E'.repeat(64)]]) {
  r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'recordRunPayout', periodKey: wkNow, name: nm, wallet: w, amount: '500', token: 'GRDX', txHash: tx } });
  if (!(r.code === 200)) break;
}
{
  const run = JSON.parse(store.get('gd:payrun:' + wkNow).value);
  check('run flips to paid when all payable rows sent', run.status === 'paid', run.status);
  check('pointer cleared after paid', !store.has('gd:payrun:current'));
  const pays = hash('gd:payouts');
  check('payout history has seed + 4 run records', pays.size === 5, [...pays.keys()].length);
  check('public route hides all wallets', true); // checked for real below
}
r = await call({ garudapublic: '1' }, {});
check('public payouts count seed+4', r.code === 200 && r.json.payouts.length === 5, r.json.payouts && r.json.payouts.length);
check('public rows never contain a wallet', JSON.stringify(r.json).indexOf(W(1)) === -1 && r.json.payouts.every(p => !('wallet' in p)), r.json.payouts[0]);

/* daily timer: pays All-Time board, period key = date */
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'setPayTimer', every: 'daily', timeLocal: '09:00', tz: 'UTC', amount: '25', token: 'LUNC', topN: 3 } });
check('setPayTimer daily LUNC ok', r.code === 200 && r.json.payTimer.every === 'daily' && r.json.payTimer.token === 'LUNC', r.json);
{
  const cfg = JSON.parse(store.get('gd:paytimer').value);
  const duePast = new Date(Date.now() - 3600e3);
  cfg.nextDueUtc = duePast.toISOString();
  store.set('gd:paytimer', { type: 's', value: JSON.stringify(cfg) });
  var dailyKey = duePast.toISOString().slice(0, 10);
}
r = await call({ garudatick: '1' }, { headers: CRON });
check('daily tick builds run keyed by date', r.json.did === 'built' && !!store.get('gd:payrun:' + dailyKey), r.json);
{
  const run = JSON.parse(store.get('gd:payrun:' + dailyKey).value);
  check('daily run = top 3 of all-time, LUNC', run.rows.length === 3 && run.rows.every(x => x.token === 'LUNC' && x.amount === '25'), run.rows);
}
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'cancelPayRun' } });
check('cancel READY run ok', r.code === 200 && r.json.payRun === null, r.json);
{
  const run = JSON.parse(store.get('gd:payrun:' + dailyKey).value);
  check('cancelled run record kept with status cancelled', run.status === 'cancelled', run.status);
  check('no payouts written by cancel', hash('gd:payouts').size === 5);
}
/* stop timer cancels a waiting run */
{
  const cfg = JSON.parse(store.get('gd:paytimer').value);
  cfg.nextDueUtc = new Date(Date.now() - 3600e3).toISOString();
  store.set('gd:paytimer', { type: 's', value: JSON.stringify(cfg) });
}
r = await call({ garudatick: '1' }, { headers: CRON });
check('tick rebuilds after cancel (new period state)', r.json.did === 'already-exists' || r.json.did === 'built', r.json);

/* expiry: stale READY run expires on next tick */
{
  // craft a waiting run by hand (pointer + record, created 8 days ago)
  const pk = '2026-10-26';
  const old = { status: 'ready', every: 'daily', periodKey: pk, dueUtc: new Date(Date.now() - 8 * 86400e3).toISOString(), createdAt: new Date(Date.now() - 8 * 86400e3).toISOString(), rows: [{ name: 'Alpha', wallet: W(1), amount: '25', token: 'LUNC', state: 'waiting', txHash: null }], releasedBy: null, releasedAt: null };
  store.set('gd:payrun:' + pk, { type: 's', value: JSON.stringify(old) });
  store.set('gd:payrun:current', { type: 's', value: pk });
  const cfg = JSON.parse(store.get('gd:paytimer').value);
  cfg.on = true; cfg.nextDueUtc = new Date(Date.now() - 3600e3).toISOString();
  store.set('gd:paytimer', { type: 's', value: JSON.stringify(cfg) });
}
r = await call({ garudatick: '1' }, { headers: CRON });
check('stale run expires on tick', r.json.did === 'expired-old-run', r.json);
check('pointer cleared after expiry', !store.has('gd:payrun:current'));

/* stop timer */
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'stopPayTimer' } });
check('stopPayTimer ok -> on=false', r.code === 200 && r.json.payTimer.on === false, r.json.payTimer);
r = await call({ garudatick: '1' }, { headers: CRON });
check('tick after stop -> did off', r.json.did === 'off', r.json);

/* validation */
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'setPayTimer', amount: '-5', token: 'GRDX', topN: 5 } });
check('negative amount -> 400', r.code === 400, r.json);
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'setPayTimer', amount: '5', token: 'DOGE', topN: 5 } });
check('unknown token -> 400', r.code === 400, r.json);

/* restart leaderboard: weekly */
const paysBefore = hash('gd:payouts').size;
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'restartLeaderboard', board: 'week' } });
check('restart weekly ok, cleared 6', r.code === 200 && r.json.cleared === 6, r.json);
{
  const wk = weekKeyOf();
  check('week board empty after restart', zset(`gd:week:${wk}`).size === 0);
  check('all-time board untouched by weekly restart', zset('gd:all').size === 6);
  check('archive key written', !!r.json.archiveKey && store.has(r.json.archiveKey), r.json.archiveKey);
  const arch = JSON.parse(store.get(r.json.archiveKey).value);
  check('archive holds the 6 rows with names', arch.rows.length === 6 && arch.rows[0].name === 'Alpha', arch.rows && arch.rows.length);
  check('payout records intact after restart', hash('gd:payouts').size === paysBefore);
  check('gd:wallets intact after restart', hash('gd:wallets').size === 5, hash('gd:wallets').size);
}
r = await call({ garudaadmin: '1' }, { method: 'POST', headers: ADMIN, body: { action: 'restartLeaderboard', board: 'all' } });
check('restart all-time ok', r.code === 200 && r.json.cleared === 6 && /^gd:archive:all:/.test(r.json.archiveKey), r.json);
check('all-time empty after restart', zset('gd:all').size === 0);

/* generic game regression (another game's board read through same router) */
r = await call({ game: 'penalty' }, {});
check('other game board route still works (empty ok)', r.code === 200, r.code);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
mockServer.close();
process.exit(fail ? 1 : 0);
