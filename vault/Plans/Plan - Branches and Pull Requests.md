---
title: "Plan - Branches and Pull Requests"
tags:
  - plan
  - git
  - github
date: 2026-11-12
---

> [!INFO] Where this fits
> How our work gets from the branch on GitHub into `main`. The migration plan: [[Plan - Full Migration Off Zoho Creator]]. The first module being finished: [[Plan - Finish Procurement]].

# Branches and pull requests

## 1. Buod (Tagalog)
- **Isang pull request lang ang kailangan**: mula sa `feature/postgres-data-layer` papunta sa `main`.
- Ang `feature/zoho-backend-adapter` ay **naka-merge na** (PR #1). Walang gagawin dito; pwede na itong burahin sa GitHub.
- Ang PR ay **Draft** muna, para makita nina Sir Yhel at Sir JV ang kabuuan habang nagdadagdag pa tayo. **I-merge lang kapag tapos na at nasuri na ang Procurement.**
- Ang pag-merge sa `main` ay **hindi nagde-deploy** sa Railway. Mano-mano ang deploy mula sa PC (`railway up`).

## 2. State on GitHub (checked 2026-11-12)
| Branch | Behind `main` | Ahead of `main` | Pull request | What to do |
|---|---:|---:|---|---|
| `main` | - | - | - | Default branch. Untouched by this work (still at the commit "Make npm run dev start the app with login") |
| `feature/zoho-backend-adapter` | 3 | 0 | #1, **merged** | Nothing to review. Delete the branch on GitHub to avoid confusion |
| `feature/postgres-data-layer` | 0 | 17 | [#2](https://github.com/Yhelie08/Supply-Chain-SystemV2/pull/2), Draft | **The only pull request.** Review, then merge when Procurement is done |

`feature/postgres-data-layer` is built directly on top of the current `main`, and `main` has not moved, so there can be no merge conflict.

## 3. Why one pull request and not several
- All the work is one line of commits on one branch; each step builds on the previous one (database layer, then hooks, then Books, then the Inquiry and Purchase Request ports).
- Splitting it by theme would need separate branches and re-testing each one on its own, for no real gain, because the pieces depend on each other.
- To make it easy to review, the PR description lists what each group of commits does, and the commits are already grouped by topic.

## 4. The plan, in order
1. **Push the branch** with all its commits (done).
2. **Open a Draft pull request** from `feature/postgres-data-layer` into `main` (done: #2).
3. **Review**: Sir Yhel and Sir JV read the PR description and the notes in `vault/Plans/` and `vault/Deluge Scripts (Obsidian)/`; to try it, run `npm run dev:pg` (see [[00 - Current System]]).
4. **Keep adding commits** to the same branch as Procurement is finished ([[Plan - Finish Procurement]]); the Draft PR updates itself.
5. **Mark the PR ready and merge** when Procurement is done and the team has checked it (open questions in [[Plan - Finish Procurement]] answered, comparison with Zoho Development done).
6. After the merge, delete `feature/postgres-data-layer` and start the next branch (for example `feature/fulfillment`) from the new `main`.

**Pull request link:** https://github.com/Yhelie08/Supply-Chain-SystemV2/pull/2 (Draft, opened 2026-11-12)

## 5. Things to know
- **Merging does not deploy.** The live site on Railway is updated by hand from a computer (`railway up`), not from GitHub. Nothing in the PR changes the live site by itself.
- **Not in the PR on purpose:** passwords, tokens and Zoho credentials (`server/zoho-credentials.json`, `self_client.json`, `.env` are git-ignored), backups of data (`data/`), and the generated graph (`graphify-out/`, `vault/Graph/`).
- **Do not merge a Draft PR by accident**: GitHub does not allow it until it is marked "Ready for review".
- A branch that is fully merged (like `feature/zoho-backend-adapter`) is safe to delete; the commits stay in `main`.
