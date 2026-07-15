# PixelBisect demo video

The repository includes a finished 77.8-second narrated product reel:

- [1080p master](./media/pixelbisect-promo.mp4) — H.264 video, AAC audio, 1920×1080 at 30 fps
- [Animated README preview](./media/pixelbisect-preview.gif) — a purpose-built 12-second silent loop at 800×450 and 10 fps
- [Clean poster frame](./media/pixelbisect-promo-poster.png) — 1440×810

The full edit uses genuine PixelBisect output: a complete deterministic investigation, terminal progress, culprit reveal, interactive before/after slider, report scrolling, pixel evidence, tested-commit table, and Git diff. Motion consists of retiming, crossfades, smooth push-ins, reframing, captions, and title cards; it does not invent product behavior.

The README GIF is a separate clean edit rather than a sample of the narrated video. It contains no captions, narration, or title cards: it eases from the report overview into the culprit, preserves the real slider movement, pans through the evidence, and returns to its opening frame for a continuous loop.

## Narration

> Visual tests tell you when your interface broke. PixelBisect tells you which commit broke it.
>
> Point it at a local repository, a known-good commit, a known-bad commit, a page, and one CSS selector. Then run one command.
>
> PixelBisect creates a protected Git worktree, builds each selected revision, waits for the app, captures deterministic Chromium screenshots, and drives Git's native first-parent bisect.
>
> Here, across sixty-four commits, it finds the exact visual regression in six comparisons—under thirty seconds.
>
> The result is one self-contained offline report: an interactive before-and-after slider, highlighted changed pixels, every tested commit, and the culprit Git diff.
>
> Your code never leaves your machine. No cloud. No account. No API key.
>
> Codex with GPT-5.6 accelerated PixelBisect from architecture and TypeScript implementation through adversarial testing, Windows cleanup debugging, packaging, and visual quality assurance. The product itself has no runtime AI.
>
> PixelBisect: from a broken pixel to the exact commit.

## Edit structure

| Time | Visual |
| --- | --- |
| 0:00–0:06 | Product title and one-line promise |
| 0:06–0:14 | Report overview and the forensic question |
| 0:14–0:29 | Real one-command terminal investigation |
| 0:29–0:42 | Exact culprit reveal: 64 commits, six comparisons, 28.7 seconds |
| 0:42–0:55 | Smooth punch-in on the interactive before/after slider |
| 0:55–1:07 | Investigation configuration, tested commits, and culprit Git diff |
| 1:07–1:13 | Local-only privacy and zero-service requirements |
| 1:13–1:18 | Codex/GPT-5.6 credit and project URL |

The included narration already covers how Codex and GPT-5.6 were used, as requested by the Build Week submission instructions. A human voice can be recorded against the same script and swapped into the existing edit before final YouTube upload if desired.
