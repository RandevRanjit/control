/** What a login page is asking for. */
export type LoginFormKind = "credentials" | "password" | "username";

export interface LoginFormRequest {
  readonly origin: string;
  /** How long to wait for the form; a page may draw it after it loads. */
  readonly waitMs: number;
  /** Fills and submits the form when it is still this kind. Absent, it only looks. */
  readonly fill?: {
    readonly kind: LoginFormKind;
    readonly username: string;
    readonly password: string;
  };
}

/**
 * Code for the page's isolated world that finds its login form, and fills and submits it in one
 * step. Resolves to the form's kind, or null when there is none to sign in with: a sign-up or
 * change-password form, a field someone already typed in, or a page on another origin.
 */
export const loginFormCode = (request: LoginFormRequest) => `(async ({ origin, waitMs, fill }) => {
  const usable = (input) =>
    !input.disabled &&
    !input.readOnly &&
    input.checkVisibility({ opacityProperty: true, visibilityProperty: true });
  const inputs = (root, selector) => [...root.querySelectorAll(selector)].filter(usable);
  const tokens = (input) => (input.getAttribute("autocomplete") ?? "").toLowerCase().split(/\\s+/);
  const TEXT = 'input:not([type]), input[type="text"], input[type="email"], input[type="tel"]';

  const find = () => {
    const passwords = inputs(document, 'input[type="password"]');
    if (passwords.length > 1) return null;
    const [password] = passwords;
    if (password) {
      if (password.value !== "" || tokens(password).includes("new-password")) return null;
      const username = inputs(password.form ?? document, TEXT)
        .filter((input) => input.compareDocumentPosition(password) & Node.DOCUMENT_POSITION_FOLLOWING)
        .at(-1);
      return { kind: username ? "credentials" : "password", username, password, form: password.form };
    }
    const usernames = inputs(document, TEXT).filter((input) => tokens(input).includes("username"));
    if (usernames.length !== 1 || usernames[0].value !== "") return null;
    return { kind: "username", username: usernames[0], form: usernames[0].form };
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const type = (input, value) => {
    input.value = value;
    input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText", data: value }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  };

  const deadline = performance.now() + waitMs;
  let found = find();
  while (!found && performance.now() < deadline) {
    await pause(200);
    found = find();
  }
  if (!found || location.origin !== origin) return null;
  if (!fill) return found.kind;
  if (found.kind !== fill.kind) return null;
  const { form } = found;
  const target = new URL(form?.getAttribute("action") ?? "", document.baseURI);
  if (target.protocol !== "https:") return null;

  if (found.username) type(found.username, fill.username);
  if (found.password) type(found.password, fill.password);
  if (!form) return found.kind;
  const last = found.password ?? found.username;
  const buttons = [
    ...form.querySelectorAll('button[type="submit"], button:not([type]), input[type="submit"]'),
  ];
  const submit =
    buttons.find(
      (button) => last.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) ?? buttons[0];
  // A page may enable its button only after it has seen the input.
  for (let tries = 0; submit?.disabled && tries < 20; tries += 1) await pause(50);
  if (submit && !submit.disabled) submit.click();
  else form.requestSubmit();
  return found.kind;
})(${JSON.stringify(request)})`;
