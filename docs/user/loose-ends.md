# Loose ends

A loose end is something an agent has handed you to do, or a question it's waiting on you to
answer: make the forum accounts, send the drafted emails, say which forums to post on. Each one
stays with its thread until you've done it, so it doesn't scroll away in a long conversation.

Agents file loose ends themselves, through Control's `loose_end_add` tool; Control never guesses
one from a reply. Unsent composer text, an agent's own to-do list, and pending questions and
approvals aren't loose ends. Each thread has its own list.

## See and close them

The mail icon in the thread's head, left of the command palette button, shows how many are open in
this thread. Click it, or press `mod+e`, to open the list under it; `mod+e` again, `Esc` or a click
anywhere else closes it. Customize `looseEnds.toggle` in **Settings → Keybindings**.

Each item has the agent's line, its reason, and the turn it was filed in; click the turn to
scroll the thread there. An item can carry one action: **Open** a link, **Reveal** a file, or
**Copy** a command. Tick the box when it's done, or press **×** to dismiss one you won't do. The
agent can also close one once it can see it's done. Closed items fold under **Done**, newest
first, with who closed them and when; **Undo** puts one back. Each device remembers whether the
fold is open.

A thread with anything open shows the mail mark and the count on its card. Click the mark to open
that thread with its list up.

Nothing pings: a new loose end changes no lamp, shows no toast and never breaks through a
[lock](./lock.md). The count is the only signal.

## Settling

Settling a thread that still has loose ends open asks first, from the menu, `mod+shift+s`, a drop
on the Settled fold, or the phone. **Settle** keeps them with the thread, and its card keeps the
mark. Threads settled together share one question.

## On the phone

The thread's header has an envelope with the count. It opens a sheet with the same list; drag it up
for more room. A file's action is **Copy** there, which copies its path, since the file is on
your computer.
