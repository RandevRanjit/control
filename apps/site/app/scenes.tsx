// The reel's scenes: small stretches of the app, drawn with its own tokens and moving on its clock.
// They are illustrations (the hero shows the real window); every name in them is fictional.
import { Mark } from "./Mark";

type State = "needs" | "working" | "done" | "failed" | "idle";

const STATE_WORDS = {
  needs: "needs you",
  working: "working",
  done: "done",
  failed: "failed",
  idle: "idle",
};

function Lamp({ state }: { state: State }) {
  return (
    <span className={`lamp st-${state}`}>
      <i />
    </span>
  );
}

function Row({
  group,
  tint,
  name,
  state,
  tokens,
  model = "Opus 5.5",
}: {
  group: string;
  tint: string;
  name: string;
  state: State;
  tokens: string;
  model?: string;
}) {
  return (
    <div className="row" data-st={state}>
      <div className="row-top">
        <span className="chip" style={{ background: `var(--id-${tint})` }}>
          {group.slice(0, 2)}
        </span>
        <span className="row-group">{group}</span>
        <span className={`beads sb-${state}`} />
        <Lamp state={state} />
      </div>
      <div className="row-name">
        <b>{name}</b>
        <span>{tokens}</span>
      </div>
      <div className="row-meta">
        <span>{STATE_WORDS[state]} · main</span>
        <span>{model}</span>
      </div>
    </div>
  );
}

function Step({ tool, target, state = "done" }: { tool: string; target: string; state?: State }) {
  return (
    <p className="step">
      <Lamp state={state} />
      {tool} <code>{target}</code>
    </p>
  );
}

/** A thread asks for an approval: its row turns, the menu bar counts it, the question is waiting. */
export function NeedsScene() {
  return (
    <div className="plate scene-needs" aria-hidden="true">
      <div className="side">
        <p className="group">
          <i style={{ background: "var(--id-mint)" }} />
          Thesis
        </p>
        <div className="flip">
          <Row group="Thesis" tint="mint" name="STATISTICS" state="working" tokens="64k" />
          <Row group="Thesis" tint="mint" name="STATISTICS" state="needs" tokens="64k" />
        </div>
        <Row group="Thesis" tint="mint" name="LINEAR_ALGEBRA" state="done" tokens="41k" />
        <p className="group">
          <i style={{ background: "var(--id-rose)" }} />
          Orbit
        </p>
        <Row group="orbit-website" tint="rose" name="ORBIT-WEBSITE" state="working" tokens="96k" />
        <Row group="orbit-website" tint="rose" name="PORTFOLIO-SCROLL" state="failed" tokens="138k" />
      </div>
      <div className="centre flip">
        <div className="talk">
          <p className="said">rerun the regression with the outliers dropped</p>
          <Step tool="Read" target="analysis/fit.py" />
          <Step tool="Edit" target="analysis/fit.py" />
          <Step tool="Bash" target="uv run fit.py" state="working" />
          <p className="headbar">
            <span className="beads sb-working" />
            Working for 41s
          </p>
        </div>
        <div className="talk">
          <p className="said">rerun the regression with the outliers dropped</p>
          <div className="ask">
            <p>Allow this command?</p>
            <code>rm -rf results/2025</code>
            <p className="ask-keys">
              <span className="key">Deny</span>
              <span className="key primary">Allow</span>
            </p>
          </div>
        </div>
      </div>
      <p className="menubar">
        <Mark size={17} />
        <span className="flip">
          <b>0</b>
          <b>1</b>
        </span>
      </p>
    </div>
  );
}

/** The lock plate, with work carrying on under it and one thread that needs you coming through. */
export function LockScene() {
  return (
    <div className="plate scene-lock" aria-hidden="true">
      <Mark size={84} />
      <p className="lock-word">Locked</p>
      <p className="lock-until">
        until <b>17:30</b>
      </p>
      <p className="lock-work">
        <span className="beads sb-working" />
        <span className="beads sb-working" />
        <span className="beads sb-working" />
        3 threads still working
      </p>
      <div className="lock-through">
        <Row group="Thesis" tint="mint" name="STATISTICS" state="needs" tokens="64k" />
      </div>
    </div>
  );
}

/** Claude's cursor crosses a page in the thread's own tab, picks a button and clicks it. */
export function BrowserScene() {
  return (
    <div className="plate scene-browser" aria-hidden="true">
      <p className="urlbar">
        <code>localhost:3000/download</code>
      </p>
      <div className="web">
        <p className="web-nav">
          <b>ORBIT</b>
          <span>Features</span>
          <span>Download</span>
          <span>Changelog</span>
        </p>
        <p className="web-h">Download ORBIT</p>
        <p className="web-p">One key, every track ready.</p>
        <p className="web-cta">
          Download for macOS
          <i className="pick" />
        </p>
        <p className="pick-chip">
          <code>button.cta</code> 212 × 40
        </p>
        <svg className="cursor" viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 2l13 6.2-5.4 1.9L8.6 16z" />
        </svg>
      </div>
      <div className="trail">
        <Step tool="Browser" target="open localhost:3000/download" />
        <Step tool="Browser" target="click button.cta" state="working" />
      </div>
    </div>
  );
}

/** A sign-in page fills itself from a saved login and lets the thread through. */
export function LoginScene() {
  return (
    <div className="plate scene-login" aria-hidden="true">
      <p className="urlbar">
        <code>accounts.example.com/sign-in</code>
      </p>
      <div className="web">
        <div className="signin">
          <p className="web-h">Sign in</p>
          <p className="field">
            <span>Email</span>
            <b>
              <span>ada@example.com</span>
            </b>
          </p>
          <p className="field">
            <span>Password</span>
            <b>
              <span>••••••••••••••</span>
            </b>
          </p>
          <p className="web-cta">Sign in</p>
        </div>
        <p className="saved">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <circle cx="5.2" cy="8" r="2.7" />
            <path d="M7.9 8h6.3M11.6 8v2.4M13.6 8v1.7" />
          </svg>
          Saved login, from your Keychain
        </p>
        <p className="signed">
          <Lamp state="done" />
          Signed in as ada@example.com
        </p>
      </div>
    </div>
  );
}

/** A private file goes to a model on this Mac; only the model's answer crosses to Claude. */
export function LocalScene() {
  return (
    <div className="plate scene-local" aria-hidden="true">
      <div className="zone">
        <p className="zone-name">This Mac</p>
        <p className="file">
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M4 1.8h5.2L12.4 5v9.2H4zM9 1.8V5.2h3.4" />
          </svg>
          <code>payslips-2026.pdf</code>
        </p>
        <span className="beads sb-working drop" />
        <p className="model">
          <Lamp state="working" />
          Qwen 3 <span>ready · 28 GB</span>
        </p>
        <p className="never">The file stays on this side.</p>
      </div>
      <div className="zone">
        <p className="zone-name">Claude</p>
        <p className="said">what changed in my October payslip?</p>
        <Step tool="Local model" target="Qwen 3" state="working" />
        <p className="answer">Net pay rose 4% in October. Nothing else changed.</p>
      </div>
      <i className="packet" />
    </div>
  );
}

/** The phone shows the same threads as the Mac, and a state change lands on both. */
export function PhoneScene() {
  return (
    <div className="plate scene-phone" aria-hidden="true">
      <div className="side">
        <div className="flip">
          <Row group="orbit-website" tint="rose" name="ORBIT-WEBSITE" state="working" tokens="96k" />
          <Row group="orbit-website" tint="rose" name="ORBIT-WEBSITE" state="done" tokens="97k" />
        </div>
        <Row group="Thesis" tint="mint" name="STATISTICS" state="working" tokens="64k" />
        <Row group="Thesis" tint="mint" name="LINEAR_ALGEBRA" state="idle" tokens="41k" />
      </div>
      <p className="link">
        <span className="beads sb-house" />
        your network or Tailscale
      </p>
      <div className="phone">
        <p className="phone-title">Threads</p>
        <div className="flip">
          <Row group="orbit-website" tint="rose" name="ORBIT-WEBSITE" state="working" tokens="96k" />
          <Row group="orbit-website" tint="rose" name="ORBIT-WEBSITE" state="done" tokens="97k" />
        </div>
        <Row group="Thesis" tint="mint" name="STATISTICS" state="working" tokens="64k" />
        <Row group="Thesis" tint="mint" name="LINEAR_ALGEBRA" state="idle" tokens="41k" />
      </div>
    </div>
  );
}
