const byId = (id) => document.getElementById(id);

/** The lobby owns presentation; the room authority validates every seat change. */
export class HockeyRoomUI {
  constructor({ network, getOptions, resumeCode = "", onNotice = () => {}, onChanged = () => {} }) {
    this.network = network;
    this.getOptions = getOptions;
    this.onNotice = onNotice;
    this.onChanged = onChanged;
    this.state = null;
    this.seatKey = null;
    this.busy = false;
    const saved = HockeyRoomUI.savedName();
    byId("online-name").value = saved;
    byId("online-code").value = new URLSearchParams(location.search).get("room") || resumeCode || "";
    byId("online-create").onclick = () => this.run(async () => {
      await network.create({ ...getOptions(), name: this.name(), side: 0, mode: "team" });
    });
    byId("online-join").onclick = () => this.run(async () => {
      await network.join(byId("online-code").value, { name: this.name() });
    });
    byId("online-code").addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); byId("online-join").click(); }
    });
    byId("online-side").onchange = () => this.populateSkaters();
    byId("online-control-mode").onchange = () => this.populateSkaters();
    byId("online-seat-save").onclick = () => this.run(() => network.configure({
      name: this.name(), side: Number(byId("online-side").value),
      mode: byId("online-control-mode").value,
      playerId: Number(byId("online-player").value),
    }));
    byId("online-ready").onclick = () => this.run(() => network.ready(!this.me()?.ready));
    byId("online-start").onclick = () => this.run(() => network.start());
    byId("online-leave").onclick = () => this.run(() => network.leave());
    byId("online-copy").onclick = async () => {
      if (!this.state?.room) return;
      const url = new URL(location.href);
      url.searchParams.set("sport", "hockey");
      url.searchParams.set("room", this.state.room.code);
      try {
        await navigator.clipboard.writeText(url.href);
        this.onNotice("Invite link copied. Open it on another device to join.");
      } catch {
        byId("online-status").textContent = `Invite: ${url.href}`;
      }
    };
  }
  static savedName() {
    try { return localStorage.getItem("dfe.hockey.name") || ""; } catch { return ""; }
  }
  name() {
    const name = byId("online-name").value.trim().slice(0, 18) || "Skater";
    try { localStorage.setItem("dfe.hockey.name", name); } catch {}
    return name;
  }
  me() { return this.state?.room?.players.find((seat) => seat.id === this.state.seatId); }
  async run(action) {
    if (this.busy) return;
    this.busy = true;
    byId("online-status").textContent = "Connecting…";
    this.renderButtons();
    try { await action(); }
    catch (error) { byId("online-status").textContent = error.message || "Could not reach this match. Try again."; }
    finally { this.busy = false; this.renderButtons(); this.onChanged(); }
  }
  populateSkaters(preferred) {
    const room = this.state?.room;
    if (!room) return;
    const side = Number(byId("online-side").value);
    const mode = byId("online-control-mode").value;
    const select = byId("online-player");
    const previous = preferred ?? Number(select.value);
    const reserved = new Set(room.players.filter((seat) => seat.id !== this.state.seatId).map((seat) => seat.playerId));
    const skaters = room.lineups.filter((p) => p.side === side && !p.keeper && !reserved.has(p.id));
    select.replaceChildren(...skaters.map((p) => {
      const option = document.createElement("option");
      option.value = p.id;
      option.textContent = `${p.number} · ${p.name} · ${p.role}`;
      return option;
    }));
    if (skaters.some((p) => p.id === previous)) select.value = previous;
    select.disabled = mode !== "skater" || room.status !== "lobby" || this.busy;
  }
  render(state) {
    this.state = state;
    const room = state.room;
    const renderKey = JSON.stringify([room?.code, room?.status, room?.reason, room?.players, state.connected]);
    if (renderKey === this.renderKey) return;
    this.renderKey = renderKey;
    const connected = !!room && room.status !== "closed";
    byId("online-room").hidden = !connected;
    document.querySelector(".online-connect").hidden = connected;
    if (!connected) {
      this.seatKey = null;
      byId("online-status").textContent = room?.reason || "Use an invite link or a match code. Up to four players, on either side.";
      this.renderButtons();
      this.onChanged();
      return;
    }
    byId("online-room-code").textContent = room.code;
    const me = this.me();
    const key = `${room.code}:${me?.id}:${me?.side}:${me?.mode}:${me?.playerId}`;
    const occupiedKey = room.players.map((seat) => `${seat.id}:${seat.playerId}`).join("|");
    if (key !== this.seatKey) {
      byId("online-side").value = me?.side ?? 0;
      byId("online-control-mode").value = me?.mode || "team";
      this.seatKey = key;
      this.populateSkaters(me?.playerId);
    } else if (occupiedKey !== this.occupiedKey) this.populateSkaters();
    this.occupiedKey = occupiedKey;
    for (const option of byId("online-side").options) {
      const team = room.teams[Number(option.value)];
      option.textContent = `${Number(option.value) ? "Away" : "Home"} · ${team.short || team.name}`;
    }
    const rows = room.players.map((seat) => {
      const row = document.createElement("li");
      row.className = "online-seat";
      row.dataset.side = seat.side;
      const description = document.createElement("span");
      const player = room.lineups.find((p) => p.id === seat.playerId);
      description.textContent = `${seat.name}${seat.id === state.seatId ? " (you)" : ""}${seat.id === room.hostId ? " · host" : ""} — ${room.teams[seat.side].short} · ${seat.mode === "skater" ? player?.name || "Locked skater" : "Switch skaters"}`;
      const status = document.createElement("span");
      status.className = `seat-status${seat.ready ? " ready" : ""}`;
      status.textContent = !seat.connected ? "Reconnecting" : seat.ready ? "Ready" : "Choosing";
      row.append(description, status);
      return row;
    });
    while (rows.length < 4) {
      const row = document.createElement("li");
      row.className = "online-seat";
      row.textContent = "Open spot · invite a friend";
      rows.push(row);
    }
    byId("online-seats").replaceChildren(...rows);
    byId("online-status").textContent = !state.connected
      ? "Reconnecting to the match… Your spot is held briefly."
      : room.status === "paused" ? room.reason || "Match paused."
      : room.status === "lobby" ? "Choose your side and control mode, save your spot, then mark ready. One switching player per side; teammates lock a skater."
      : room.status === "finished" ? "Match complete. Create a new room for the next game."
      : "Match in progress.";
    this.renderButtons();
    this.onChanged();
  }
  renderButtons() {
    const room = this.state?.room, me = this.me();
    const lobby = room?.status === "lobby";
    byId("online-create").disabled = this.busy;
    byId("online-join").disabled = this.busy;
    for (const id of ["online-side", "online-control-mode", "online-seat-save", "online-ready"])
      byId(id).disabled = this.busy || !lobby;
    byId("online-player").disabled = this.busy || !lobby || byId("online-control-mode").value !== "skater";
    byId("online-ready").textContent = me?.ready ? "NOT READY" : "I’M READY";
    byId("online-ready").setAttribute("aria-pressed", String(!!me?.ready));
    byId("online-start").hidden = !!room && room.hostId !== this.state.seatId;
    byId("online-start").disabled = this.busy || !lobby || room.players.length < 2 || !room.players.every((seat) => seat.ready && seat.connected);
    byId("online-leave").disabled = this.busy;
  }
}
