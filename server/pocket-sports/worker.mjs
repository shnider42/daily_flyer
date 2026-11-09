import readline from "node:readline";
import { performance } from "node:perf_hooks";
import { HockeyRooms, RoomError } from "./rooms.mjs";

const rooms = new HockeyRooms({ maxRooms: Math.max(1, Math.min(16, Number(process.env.HOCKEY_MAX_ROOMS) || 8)) });
const lines = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
let last = performance.now(), accumulator = 0;
const timer = setInterval(() => {
  const now = performance.now();
  accumulator += Math.min(0.12, Math.max(0, (now - last) / 1000)); last = now;
  try {
    while (accumulator >= 1 / 60) { rooms.step(1 / 60); accumulator -= 1 / 60; }
  } catch {
    // A failed authority must never keep serving a partly advanced match.
    rooms.rooms.clear(); accumulator = 0;
  }
}, 1000 / 60);
lines.on("line", line => {
  let request;
  try {
    if (line.length > 20000) throw new RoomError("Room request is too large.", 413);
    request = JSON.parse(line);
    const result = rooms.request(request.payload);
    process.stdout.write(JSON.stringify({ id: request.id, result }) + "\n");
  } catch (error) {
    const known = error instanceof RoomError;
    process.stdout.write(JSON.stringify({ id: request?.id ?? null, error: {
      status: known ? error.status : 503,
      code: known ? error.code : "AUTHORITY_ERROR",
      message: known ? error.message : "The hockey authority could not complete that request. Reconnect or create a new room.",
    } }) + "\n");
  }
});
lines.on("close", () => { clearInterval(timer); process.exit(0); });
for (const signal of ["SIGINT", "SIGTERM"]) process.on(signal, () => { clearInterval(timer); process.exit(0); });
