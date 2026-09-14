import { useState, useMemo, useEffect, useCallback } from "react";
import {
  requestShortlist, recordClick, fetchSuggested,
  fetchLibrary, saveToLibrary, removeFromLibrary,
} from "./api.js";
import LibraryView from "./Library.jsx";
import Home from "./Home.jsx";
import GameDialog from "./GameDialog.jsx";
import statusesFile from "../../data/statuses.json";

// The three pinned vocabularies, baked in at build time. See vite.config.js for
// why these are imported rather than fetched. Whatever is in these files is the
// entire vocabulary this product understands — spec.md part 5, pitfall 9.
import categoriesFile from "../../data/categories.igdb.json";
import platformsFile from "../../data/platforms.igdb.json";
import tagsFile from "../../data/tags.igdb.json";

// Platforms someone might actually own. The catalogue knows 220, most of them
// Amigas, Atari variants and machines with four games; data/platforms.igdb.json
// is a hand-built selection of nine families and this is the order they appear
// in. See scripts/pin-igdb.js for what was left out and why.
const PLATFORM_ORDER = ["pc", "playstation", "xbox", "nintendo", "sega", "mobile", "mac", "linux", "web"];

const CATEGORIES = categoriesFile.categories;
const PLATFORMS = PLATFORM_ORDER
  .map(slug => platformsFile.platforms.find(p => p.slug === slug))
  .filter(Boolean);
const FACETS = tagsFile.facets;
const STATUSES = statusesFile.statuses;
const DEFAULT_STATUS = STATUSES.find(s => s.default)?.id ?? STATUSES[0].id;

const MAX_TAGS = 6;

export default function App() {
  // "any" by default rather than a genre. Picking one narrows a 500,000-game
  // catalogue before the person has said anything, and the nineteen genres are
  // coarse enough that a default of Action quietly excludes most of what someone
  // might want. Choosing to narrow should be a choice.
  const [category, setCategory] = useState("any");
  // `platforms` is the families wanted; `machines` narrows within some of them.
  // A family with no machines ticked means the whole family. Nothing is
  // selected to begin with — a default platform makes a choice for the person
  // before they have said anything, the same objection as a default genre.
  const [platforms, setPlatforms] = useState([]);
  const [machines, setMachines] = useState([]);
  const [tags, setTags] = useState([]);
  const [openFacet, setOpenFacet] = useState(null);

  const [state, setState] = useState({ status: "idle" });
  const [clicked, setClicked] = useState(null);
  const [elapsed, setElapsed] = useState(0);

  const [view, setView] = useState("home");
  const [library, setLibrary] = useState({ ok: true, entries: [] });
  const [busyId, setBusyId] = useState(null);
  // The card somebody opened, or null. The card rather than the id, so the panel
  // can draw a title and a picture straight away instead of showing an empty box
  // while the full record is fetched.
  const [opened, setOpened] = useState(null);
  // Games this app has already put in front of somebody. Fetched once and never
  // refetched — it is a flourish above the form, not live data.
  const [suggested, setSuggested] = useState([]);

  const reloadLibrary = useCallback(async () => {
    setLibrary(await fetchLibrary());
  }, []);

  // Loaded once at the start rather than when the library tab is opened: a
  // shortlist needs to know what is already on the list, so it can say so on
  // the card instead of offering to add something twice.
  useEffect(() => { reloadLibrary(); }, [reloadLibrary]);

  useEffect(() => {
    let alive = true;
    fetchSuggested().then(g => { if (alive) setSuggested(g); });
    return () => { alive = false; };
  }, []);

  const inLibrary = useMemo(
    () => new Map((library.entries ?? []).map(e => [e.game_id, e.status])),
    [library]
  );

  async function setStatus(pick, status) {
    setBusyId(pick.id);
    const r = await saveToLibrary({
      gameId: pick.id,
      status,
      title: pick.title,
      slug: pick.slug ?? null,
      // The COVER, not the display image. Everywhere else in this app the frame
      // is 16:9 and wants a screenshot; the library is a shelf, and a shelf
      // wants box art. The column holds whatever that view should show, so this
      // needs no second column and no migration — but it does mean a row added
      // before this change still holds the screenshot it was given.
      image: pick.cover ?? pick.image ?? null,
      released: pick.released ?? null,
      platforms: pick.platforms ?? [],
    });
    if (!r.ok) setLibrary(l => ({ ...l, ok: false, reason: r.reason }));
    else await reloadLibrary();
    setBusyId(null);
  }

  async function changeStatus(entry, status) {
    await setStatus(
      {
        id: entry.game_id, title: entry.title, slug: entry.slug,
        image: entry.image, released: entry.released, platforms: entry.platforms,
      },
      status
    );
  }

  async function remove(entry) {
    const id = entry.game_id ?? entry.id;
    setBusyId(id);
    const r = await removeFromLibrary(id);
    if (!r.ok) setLibrary(l => ({ ...l, ok: false, reason: r.reason }));
    else await reloadLibrary();
    setBusyId(null);
  }

  const canSubmit = platforms.length > 0 && state.status !== "waiting";

  const selectedTagLabels = useMemo(
    () => FACETS.flatMap(f => f.tags).filter(t => tags.includes(t.slug)).map(t => t.slug),
    [tags]
  );

  // Families and machines read back in the order they appear in the form, by
  // name rather than slug.
  // A family narrowed to machines reads as those machines; a family left whole
  // reads as itself. Saying "PlayStation, PlayStation 5" would describe a
  // request nobody made.
  const selectionLabels = useMemo(() => {
    const out = [];
    for (const f of PLATFORMS) {
      if (!platforms.includes(f.slug)) continue;
      const narrowed = (f.platforms ?? []).filter(m => machines.includes(m.slug));
      if (narrowed.length) out.push(...narrowed.map(m => m.name));
      else out.push(f.name);
    }
    return out;
  }, [platforms, machines]);

  // A family is the container. Turning it off takes its machines with it —
  // leaving orphaned machine selections behind would produce a request the form
  // no longer shows.
  function toggleFamily(family) {
    const on = platforms.includes(family.slug);
    const children = new Set((family.platforms ?? []).map(m => m.slug));
    setPlatforms(p => (on ? p.filter(x => x !== family.slug) : [...p, family.slug]));
    if (on) setMachines(m => m.filter(x => !children.has(x)));
  }

  /** Narrow a selected family to one machine, or add another alongside. */
  function toggleMachine(machine) {
    setMachines(m =>
      m.includes(machine.slug) ? m.filter(x => x !== machine.slug) : [...m, machine.slug]
    );
  }

  /** Back to the whole family: clear every machine ticked under it. */
  function clearMachines(family) {
    const children = new Set((family.platforms ?? []).map(m => m.slug));
    setMachines(m => m.filter(x => !children.has(x)));
  }

  function toggleTag(slug) {
    setTags(t => {
      if (t.includes(slug)) return t.filter(x => x !== slug);
      if (t.length >= MAX_TAGS) return t;
      return [...t, slug];
    });
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;

    setClicked(null);
    setState({ status: "waiting" });

    // An honest counter rather than a progress bar. Nothing streams, so a bar
    // would be inventing information the page does not have.
    setElapsed(0);
    const started = Date.now();
    const ticker = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 250);

    const result = await requestShortlist({ category, platforms, machines, tags });
    clearInterval(ticker);
    // The tags are kept with the result so a thin one can name the others in
    // the same group. They have to be the tags this result was built from, not
    // whatever is ticked now — the form is still editable while you read it.
    setState({ status: "done", result, narrowed: machines.length > 0, tags });
  }

  /**
   * Adding to the library is also the click-through criterion 15 records.
   * One action, two effects — the person gets a list, and the request keeps a
   * note of which of the three was chosen over the other two.
   */
  async function choose(pick, status, requestId) {
    setClicked(pick.id);
    await setStatus(pick, status);
    if (requestId) await recordClick(requestId, pick.id);
  }

  return (
    // The library is a shelf of cards with art beside the details; it needs more
    // width than the shortlist, which is set to a reading measure on purpose.
    <main className={view === "find" ? undefined : "wide"}>
      <header className="masthead">
        <h1 className="logo">
          {/* A single line threading through three points, which is what this
              app does: one route drawn through three games. A controller icon
              would say "games" and nothing else — this says which game app.
              Inline rather than an image file so it inherits the theme's
              colours and stays sharp at any size. */}
          <svg className="logo-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
            <defs>
              <linearGradient id="tl-grad" x1="0" y1="1" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--logo-1)" />
                <stop offset="52%" stopColor="var(--logo-2)" />
                <stop offset="100%" stopColor="var(--logo-3)" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="30" height="30" rx="9.5" fill="url(#tl-grad)" opacity="0.13" />
            <rect x="1" y="1" width="30" height="30" rx="9.5" fill="none"
                  stroke="url(#tl-grad)" strokeWidth="1.4" opacity="0.45" />
            <path d="M6.5 22.5 C 11 22.5, 11.5 9.5, 16 9.5 S 21 22.5, 25.5 22.5"
                  fill="none" stroke="url(#tl-grad)" strokeWidth="2.4"
                  strokeLinecap="round" />
            <circle cx="6.5" cy="22.5" r="2.7" fill="url(#tl-grad)" />
            <circle cx="16" cy="9.5" r="2.7" fill="url(#tl-grad)" />
            <circle cx="25.5" cy="22.5" r="2.7" fill="url(#tl-grad)" />
          </svg>
          <span className="logo-words">
            <span className="logo-word">Throughline</span>
            {/* Takes the place the per-view tagline used to occupy. A logo
                lockup says what the product is once, rather than three
                sentences explaining what each tab does — which is a thing the
                tabs already say. */}
            <span className="logo-tail">Your Gaming Companion</span>
          </span>
        </h1>
        <nav className="tabs">
          <button
            type="button"
            className={view === "home" ? "tab on" : "tab"}
            aria-current={view === "home"}
            onClick={() => setView("home")}
          >
            Home
          </button>
          {/* The only tab that is an action rather than a place. Home and the
              library are things you look at; this is the thing the app does, and
              it is the one route to the pipeline the whole project is about.

              `primary` is always on the element, and `on` is added on top of it
              when this is the current view. The pause lives in CSS as
              `.tab.on.primary`, not here as a missing class — an animation
              asking you to go where you already are is nagging, and a rule
              saying so out loud is easier to find than an absent class name. */}
          <button
            type="button"
            className={view === "find" ? "tab primary on" : "tab primary"}
            aria-current={view === "find"}
            onClick={() => setView("find")}
          >
            Find a game to play
          </button>
          <button
            type="button"
            className={view === "library" ? "tab on" : "tab"}
            aria-current={view === "library"}
            onClick={() => setView("library")}
          >
            My library
            {inLibrary.size > 0 && <span className="count">{inLibrary.size}</span>}
          </button>
        </nav>
      </header>

      {/* HIDDEN, NOT UNMOUNTED — the same decision the filters form makes below.

          `{view === "home" && <Home/>}` destroys the component on every tab
          change and builds a new one on the way back. A fresh component has
          fresh state, so it refetched and showed "Reading the catalogue" each
          time. That reads as the page updating itself; it is the page being
          rebuilt from nothing.

          The catalogue was never re-queried — the function caches for thirty
          minutes — so the cost was one HTTP round trip and a loading state that
          made the app look busier than it was. What it actually threw away was
          the user's place: a scrolled rail, an open deals search, a refreshed
          page of prices.

          Kept mounted and hidden, all of that survives a trip to the library and
          back. `[hidden] { display: none !important }` in styles.css is what
          makes this work — an ordinary [hidden] loses to any class that sets
          `display`, which is how the filters form was once marked hidden and
          drawn anyway. */}
      <div hidden={view !== "home"}>
        <Home
          inLibrary={inLibrary}
          busyId={busyId}
          onAdd={g => setStatus(
            { id: g.id, title: g.title, slug: g.slug, image: g.image,
              cover: g.cover, released: g.released, platforms: g.platforms },
            DEFAULT_STATUS
          )}
          onOpen={setOpened}
          onFind={() => setView("find")}
        />
      </div>

      <GameDialog
        game={opened}
        status={opened ? inLibrary.get(opened.id) ?? null : null}
        busy={opened ? busyId === opened.id : false}
        onAdd={g => setStatus(
          { id: g.id, title: g.title, slug: g.slug, image: g.image,
            cover: g.cover, released: g.released, platforms: g.platforms },
          DEFAULT_STATUS
        )}
        onClose={() => setOpened(null)}
      />

      {view === "library" && (
        <LibraryView
          library={library}
          busyId={busyId}
          onChangeStatus={changeStatus}
          onRemove={remove}
        />
      )}

      <form onSubmit={submit} className="filters" hidden={view !== "find"}>
        <fieldset>
          <legend>What kind of game</legend>
          <select value={category} onChange={e => setCategory(e.target.value)}>
            <option value="any">Any kind of game</option>
            {CATEGORIES.map(c => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
          </select>
          {category === "any" && (
            <p className="hint quiet">
              No genre filter. The widest search, and the one least likely to come
              back empty.
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>What you can play it on</legend>
          <div className="chips">
            {PLATFORMS.map(p => (
              <button
                key={p.slug}
                type="button"
                className={platforms.includes(p.slug) ? "chip on" : "chip"}
                aria-pressed={platforms.includes(p.slug)}
                onClick={() => toggleFamily(p)}
              >
                {p.name}
              </button>
            ))}
          </div>

          {/* Consoles appear for a family once it is chosen, rather than behind
              an expander. One interaction model — pick the family, then narrow
              if you want to — and the narrowing is visible rather than hidden
              behind a control small enough to miss. */}
          {PLATFORMS.filter(p => platforms.includes(p.slug) && (p.platforms ?? []).length > 1)
            .map(p => {
              const narrowed = (p.platforms ?? []).filter(m => machines.includes(m.slug));
              return (
                <div key={p.slug} className="machines">
                  <p className="machines-label">{p.name}</p>
                  <div className="chips" role="group" aria-label={`${p.name} consoles`}>
                    <button
                      type="button"
                      className={narrowed.length === 0 ? "chip small on" : "chip small"}
                      aria-pressed={narrowed.length === 0}
                      onClick={() => clearMachines(p)}
                    >
                      All {p.name}
                    </button>
                    {p.platforms.map(m => (
                      <button
                        key={m.slug}
                        type="button"
                        className={machines.includes(m.slug) ? "chip small on" : "chip small"}
                        aria-pressed={machines.includes(m.slug)}
                        onClick={() => toggleMachine(m)}
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}

          {platforms.length === 0 && (
            <p className="hint">Pick at least one. Then narrow to a console if you want to.</p>
          )}

          {/* Say back exactly what is selected. A default of PC plus one click
              on a Game Boy Advance is a request for either, and reading "1"
              on a collapsed Nintendo chip is not enough to notice that. */}
          {selectionLabels.length > 0 && (
            <p className="hint">
              Searching <strong>{selectionLabels.join(", ")}</strong>
              {machines.length > 0 && (
                <span className="quiet">
                  {" — "}a named console is far fewer games than its whole family
                </span>
              )}
            </p>
          )}
        </fieldset>

        <fieldset>
          <legend>
            Anything more particular <span className="optional">optional</span>
          </legend>
          <div className="facets">
            {FACETS.map(f => {
              const chosenHere = f.tags.filter(t => tags.includes(t.slug)).length;
              const open = openFacet === f.id;
              return (
                <div key={f.id} className="facet">
                  <button
                    type="button"
                    className={open ? "facet-head open" : "facet-head"}
                    onClick={() => setOpenFacet(open ? null : f.id)}
                    aria-expanded={open}
                  >
                    {f.label}
                    {chosenHere > 0 && <span className="count">{chosenHere}</span>}
                  </button>
                  {open && (
                    <div className="chips">
                      {f.tags.map(t => {
                        const on = tags.includes(t.slug);
                        const full = !on && tags.length >= MAX_TAGS;
                        return (
                          <button
                            key={t.slug}
                            type="button"
                            className={on ? "chip on" : "chip"}
                            aria-pressed={on}
                            disabled={full}
                            onClick={() => toggleTag(t.slug)}
                          >
                            {t.slug.replace(/-/g, " ")}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tags.length > 0 && (
            <p className="hint">
              {selectedTagLabels.join(", ")}
              {tags.length > 1 && (
                <>
                  {" — "}
                  <span className="quiet">
                    games matching more of these come first; games matching one still appear
                  </span>
                </>
              )}
            </p>
          )}
          {tags.length >= MAX_TAGS && <p className="hint warn">Six at most.</p>}
        </fieldset>

        {/* THE AI MARKER.

            Next to the control that triggers the model call, because that is
            the moment the information is worth something.

            NO VENDOR LOGO, deliberately. Two reasons, and the second is the one
            that would have bitten:

              A Gemini or OpenRouter mark is somebody else's trademark and
              implies a partnership this project does not have.

              `OPENROUTER_MODEL` is an environment variable precisely because
              model ids go stale — see .env.example. A logo naming one model
              becomes a false claim the moment that variable changes, in the most
              visible place in the app. A generic glyph stays true.

            The icon carries no visible text, which is the user's choice. So the
            meaning is attached where it can still be reached: `title` on hover,
            `aria-label` for screen readers. An unlabelled decoration nobody can
            decode would be worse than nothing — it would look like disclosure
            without being any. */}
        <div className="go-row">
          <button type="submit" className="go" disabled={!canSubmit}>
            {/* Not "find me three": the count is not promised. A thin filter can
                legitimately return one, and criterion 5 forbids padding it. */}
            {state.status === "waiting" ? "Looking…" : "Find me games to play"}
          </button>
          <span
            className="ai-mark"
            title="The three write-ups are written by a language model, from a set of games this app chose."
            aria-label="Written by a language model."
            role="img"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              {/* A four-point sparkle. Generic enough to belong to nobody. */}
              <path d="M12 2.5 13.9 9.1 20.5 11 13.9 12.9 12 19.5 10.1 12.9 3.5 11 10.1 9.1z" />
              <path d="M18.5 2.5 19.3 5.2 22 6 19.3 6.8 18.5 9.5 17.7 6.8 15 6 17.7 5.2z" />
            </svg>
          </span>
        </div>
      </form>

      {/* Shown only while the find page is otherwise empty. Once there is a
          result, or one is being fetched, this is the least important thing on
          the page and competing with the answer would be the wrong trade. */}
      {view === "find" && state.status === "idle" && suggested.length > 0 && (
        <section className="suggested">
          <h2>Recently suggested here</h2>
          <p className="row-source">
            Games this app has actually put in front of somebody, newest first,
            with the angle each was given.
          </p>
          <ul className="banners">
            {suggested.map(g => (
              <li key={g.id} className="banner">
                {g.cover
                  ? <img className="banner-art" src={g.cover} alt="" loading="lazy" />
                  : <span className="banner-art banner-noart" aria-hidden="true" />}
                <span className="banner-text">
                  {g.angleLabel && <span className="banner-angle">{g.angleLabel}</span>}
                  <span className="banner-title">{g.title}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {view === "find" && state.status === "waiting" && (
        <section className="waiting">
          {/* A moving bar that measures nothing, and says nothing. Nothing
              streams from either service, so a progress bar would be inventing
              information the page does not have. The only honest number here
              is the one counting up. */}
          <div className="shimmer" aria-hidden="true" />
          <p>Reading the catalogue, then asking the model once.</p>
          <p className="quiet">Usually 8–20 seconds. {elapsed}s so far.</p>
        </section>
      )}

      {view === "find" && state.status === "done" && (
        <Result
          result={state.result}
          narrowed={state.narrowed}
          usedTags={state.tags ?? []}
          clicked={clicked}
          inLibrary={inLibrary}
          busyId={busyId}
          onChoose={choose}
          onRemove={remove}
        />
      )}

      <footer>
        {/* CREDIT, NOT DECORATION, AND NOT A LINK ANY MORE.

            Both services ask to be credited. IGDB's rules say to attribute them
            and not to bulk re-publish the dataset; they do not, as far as this
            project could verify, require a hyperlink specifically — unlike RAWG,
            whose free tier demanded an active link back from every page showing
            their data.

            So the links are gone at the user's request and the credit stays as
            text. That is the reading of "remove any links" that does not quietly
            drop an obligation: a link is a navigation choice, attribution is a
            licence term, and only one of those was being asked about. If the
            terms turn out to require a live link, this is where it goes back. */}
        <p>
          Game data, images and trailers from IGDB. Prices from IsThereAnyDeal.
        </p>
        {/* REMOVED IN TURN 018, AT THE USER'S REQUEST.

            This line used to say the three arguments are written by a language
            model and that nothing checks whether they are true. It was the only
            place in the running app where pitfall 1 — the largest known gap in
            this project — was visible to the person reading the shortlist.

            Removing it does not change the gap, and the spec still states it
            (part 3, pitfall 1, and the "not a criterion" note after criterion
            15). It changes who knows about it: the marker, and not the reader.
            That is a product decision and it is the user's to make; it is
            recorded here rather than left as an unexplained deletion, because a
            disclosure that vanishes with no trace is the kind of change nobody
            can review later.

            If it comes back, it goes back here, and shorter. */}
      </footer>
    </main>
  );
}

function Result({ result, narrowed, usedTags, clicked, inLibrary, busyId, onChoose, onRemove }) {
  // Criterion 12: a failure is shown as a failure. Never an empty or partial
  // shortlist dressed up as a result.
  if (!result.ok) {
    return <Failure result={result} narrowed={narrowed} usedTags={usedTags} />;
  }

  const m = result.meta ?? {};
  const thin = result.picks.length < 3;

  return (
    <section className="results">
      {/* Pitfall 10 reaching a person. Criterion 5 forbids padding a thin
          result, so the honest alternative is saying it is thin. A shortlist
          drawn from a pool barely larger than itself is not a choice, and
          leaving that in the small grey line at the bottom would let it read
          as one. */}
      {thin && (
        <p className="thin">
          {result.picks.length === 1
            ? "Only one game matched those filters, so there is nothing to choose between."
            : `Only ${result.picks.length} games matched those filters.`}{" "}
          Nothing was loosened to fill the gap.{" "}
          <Diagnosis diagnosis={result.diagnosis} narrowed={narrowed} usedTags={usedTags} />
        </p>
      )}

      {result.picks.map((p, i) => (
        <Pick
          key={p.id}
          index={i}
          pick={p}
          chosen={clicked === p.id}
          status={inLibrary.get(p.id) ?? null}
          busy={busyId === p.id}
          onChoose={status => onChoose(p, status, result.requestId)}
          onRemove={() => onRemove(p)}
        />
      ))}

      <p className="meta">
        Chosen from {m.candidateCount ?? "?"} candidates
        {m.shownFrom ? ` (the catalogue holds ${m.shownFrom} for those filters)` : ""}
        {m.callsUsed != null ? ` · ${m.callsUsed} of ${m.callCap} model calls` : ""}
        {m.latencyMs ? ` · ${(m.latencyMs / 1000).toFixed(1)}s` : ""}
        {m.prompt ? ` · ${m.prompt}` : ""}
      </p>
      {m.repeatsAvoided > 0 && (
        <p className="meta">
          {m.repeatsAvoided} {m.repeatsAvoided === 1 ? "game" : "games"} shown
          recently {m.repeatsAvoided === 1 ? "was" : "were"} set aside so this is
          not the same answer twice.
        </p>
      )}
      {m.excluded > 0 && (
        <p className="meta">
          {m.excluded} {m.excluded === 1 ? "game" : "games"} in your library
          {m.excluded === 1 ? " was" : " were"} kept out of this.
        </p>
      )}
      {m.libraryError && (
        // Criterion 8 did not hold for this request. Saying nothing would leave
        // a shortlist that might contain something already on the list looking
        // exactly like one that could not.
        <p className="meta warn">
          Your library could not be read, so nothing was excluded: {m.libraryError}
        </p>
      )}
      {m.recording && m.recording.ok === false && (
        <p className="meta warn">
          This result was not recorded: {m.recording.reason}
        </p>
      )}
    </section>
  );
}

/**
 * Which filter emptied the pool, from counts the server measured rather than a
 * guess made here.
 *
 * The old advice was a guess and it was wrong: a request for split-screen
 * GameCube games returned one, and the page suggested widening to the whole
 * Nintendo family. The catalogue holds 662 GameCube games; six carry the
 * split-screen tag. The console was never the problem, and being told
 * confidently to change the wrong thing is worse than being told nothing.
 */
/**
 * The other tags in the same groups as the ones that were used.
 *
 * Tags combine with OR — decision 0004 — so adding more widens the search
 * rather than narrowing it, which is the opposite of what the word "filter"
 * suggests and the single most useful thing to know about that panel.
 *
 * Asking for split-screen GameCube games finds one. Mario Kart: Double Dash,
 * Melee and Wind Waker are all tagged `multiplayer` and would have come back
 * too. Nothing in the interface said so.
 */
function siblingTags(usedTags) {
  if (!usedTags?.length) return [];
  const groups = FACETS.filter(f => f.tags.some(t => usedTags.includes(t.slug)));
  return groups
    .flatMap(f => f.tags.map(t => t.slug))
    .filter(slug => !usedTags.includes(slug))
    .slice(0, 6);
}

function Diagnosis({ diagnosis, narrowed, usedTags }) {
  const siblings = siblingTags(usedTags);

  const alsoTry = siblings.length > 0 && (
    <>
      {" "}Tags widen the search rather than narrowing it, so ticking more of the
      same group finds more:{" "}
      <strong>{siblings.map(s => s.replace(/-/g, " ")).join(", ")}</strong>.
    </>
  );

  if (!diagnosis) {
    return narrowed
      ? <>Choosing the whole console family rather than one machine would give more to pick from.</>
      : <>Fewer tags, or another platform, would give more to pick from.</>;
  }

  const { withFilters, withoutTags, withoutCategory } = diagnosis;
  const tagsAreTheCause = withoutTags != null && withoutTags > (withFilters ?? 0) * 4;
  const categoryIsTheCause = withoutCategory != null && withoutCategory > (withFilters ?? 0) * 4;

  if (tagsAreTheCause) {
    return (
      <>
        The catalogue holds <strong>{withoutTags.toLocaleString("en-GB")}</strong> games for
        this platform, but only <strong>{withFilters?.toLocaleString("en-GB")}</strong> of
        them carry the tags you picked.{" "}
        <span className="quiet">
          Tags come mostly from Steam pages, so older console games often have
          none at all — however obviously they fit.
        </span>
        {alsoTry}
      </>
    );
  }

  if (categoryIsTheCause) {
    return (
      <>
        The catalogue holds <strong>{withoutCategory.toLocaleString("en-GB")}</strong> games
        for this platform, but only <strong>{withFilters?.toLocaleString("en-GB")}</strong>{" "}
        are filed under that category. Try “any kind of game”.
      </>
    );
  }

  return (
    <>
      The catalogue itself only holds{" "}
      <strong>{withFilters?.toLocaleString("en-GB") ?? "a few"}</strong> games for this
      combination{narrowed ? ", and a named console is a narrow request" : ""}.
      {alsoTry}
    </>
  );
}

function Pick({ pick, index, chosen, status, busy, onChoose, onRemove }) {
  const shots = useMemo(() => {
    // The main image IS the first screenshot now, so this dedupe does real work
    // rather than guarding an edge case.
    const all = [pick.image, ...(pick.screenshots ?? [])].filter(Boolean);
    return [...new Set(all)];
  }, [pick]);

  const [shown, setShown] = useState(0);
  // The trailer, where the catalogue has one. Behind a click and never
  // preloaded: three embedded players loading at once on a page of three
  // recommendations is a page nobody waits for.
  const [playing, setPlaying] = useState(false);

  return (
    // --i staggers the entrance; the CSS removes it under reduced motion.
    <article className={chosen ? "pick chosen" : "pick"} style={{ "--i": index }}>
      <p className="angle">{pick.angleLabel}</p>
      {/* Written by code from the catalogue record, not by the model. Five of
          the six angles have a fact behind them; `beautiful-one` has none and
          gets no line rather than an invented one. */}
      {pick.angleReason && <p className="angle-reason">{pick.angleReason}</p>}

      <h2>
        {pick.title} <span className="year">{pick.released?.slice(0, 4)}</span>
      </h2>

      {(shots.length > 0 || pick.video) && (
        <div className="gallery">
          {playing && pick.video ? (
            <iframe
              className="gallery-video"
              src={`${pick.video}?rel=0&autoplay=1`}
              title={`${pick.title} trailer`}
              allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <div className="gallery-frame">
              {shots.length > 0 && (
                <img src={shots[shown]} alt={`${pick.title} screenshot`} loading="lazy" />
              )}
              {/* The src is built server-side by youTubeUrl, which checks the id
                  against YouTube's alphabet before it can reach an iframe. The
                  value is written by a third party. */}
              {pick.video && shown === 0 && (
                <button type="button" className="sheet-play" onClick={() => setPlaying(true)}>
                  <span aria-hidden="true">▶</span> Watch the trailer
                </button>
              )}
            </div>
          )}
          {shots.length > 1 && (
            <div className="strip">
              {shots.map((s, i) => (
                <button
                  key={s}
                  type="button"
                  className={i === shown && !playing ? "thumb on" : "thumb"}
                  onClick={() => { setShown(i); setPlaying(false); }}
                  aria-label={`Screenshot ${i + 1} of ${shots.length}`}
                >
                  <img src={s} alt="" loading="lazy" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* The two blocks below are labelled because they come from different
          places and one of them is checkable. The argument is written by a
          language model and nothing verifies it; the description is the
          catalogue's own. Letting them run together as one voice would hide
          exactly the distinction that makes the second one worth showing. */}
      <p className="case">{pick.case}</p>

      {/* What each word you ticked turns out to mean in this game. The tag is
          the catalogue's and was checked before this was allowed to exist; the
          sentence beside it is the model's. */}
      {pick.tagNotes?.length > 0 && (
        <dl className="tag-notes">
          {pick.tagNotes.map(n => (
            <div key={n.tag}>
              <dt>{n.tag.replace(/-/g, " ")}</dt>
              <dd>{n.how}</dd>
            </div>
          ))}
        </dl>
      )}

      {pick.synopsis && (
        <div className="synopsis">
          <p className="source">Summary from IGDB</p>
          <p>{pick.synopsis}</p>
        </div>
      )}

      <p className="facts">
        {pick.platforms.join(" · ")}
        {pick.criticScore != null
          ? ` · ${pick.criticScore} from ${pick.criticReviews} critics`
          : ""}
      </p>

      {/* The action criterion 15 calls "clicking through". It used to go
          nowhere: a label promising something while only writing a row. Now it
          puts the game on the list — which also means it is never recommended
          again, so the button changes what the app does rather than only what
          it knows. */}
      {status ? (
        <div className="library-state">
          <span className="in-library">
            In your library
            <span className="quiet"> — won't be suggested again</span>
          </span>
          <div className="library-controls">
            <select
              value={status}
              disabled={busy}
              onChange={e => onChoose(e.target.value)}
              aria-label={`Status of ${pick.title}`}
            >
              {STATUSES.map(s => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
            <button type="button" className="remove" disabled={busy} onClick={onRemove}>
              Remove
            </button>
          </div>
        </div>
      ) : (
        // One button, one meaning. Everything added from a shortlist goes in as
        // "plan to play" — you are being shown something you have not played,
        // so the other four states are answers to a question nobody asked here.
        // Changing it is a job for the library, where the game already exists.
        <button
          type="button"
          className="choose"
          disabled={busy}
          onClick={() => onChoose(DEFAULT_STATUS)}
        >
          {busy ? "Adding…" : "Add to my library"}
        </button>
      )}
    </article>
  );
}

function Failure({ result, narrowed, usedTags }) {
  // Each stage gets its own words. With two external services behind this, a
  // person who cannot tell which one broke cannot report anything useful —
  // criterion 13. "Something went wrong" is the message that helps nobody.
  const stage = result.stage;

  const headings = {
    empty: "Nothing to show you",
    catalogue: "The game database did not answer",
    gate: "The model's answer was rejected",
    parse: "The model's answer could not be read",
    schema: "The model's answer was the wrong shape",
    budget: "Stopped before spending more",
    call: "The model did not answer",
    server: "The server failed",
    request: "That request was refused",
    unexpected: "Something failed unexpectedly",
  };

  const explanations = {
    empty:
      "Either nothing in the catalogue matches those filters, or what does match is " +
      "too obscure to write about honestly.",
    catalogue:
      "That is the game database, not the model. Nothing was asked of the model and " +
      "nothing was spent. It is usually worth trying again in a minute.",
    gate:
      "The model returned three games, and the checks refused them. That is the system " +
      "working: a shortlist that fails a check is not shown as a partial result.",
    budget: "The per-request cap on model calls was reached. Nothing further was spent.",
  };

  return (
    <section className="failure">
      <h2>{headings[stage] ?? "That did not work"}</h2>
      {explanations[stage] && <p>{explanations[stage]}</p>}
      {/* Measured, not guessed. An empty result is the case where wrong advice
          costs the most, because there is nothing else on the page to go on. */}
      {stage === "empty" && result.diagnosis && (
        <p><Diagnosis diagnosis={result.diagnosis} narrowed={narrowed} usedTags={usedTags} /></p>
      )}
      <p className="reason">{result.failureReason}</p>
      {result.problems?.length > 0 && (
        <ul className="problems">
          {result.problems.map((p, i) => <li key={i}>{p}</li>)}
        </ul>
      )}
      {result.meta?.recording && result.meta.recording.ok === false && (
        <p className="meta warn">This failure was not recorded: {result.meta.recording.reason}</p>
      )}
    </section>
  );
}
