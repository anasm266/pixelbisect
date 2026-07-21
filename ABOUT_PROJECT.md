# PixelBisect

> **Visual testing catches tomorrow's regressions. PixelBisect finds yesterday's.**

## Inspiration

Visual-regression tools are good at telling developers that an interface is broken **now**. They rarely answer the more expensive question:

> Which historical commit introduced the regression?

That usually means manually checking commits, rebuilding old versions, comparing screenshots, and hoping the bug is obvious. I built PixelBisect to automate that entire investigation.

## What it does

PixelBisect is a local visual-regression forensics CLI. You provide:

- A local Git repository
- A known-good commit
- A known-bad commit
- A page URL
- A CSS selector for the affected interface region

PixelBisect then checks historical revisions automatically. For each selected commit, it installs or reuses dependencies, starts the real application, waits for it to become ready, captures a deterministic Chromium screenshot, and classifies the result using thresholded pixel comparison.

Native Git bisect selects each revision, so the number of comparisons grows logarithmically:

$$
\text{comparisons} \approx \left\lceil \log_2(n) \right\rceil
$$

For the included 64-commit demonstration:

$$
\left\lceil \log_2(64) \right\rceil = 6
$$

The final result includes the exact first-bad commit and a self-contained HTML evidence report containing:

- Commit hash, author, date, and message
- Last-good and first-bad screenshots
- An interactive before-and-after slider
- A highlighted pixel-difference image
- Changed-pixel statistics
- Computed CSS changes
- The adjacent Git patch
- Every commit tested during the investigation

The report works completely offline. PixelBisect requires no account, API key, database, hosted backend, or paid service.

## The demonstration

The reproducible demo creates a fleet-operations dashboard with a deterministic 64-commit history.

The dashboard still reports **18 drivers online**, but seven driver markers have disappeared beneath two service-zone overlays. The data is correct, the DOM elements still exist, and most of the interface looks unchanged.

PixelBisect reduces the entire history to six comparisons and identifies the responsible commit in 43.9 seconds.

The root cause is one distant design-token change:

```diff
- --layer-map-marker: 30;
+ --layer-map-marker: 3;
```

Only 1,589 of 778,800 pixels changed—approximately 0.204%—but the operational impact is significant. PixelBisect connects that subtle product symptom directly to the commit and source patch that introduced it.

## How I built it

PixelBisect is a TypeScript CLI running on Node.js.

Git provides revision resolution, first-parent history, detached worktrees, and native `git bisect run`. The detached worktree is important because historical builds never touch the developer's active checkout or uncommitted work.

At each revision, PixelBisect:

1. Checks out the selected commit inside the temporary worktree.
2. Reuses dependencies when the lockfile has not changed.
3. Runs the configured installation and build commands.
4. Starts the application and polls its readiness URL.
5. Opens the target page with Playwright and Chromium.
6. Fixes the viewport and freezes time and animation.
7. Waits for fonts and the target element.
8. Captures the selected interface region.
9. Compares it against the known-good baseline using `pixelmatch`.
10. Returns a good or bad verdict to Git bisect.

Once the culprit is found, PixelBisect captures the adjacent good and bad revisions again, compares their computed styles, collects their Git metadata and patch, and embeds all evidence into one portable HTML file.

## How I used Codex

I built PixelBisect with Codex and GPT-5.6 as my primary engineering partner.

Codex helped transform the initial concept into a focused developer tool, implement the TypeScript CLI, design the evidence report, create the deterministic 64-commit fixture, and develop adversarial tests for failed builds, occupied ports, hanging servers, Git state, and interruption cleanup.

It was especially valuable when diagnosing Windows process-tree races from CI logs. Codex also helped harden cross-platform cleanup, visually inspect report renders, improve the demonstration, validate npm packaging, and run the final release and reliability checks.

The most important architectural decisions made during that collaboration were to use native Git bisect, protect the active repository with a detached worktree, keep all evidence offline, and treat cleanup as a core product feature.

Codex and GPT-5.6 were development tools, not runtime dependencies. PixelBisect never sends repository contents or screenshots to an AI service.

## Challenges I faced

### Safely running historical code

The binary search itself is straightforward. Safely building and serving dozens of historical revisions is not.

A server can fail during startup, spawn child processes, leave a port occupied, or be interrupted halfway through an investigation. Windows and POSIX systems also terminate process trees differently.

PixelBisect therefore verifies port release, handles late Windows listeners, resets Git bisect state, removes its temporary worktree, and restores the repository on success, failure, and `Ctrl+C`.

### Producing trustworthy screenshots

Small sources of nondeterminism can make visual testing unreliable. Animations, clocks, fonts, viewport differences, and anti-aliasing can all create false positives.

PixelBisect fixes the viewport, waits for fonts, freezes time and animation, rejects mismatched screenshot dimensions, and separates per-pixel color tolerance from the overall changed-pixel threshold.

### Making the result actionable

Finding a commit hash was not enough. A developer still needs to understand what visually changed and where to begin investigating.

The final report places the screenshots, highlighted pixels, runtime CSS differences, commit information, and adjacent source patch in one evidence package.

## What I learned

The biggest lesson was that a developer tool earns trust through its failure paths. The happy-path algorithm is only a small part of the product. Cleanup, interruption handling, deterministic execution, and useful diagnostics required most of the engineering effort.

I also learned that visual evidence becomes much more valuable when several perspectives are combined. A screenshot explains the symptom, computed styles explain the browser's runtime state, and the Git patch reveals the code change. Together, they reduce a vague visual bug to an actionable investigation.

Finally, deliberately narrowing the first release made it stronger. PixelBisect focuses on one repository, one browser, one route, one selector, and one regression boundary—and tests that workflow thoroughly.

## Accomplishments

- Finds one planted regression across 64 commits in six comparisons
- Generates a portable, interactive, offline evidence report
- Preserves the active checkout and uncommitted files
- Cleans up Git, browser, server, worktree, process, and port state
- Passes 34 unit, integration, and end-to-end tests
- Passed five consecutive complete reliability investigations
- Passes CI on Windows and Ubuntu
- Ships as a compiled, judge-ready npm tarball
- Requires no API key, account, backend, or paid service

## What's next

The next additions would be:

- Skipping historical commits that cannot build
- Playwright interaction scripts for stateful regressions
- Multiple selectors in one investigation
- Additional package managers and browsers
- A GitHub Action that attaches reports to visual-bug issues
- Optional container isolation for executing untrusted historical code

The central idea will remain the same: private, local, reproducible visual-regression investigation.
