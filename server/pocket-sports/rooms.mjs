import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync } from "node:fs";
import { Match, ENGINE_VERSION } from "../../daily_flyer/themes/pocket_sports_assets/core/engine.js";

export const PROTOCOL = 1;
export const INPUT_TTL = 350;
export const CONNECTION_TTL = 3000;
export const RECONNECT_TTL = 60000;
const ACTIONS = new Set([
  "hockey-pass", "hockey-shot", "hockey-dump", "hockey-saucer",
  "hockey-poke", "hockey-hit", "switch",
]);
const catalogue = JSON.parse(readFileSync(new URL("../../daily_flyer/themes/pocket_sports_assets/data/teams-hockey.json", import.meta.url), "utf8"));
const teamById = new Map(catalogue.teams.map(team => [team.id, team]));
const finite = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const clamp = (value, lo, hi) => Math.max(lo, Math.min(hi, value));
const tokenMatches = (a, b) => {
  if (typeof b !== "string") return false;
  const left = Buffer.from(a), right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
const cleanName = value => (typeof value === "string" ? value : "Skater").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 24) || "Skater";
const neutral = () => ({ x: 0, y: 0, sprint: false, shotHeld: false, dumpHeld: false, fightHeld: false });
export function safeInput(value = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) value = {};
  const x = clamp(finite(value.x), -1, 1), y = clamp(finite(value.y), -1, 1);
  const n = Math.max(1, Math.hypot(x, y));
  return { x: x / n, y: y / n, sprint: value.sprint === true,
    shotHeld: value.shotHeld === true, dumpHeld: value.dumpHeld === true,
    fightHeld: value.fightHeld === true };
}
export class RoomError extends Error {
  constructor(message, status = 400, code = "INVALID_REQUEST") {
    super(message); this.status = status; this.code = code;
  }
}

// One authority owns all clocks, movement, puck contact, penalties and scoring.
// Clients submit bounded inputs, never player positions or scores.
export class HockeyRooms {
  constructor({ now = () => Date.now(), maxRooms = 8, matchClass = Match } = {}) {
    this.now = now; this.maxRooms = maxRooms; this.Match = matchClass;
    this.rooms = new Map(); this.shuttingDown = false; this.replySequence = 0;
  }
  newSeat(room, options = {}) {
    const seat = {
      id: randomBytes(6).toString("hex"), token: randomBytes(24).toString("base64url"),
      name: cleanName(options.name), side: options.side === 1 ? 1 : 0,
      mode: options.mode === "skater" ? "skater" : "team", playerId: null,
      ready: false, lastSeen: this.now(), disconnectedAt: null,
      seq: -1, appliedSeq: -1, actionSeq: -1, lastInput: 0,
      input: neutral(), commands: [], holds: {}, released: {},
      actionWindow: 0, actionCount: 0,
    };
    this.assignPlayer(room, seat, options.playerId);
    return seat;
  }
  assignPlayer(room, seat, requested) {
    if (seat.mode === "team" && room.players.some(p => p.id !== seat.id && p.side === seat.side && p.mode === "team"))
      throw new RoomError("That side already has a team controller. Choose Skater to play alongside them.", 409, "TEAM_CONTROLLER_TAKEN");
    const used = new Set(room.players.filter(p => p.id !== seat.id).map(p => p.playerId));
    const choices = room.lineups.filter(p => p.side === seat.side && !p.keeper && !used.has(p.id));
    if (!choices.length) throw new RoomError("That team has no available skater. Choose the other side.", 409);
    const candidate = choices.find(p => p.id === requested);
    if (seat.mode === "skater" && requested != null && !candidate)
      throw new RoomError("That skater is already controlled or belongs to the other team.", 409);
    seat.playerId = candidate?.id ?? choices.find(p => p.id === seat.playerId)?.id ?? choices.at(-1).id;
  }
  create(options = {}) {
    this.prune();
    if (this.shuttingDown || this.rooms.size >= this.maxRooms)
      throw new RoomError("All hockey rooms are busy. Try again shortly.", 503, "ROOMS_BUSY");
    const homeTeamId = options.homeTeamId ?? options.home;
    const awayTeamId = options.awayTeamId ?? options.away;
    if (!teamById.has(homeTeamId) || !teamById.has(awayTeamId) || homeTeamId === awayTeamId)
      throw new RoomError("Choose two different NHL teams.");
    const config = { homeTeamId, awayTeamId,
      difficulty: ["casual", "club", "pro"].includes(options.difficulty) ? options.difficulty : "club",
      duration: [45, 90, 180].includes(Number(options.duration)) ? Number(options.duration) : 45 };
    const teams = [teamById.get(homeTeamId), teamById.get(awayTeamId)];
    const preview = new this.Match({ sport: "hockey", home: teams[0], away: teams[1] });
    let code;
    do { code = randomBytes(4).toString("hex").slice(0, 6).toUpperCase(); } while (this.rooms.has(code));
    const room = { code, config, teams, hostId: null, players: [], game: null,
      lineups: preview.players.map(({ id, side, slot, name, number, role, keeper }) => ({ id, side, slot, name, number, role, keeper })),
      status: "lobby", reason: "Choose sides and control styles, then mark ready.",
      created: this.now(), lastActivity: this.now(), changed: this.now(), tick: 0,
      matchId: null, eventId: 0, events: [], seenEvents: new WeakSet() };
    const seat = this.newSeat(room, options);
    room.hostId = seat.id; room.players.push(seat); this.rooms.set(code, room);
    return this.reply(room, seat, true);
  }
  find(code) {
    const key = typeof code === "string" ? code.trim().toUpperCase() : "";
    const room = this.rooms.get(key);
    if (!room) throw new RoomError("That hockey room has ended or does not exist. Ask for a new code.", 404, "ROOM_ENDED");
    return room;
  }
  authenticate(room, token) {
    const seat = room.players.find(p => tokenMatches(p.token, token));
    if (!seat) throw new RoomError("This room needs the private reconnect pass from your own tab.", 403, "INVALID_TOKEN");
    if (seat.disconnectedAt != null && this.now() - seat.disconnectedAt > RECONNECT_TTL)
      throw new RoomError("Your reconnect window expired. Create a new room.", 410, "ROOM_ENDED");
    seat.lastSeen = this.now(); seat.disconnectedAt = null; room.lastActivity = this.now();
    return seat;
  }
  join(code, options = {}) {
    const room = this.find(code);
    if (typeof options.token === "string") {
      const seat = this.authenticate(room, options.token);
      seat.input = neutral(); seat.commands = []; seat.holds = {}; seat.released = {};
      if (room.game && room.status === "playing") this.pause(room, "A player reconnected. Everyone chooses Resume when ready.");
      return this.reply(room, seat, true);
    }
    if (room.status !== "lobby" || room.players.length >= 4)
      throw new RoomError(room.status === "lobby" ? "This room already has four players." : "This match has already started. Use your reconnect pass or create another room.", 409);
    const side = options.side === 0 || options.side === 1 ? options.side
      : room.players.filter(p => p.side === 0).length <= room.players.filter(p => p.side === 1).length ? 0 : 1;
    const mode = options.mode ?? (room.players.some(p => p.side === side && p.mode === "team") ? "skater" : "team");
    const seat = this.newSeat(room, { ...options, side, mode });
    room.players.push(seat); room.players.forEach(p => { p.ready = false; });
    return this.reply(room, seat, true);
  }
  configure(room, seat, options) {
    if (room.status !== "lobby") throw new RoomError("Choose your side and control style before the match starts.", 409);
    const next = { ...seat, side: options.side === 0 || options.side === 1 ? options.side : seat.side,
      mode: ["team", "skater"].includes(options.mode) ? options.mode : seat.mode,
      name: options.name == null ? seat.name : cleanName(options.name) };
    this.assignPlayer(room, next, options.playerId);
    Object.assign(seat, { side: next.side, mode: next.mode, playerId: next.playerId, name: next.name });
    room.players.forEach(p => { p.ready = false; });
  }
  start(room, seat) {
    if (seat.id !== room.hostId) throw new RoomError("The room creator starts the match.", 403);
    if (room.status !== "lobby" && room.status !== "finished") throw new RoomError("The match is already underway.", 409);
    if (room.players.length < 2) throw new RoomError("A friend needs to join before this private match starts.", 409);
    if (!room.players.every(p => p.ready && this.connected(p))) throw new RoomError("Every player must be connected and ready.", 409);
    const c = room.config;
    const game = new this.Match({ sport: "hockey", home: room.teams[0], away: room.teams[1],
      difficulty: c.difficulty, seconds: c.duration, seed: randomBytes(4).readUInt32LE(), controlMode: "touch" });
    game.setControllers(room.players.map(p => ({ id: p.id, side: p.side, mode: p.mode, playerId: p.playerId })), null);
    room.game = game; room.status = "playing"; room.reason = ""; room.changed = this.now();
    room.tick = 0; room.matchId = randomBytes(8).toString("hex");
    room.eventId = 0; room.events = []; room.seenEvents = new WeakSet();
    for (const p of room.players) this.clearSeatInput(p);
  }
  clearSeatInput(seat) {
    seat.ready = false; seat.input = neutral(); seat.commands = [];
    seat.holds = {}; seat.released = {}; seat.lastInput = this.now();
  }
  pause(room, reason = "Match paused. Everyone chooses Resume when ready.") {
    if (!room.game || room.status === "finished") return;
    room.status = "paused"; room.reason = reason; room.changed = this.now();
    room.players.forEach(p => this.clearSeatInput(p));
  }
  resume(room, seat) {
    if (room.status !== "paused") return;
    seat.ready = true;
    if (room.players.every(p => p.ready && this.connected(p))) {
      room.status = "playing"; room.reason = ""; room.changed = this.now();
      room.players.forEach(p => this.clearSeatInput(p));
    }
  }
  connected(seat) { return this.now() - seat.lastSeen <= CONNECTION_TTL; }
  receiveInput(room, seat, message) {
    if (!Number.isSafeInteger(message.seq) || message.seq <= seat.seq) return;
    seat.seq = message.seq; seat.lastInput = this.now();
    const value = room.status === "playing" ? safeInput(message.input) : neutral();
    const actorId = room.game?.controllers?.find(p => p.id === seat.id)?.playerId;
    const actor = room.game?.players[actorId];
    const context = actor ? room.game.puckControlContext(actor) : null;
    for (const name of ["shot", "dump"]) {
      const held = value[`${name}Held`] && actor && room.game.canPlayPuck(actor);
      if (held && (!seat.holds[name] || seat.holds[name].context !== context))
        seat.holds[name] = { started: this.now(), actorId, context };
      else if (!held && seat.holds[name]) {
        const old = seat.holds[name];
        if (context === old.context) seat.released[name] = { seconds: (this.now() - old.started) / 1000, actorId: old.actorId, context, at: this.now() };
        else delete seat.released[name];
        delete seat.holds[name];
      }
    }
    seat.input = value;
  }
  receiveActions(room, seat, actions) {
    if (!Array.isArray(actions) || actions.length > 6 || room.status !== "playing") return;
    if (this.now() - seat.actionWindow > 1000) { seat.actionWindow = this.now(); seat.actionCount = 0; }
    for (const action of actions) {
      if (!action || !Number.isSafeInteger(action.seq) || action.seq <= seat.actionSeq) continue;
      seat.actionSeq = action.seq;
      if (!ACTIONS.has(action.name) || ++seat.actionCount > 18 || seat.commands.length >= 8) continue;
      const actorId = room.game.controllers.find(c => c.id === seat.id)?.playerId;
      const context = room.game.puckControlContext(room.game.players[actorId]);
      let heldSeconds = 0;
      const charge = action.name === "hockey-shot" ? "shot" : action.name === "hockey-dump" ? "dump" : null;
      if (charge) {
        const held = seat.holds[charge], released = seat.released[charge];
        if (context && held?.context === context) heldSeconds = (this.now() - held.started) / 1000;
        else if (context && released?.context === context && this.now() - released.at < 500) heldSeconds = released.seconds;
        delete seat.holds[charge]; delete seat.released[charge];
      }
      seat.commands.push({ name: action.name, charge, context, input: safeInput(action.input || seat.input),
        power: clamp(heldSeconds / (charge === "dump" ? 1.4 : 0.85), charge === "dump" ? 0.08 : 0.22, 1),
        details: { heldSeconds: clamp(heldSeconds, 0, 4) } });
    }
  }
  request(message) {
    if (!message || typeof message !== "object" || Array.isArray(message)) throw new RoomError("Invalid room request.");
    if (message.op === "health") return { ok: true, protocol: PROTOCOL, engineVersion: ENGINE_VERSION,
      activeRooms: this.rooms.size, maxRooms: this.maxRooms, maxPlayers: 4, authority: "server" };
    if (message.protocol != null && message.protocol !== PROTOCOL) throw new RoomError("Refresh the game to use the current multiplayer version.", 409, "VERSION_MISMATCH");
    if (message.op === "create") return this.create(message);
    if (message.op === "join") return this.join(message.code, message);
    const room = this.find(message.code), seat = this.authenticate(room, message.token);
    if (message.op === "configure") this.configure(room, seat, message);
    else if (message.op === "ready") {
      if (room.status === "lobby" || room.status === "finished") seat.ready = message.ready !== false;
      else if (room.status === "paused") this.resume(room, seat);
    } else if (message.op === "start") this.start(room, seat);
    else if (message.op === "pause") this.pause(room);
    else if (message.op === "resume") this.resume(room, seat);
    else if (message.op === "leave") {
      if (room.game) this.rooms.delete(room.code);
      else {
        room.players = room.players.filter(p => p !== seat);
        if (!room.players.length) this.rooms.delete(room.code);
        else { room.hostId = room.players[0].id; room.players.forEach(p => { p.ready = false; }); }
      }
      return { ok: true, closed: true, reason: "You left the hockey room." };
    } else if (message.op !== "poll") throw new RoomError("Unknown room action.");
    if (message.op === "poll") {
      this.receiveInput(room, seat, message);
      this.receiveActions(room, seat, message.actions);
    }
    return this.reply(room, seat);
  }
  collectEvents(room) {
    for (const event of room.game.events) if (!room.seenEvents.has(event)) {
      room.seenEvents.add(event); room.events.push({ ...event, networkId: ++room.eventId });
    }
    room.events = room.events.slice(-50);
  }
  step(dt) {
    for (const room of this.rooms.values()) {
      for (const p of room.players) if (!this.connected(p) && p.disconnectedAt == null) {
        p.disconnectedAt = this.now(); p.input = neutral(); p.holds = {}; p.released = {};
        if (room.status === "playing") this.pause(room, "A connection stalled. Places are held for 60 seconds; everyone chooses Resume after reconnecting.");
      }
      if (room.status !== "playing") continue;
      const inputs = {};
      for (const p of room.players) {
        if (this.now() - p.lastInput > INPUT_TTL) {
          p.input = neutral(); p.commands = []; p.holds = {}; p.released = {};
        }
        inputs[p.id] = p.input;
        for (const command of p.commands.splice(0)) {
          if (command.charge) {
            const actorId = room.game.controllers.find(c => c.id === p.id)?.playerId;
            if (room.game.puckControlContext(room.game.players[actorId]) !== command.context) continue;
          }
          room.game.controllerAction(p.id, command.name, command.input, command.power, command.details);
        }
      }
      room.game.step(dt, neutral(), inputs);
      room.tick++;
      for (const p of room.players) {
        p.appliedSeq = p.seq;
        const c = room.game.controllers.find(c => c.id === p.id);
        if (c) p.playerId = c.playerId;
      }
      this.collectEvents(room);
      if (room.game.phase === "finished") {
        room.status = "finished"; room.reason = "Final. Leave this room to create another match.";
        room.changed = this.now(); room.players.forEach(p => this.clearSeatInput(p));
      }
    }
    this.prune();
  }
  prune() {
    const now = this.now();
    for (const room of this.rooms.values()) {
      if (now - room.created > 2 * 60 * 60 * 1000 ||
          room.status === "lobby" && now - room.lastActivity > 10 * 60 * 1000 ||
          room.status === "finished" && now - room.lastActivity > 3 * 60 * 1000 ||
          room.players.some(p => p.disconnectedAt != null && now - p.disconnectedAt > RECONNECT_TTL))
        this.rooms.delete(room.code);
    }
  }
  reply(room, seat, includeToken = false) {
    const roomData = { code: room.code, status: room.status, hostId: room.hostId, reason: room.reason,
      config: { ...room.config }, teams: room.teams, lineups: room.lineups,
      players: room.players.map(p => ({ id: p.id, name: p.name, side: p.side, mode: p.mode,
        playerId: p.playerId, ready: p.ready, connected: this.connected(p) })) };
    const state = room.game ? JSON.parse(JSON.stringify(room.game)) : null;
    if (state) state.events = room.events;
    return { ok: true, protocol: PROTOCOL, room: roomData, seatId: seat.id,
      ...(includeToken ? { token: seat.token } : {}), matchId: room.matchId,
      state, ack: seat.appliedSeq, inputSeq: seat.seq, actionAck: seat.actionSeq, replySeq: ++this.replySequence, tick: room.tick, serverTime: this.now() };
  }
}
