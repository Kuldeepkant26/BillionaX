/**
 * Shared formatting for the two ends of the support conversation — the guest's
 * chat screen and the admin panel's inbox.
 *
 * Both render the same messages from opposite sides, so a divergence here
 * would show up as the two of them disagreeing about what day something was
 * said. One copy is the only way that stays true.
 */

const sameDay = (a, b) => a.toDateString() === b.toDateString();

/** "Today" / "Yesterday" / "4 Mar 2026", for the separators between days. */
export const dayLabel = (iso) => {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
};

/** The time under a bubble. */
export const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });

/**
 * Annotates each message with the day separator that should precede it.
 *
 * Done in one pass BEFORE rendering rather than by tracking "the last day I
 * drew" inside the map. That tracking works, but it is a variable mutated
 * during render — which React's rules rightly reject, because a re-render that
 * starts from a stale value silently draws the separators in the wrong places.
 * Deriving it up front makes the output a pure function of the input.
 */
export const withDayBreaks = (messages = []) => {
  let previous = null;

  return messages.map((message) => {
    const day = dayLabel(message.createdAt);
    const startsDay = day !== previous;
    previous = day;
    return { message, day, startsDay };
  });
};

/**
 * Resizes a growing textarea to fit its content.
 *
 * Exported so the send handlers can call it after clearing the draft: the
 * inline height set while typing does NOT go away when the value does, so a
 * sent message would otherwise leave a tall empty box behind. Setting "auto"
 * first lets scrollHeight shrink as well as grow.
 */
export const autoGrow = (el) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = `${el.scrollHeight}px`;
};
