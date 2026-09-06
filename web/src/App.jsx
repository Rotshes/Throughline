import { useState, useEffect, useRef } from "react";
import { requestRecommendation, commitToPlay } from "./api.js";

const MIN_GAMES = 2;
const MAX_GAMES = 5;

export default function App() {
  const [games, setGames] = useState(["", ""]);
  const [state, setState] = useState("idle"); // idle | working | done
  const [result, setResult] = useState(null);
  const [committed, setCommitted] = useState(false);

  const filled = games.map(g => g.trim()).filter(Boolean);
  // Criterion 7b, checked in the form so no call is made for a request that
  // cannot succeed. Also checked in the function; the browser is never trusted.
  const canSubmit = filled.length >= MIN_GAMES && state !== "working";

  function setGame(i, value) {
    setGames(g => g.map((v, j) => (j === i ? value : v)));
  }

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setState("working");
    setResult(null);
    setCommitted(false);
    setResult(await requestRecommendation(filled));
    setState("done");
  }

  return (
    <div className="page">
      <header>
        <h1>Throughline</h1>
        <p className="lede">
          Name two to five games you have enjoyed. This works out what they share
          underneath their genre labels, then finds one more like them — or says
          plainly that it cannot.
        </p>
      </header>

      <form onSubmit={submit}>
        <fieldset disabled={state === "working"}>
          <legend>Games you have played and enjoyed</legend>
          {games.map((g, i) => (
            <div className="row" key={i}>
              <input
                value={g}
                onChange={e => setGame(i, e.target.value)}
                placeholder={i < 2 ? "required" : "optional"}
                aria-label={`Game ${i + 1}`}
                autoComplete="off"
              />
              {games.length > MIN_GAMES && (
                <button
                  type="button"
                  className="ghost"
                  onClick={() => setGames(gs => gs.filter((_, j) => j !== i))}
                  aria-label={`Remove game ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}

          {games.length < MAX_GAMES && (
            <button type="button" className="ghost" onClick={() => setGames(g => [...g, ""])}>
              Add another
            </button>
          )}
        </fieldset>

        <div className="submit">
          <button type="submit" disabled={!canSubmit}>
            {state === "working" ? "Working…" : "Find something"}
          </button>
          {filled.length < MIN_GAMES && (
            <span className="hint">
              {MIN_GAMES - filled.length} more needed — one game shares nothing with itself.
            </span>
          )}
        </div>
      </form>

      {state === "working" && <Working />}
      {state === "done" && result && (
        <Result
          result={result}
          inputGames={filled}
          committed={committed}
          onCommit={async () => {
            if (await commitToPlay(result.sessionId)) setCommitted(true);
          }}
        />
      )}
    </div>
  );
}

/**
 * Two model calls run one after the other, and together they take roughly
 * 15 to 25 seconds. That is long enough that a still screen reads as broken.
 *
 * The elapsed counter is deliberately honest: nothing here streams, so a fake
 * progress bar would be inventing information. Saying what is happening and how
 * long it usually takes is the truthful version.
 */
function Working() {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setSeconds(s => s + 1), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <section className="panel working" aria-live="polite">
      <p><strong>Reading your games, then searching the list.</strong></p>
      <p className="muted">
        Two model calls, one after the other. Usually 15–25 seconds. {seconds}s so far.
      </p>
    </section>
  );
}

function Result({ result, inputGames, committed, onCommit }) {
  const panel = useRef(null);
  useEffect(() => { panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }); }, []);

  if (!result.ok) return <div ref={panel}><Failure result={result} /></div>;

  const rec = result.recommendation;
  const declined = rec.outcome === "no_good_fit";

  return (
    <div ref={panel}>
      {/* Criterion 7a: a decline is shown as a decline. Different heading,
          different styling, no Commit to Play control. It must never be
          mistakable for a lukewarm recommendation. */}
      <section className={`panel headline ${declined ? "declined" : "recommended"}`}>
        {declined ? (
          <>
            <h2>Nothing here fits</h2>
            <p>{rec.rationale}</p>
            {rec.title && <p className="muted">Closest was {rec.title}, and it still was not close enough.</p>}
          </>
        ) : (
          <>
            <p className="eyebrow">Play this</p>
            <h2>{rec.title}</h2>
            <p>{rec.rationale}</p>
            <ul className="satisfies">
              {rec.satisfies.map(s => <li key={s}>{s}</li>)}
            </ul>
            {committed ? (
              <p className="committed">Noted — recorded as a yes.</p>
            ) : (
              <button onClick={onCommit}>Commit to play</button>
            )}
          </>
        )}
      </section>

      <Motifs motifs={result.motifs} inputGames={inputGames} />
      <Meta meta={result.meta} />
    </div>
  );
}

function Motifs({ motifs, inputGames }) {
  if (!motifs?.length) return null;

  // From turn 001: given three games where one shares nothing with the others,
  // the motifs quietly cite only two and nothing tells the user why. Saying
  // which games were actually drawn on costs a line and removes the mystery.
  const cited = new Set(
    motifs.flatMap(m => m.evidence.map(e => e.source.trim().toLowerCase()))
  );
  const unused = inputGames.filter(g => !cited.has(g.trim().toLowerCase()));

  return (
    <section className="panel">
      <h3>What your games share</h3>
      {motifs.map(m => (
        <article key={m.name} className="motif">
          <h4>{m.name}</h4>
          <p>{m.description}</p>
          <ul className="evidence">
            {m.evidence.map((e, i) => (
              <li key={i}><span className="source">{e.source}</span> {e.detail}</li>
            ))}
          </ul>
        </article>
      ))}
      {unused.length > 0 && (
        <p className="muted note">
          Nothing was drawn from {unused.join(" or ")} — no shared thread was found
          with the others.
        </p>
      )}
    </section>
  );
}

function Failure({ result }) {
  const zeroMotifs = result.stage === "zero-motifs";
  return (
    <section className="panel failure">
      <h2>{zeroMotifs ? "These games share nothing I can name" : "That did not work"}</h2>
      <pre className="reason">{result.failureReason}</pre>
      {!zeroMotifs && (
        <p className="muted">
          Nothing was recommended, because a wrong answer here is worse than none.
          Trying again is reasonable — this sometimes passes on a second run.
        </p>
      )}
    </section>
  );
}

function Meta({ meta }) {
  if (!meta) return null;
  return (
    <section className="panel meta">
      <p>
        {meta.callsUsed} of {meta.callCap} model calls ·{" "}
        {(meta.latencyMs / 1000).toFixed(1)}s ·{" "}
        chosen from {meta.candidates} games
        {meta.excluded ? ` (${meta.excluded} excluded as yours)` : ""}
      </p>
      <p className="muted">{meta.prompts?.analysis} · {meta.prompts?.matching}</p>
      {/* Surfaced rather than swallowed. If recording failed, criterion 10 did
          not hold for this request, and hiding that would make the audit trail
          a fiction. */}
      {meta.recording && meta.recording.ok === false && (
        <p className="warn">This run was not recorded: {meta.recording.reason}</p>
      )}
    </section>
  );
}
