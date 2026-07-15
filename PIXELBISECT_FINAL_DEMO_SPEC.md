# PixelBisect — Final Demo Specification

**Track:** Developer Tools  
**Product:** Local CLI tool with a self-contained HTML report  
**Runtime AI:** None

## Product promise

Given a local Git repository, a known-good commit, a known-bad commit, and one page element, PixelBisect automatically finds the first commit where that element becomes visually different.

It returns the culprit commit together with before, after, pixel-difference, and code-difference evidence.

## Positioning

Visual-regression services such as Percy and Chromatic help prevent future regressions in CI. PixelBisect performs retroactive visual forensics: it searches existing repository history to find when a visible regression first appeared.

The underlying inspiration is Git bisect and tools such as Mozilla's mozregression, applied to a web project's own source history and visual output.

## Demo scope

The submitted version intentionally supports:

- Local repositories only
- Node/JavaScript projects
- npm
- Chromium through Playwright
- Linear, first-parent Git history
- One route per investigation
- One viewport
- One watched CSS selector
- One known-good and one known-bad commit
- A regression that remains present after it is introduced
- Repositories whose commits in the selected range can all run

The demo repository is controlled and deterministic. PixelBisect does not attempt to make arbitrary historical web applications reproducible.

---

# Required user stories

These stories are the complete implementation target. The demo is not complete until all of them work together in one uninterrupted run.

## PB-001 — Configure an investigation

> As a developer, I can describe one visual-regression investigation in a small configuration file so that PixelBisect knows what to run and compare.

PixelBisect accepts `pixelbisect.config.json` containing:

```json
{
  "repoPath": "./demo-repo",
  "goodCommit": "visual-good",
  "badCommit": "HEAD",
  "installCommand": "npm install",
  "buildCommand": null,
  "startCommand": "npm run dev -- --port 4173",
  "port": 4173,
  "readinessUrl": "http://127.0.0.1:4173",
  "targetUrl": "http://127.0.0.1:4173/checkout",
  "selector": "#checkout-button",
  "viewport": {
    "width": 1280,
    "height": 720
  },
  "startupTimeoutMs": 15000,
  "captureTimeoutMs": 10000,
  "pixelColorThreshold": 0.1,
  "maxChangedPixelPercent": 0.5
}
```

Acceptance criteria:

- The configuration file is hand-written; there is no setup wizard.
- `badCommit` may default to `HEAD`.
- `buildCommand` may be omitted.
- Required fields are validated before Git operations begin.
- Invalid configuration produces one readable error and a nonzero exit code.
- Git hashes, tags, and branch references are resolved to full hashes.
- The good commit must be an ancestor of the bad commit.
- PixelBisect prints both endpoint commits and the number of commits in the selected first-parent range.

## PB-002 — Protect the active repository

> As a developer, I can run PixelBisect without it changing my current branch, files, or uncommitted work.

Acceptance criteria:

- PixelBisect never checks historical commits out in the active working tree.
- One temporary Git worktree is created for the investigation.
- All installation, builds, checkouts, and server processes run from the temporary worktree.
- The original branch and working files remain unchanged.
- The worktree is removed after success or handled failure.
- Cleanup runs from a `finally` path.

## PB-003 — Clean up interrupted runs

> As a developer, I can cancel an investigation without leaving development servers or temporary worktrees behind.

Acceptance criteria:

- Ctrl+C and termination signals initiate cleanup.
- The active server and its child processes are terminated.
- The configured port is released.
- The temporary worktree is removed when safely possible.
- A second run can start immediately after cancellation.

## PB-004 — Run the investigation with one command

> As a developer, I can start the complete investigation with one command so that no manual checkout, build, screenshot, or comparison work is required.

Command:

```bash
pixelbisect run pixelbisect.config.json
```

For every selected commit, PixelBisect:

1. Checks the commit out in the temporary worktree.
2. Installs dependencies when the lockfile differs from the previously installed lockfile.
3. Runs the optional build command.
4. Starts the configured development server.
5. Waits for the readiness URL.
6. Opens the target URL.
7. Waits for the target selector.
8. Captures the watched element.
9. Compares it with the good baseline.
10. Stops the server before testing another commit.

If installation, building, server startup, navigation, selector lookup, or capture fails, PixelBisect stops with a readable error. The demo version does not attempt automatic skip semantics.

## PB-005 — Capture deterministic screenshots

> As a developer, I receive consistent screenshots so that rendering noise does not produce false commit verdicts.

Acceptance criteria:

- Playwright's bundled Chromium is used for every capture.
- Viewport and device scale factor remain fixed.
- Browser scrollbars are hidden.
- CSS animations, transitions, and caret blinking are disabled through injected capture CSS.
- PixelBisect waits for the readiness URL and target selector.
- PixelBisect waits a fixed 500 ms settling period before capture.
- Only the configured element is captured.
- The demo application uses system fonts, no timestamps, no randomized content, and no external data.

The demo version does not implement clock mocking, network replay, repeated instability detection, or dynamic-region masking.

## PB-006 — Verify the good and bad endpoints

> As a developer, I know that the chosen range contains a detectable visual difference before PixelBisect begins searching it.

Acceptance criteria:

- PixelBisect builds and captures the known-good commit first.
- That screenshot becomes the baseline for the entire run.
- PixelBisect builds and captures the known-bad commit.
- The bad screenshot must differ from the baseline beyond the configured threshold.
- Identical endpoints stop the run with a clear explanation.
- Baseline image dimensions and bad image dimensions must match.
- Images are never silently resized.

## PB-007 — Find the visual transition with binary search

> As a developer, I want PixelBisect to test the minimum number of commits needed to locate the visual regression.

Acceptance criteria:

- PixelBisect constructs the first-parent commit sequence between the verified endpoints.
- It tests the midpoint of the remaining range.
- A commit is good when its screenshot remains within the configured baseline threshold.
- A commit is bad when its screenshot exceeds the threshold.
- Each verdict narrows the good-to-bad boundary.
- The search stops when the first bad commit immediately follows the last good commit in the selected sequence.
- Approximately six comparisons are required for a 64-commit range, excluding endpoint verification.
- The report states that the result assumes a monotonic good-to-bad transition.

## PB-008 — Show live terminal progress

> As a developer, I can see what PixelBisect is doing so that the live run feels active and understandable.

The terminal displays:

- Resolved good and bad commits
- Number of commits in the range
- Current commit and message
- Current phase: checkout, install, build, start, capture, or compare
- Good or bad verdict
- Changed-pixel percentage
- Completed and estimated remaining comparisons
- Total elapsed time

There is no live web dashboard or graphical timeline.

Example:

```text
PixelBisect

Range: 4c21ab1..8e91d02 — 64 commits

[1/6] a83d910  GOOD  0.00% changed
[2/6] e292bc1  BAD   18.42% changed
[3/6] c784ae2  GOOD  0.01% changed
```

## PB-009 — Produce visual comparison evidence

> As a developer, I can see exactly how the last-good and first-bad images differ.

Acceptance criteria:

- Screenshots are compared pixel by pixel.
- Pixel color tolerance comes from the configuration.
- The good/bad verdict uses the configured maximum changed-pixel percentage.
- PixelBisect records the changed-pixel count and percentage.
- PixelBisect generates a highlighted diff image.
- Mismatched image dimensions produce an explicit error.

A changed-region bounding-box algorithm is not required.

## PB-010 — Identify the culprit commit

> As a developer, I receive the first bad commit and its code changes so that I can begin fixing the regression immediately.

The result contains:

- First bad commit full and short hash
- Last good commit hash
- Author
- Date
- Commit message
- Files changed
- Added and removed lines with line numbers
- Full Git diff between the adjacent last-good and first-bad commits
- Comparisons performed
- Run duration

CSS files may receive a visual badge in the report, but PixelBisect does not claim that a particular source line caused the regression.

## PB-011 — Generate a self-contained HTML report

> As a developer, I receive one offline report so that I can inspect and share the investigation without rerunning PixelBisect.

The report embeds:

- Culprit commit information
- Last-good and first-bad screenshots
- Highlighted pixel-difference image
- Changed-pixel count and percentage
- Commit search results
- Investigation configuration
- Culprit Git diff
- Total duration

Acceptance criteria:

- The report works without a server.
- Images are embedded in the HTML file.
- Repository-derived text is HTML-escaped.
- Environment values, cookies, tokens, and browser storage are not included.
- The report warns that screenshots may contain application data.

JSON, Markdown, hosted links, and automatic uploads are not included.

## PB-012 — Provide an interactive before/after slider

> As a developer, I can drag between the last-good and first-bad screenshots so that the regression is immediately visible.

Acceptance criteria:

- The screenshots are perfectly aligned.
- A draggable divider reveals the good and bad images.
- The slider works with mouse and keyboard input.
- The report also provides a highlighted-diff view.
- All interaction works inside the self-contained HTML file.

Zoom, pan, and changed-region navigation are not included.

---

# Optional final enhancement

Implement this only after every required story passes the complete rehearsed run.

## PB-013 — Compare computed styles

> As a developer, I can see which computed CSS properties changed on the watched element so that the visual difference is easier to interpret.

Acceptance criteria:

- PixelBisect captures `getComputedStyle()` for the watched element at the last-good and first-bad commits.
- It displays only properties whose values changed.
- Each row shows the property name, good value, and bad value.
- The comparison is descriptive evidence, not a causality claim.

PixelBisect does not automatically map computed properties to source lines. The ordinary culprit Git diff supplies the source evidence. The planted demonstration regression should contain one obvious CSS custom-property change so the relevant line is immediately visible.

---

# Explicitly not implemented

These are roadmap items, not partially built features:

- Automatic commit skipping
- Ambiguous-result recovery
- Non-monotonic or exhaustive history analysis
- Merge-graph analysis beyond first-parent history
- Initialization wizard
- Framework or package-manager autodetection
- Searchable commit picker
- Live GUI
- Full-page capture
- Multiple selectors
- Multiple routes
- Multiple viewports
- Interaction scripts
- Authenticated pages
- Dynamic-content masking
- Repeated instability detection
- Resume and investigation history
- Exact CSS source-line attribution
- SCSS, Tailwind, or CSS-in-JS attribution
- JSON or Markdown export
- GitHub Actions or issue integration
- Hosted reports
- Remote repositories
- Monorepos
- Docker or sandboxed execution
- Firefox, WebKit, or cross-browser comparison
- Automatic regression fixing
- Fix verification

The README may describe a small selection of these as future work, but it must not imply they are implemented.

---

# Safety statement

PixelBisect executes installation, build, and server commands from historical repository commits. The demo version must display a warning that users should run it only on repositories they trust.

A Git worktree protects the active checkout; it does not sandbox arbitrary code. Containerized execution is future work.

---

# Demonstration repository

The controlled demo repository must have:

- A Vite application
- A simple checkout page
- One stable watched selector, such as `#checkout-button`
- System fonts only
- No animations, timestamps, randomized content, remote APIs, authentication, or feature flags
- A linear history of 64 believable commits
- An unchanged lockfile throughout the selected range
- Every commit installable and runnable
- One commit near the middle that changes a CSS custom property and visibly breaks the checkout button
- No other visual changes to the watched element between the known-good and known-bad endpoints

Example planted regression:

```diff
- --button-primary: #2563eb;
+ --button-primary: #e5e7eb;
```

Use tags such as `visual-good` and `visual-bad` to make the demonstration configuration readable.

---

# Demonstration script

1. Show the broken checkout button at the bad commit.
2. Explain: “This button looked correct 64 commits ago. Which commit changed it?”
3. Briefly show `pixelbisect.config.json`.
4. Run `pixelbisect run pixelbisect.config.json`.
5. Let endpoint verification establish the good baseline and confirm the bad endpoint.
6. Show the terminal narrowing the range through approximately six midpoint comparisons.
7. Open the generated HTML report.
8. Drag the before/after slider.
9. Show the highlighted pixel-difference image.
10. Reveal the first bad commit and the CSS-variable change in its ordinary Git diff.
11. If PB-013 is implemented, show the corresponding computed-style change.
12. Close with: “Visual testing catches tomorrow’s regressions. PixelBisect finds yesterday’s.”

Do not offer to run the demonstration on an unknown judge-provided repository.

---

# Definition of done

PixelBisect is demo-ready only when:

1. A fresh terminal can run the complete command successfully.
2. The active repository remains unchanged.
3. Endpoint verification reliably detects the planted difference.
4. Binary search returns the planted culprit commit.
5. Terminal progress remains understandable throughout the run.
6. The resulting HTML report opens offline.
7. The slider, diff image, commit data, and Git diff all render correctly.
8. Ctrl+C cleanup has been tested during server startup and during the bisect loop.
9. A second run succeeds immediately after cancellation.
10. The full live run completes in less than 90 seconds on the demonstration machine.
11. A backup recording of a successful run exists before the final demo is recorded.

No roadmap item is required for completion.
