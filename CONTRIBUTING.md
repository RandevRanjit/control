# Contributing

CONTROL is my personal project. Friends are welcome to try it and send fixes, but a PR is no
promise that I'll review or merge it, and I may fix the same thing my own way.

## Setup

See the [development runbook](docs/operations/development.md#first-checkout).

## What's welcome

- Bug, reliability and performance fixes are the most likely to land. Unsolicited features,
  opinionated rewrites and unrelated cleanup are not.
- Bugs and ideas both go in issues. Search the existing ones first.
- Want to build a feature? Open an issue and get my OK before you start.
- A small, obvious bug fix can go straight to a PR.

## One problem per PR

- One underlying problem per PR, with the contract, server, client, test and doc changes it
  needs. An adjacent cleanup or a second fix goes in its own PR.
- Update any doc your change makes wrong, and don't document what the code already says.
- Commit titles: `Area: brief`, e.g. `Sidebar: snoozed chats wake on a reply`.

## Evidence

Say how you found the problem, how you checked the fix and what you saw, and what you
couldn't check. "Tests pass" alone isn't evidence.

- Use focused tests and manual checks for the behaviour you changed. There's no need to run the
  whole suite for this.
- UI changes need before/after screenshots, plus a short recording for motion or timing.
  Attach them to the PR; don't commit them.

A PR without evidence may be closed. I judge the problem and the evidence, not the writing
style or whether an agent wrote it.

## Closing

If I close your PR, I'll say why and what would get it in.
