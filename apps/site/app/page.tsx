import { DOWNLOAD_URL, REPO_URL, T3_URL, asset } from "@/lib/site";
import { Mark } from "./Mark";
import { Reel } from "./Reel";
import { Thermal } from "./Thermal";
import {
  BrowserScene,
  LocalScene,
  LockScene,
  LoginScene,
  NeedsScene,
  PhoneScene,
} from "./scenes";

const SCENES = [
  {
    title: "See who needs you",
    body: "Every thread wears its state, and the menu bar counts the ones waiting on you. The window can stay shut until one is.",
    scene: <NeedsScene />,
  },
  {
    title: "Lock yourself out",
    body: "Agents don't get tired, so there's never a reason to stop. Lock gives you one: pick a time and step away. Only a thread that needs you can call you back.",
    scene: <LockScene />,
  },
  {
    title: "A browser Claude drives",
    body: "Each thread gets its own tab in Control's browser. Watch it work through a page without it taking over your screen.",
    scene: <BrowserScene />,
  },
  {
    title: "Signed in, for you and your agents",
    body: "Save a login once. Control fills it on that exact page, in your tabs and theirs, encrypted with a key in your Mac's Keychain.",
    scene: <LoginScene />,
  },
  {
    title: "Private files stay on your Mac",
    body: "Hand a file to a model running on your own machine. Claude only ever sees the answer.",
    scene: <LocalScene />,
  },
  {
    title: "The same threads on your phone",
    body: "Pair over your own network or Tailscale and carry on from anywhere. No account and no cloud relay.",
    scene: <PhoneScene />,
  },
];

const ALSO = [
  {
    title: "Groups",
    body: "Put any thread in a named group, from any folder. You decide how the sidebar is cut, not your file system.",
  },
  {
    title: "Loose ends",
    body: "What an agent hands you to do stays pinned to its thread until it's done.",
  },
  {
    title: "A checkpoint after every turn",
    body: "See what a turn changed, and restore it.",
  },
  {
    title: "Usage you can see",
    body: "Your 5-hour and weekly limits sit at the foot of the sidebar. Ahead of pace, working threads are asked to stop spawning subagents.",
  },
  {
    title: "Compaction on time",
    body: "A big idle thread is compacted while its prompt cache is still warm, so it costs a cache hit, not a full re-read.",
  },
  {
    title: "Nothing gets lost",
    body: "Threads keep running with the window closed and come back after a crash. Restarting never sends a message for you.",
  },
  {
    title: "Threads that talk",
    body: "Agents can see the other threads in their group and message them. Claude in your terminal can read them too, over MCP.",
  },
  {
    title: "Your settings, in place",
    body: "Control edits ~/.claude/settings.json where it lives and keeps the previous copy before every write.",
  },
  {
    title: "See what a thread loaded",
    body: "Its header lists the hooks, skills, MCP servers, plugins and subagents it's working with.",
  },
];

export default function Home() {
  return (
    <>
      <div className="stage">
        <header className="top">
          <a className="brand" href="#">
            <Mark />
            Control
          </a>
          <nav>
            <a href="#features">Features</a>
            <a href="#install">Install</a>
            <a href={REPO_URL}>GitHub</a>
          </nav>
        </header>

        <section className="hero">
          <h1>All your Claude Code threads in one window.</h1>
          <p className="lede">
            Control runs the <code>claude</code> you already use, keeps every thread alive, and
            shows you which one is working, which is done and which needs you.
          </p>
          <div className="actions">
            <a className="button primary" href={DOWNLOAD_URL}>
              Download for Mac
            </a>
            <a className="button" href={REPO_URL}>
              Source on GitHub
            </a>
          </div>
          <p className="fine">Free and open source. Apple silicon, with Claude Code signed in.</p>
        </section>

        <figure className="window">
          <Thermal />
          <picture>
            <source
              srcSet={asset("/fig/app-night.webp")}
              type="image/webp"
              media="(prefers-color-scheme: dark)"
            />
            <source srcSet={asset("/fig/app-field.webp")} type="image/webp" />
            <img
              src={asset("/fig/app-field.jpg")}
              width={1512}
              height={945}
              fetchPriority="high"
              alt="Control's window: threads in named groups down the left, each with a coloured state bar, and the conversation in the middle with its tool calls folded into steps."
            />
          </picture>
        </figure>
      </div>

      <main>
        <Reel title="Six things it does that a terminal can't.">
          {SCENES.map(({ title, body, scene }, index) => (
            <article className="panel" key={title}>
              <p className="panel-n">{index + 1}</p>
              <h3>{title}</h3>
              <p>{body}</p>
              {scene}
            </article>
          ))}
        </Reel>

        <section className="also">
          <h2>Also in the box</h2>
          <dl>
            {ALSO.map(({ title, body }) => (
              <div key={title}>
                <dt>{title}</dt>
                <dd>{body}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="aside">
          <h2>Not only for code.</h2>
          <p>
            Control started as a way to run Claude on everything: coursework, research, job
            applications and admin. Agents answer with a chart or a table instead of a wall of
            text, open PDFs beside the chat, fill in forms in the browser and leave you a short
            list of what&apos;s left.
          </p>
        </section>

        <section id="install" className="install">
          <div>
            <h2>Install</h2>
            <a className="button primary" href={DOWNLOAD_URL}>
              Download for Mac
            </a>
          </div>
          <ol>
            <li>
              Install <a href="https://claude.com/product/claude-code">Claude Code</a> and sign in.
              <pre>
                <code>claude auth login</code>
              </pre>
            </li>
            <li>
              <a href={DOWNLOAD_URL}>Download Control</a> and drag it to Applications. It&apos;s
              signed and notarised, and it updates itself.
            </li>
          </ol>
          <p>
            Control never signs you in to anything. It runs your own <code>claude</code>, with your
            own Claude subscription or API key.
          </p>
          <p>
            The iPhone app isn&apos;t on the App Store yet: build it with your own Apple developer
            account from{" "}
            <a href={`${REPO_URL}/blob/main/apps/mobile/README.md`}>apps/mobile</a>. To build the
            desktop app yourself, start at{" "}
            <a href={`${REPO_URL}#build-from-source`}>Build from source</a>.
          </p>
        </section>
      </main>

      <footer className="foot">
        <p>
          <Mark size={15} /> Free and open source under the MIT licence. A hard fork of{" "}
          <a href={T3_URL}>T3 Code</a>; not affiliated with Anthropic or T3 Tools.
        </p>
        <p>
          <a href={REPO_URL}>GitHub</a>
          <a href={`${REPO_URL}#documentation`}>Docs</a>
          <a href={`${REPO_URL}/issues`}>Issues</a>
          <a href={`${REPO_URL}/blob/main/NOTICE`}>Notice</a>
        </p>
      </footer>
    </>
  );
}
