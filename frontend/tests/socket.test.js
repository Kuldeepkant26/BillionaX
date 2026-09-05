/**
 * The shared socket instance.
 *
 * This pins the bug that made the hotel panel's "Awaiting payment" list stop
 * updating, which survived one round of fixes because every individual piece
 * looked right:
 *
 *   connectSocket() guarded on `socket?.connected`. A socket that is still
 *   handshaking — or one reauthSocket has momentarily dropped — reports
 *   connected === false, so a SECOND caller fell through to disconnectSocket(),
 *   which calls removeAllListeners(), and built a replacement. The first
 *   caller's handlers were torn off a socket that had already been discarded.
 *
 * It only became reachable when a second hook started calling connectSocket()
 * on the same mount (useHotelBillRealtime, alongside useRealtime). Nothing
 * threw; events simply stopped arriving.
 *
 * The module reads Vite env and socket.io-client at import time, so the two
 * functions are re-implemented here against a fake io() and checked against
 * the source instead. That keeps the invariant — ONE socket, listeners survive
 * — enforced without a DOM or a bundler.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "../src/realtime/socket.js"), "utf8");

/** Mirrors src/realtime/socket.js. Kept honest by the source checks below. */
const makeModule = () => {
  let socket = null;
  let created = 0;

  const fakeIo = (opts) => ({
    id: ++created,
    connected: false,
    auth: opts.auth,
    listeners: new Set(),
    on(e) { this.listeners.add(e); },
    off(e) { this.listeners.delete(e); },
    removeAllListeners() { this.listeners.clear(); },
    disconnect() { this.connected = false; return this; },
    connect() { this.connected = true; return this; },
  });

  return {
    get socket() { return socket; },
    get created() { return created; },
    connectSocket(token = "t1") {
      if (socket) return socket;
      socket = fakeIo({ auth: { token } });
      return socket;
    },
    disconnectSocket() {
      if (!socket) return;
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    },
    reauthSocket(token) {
      if (!socket || !token) return;
      if (socket.auth?.token === token) return;
      socket.auth = { token };
      socket.disconnect().connect();
    },
  };
};

const NOTIF = ["connect", "notification:new", "notification:read", "auth:expiring"];
const BILL = ["connect", "bill:new", "bill:paid", "bill:cancelled", "bill:expired"];

let m;
beforeEach(() => { m = makeModule(); });

describe("connectSocket returns one shared instance", () => {
  it("does not build a second socket while the first is still connecting", () => {
    // The exact failure: both hooks run in the same tick, before connect().
    const a = m.connectSocket();
    const b = m.connectSocket();

    assert.equal(m.created, 1, `built ${m.created} sockets for one mount`);
    assert.equal(a, b, "the two hooks are holding different sockets");
  });

  it("keeps BOTH hooks' listeners attached after a panel mount", () => {
    const a = m.connectSocket();
    NOTIF.forEach((e) => a.on(e));      // useRealtime
    const b = m.connectSocket();
    BILL.forEach((e) => b.on(e));       // useHotelBillRealtime

    for (const event of [...NOTIF, ...BILL]) {
      assert.ok(
        m.socket.listeners.has(event),
        `${event} was unsubscribed — this is why the panel stopped updating`
      );
    }
  });

  it("survives a second hook re-running its effect", () => {
    const a = m.connectSocket();
    NOTIF.forEach((e) => a.on(e));
    const b = m.connectSocket();
    BILL.forEach((e) => b.on(e));

    // useHotelBillRealtime's deps change: it cleans up and re-subscribes.
    BILL.forEach((e) => m.socket.off(e));
    const c = m.connectSocket();
    BILL.forEach((e) => c.on(e));

    assert.equal(m.created, 1, "an effect re-run replaced the socket");
    for (const event of NOTIF) {
      assert.ok(m.socket.listeners.has(event), `${event} was collateral damage`);
    }
  });
});

describe("reauthSocket keeps the same instance", () => {
  it("ignores a token that has not changed", () => {
    // The accessToken effect fires on MOUNT too, so this used to drop a socket
    // that had only just been opened — widening the not-yet-connected window
    // the old connectSocket guard mishandled.
    m.connectSocket("t1");
    m.socket.connect();
    m.reauthSocket("t1");

    assert.equal(m.socket.connected, true, "an unchanged token dropped the socket");
  });

  it("re-handshakes on a real rotation without losing listeners", () => {
    const s = m.connectSocket("t1");
    [...NOTIF, ...BILL].forEach((e) => s.on(e));

    m.reauthSocket("t2");

    assert.equal(m.socket.auth.token, "t2");
    assert.equal(m.created, 1, "the rotation replaced the socket");
    for (const event of ["bill:paid", "bill:cancelled", "notification:new"]) {
      assert.ok(m.socket.listeners.has(event), `${event} did not survive the rotation`);
    }
  });
});

describe("disconnectSocket is still a real teardown", () => {
  it("clears the instance so logout does not leak the previous session", () => {
    const s = m.connectSocket();
    [...NOTIF, ...BILL].forEach((e) => s.on(e));

    m.disconnectSocket();
    assert.equal(m.socket, null);

    const fresh = m.connectSocket();
    assert.equal(m.created, 2, "a new session must get a new socket");
    assert.equal(fresh.listeners.size, 0);
  });
});

describe("the source still implements what is modelled above", () => {
  it("guards on the socket EXISTING, not on it being connected", () => {
    // The regression in one assertion. `socket?.connected` here is the bug.
    assert.match(
      source,
      /if \(socket\) return socket;/,
      "connectSocket no longer returns an existing socket unconditionally"
    );
    assert.ok(
      !/if \(socket\?\.connected\) return socket;/.test(source),
      "the connected-guard is back — a second caller will destroy the first's listeners"
    );
  });

  it("does not tear down an existing socket inside connectSocket", () => {
    // Comments are stripped first: the doc comment on connectSocket EXPLAINS
    // the disconnectSocket() bug, so a naive substring match reads the
    // explanation as the defect it warns about.
    const fn = source
      .slice(
        source.indexOf("export const connectSocket"),
        source.indexOf("export const disconnectSocket")
      )
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");

    assert.ok(
      !fn.includes("disconnectSocket()"),
      "connectSocket destroys a live socket, unsubscribing whoever already holds it"
    );
  });

  it("skips a reauth when the token is unchanged", () => {
    assert.match(source, /if \(socket\.auth\?\.token === token\) return;/);
  });

  it("reauths the same instance rather than replacing it", () => {
    const fn = source.slice(source.indexOf("export const reauthSocket"));
    assert.match(fn, /socket\.disconnect\(\)\.connect\(\)/);
    assert.ok(!fn.includes("io("), "reauth builds a new socket, losing every listener");
  });
});
