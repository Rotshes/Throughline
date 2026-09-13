import { useEffect, useRef } from "react";

/**
 * Drift a horizontal rail sideways, slowly, and stop when anyone is using it.
 *
 * The point is that the front page should look alive rather than printed. The
 * risk is everything else about moving content, so this stops for more reasons
 * than it starts for.
 *
 * IT STOPS WHEN:
 *
 *   the pointer is over it        — you cannot read a card that is sliding away
 *   something inside has focus    — otherwise tabbing to the fourth card walks
 *                                   the focus ring off the screen while you
 *                                   look at it, which is the version of this
 *                                   that actually hurts people
 *   a finger is on it             — a touch drag and a script writing scrollLeft
 *                                   sixty times a second fight each other, and
 *                                   the script wins, which feels broken
 *   the tab is hidden             — no reason to burn a frame loop nobody sees
 *   the row is not scrollable     — five cards that already fit have nowhere to
 *                                   drift to, and a rail that twitches in place
 *                                   looks like a bug
 *   prefers-reduced-motion is set — and NOT because the global CSS rule covers
 *                                   it. That rule zeroes animation durations;
 *                                   this is JavaScript writing a scroll offset
 *                                   and no stylesheet can reach it. Motion
 *                                   sensitivity is the one preference where
 *                                   getting it wrong makes somebody ill.
 *
 * THE LOOP IS SEAMLESS, WHICH IS WHY THE CALLER DUPLICATES THE CONTENT.
 *
 *   The rail renders its games twice. When the scroll passes the halfway mark,
 *   half the width is subtracted — landing on the identical pixel, because the
 *   second copy is the first copy. No jump, no rubber-band back to the start.
 *   A rail that scrolls to the end and snaps home draws the eye to exactly the
 *   moment you did not want noticed.
 *
 * Speed is in pixels per second because that is the unit a person perceives.
 * A card is about 186px wide, so 14px/s is roughly one card every thirteen
 * seconds: visible if you watch for it, invisible if you are reading.
 */
export function useDrift(speedPxPerSecond = 14) {
  const ref = useRef(null);
  const paused = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (reduced?.matches) return;

    let frame = 0;
    let last = 0;
    // Fractional pixels accumulate here. `scrollLeft` rounds, so adding 0.23 to
    // it sixty times a second adds nothing at all — the rail would simply never
    // move, which is a very quiet way for this to fail.
    let offset = el.scrollLeft;

    const step = now => {
      frame = requestAnimationFrame(step);
      const dt = last ? Math.min((now - last) / 1000, 0.1) : 0;
      last = now;

      if (paused.current || document.hidden) return;

      // Half, because the content is rendered twice.
      const loopWidth = el.scrollWidth / 2;
      if (loopWidth < 1 || el.scrollWidth <= el.clientWidth + 1) return;

      offset += speedPxPerSecond * dt;
      if (offset >= loopWidth) offset -= loopWidth;
      el.scrollLeft = offset;
    };

    // A manual scroll has to be adopted rather than fought. Without this the
    // next frame would yank the rail back to wherever the script had got to.
    const onScroll = () => {
      if (paused.current) offset = el.scrollLeft;
    };

    const pause = () => { paused.current = true; };
    const resume = () => { paused.current = false; };

    el.addEventListener("pointerenter", pause);
    el.addEventListener("pointerleave", resume);
    el.addEventListener("focusin", pause);
    el.addEventListener("focusout", resume);
    el.addEventListener("touchstart", pause, { passive: true });
    el.addEventListener("touchend", resume, { passive: true });
    el.addEventListener("scroll", onScroll, { passive: true });

    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      el.removeEventListener("pointerenter", pause);
      el.removeEventListener("pointerleave", resume);
      el.removeEventListener("focusin", pause);
      el.removeEventListener("focusout", resume);
      el.removeEventListener("touchstart", pause);
      el.removeEventListener("touchend", resume);
      el.removeEventListener("scroll", onScroll);
    };
  }, [speedPxPerSecond]);

  return ref;
}
