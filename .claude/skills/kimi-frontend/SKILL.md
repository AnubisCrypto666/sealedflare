---
name: kimi-frontend
description: Delegate all frontend UI work (layout, styling, React components, responsiveness, animations) in frontend/ to the Kimi K3 CLI, then review and integrate the result.
---

# Kimi frontend delegation

This project's frontend (`frontend/`, Next.js + wagmi) is built by **Kimi K3**, not
written directly by Claude Code. Claude Code's job here is: write a precise brief,
invoke Kimi, then **review, test, and integrate** what it produces. Never hand-write
React components, Tailwind classes, or layout code yourself when this skill applies —
delegate first.

## When this applies

Any task that is primarily about: page/component layout, visual styling, Tailwind
classes, responsiveness, animations/transitions, forms UX, loading/error/empty states,
or new React components/pages under `frontend/`.

Does NOT apply to: contract ABIs/addresses wiring, wagmi hook logic that depends on
contract semantics, encryption code, or anything in `contracts/` or `fce/` — Claude
Code does that directly.

## Prerequisites (one-time, already done)

- Kimi Code CLI installed at `~/.kimi-code/bin/kimi` (`~/.kimi-code/bin` is on PATH
  after a new shell, added to `~/.zshrc` by the installer).
- The user has authenticated once via `kimi login` (device-code flow in their own
  browser — no API key ever passed through this chat). Verify with:
  `kimi provider list` or `kimi doctor config`.
- Confirmed working model alias is **`kimi-code/k3`** (not `k3` — check `kimi provider
  list --json` if this ever changes; the bare `k3` alias does not exist in this OAuth
  setup, only `kimi-code/k3`).

## How to delegate

1. Write a **specific, self-contained brief** — Kimi has no memory of this
   conversation. Include: the exact page/component to build or change, the wagmi/data
   it needs to read or write (contract addresses, ABI names, hook signatures already
   defined elsewhere in the repo), acceptance criteria, and any existing files it
   should follow as style reference.
2. Invoke Kimi non-interactively from the repo root, scoped to `frontend/`:

   ```bash
   kimi -p "<the brief>" --yolo --add-dir frontend -m kimi-code/k3
   ```

   - Use `--yolo` so Kimi can edit/create files without per-action approval prompts
     (it's sandboxed to this repo working tree; changes are all visible in `git diff`
     before anything is committed).
   - Use `--add-dir frontend` (in addition to the default cwd) so it can see the rest
     of the repo (contract ABIs, README) for context while focusing edits on
     `frontend/`.
   - Add `-c` to continue the previous Kimi session when iterating on the same
     feature instead of starting fresh each time.

3. **Review before trusting**: run `git diff -- frontend/` (or `git status` for new
   files) and read every changed file. Check for: hardcoded/fake contract addresses,
   missing error handling on wagmi calls, accessibility basics, and anything that
   contradicts the brief.
4. **Verify it runs**: `cd frontend && npm run dev` (or `npm run build` / `npm run
   lint`) and exercise the affected page in a browser before calling the task done.
5. Fix small issues yourself directly (typos, import paths, wiring a prop) rather than
   round-tripping to Kimi for trivial corrections. Round-trip to Kimi for anything
   that's a real design/layout change.

## Example invocation

```bash
kimi -p "Build the auction creation page at frontend/app/create/page.tsx. Fields: FXRP amount (deposit), reserve price (optional, checkbox to hide), bid window duration (dropdown: 1h/6h/24h). Connect wallet via wagmi (useAccount/useConnect), submit calls a passed-in onSubmit(values) prop — do not invent contract calls. Use Tailwind, match the visual style of frontend/app/page.tsx. Mobile-responsive. Show a disabled-state submit button with validation errors inline." --yolo --add-dir frontend -m kimi-code/k3
```

## Notes

- If `kimi` reports it's not authenticated, stop and tell the user to run `kimi login`
  themselves in their own terminal (never ask them to paste a key into this chat).
- Keep Kimi's scope narrow per call (one page/component at a time) — smaller briefs
  produce more reviewable diffs.
