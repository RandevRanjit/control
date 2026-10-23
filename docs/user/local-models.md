# Local models

A local model runs on your Mac. It serves two ways: as a tool for private files that shouldn't
reach Claude, and, if you turn on its **Chats** switch, as a model you can chat with. As a tool, an
agent hands a model files by path, Control reads them and sends them to the model, and only the
model's answer comes back. The files' contents never enter Claude's context, the transcript or a
log.

Add models in **Settings → Local models**. **Add** lists the GGUF
files in `~/models` and the Hugging Face cache; a vision projector beside a model is attached to
it. On the desktop, **Browse** adds any other GGUF. Control fills in a `llama-server` command from
the file, keeping the flags of a `serve.sh` beside it, and sets the host and port itself, so the
model listens on this Mac only. Select a model to edit its name, command, system prompt and how
long it stays awake; changes apply at its next wake. Adding and editing are on the desktop.

A model is **asleep**, **waking** (loading, then reading its system prompt once) or **ready**. An
agent's call wakes an asleep model, or you can press **Wake**. A ready model sleeps after its idle
minutes with no call running; **Sleep**, on its Settings row, its sidebar note or **Sleep local
models** in the palette, ends it at once. While a model is awake, a note under the update note
shows it. On the phone, the note sits at the top of the chat list, and Settings → Local models lists
every model with **Wake** and **Sleep**.

Before a wake, Control checks the Mac's memory. A wake that would leave less than 15 GB free, or
one while the Mac is using swap, is refused with the numbers, and Control doesn't put other models
to sleep to make room. A model over 40 GB asks first when an agent wakes it, in the chat the way
a permission request does, or in place in Settings. Quitting Control puts every model to sleep,
and after a crash Control ends the models it started, and only those.

With **Chats** on, the model joins the chat model picker, marked **Local**. A chat on it is still
Claude Code, with the same tools and permissions, but every call goes to the model on this Mac.
Sending wakes it; it stays awake while the chat's Claude Code process lives, then sleeps after its
idle minutes. Leave Chats off for a model built for one job. The first turn is slow: Claude Code's
instructions and tools come to tens of thousands of tokens, which the model reads before it
answers, and later turns reuse that reading. Sending is your approval, so a model over 40 GB wakes
without asking; the memory check still applies. A new chat's title is still written by the title
model in Settings from your first message.

Agents use Control's `local_model_list`, `local_model_wake`, `local_model_sleep` and
`local_model_run` tools.
