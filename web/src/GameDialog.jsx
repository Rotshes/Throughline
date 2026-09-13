import { useEffect, useRef, useState } from "react";
import { fetchGame } from "./api.js";

/**
 * One game, opened from a card.
 *
 * A native <dialog> rather than a div with a high z-index. `showModal()` gives
 * the focus trap, the Escape key, the inert background and the backdrop for
 * free, and every one of those is a thing a hand-rolled modal gets wrong. The
 * only behaviour written here is closing on a backdrop click, which the element
 * does not do by itself.
 *
 * Everything in this panel is the catalogue's. No model call is made to open it
 * and nothing here is an argument — the case for a game is written in the
 * shortlist, where it is gated. A panel that started making claims would need
 * gates of its own, so it does not.
 */
export default function GameDialog({ game, status, busy, onAdd, onClose }) {
  const ref = useRef(null);
  const [state, setState] = useState({ status: "loading" });
  const [shown, setShown] = useState(0);

  // `game` is the card that was clicked: an id, a title, an image. Enough to
  // draw the panel immediately while the full record is fetched, so opening one
  // never shows an empty box.
  const id = game?.id;

  useEffect(() => {
    if (!id) return;
    setState({ status: "loading" });
    setShown(0);
    let alive = true;
    fetchGame(id).then(r => { if (alive) setState({ status: "done", result: r }); });
    return () => { alive = false; };
  }, [id]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (id && !el.open) el.showModal();
    if (!id && el.open) el.close();
  }, [id]);

  if (!id) return null;

  const full = state.status === "done" && state.result?.ok ? state.result.game : null;
  const failed = state.status === "done" && state.result?.ok === false ? state.result : null;

  // Prefer the full record once it lands, fall back to the card until then. The
  // title and the header picture are the same in both, so the panel does not
  // jump when the fetch returns.
  const title = full?.title ?? game.title;
  const image = full?.image ?? game.image;
  const gallery = full?.gallery ?? [];
  const pictures = [image, ...gallery].filter(Boolean);

  return (
    <dialog
      ref={ref}
      className="sheet"
      aria-label={title}
      onClose={onClose}
      onClick={e => {
        // A click on the element itself is a click on the backdrop: the content
        // sits in a child, so anything inside stops here.
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="sheet-inner">
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {pictures.length > 0 && (
          <div className="sheet-art">
            <img src={pictures[Math.min(shown, pictures.length - 1)]} alt="" />
          </div>
        )}

        <div className="sheet-body">
          <h2>{title}</h2>

          <p className="sheet-facts">
            {full?.released ? longDate(full.released) : game.released ? longDate(game.released) : null}
            {full?.developers?.length ? ` · ${full.developers.join(", ")}` : ""}
            {full?.metacritic != null ? ` · ${full.metacritic} metacritic` : ""}
            {full?.playtime ? ` · about ${full.playtime}h, per the catalogue` : ""}
          </p>

          {state.status === "loading" && (
            <>
              <div className="shimmer" aria-hidden="true" />
              <p className="quiet">Reading the catalogue.</p>
            </>
          )}

          {failed && (
            // Criterion 13. No model was involved in opening this, and the panel
            // must not let a catalogue outage read as one.
            <p className="reason">
              {failed.stage === "catalogue"
                ? "The game database did not answer, so there is nothing more to show than what was on the card. Nothing was asked of the model."
                : failed.reason}
            </p>
          )}

          {pictures.length > 1 && (
            <div className="strip">
              {pictures.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={i === Math.min(shown, pictures.length - 1) ? "thumb on" : "thumb"}
                  onClick={() => setShown(i)}
                  aria-label={`Picture ${i + 1} of ${pictures.length}`}
                >
                  <img src={s} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}

          {full?.synopsis && (
            <div className="synopsis">
              <p className="source">What the catalogue says</p>
              <p>{full.synopsis}</p>
            </div>
          )}

          {full?.machines?.length > 0 && (
            <p className="sheet-platforms">
              <span className="source">On</span> {full.machines.join(" · ")}
            </p>
          )}

          {full?.tags?.length > 0 && (
            <p className="sheet-tags">
              {/* Labels the catalogue carries, not judgements this app made.
                  Said plainly because turn 005 found them loose in both
                  directions — God of War is filed as a souls-like. */}
              <span className="source">Tagged</span>{" "}
              {full.tags.map(t => t.replace(/-/g, " ")).join(", ")}
            </p>
          )}

          <div className="sheet-actions">
            {status ? (
              <span className="in-library">
                In your library
                <span className="quiet"> — won't be suggested again</span>
              </span>
            ) : (
              <button
                type="button"
                className="choose"
                disabled={busy}
                onClick={() => onAdd(full ?? game)}
              >
                {busy ? "Adding…" : "Add to my library"}
              </button>
            )}

            {/* The attribution RAWG's free tier requires, and the place to find
                the things this tier does not carry — trailers, where to buy. */}
            {(full?.slug ?? game.slug) && (
              <a
                className="sheet-link"
                href={`https://rawg.io/games/${full?.slug ?? game.slug}`}
                target="_blank"
                rel="noreferrer"
              >
                On RAWG
              </a>
            )}
            {full?.website && (
              <a className="sheet-link" href={full.website} target="_blank" rel="noreferrer">
                Official site
              </a>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}

/**
 * "12 July 2026" rather than "2026-07-12".
 *
 * Exported so the front page uses the same formatter — two places rendering the
 * same field differently is how a date ends up American in one row and British
 * in the next.
 */
export function longDate(iso) {
  if (typeof iso !== "string") return null;
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
  });
}
