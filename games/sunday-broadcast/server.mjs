import http from 'node:http';
import { randomBytes, randomInt } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createGzip, constants as zlib } from 'node:zlib';
import { Football, PLAYS, DEFENSE } from './public/football.mjs';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const roomAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const neutral = { x: 0, y: 0, sprint: false };
const step = 1 / 120;
const reconnectMs = 120000;
const roomIdleMs = 45 * 60 * 1000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};

class RequestError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

async function body(req) {
  if (!String(req.headers['content-type']).startsWith('application/json')) {
    throw new RequestError(415, 'Send a JSON request.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new RequestError(413, 'Request is too large.');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw new RequestError(400, 'Request is not valid JSON.');
  }
}

function newSeat() {
  return {
    token: randomBytes(24).toString('hex'),
    stream: null,
    disconnectedAt: Date.now(),
    ready: false,
    call: 0,
    input: neutral,
    inputAt: 0,
    seq: 0,
  };
}

function normalizeInput({ x, y, sprint }) {
  x = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
  y = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  const magnitude = Math.max(1, Math.hypot(x, y));
  return { x: x / magnitude, y: y / magnitude, sprint: sprint === true };
}

function openingGame(length, openingTeam) {
  return new Football({ quarter: length, online: true, openingTeam });
}

function roomStatus(room) {
  if (room.closed) return 'closed';
  if (!room.seats.every(Boolean)) return 'waiting';
  return room.seats.every(seat => seat.stream) ? 'playing' : 'reconnecting';
}

function packet(room, side, includeReplay) {
  const { random, frames, highlights, lastReplay, ...game } = room.game;
  if (game.state === 'pre') {
    game.play = game.possession === side ? room.seats[side].call : 0;
    game.cover = game.possession === side ? 0 : room.seats[side].call;
  }
  const value = {
    room: {
      code: room.code,
      side,
      status: roomStatus(room),
      ready: room.seats.map(seat => Boolean(seat?.ready)),
      connected: room.seats.map(seat => Boolean(seat?.stream)),
      phase: room.phase,
      reason: room.closed || '',
    },
    game,
  };
  if (includeReplay) {
    const best = highlights.filter(h => h.frames).sort((a, b) => b.points - a.points || b.gain - a.gain).slice(0, 3);
    value.replay = { lastReplay, highlights: game.state === 'summary' ? best : [] };
  }
  return value;
}

export function createServer({ now = Date.now, allowedOrigins = ['https://dfe-sunday-broadcast.onrender.com'] } = {}) {
  const rooms = new Map(), rates = new Map();
  const origins = new Set([...allowedOrigins, ...(process.env.FOOTBALL_ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean)]);
  function rate(req, kind, max, windowMs) {
    const address = req.socket.remoteAddress || 'unknown';
    const key = kind + ':' + address, timestamp = now();
    let bucket = rates.get(key);
    if (!bucket || timestamp >= bucket.expires) {
      if (rates.size >= 4096 && !bucket) throw new RequestError(429, 'Online is busy. Try again shortly.');
      bucket = { count: 0, expires: timestamp + windowMs };
      rates.set(key, bucket);
    }
    if (++bucket.count > max) throw new RequestError(429, 'Too many requests. Try again shortly.');
  }

  function setOrigin(req, res) {
    const origin = req.headers.origin;
    if (!origin) return;
    const protocol = process.env.RENDER ? 'https' : 'http';
    if (!origins.has(origin) && origin !== protocol + '://' + req.headers.host) {
      throw new RequestError(403, 'Open the Sunday Broadcast site to play online.');
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Max-Age', '600');
  }

  function publish(room, includeReplay = false) {
    for (let side = 0; side < 2; side++) {
      room.seats[side]?.stream?.send(packet(room, side, includeReplay));
    }
    room.lastPublish = now();
  }

  function closeRoom(room, reason) {
    room.closed = reason;
    rooms.delete(room.code);
    publish(room);
    for (const seat of room.seats) seat?.stream?.end();
  }

  function getRoom(code) {
    const room = rooms.get(code);
    if (!room) throw new RequestError(404, 'This room expired or the code is incorrect.');
    return room;
  }

  function seatFor(req, room) {
    const token = /^Bearer ([a-f0-9]{48})$/.exec(req.headers.authorization || '')?.[1];
    const side = token ? room.seats.findIndex(seat => seat?.token === token) : -1;
    if (side < 0) throw new RequestError(401, 'This tab has no seat in the room.');
    return side;
  }

  function session(room, side) {
    return { code: room.code, side, token: room.seats[side].token, lastSeq: room.seats[side].seq, packet: packet(room, side, true) };
  }

  function createRoom({ quarter, team }) {
    if (rooms.size >= 64) throw new RequestError(503, 'All online fields are in use. Try again shortly.');
    let code;
    do {
      code = Array.from({ length: 6 }, () => roomAlphabet[randomInt(roomAlphabet.length)]).join('');
    } while (rooms.has(code));
    const seats = [null, null];
    const side = team === 1 ? 1 : 0;
    seats[side] = newSeat();
    const length = [60, 120, 180].includes(quarter) ? quarter : 120;
    const room = { code, seats, host: side, length, openingTeam: 0, game: openingGame(length, 0), phase: 1, lastActive: now(), lastPublish: 0 };
    rooms.set(code, room);
    return session(room, side);
  }

  function connect(req, res, room, side) {
    const seat = room.seats[side], previous = seat.stream;
    const gzip = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gzip) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', req.headers.origin ? 'Origin, Accept-Encoding' : 'Accept-Encoding');
    }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
    const writer = gzip ? createGzip({ level: zlib.Z_BEST_SPEED, flush: zlib.Z_SYNC_FLUSH }) : res;
    if (gzip) {
      writer.on('error', () => res.destroy());
      writer.pipe(res);
      res.on('close', () => writer.destroy());
    }
    const stream = {
      send(value) {
        if (res.destroyed || res.writableEnded) return;
        if (res.writableLength + (gzip ? writer.writableLength : 0) > 6 * 1024 * 1024) {
          res.destroy();
          return;
        }
        writer.write('data: ' + JSON.stringify(value) + '\n\n');
      },
      end() { writer.end(); },
    };
    seat.stream = stream;
    seat.input = neutral;
    seat.inputAt = 0;
    if (previous) {
      previous.send({ replaced: true });
      previous.end();
    }
    res.on('close', () => {
      if (seat.stream !== stream) return;
      seat.stream = null;
      seat.disconnectedAt = now();
      seat.input = neutral;
      if (!room.closed) publish(room);
    });
    room.lastActive = now();
    stream.send(packet(room, side, true));
    for (const other of room.seats) {
      if (other?.stream && other !== seat) other.stream.send(packet(room, 1 - side, false));
    }
  }

  function transition(room, resetReplay = false) {
    const game = room.game;
    if (game.state === 'dead') {
      // Retain the same three plays shown on the highlight desk.
      game.highlights = game.highlights.filter(h => h.frames)
        .sort((a, b) => b.points - a.points || b.gain - a.gain).slice(0, 3);
    }
    room.phase++;
    room.pendingPass = null;
    for (const seat of room.seats) {
      if (!seat) continue;
      seat.ready = false;
      seat.call = 0;
      seat.input = neutral;
      seat.inputAt = 0;
    }
    publish(room, resetReplay || room.game.state === 'dead' || room.game.state === 'summary');
  }

  function command(room, side, data) {
    if (data.type === 'leave') {
      closeRoom(room, 'A player left the match.');
      return;
    }
    const seat = room.seats[side], game = room.game;
    if (!seat.stream || roomStatus(room) !== 'playing') throw new RequestError(409, 'Wait for both players to connect.');
    if (data.phase !== room.phase) return;
    room.lastActive = now();
    if (data.type === 'select' && game.state === 'pre') {
      const list = side === game.possession ? PLAYS : DEFENSE;
      if (!Number.isInteger(data.index) || !list[data.index]) throw new RequestError(400, 'Choose a play from your playbook.');
      if (seat.call !== data.index) seat.ready = false;
      seat.call = data.index;
      publish(room);
      return;
    }
    const final = game.state === 'summary' && (game.final ?? game.quarter === 4);
    if ((data.type === 'rematch' && final) || (data.type === 'ready' && game.state !== 'live' && !final)) {
      seat.ready = true;
      if (!room.seats.every(player => player.ready)) {
        publish(room);
        return;
      }
      if (final) {
        room.openingTeam = 1 - room.openingTeam;
        room.game = openingGame(room.length, room.openingTeam);
      } else if (game.state === 'pre') {
        room.seats.forEach((player, team) => game.select(player.call, team));
        game.snap();
      } else game.advance();
      transition(room, final);
      return;
    }
    if (data.type === 'skill' && (game.state === 'live' || game.state === 'pre')) {
      game.skill(side);
      if (game.state === 'pre') publish(room);
      return;
    }
    if (game.state !== 'live') return;
    if (data.type === 'move') {
      if (!Number.isSafeInteger(data.seq) || data.seq <= seat.seq) return;
      seat.seq = data.seq;
      seat.input = normalizeInput(data);
      seat.inputAt = now();
    } else if (data.type === 'pass' && side === game.possession && game.canPass) {
      if (!Number.isInteger(data.index) || data.index < 0 || data.index > 3) return;
      const aim = normalizeInput(data.aim && typeof data.aim === 'object' ? data.aim : {});
      if (!game.pass(data.index, data.bullet === true, side, aim) && game.t < .15) {
        room.pendingPass = { index: data.index, bullet: data.bullet === true, side, aim };
      }
    } else if (data.type === 'dive' && (side !== game.possession || game.kickMeter)) {
      game.action(side);
    }
  }

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
      if (pathname === '/health' || pathname.startsWith('/api/')) {
        setOrigin(req, res);
        if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
        if (req.method === 'GET' && (pathname === '/health' || pathname === '/api/health')) {
          json(res, 200, { ok: true, service: 'sunday-broadcast-matches' });
          return;
        }
        if (req.method === 'POST' && pathname === '/api/rooms') {
          rate(req, 'create', 14, 60000);
          json(res, 201, createRoom(await body(req)));
          return;
        }
        const route = /^\/api\/rooms\/([A-Z2-9]{6})\/(join|rejoin|stream|command)$/.exec(pathname);
        if (!route) throw new RequestError(404, 'That match route was not found.');
        const [, code, operation] = route;
        if (operation === 'join' && req.method === 'POST') rate(req, 'join', 42, 60000);
        const room = getRoom(code);
        if (operation === 'join' && req.method === 'POST') {
          await body(req);
          if (rooms.get(code) !== room) throw new RequestError(404, 'This room expired.');
          const side = 1 - room.host;
          if (room.seats[side]) throw new RequestError(409, 'This room already has two players.');
          room.seats[side] = newSeat();
          room.lastActive = now();
          publish(room);
          json(res, 200, session(room, side));
          return;
        }
        const side = seatFor(req, room);
        if (operation === 'stream' && req.method === 'GET') { connect(req, res, room, side); return; }
        if (req.method !== 'POST') throw new RequestError(405, 'Use a POST request.');
        const data = await body(req);
        if (rooms.get(code) !== room) throw new RequestError(404, 'This room expired.');
        if (operation === 'rejoin') json(res, 200, session(room, side));
        else if (operation === 'command') {
          rate(req, 'command', 240, 1000);
          command(room, side, data);
          json(res, 200, { ok: true });
        } else throw new RequestError(405, 'That request method is unavailable.');
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) throw new RequestError(405, 'Use a GET request.');
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1), file = path.resolve(publicRoot, relative);
      if (!file.startsWith(publicRoot) || relative.split('/').some(part => part.startsWith('.')) || relative.includes('\\')) {
        throw new RequestError(404, 'File not found.');
      }
      const data = await readFile(file).catch(() => { throw new RequestError(404, 'File not found.'); });
      res.writeHead(200, {
        'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Content-Length': data.length,
        'Cache-Control': 'no-cache',
      });
      res.end(req.method === 'HEAD' ? undefined : data);
    } catch (error) {
      if (res.headersSent) { res.end(); return; }
      if (!(error instanceof RequestError) && !(error instanceof URIError)) console.error(error);
      json(res, error.status || (error instanceof URIError ? 400 : 500), {
        error: error instanceof RequestError ? error.message : 'The online field could not complete this request.',
      });
    }
  });
  let lastTick = performance.now(), accumulated = 0, lastCleanup = 0;
  const timer = setInterval(() => {
    const time = now(), tick = performance.now();
    accumulated += Math.min(.1, (tick - lastTick) / 1000);
    lastTick = tick;
    const steps = Math.floor(accumulated / step);
    accumulated -= steps * step;
    for (const room of rooms.values()) {
      const disconnected = room.seats.some(seat => seat && !seat.stream && time - seat.disconnectedAt > reconnectMs);
      if (disconnected || time - room.lastActive > roomIdleMs) {
        closeRoom(room, disconnected ? 'A player did not reconnect in time.' : 'This room expired.');
        continue;
      }
      const game = room.game;
      if (roomStatus(room) === 'playing' && game.state === 'live') {
        const teams = room.seats.map(seat => time - seat.inputAt <= 450 ? seat.input : neutral);
        for (let i = 0; i < steps && game.state === 'live'; i++) {
          if (room.pendingPass && game.t >= .12) {
            const pass = room.pendingPass;
            game.pass(pass.index, pass.bullet, pass.side, pass.aim);
            room.pendingPass = null;
          }
          game.tick(step, { teams });
        }
        if (game.state !== 'live') transition(room);
        else if (time - room.lastPublish >= 42) publish(room);
      } else if (time - room.lastPublish > 8000) publish(room);
    }
    if (time - lastCleanup >= 30000) {
      for (const [key, bucket] of rates) if (bucket.expires <= time) rates.delete(key);
      lastCleanup = time;
    }
  }, 1000 / 60);
  timer.unref();
  server.shutdown = callback => {
    for (const room of rooms.values()) closeRoom(room, 'The online field is restarting.');
    clearInterval(timer);
    server.close(callback);
    server.closeIdleConnections?.();
  };
  server.on('close', () => clearInterval(timer));
  return server;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 4174;
  const server = createServer();
  server.listen(port, '0.0.0.0', () => console.log('Sunday Broadcast listening on ' + port));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.shutdown(() => process.exit(0)));
}
