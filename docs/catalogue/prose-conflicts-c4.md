# Prose conflicts `263a340a` and `81ebed0a`

Same sentence, two skills, both `prose-directory`. Judge-4 and the fixtures stay as stored. Ruling c4: both count as misses until the executive rules on the baseline.

## Sentence

Never write ease curves / ms / stagger (those resolve in Step 5 from this skill's local `../../hyperframes-animation/rules/`).

- `263a340afc61cb75bc49abd3281a7f359878c798a8223f62cebbf4fbdb0c1755` — `skills/product-launch-video/references/visual-design.md:70`, under "Frame 3 — The problem".
- `81ebed0ad9fc42d7c85ee9d5e2e18a2944ae6946de470313064962fc46166d3a` — `skills/faceless-explainer/references/visual-design.md:70`, under "Frame 3 — How interest compounds".

Both refs are `` `../../hyperframes-animation/rules/` ``. The calibration target is the directory `skills/hyperframes-animation/rules` (48 files). The neighbouring line says to name the move from `motion-language.md` and not to write ease, millisecond, or stagger values.

## Judge-4

Both `pullsIn: false` (`judge-4`, `claude-sonnet-5-5`).

- `263a340a`: "Prohibition aside noting where eases resolve; the sentence does not itself direct reading the directory."
- `81ebed0a`: "Prohibition aside noting where eases resolve, not itself a direction to read the directory."

## Clarified ruling

`tests/trace/rulings.md`, the F1/F8 clarification (Jang via executive, 2026-10-24):

(i) A direction to any worker in the skill's workflow counts, at any step, including a later step. The ruling's example is that "concrete rules resolve in Step 5 from `rules/`" are directions: if that directory were not served, the step would fail on a missing file.

(iii) An explicit prohibition is never a pull-in. The examples are "never assume `../media-use`" and "do not read X": prohibitions of using the reference itself.

F8 still asks whether the prose names the directory as something to use. The verb list is only a hint.

## Kernel reading

Frozen Pull in: a pulled-in file pulls a file in when it directs the agent to read, run, or load it, including by a directory reference. A file that is only mentioned and never used is not pulled in.

"Never write ease curves / ms / stagger" forbids writing those tokens in the scene line. It does not forbid reading the directory, so (iii) does not cover the path. The parenthetical is the clarification's example: Step 5 resolves those values from `skills/hyperframes-animation/rules`. That is a later workflow step that loads the directory, not a location aside and not a pure mention. Leaving it unserved would make Step 5 fail. The clarification keeps a real direction; it does not misread the definition.

The answer the kernel Trace rules require is `pullsIn: true`.

Judge-4's `false` remains the baseline. Both questions are misses against it. This note does not change fixtures, judge-4, or `agreement.txt`.
