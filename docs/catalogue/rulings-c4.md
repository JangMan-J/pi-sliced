# Rulings c4 (Jang via executive, 2026-10-24)

1. **Repair r1c imports.** Quarantine packets 012 and 014 as evidence. Rebuild the judge-12 store from the 41 valid packets. Blind-retry each invalid packet once with a fresh judge; import only on pass. The coordinator brief must state the half-distinct minimum separately from the >20% reuse rule. Commit valid imports and routing by explicit pathspec, pull --rebase, then push.
2. **Prose-directory, in order:**
   - First, without new model calls, score the majority of valid existing Gemini Flash (`judge-14`), Grok Fast (`judge-13`), and Astra (`judge-10`) calibration answers against judge-4 on all 91 prose questions. Record the score in `agreement.txt`. If ≥97%, production uses three judges per question, each answer stored under its own version, with the majority recorded as a derived judge version. An individual failing score does not disqualify a passing panel.
   - Only if the panel fails, authorize one clarified prompt version, freshly and blindly calibrated on `antigravity/gemini-3.8-flash`. Baseline and threshold stay unchanged.
   - For known conflicts `263a340a` and `81ebed0a`, write a half-page giving the sentence, judge-4 answer/reason, clarified ruling reading, and the answer required by kernel Trace rules. Executive will rule on the baseline after reading. Until then both count as misses; fixtures remain untouched.
3. **C3 routing clarification:** duplicate-canonical packets rotate through `meta/muse-wonder-full-1.0`, `xai/grok-4.7`, `antigravity/gemini-4-argon`. Purpose-action reviews alternate per packet between `antigravity/gemini-4-argon` and `meta/muse-wonder-full-1.0`, since reviews precede occasion assignment and occasion runs.

Report counts and agreement numbers after step 1 commits and the panel score is known.
