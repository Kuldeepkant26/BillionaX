/**
 * The only module services import to push realtime events.
 *
 * It holds a mutable `io` reference set once at boot and imports nothing from
 * services or models, so no service can create an import cycle by using it.
 *
 * When no io is attached — seed scripts, reconcile, tests — every emit is a
 * silent no-op. That is why service code needs no conditional guards around
 * emits, and why scripts/seedDemo.js runs unchanged.
 */
let io = null;

export const attachIo = (instance) => {
  io = instance;
};

export const detachIo = () => {
  io = null;
};

export const hasIo = () => io !== null;

export const guestRoom = (guestId) => `guest:${guestId}`;

/**
 * A room of one account, whatever its role.
 *
 * Distinct from guestRoom, which only guests join. This is what lets a
 * PRIVATE message reach one staff account without going through the hotel
 * room that its colleagues also sit in — the support channel's threads are
 * per account, so the property is the wrong unit of delivery.
 *
 * Named from the token's own id in realtime/index.js, never from client input.
 */
export const userRoom = (userId) => `user:${userId}`;
export const hotelRoom = (hotelId) => `hotel:${hotelId}`;

/**
 * The global feed room.
 *
 * Unlike guest: and hotel: this one has no id — there is exactly one feed and
 * every authenticated socket is in it. It is still SERVER-derived (realtime/
 * index.js joins it on connect), so there is still no client "subscribe" event
 * and nothing here is named from client input.
 */
export const FEED_ROOM = "feed";

/**
 * The main-admin room.
 *
 * Like FEED_ROOM this has no id, but for the opposite reason: there is one
 * support queue and every MAIN_ADMIN watches the same one. The name is a
 * constant and membership is decided from the token's role in realtime/
 * index.js, so nothing here is named from client input.
 */
export const ADMIN_ROOM = "admins";

export const emitToGuest = (guestId, event, payload) => {
  if (!io || !guestId) return false;
  io.to(guestRoom(guestId)).emit(event, payload);
  return true;
};

/**
 * Sends to one account's own sockets, across every tab and device it has open.
 *
 * Used for anything private to a person rather than to their hotel — today the
 * support thread echo. Preferred over emitToHotel whenever the payload is not
 * something a colleague should read.
 */
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return false;
  io.to(userRoom(userId)).emit(event, payload);
  return true;
};

export const emitToHotel = (hotelId, event, payload) => {
  if (!io || !hotelId) return false;
  io.to(hotelRoom(hotelId)).emit(event, payload);
  return true;
};

/**
 * Broadcasts to everyone reading the feed.
 *
 * This reaches every connected socket on the network, so what goes through it
 * must be rare and small. Today that is exactly ONE event — feed:post, carrying
 * an id rather than the post — and the bar for adding a second is high:
 *
 *   Likes and comments are deliberately NOT broadcast. A like is the
 *   highest-frequency event in the system and the lowest in value; fanning it
 *   out to every socket is a self-inflicted denial of service. The person who
 *   liked it already has the authoritative count in their own HTTP response,
 *   and everyone else gets it on their next read.
 *
 * If live comments on an open post are ever wanted, the answer is a per-post
 * room joined when the sheet opens and left when it closes — bounded and
 * targeted — not a wider global broadcast.
 */
export const emitToFeed = (event, payload) => {
  if (!io) return false;
  io.to(FEED_ROOM).emit(event, payload);
  return true;
};

/**
 * Broadcasts to every signed-in main admin.
 *
 * Bounded by how few main admins exist, which is what makes a roomful of
 * support traffic acceptable here when the same volume would not be on
 * emitToFeed. It carries the support queue: a guest's message and an admin's
 * reply, so a second admin watching the same inbox sees both.
 */
export const emitToAdmins = (event, payload) => {
  if (!io) return false;
  io.to(ADMIN_ROOM).emit(event, payload);
  return true;
};
