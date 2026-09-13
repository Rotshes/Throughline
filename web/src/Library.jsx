import { useMemo, useState, useEffect } from "react";
import statusesFile from "../../data/statuses.json";

const STATUSES = statusesFile.statuses;

const SIZES = [
  { id: "s", label: "Small", hint: "More on screen at once" },
  { id: "m", label: "Medium", hint: "Art beside the details" },
  { id: "l", label: "Large", hint: "Art across the card" },
];

const SIZE_KEY = "throughline.library.size";

/**
 * The remembered card size.
 *
 * Local to the browser, which is the right place for it — it is a preference
 * about looking at the page, not part of the shared library, and storing it
 * with the data would mean one person's choice changing the view for everyone.
 *
 * Wrapped because storage throws outright in some privacy modes rather than
 * returning nothing, and a display preference must never be able to stop the
 * page rendering.
 */
function readSize() {
  try {
    const saved = localStorage.getItem(SIZE_KEY);
    return SIZES.some(s => s.id === saved) ? saved : "m";
  } catch {
    return "m";
  }
}

/**
 * The library, as its own page.
 *
 * Its own navigation across the statuses, a heading for whichever is open, and
 * cards large enough to recognise a game from the picture — the shape a list
 * site uses, rather than a settings screen with rows.
 *
 * One library, shared by everyone who opens the site. No accounts — see
 * docs/decisions/0005. The page says so rather than letting a reader assume the
 * list is theirs alone.
 *
 * Rendered entirely from the library's own rows. The catalogue is not asked
 * again: twenty games would be twenty requests of a monthly twenty thousand
 * every time this opened.
 */
export default function Library({ library, onChangeStatus, onRemove, busyId }) {
  const [tab, setTab] = useState("all");
  const [size, setSize] = useState(readSize);

  useEffect(() => {
    try { localStorage.setItem(SIZE_KEY, size); } catch { /* not worth failing over */ }
  }, [size]);

  const entries = library.entries ?? [];

  const counts = useMemo(() => {
    const c = new Map(STATUSES.map(s => [s.id, 0]));
    for (const e of entries) c.set(e.status, (c.get(e.status) ?? 0) + 1);
    return c;
  }, [entries]);

  const shown = tab === "all" ? entries : entries.filter(e => e.status === tab);
  const status = STATUSES.find(s => s.id === tab);

  if (library.ok === false) {
    // Criterion 13's reasoning applied here. An empty list and an unreachable
    // database look identical on screen and mean opposite things.
    return (
      <section className="failure">
        <h2>The library could not be read</h2>
        <p>
          This is the database, not the model. Nothing has been lost — the list is
          still there, this page could not fetch it.
        </p>
        <p className="reason">{library.reason}</p>
      </section>
    );
  }

  return (
    <section className="library">
      <nav className="status-nav">
        <button
          type="button"
          className={tab === "all" ? "status-tab on" : "status-tab"}
          aria-current={tab === "all"}
          onClick={() => setTab("all")}
        >
          All games <span className="n">{entries.length}</span>
        </button>
        {STATUSES.map(s => (
          <button
            key={s.id}
            type="button"
            className={tab === s.id ? "status-tab on" : "status-tab"}
            aria-current={tab === s.id}
            onClick={() => setTab(s.id)}
          >
            {s.label} <span className="n">{counts.get(s.id) ?? 0}</span>
          </button>
        ))}
      </nav>

      <header className="library-head">
        <div>
          <h2>{tab === "all" ? "All games" : status?.label}</h2>
          <p>
            {tab === "all"
              ? "Everything on the list. None of it will be recommended again, whatever state it is in."
              : status?.meaning}
          </p>
        </div>

        {shown.length > 0 && (
          <div className="sizes" role="group" aria-label="Card size">
            {SIZES.map(s => (
              <button
                key={s.id}
                type="button"
                className={size === s.id ? "size on" : "size"}
                aria-pressed={size === s.id}
                title={s.hint}
                onClick={() => setSize(s.id)}
              >
                {s.label}
              </button>
            ))}
          </div>
        )}
      </header>

      {shown.length === 0 ? (
        <p className="empty">
          {entries.length === 0
            ? "Nothing in the library yet. Add a game from a shortlist and it will appear here — and stop being recommended."
            : `Nothing is ${status?.label.toLowerCase()} at the moment.`}
        </p>
      ) : (
        <ul className={`shelf size-${size}`}>
          {shown.map(e => {
            const entryStatus = STATUSES.find(s => s.id === e.status);
            return (
              <li key={e.game_id} className={busyId === e.game_id ? "card busy" : "card"}>
                <div className="card-art">
                  {e.image
                    ? <img src={e.image} alt="" loading="lazy" />
                    : <div className="card-noart" aria-hidden="true" />}
                  {/* Shown only on the combined view, where it is the one thing
                      a card cannot otherwise tell you. On a single-status page
                      it would repeat the heading on every card. */}
                  {tab === "all" && (
                    <span className="card-status">{entryStatus?.label ?? e.status}</span>
                  )}
                </div>

                <div className="card-body">
                  <h3>
                    {e.title}
                    {e.released && <span className="year"> {e.released.slice(0, 4)}</span>}
                  </h3>

                  {e.platforms?.length > 0 && (
                    <p className="card-facts">{e.platforms.join(" · ")}</p>
                  )}

                  <p className="card-added">
                    Added {new Date(e.added_at).toLocaleDateString("en-GB", {
                      day: "numeric", month: "short", year: "numeric",
                    })}
                  </p>

                  <div className="card-actions">
                    <select
                      value={e.status}
                      disabled={busyId === e.game_id}
                      onChange={ev => onChangeStatus(e, ev.target.value)}
                      aria-label={`Status of ${e.title}`}
                    >
                      {STATUSES.map(s => (
                        <option key={s.id} value={s.id}>{s.label}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="remove"
                      disabled={busyId === e.game_id}
                      onClick={() => onRemove(e)}
                      aria-label={`Remove ${e.title} from the library`}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <p className="library-note quiet">
        One shared library. There are no accounts, so this is the same list for
        everyone who opens the site, and removing something removes it for
        everyone.
      </p>
    </section>
  );
}
