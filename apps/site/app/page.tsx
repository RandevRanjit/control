import { DOWNLOAD_URL, REPO_URL, T3_URL, asset } from "@/lib/site";

const STATES = [
  { key: "needs", label: "needs you" },
  { key: "working", label: "working" },
  { key: "done", label: "done" },
  { key: "failed", label: "failed" },
  { key: "choose", label: "asking you to choose" },
] as const;

const FEATURES = [
  {
    title: "Groups",
    body: "Name a group and put any thread in it, from any folder. Coursework, a client, a side project: you decide how the sidebar is cut, not your file system.",
  },
  {
    title: "Nothing gets lost",
    body: "Threads keep running when the window is closed. After a crash every thread comes back, and the ones that were mid-turn say so. Restarting never sends a message for you.",
  },
  {
    title: "Usage you can see",
    body: "Your 5-hour and weekly limits sit at the foot of the sidebar. When the 5-hour window is running ahead of pace, Control asks working threads to stop spawning subagents and work one step at a time.",
  },
  {
    title: "Compaction on time",
    body: "A big thread that has been idle for 25 minutes is compacted while the prompt cache is still warm, so it costs a cache hit rather than a full re-read.",
  },
  {
    title: "Lock",
    body: "Lock yourself out of a group, or everything, until a time you choose. Running work carries on and anything that needs you still gets through. Nothing lifts it early.",
  },
  {
    title: "Loose ends",
    body: "When an agent hands you something only you can do, like making an account or sending a drafted email, it stays pinned to that thread until it's done.",
  },
  {
    title: "A browser Claude drives",
    body: "Each thread gets a tab in Control's own browser, on one profile that stays signed in. You can watch it work without it taking over your screen. Anything else that would steal focus asks first.",
  },
  {
    title: "Local models",
    body: "Hand private files to a model running on your Mac instead of to Claude. Only its answer comes back to the thread.",
  },
  {
    title: "See what a thread loaded",
    body: "The thread's header lists the hooks, skills, MCP servers, plugins and subagents it's working with.",
  },
  {
    title: "Your settings, in place",
    body: "Settings that live in ~/.claude/settings.json are edited there, and Control keeps the previous copy before every write.",
  },
  {
    title: "Threads that talk",
    body: "Agents can see the other threads in their group and message them. Claude in your terminal can read Control's threads too, over MCP.",
  },
  {
    title: "On your phone",
    body: "Pair a phone over your own network or Tailscale and carry on from anywhere. No account and no cloud relay.",
  },
];

const FROM_T3 = [
  "An event-sourced server that survives restarts",
  "A checkpoint after every turn, with diff and restore",
  "The Agent SDK adapter that runs your installed claude",
  "Worktrees, terminals and source-control integrations",
  "The MCP server agents use to start and message threads",
  "The preview browser, HTML answers and the device panel",
  "Desktop, web and phone apps, paired over LAN or Tailscale",
];

const ADDED = [
  "Groups, needs-you states and a menu bar item",
  "Lock and loose ends",
  "Pace notices when usage runs ahead",
  "Auto-compact while the prompt cache is warm",
  "Idle release that spares threads with a pending loop or cron",
  "Claude updates that wait for working threads to finish",
  "Quiet by default: nothing steals focus without asking",
  "Local models for private files",
  "Settings that edit ~/.claude/settings.json, with backups",
  "Agents that see their siblings; reading your terminal sessions",
  "Its own design",
];

const TAKEN_OUT = [
  "Every provider except Claude",
  "T3 Connect and its sign-in",
  "Windows and Linux builds",
  "Analytics leaving the machine: Control writes them to a local file",
];

function Mark({ size = 19 }: { size?: number }) {
  return (
    <svg width={size} height={(size * 12) / 19} viewBox="0 0 19 12" aria-hidden="true">
      <polyline
        points="1,11 1,9 4,9 4,6 7,6 7,3 10,3 10,6 13,6 13,9 16,9 16,11"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        transform="translate(1 -1)"
      />
    </svg>
  );
}

function List({ title, items }: { title: string; items: readonly string[] }) {
  return (
    <div className="ledger">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  return (
    <>
      <header className="top">
        <a className="brand" href="#">
          <Mark />
          Control
        </a>
        <nav>
          <a href="#features">Features</a>
          <a href="#t3">T3 Code</a>
          <a href="#install">Install</a>
          <a href={REPO_URL}>GitHub</a>
        </nav>
      </header>

      <main>
        <section className="hero">
          <p className="eyebrow">Free and open source · macOS</p>
          <h1>All your Claude Code threads in one window.</h1>
          <p className="lede">
            Control runs the <code>claude</code> you already use, keeps every thread alive, and
            shows you at a glance which one is working, which is done and which needs you. Your
            phone sees the same threads.
          </p>
          <div className="actions">
            <a className="button primary" href={DOWNLOAD_URL}>
              Download for Mac
            </a>
            <a className="button" href={REPO_URL}>
              Source on GitHub
            </a>
          </div>
          <p className="fine">Apple silicon. Needs Claude Code, installed and signed in.</p>
        </section>

        <figure className="window">
          <picture>
            <source srcSet={asset("/fig/app-night.jpg")} media="(prefers-color-scheme: dark)" />
            <img
              src={asset("/fig/app-field.jpg")}
              width={1512}
              height={945}
              alt="Control's window: threads in named groups down the left, each with a coloured state bar, and the conversation in the middle with its tool calls folded into steps."
            />
          </picture>
        </figure>

        <section className="band">
          <h2>Know which thread needs you</h2>
          <p>
            Each thread carries a bar in its state's colour. The menu bar icon counts the threads
            waiting on you, so you can keep the window shut until one is.
          </p>
          <ul className="states">
            {STATES.map((state) => (
              <li key={state.key}>
                <span className={`bar sb-${state.key}`} />
                {state.label}
              </li>
            ))}
          </ul>
        </section>

        <section id="features" className="features">
          {FEATURES.map((feature) => (
            <article key={feature.title}>
              <h3>{feature.title}</h3>
              <p>{feature.body}</p>
            </article>
          ))}
        </section>

        <section className="band">
          <h2>Not only for code</h2>
          <p>
            Control started as a way to run Claude on everything: coursework, research, job
            applications and admin as well as code. Agents can answer with a chart or a table
            instead of a wall of text, open PDFs and Markdown in the side panel, fill in forms in
            the browser and leave you a short list of what's left. Group your threads by the parts
            of your life they belong to.
          </p>
        </section>

        <section id="t3" className="t3">
          <h2>Built on T3 Code</h2>
          <p>
            Control is a hard fork of <a href={T3_URL}>T3 Code</a> by T3 Tools, under the MIT
            licence. T3 Code did the hard engineering, and Control wouldn't exist without it. If you
            want Codex, Cursor or several providers side by side, use T3 Code. If you only use
            Claude and run a lot of it, Control is built around that.
          </p>
          <div className="ledgers">
            <List title="From T3 Code" items={FROM_T3} />
            <List title="Added in Control" items={ADDED} />
            <List title="Taken out" items={TAKEN_OUT} />
          </div>
        </section>

        <section id="install" className="install">
          <h2>Install</h2>
          <ol>
            <li>
              Install <a href="https://claude.com/product/claude-code">Claude Code</a> and sign in
              with <code>claude auth login</code>.
            </li>
            <li>
              <a href={DOWNLOAD_URL}>Download Control</a> and drag it to Applications. It updates
              itself.
            </li>
          </ol>
          <h3>Your account stays yours</h3>
          <p>
            Control never signs you in to anything. It runs your own <code>claude</code>, logged in
            with your own Claude subscription or API key, the same way T3 Code does.
          </p>
          <h3>Phone</h3>
          <p>
            The iPhone app isn't on the App Store yet. Build it yourself with your own Apple
            developer account, following{" "}
            <a href={`${REPO_URL}/blob/main/apps/mobile/README.md`}>apps/mobile/README.md</a>, then
            pair it from <b>Settings → Connections</b> on your Mac.
          </p>
          <h3>From source</h3>
          <p>
            Needs Node 24 and <a href={`${REPO_URL}#build-from-source`}>Vite+&apos;s vp</a>.
          </p>
          <pre>
            <code>{`git clone ${REPO_URL}
cd control && vp i && vp run build:desktop`}</code>
          </pre>
        </section>
      </main>

      <footer className="foot">
        <p>
          <Mark size={15} /> Control is free and open source under the MIT licence. A hard fork of
          T3 Code; not affiliated with Anthropic or T3 Tools.
        </p>
        <p>
          <a href={REPO_URL}>GitHub</a> · <a href={`${REPO_URL}/issues`}>Issues</a> ·{" "}
          <a href={`${REPO_URL}/blob/main/NOTICE`}>Notice</a>
        </p>
      </footer>
    </>
  );
}
