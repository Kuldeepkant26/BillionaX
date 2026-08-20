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
export const hotelRoom = (hotelId) => `hotel:${hotelId}`;

export const emitToGuest = (guestId, event, payload) => {
  if (!io || !guestId) return false;
  io.to(guestRoom(guestId)).emit(event, payload);
  return true;
};

export const emitToHotel = (hotelId, event, payload) => {
  if (!io || !hotelId) return false;
  io.to(hotelRoom(hotelId)).emit(event, payload);
  return true;
};
