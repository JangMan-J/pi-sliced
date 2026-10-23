This project has a kernel: read KERNEL.md, INVARIANTS.md, GLOSSARY.md, and the open threads in VECTORS/ before changing anything.

## Directives

- "Subscription-backed models only." (2026-10-23)
- "Anthropic models only through the `anthropic` provider." (2026-10-23)
- "Vendor the archive UI from commit 29610c7 (`extensions/slices/checklist.ts` plus its picker wiring). Change one thing: the Domains and Skills.sh tabs become two top-level tree branches." (2026-10-23)
- "Reuse the archive's skill references in `.handoff/curation.sqlite` (10,001 skills, 566 packs), so the search cost is not paid again." (2026-10-23)
- "Reuse the Vercel skills.sh proxy (`gateway/`) and its credentials. Never commit the credentials." (2026-10-23)

## Coding standards
