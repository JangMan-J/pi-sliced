# Audit of unresolvable rejections

## Method

Population: 1,436 human-authored `rejectFor: unresolvable` Determinations. Original deterministic strata retained: 10 `anthropics/` and 20 other Candidates, ordered within each group by SHA-256 of `unresolvable-audit-v1` + NUL + Candidate identifier. Four additional non-`anthropics/` Candidates were selected as the next entries in that same order having pinned Revisions, skipping the four no-pin records. Inspected each available pinned commit using `git ls-tree -r` in `~/.cache/pi-sliced/git`; counted tree entries and all case-insensitive `SKILL.md` paths. Examined each skill file’s directory basename and exact frontmatter `name` for Candidate-name matches. No checkout, refresh, history search, or skill execution.

## Result

Possible false rejections: **0/30 evaluated pinned cases (0%)**. Four original sample cases have no pinned commit and remain inspection gaps; they are not included in the evaluated denominator. The expanded set contains 34 rows: 30 evaluated plus those 4 gaps.

## Sample

| Candidate | Pinned revision | Tree result | Tree entries | SKILL.md files | Name-matching paths | Example sibling SKILL.md paths (anthropics) |
|---|---|---:|---:|---:|---|---|
| `anthropics/life-sciences/instrument-data-to-allotrope` | `6aab04111074ac932ef9f72e36216ab6ff153f11` | read | 27 | 2 | — | clinical-trial-protocol-skill/SKILL.md; scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/metrics-tracking` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/compensation-benchmarking` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/resource-planning` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/customer-pulse` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/life-sciences/scvi-tools` | `6aab04111074ac932ef9f72e36216ab6ff153f11` | read | 27 | 2 | — | clinical-trial-protocol-skill/SKILL.md; scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/escalation` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/campaign-planning` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/crm-cleanup` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `anthropics/knowledge-work-plugins/user-research-synthesis` | `33d3dea41a341b341d4f5da2e8801ae0c89be2b8` | read | 1285 | 252 | — | bio-research/skills/instrument-data-to-allotrope/SKILL.md; bio-research/skills/nextflow-development/SKILL.md; bio-research/skills/scientific-problem-selection/SKILL.md |
| `nvidia/skills/perf-moe-comm-overlap` | `80fd955e037bbd73cd1799fe0c6fd6612bedb8e0` | read | 5977 | 416 | — | — |
| `openshift/oc/pr-review` | `586088c46cba2cd87e1a128a304fe484cf678cd5` | read | 11777 | 3 | — | — |
| `github/awesome-copilot/suggest-awesome-github-copilot-prompts` | `613efc8c21d9b3ce642dff361d17006cd9967e28` | read | 3524 | 453 | — | — |
| `microsoft/skills-for-fabric/activator-authoring-cli` | `bc42aaf734771bf752c1d7082dd91e5a6ca72b9f` | read | 844 | 51 | — | — |
| `github/awesome-copilot/sync-agents` | `613efc8c21d9b3ce642dff361d17006cd9967e28` | read | 3524 | 453 | — | — |
| `flutter/skills/flutter-testing` | `f813a46b18456a20f37eb5784c091b7d945c3b4b` | read | 111 | 31 | — | — |
| `nvidia/skills/tao-run-on-local-docker` | `80fd955e037bbd73cd1799fe0c6fd6612bedb8e0` | read | 5977 | 416 | — | — |
| `microsoft/skills-for-copilot-studio/patterns` | `fd9653d0ec743b39443596d7132f907d0d993f1f` | read | 147 | 31 | — | — |
| `vercel-labs/vercel-skills/ai-elements` | `none` | no pinned commit | — | — | — | — |
| `auth0/agent-skills/auth0-angular` | `7b3821d533430eef35fd7406a87b7b8d02302bdf` | read | 213 | 1 | — | — |
| `openai/codex/code-breaking-changes` | `970111f6cb62cc02fe36a82ea7d71b37a2889c97` | read | 9515 | 5 | — | — |
| `callstackincubator/agent-device/react-devtools` | `c48d27a819c1af69373c2afd78862f6c747e8961` | read | 5461 | 4 | — | — |
| `pulumi/agent-skills-private/pulumi-arm-import` | `none` | no pinned commit | — | — | — | — |
| `vercel/internal-agent-skills/last-week-at-vercel` | `none` | no pinned commit | — | — | — | — |
| `cloudflare/cloudflare-docs/durable-objects` | `b519cfe1a3d960b94a33945bce1a585f7c2113b8` | read | 14077 | 4 | — | — |
| `microsoft/skills-for-fabric/powerbi-consumption-cli` | `bc42aaf734771bf752c1d7082dd91e5a6ca72b9f` | read | 844 | 51 | — | — |
| `hashicorp/hashicorp-agent-skills/github` | `none` | no pinned commit | — | — | — | — |
| `auth0/agent-skills/auth0-aspnetcore-api` | `7b3821d533430eef35fd7406a87b7b8d02302bdf` | read | 213 | 1 | — | — |
| `langchain-ai/deepagents/swarm` | `a3381668c4d3b558742101fa7e6b8fe4a64e56ef` | read | 1850 | 26 | — | — |
| `microsoft/webwright/webwright` | `ff44a0524e0812b69814efcec5e583f0d8cdde0c` | read | 198 | 1 | — | — |
| `dagster-io/skills/dgprototype` | `ed0248b1b6b70710a8785e3ff4880b44496c0f94` | read | 227 | 2 | — | — |
| `nvidia/skills/nemoclaw-user-configure-inference` | `80fd955e037bbd73cd1799fe0c6fd6612bedb8e0` | read | 5977 | 416 | — | — |
| `microsoft/agent-framework/python-samples` | `4982e4c61ec81cc4f9ba0cbdb5594ed530dbbcfe` | read | 5561 | 38 | — | — |
| `clerk/cli/clerk` | `6dbca61ba3350fa4825b7013ce4b4c23a95a7f33` | read | 900 | 3 | — | — |

## Limitations and recommendations

This is a deterministic, stratified audit sample, not a probability sample across independent repositories: multiple Candidates share repositories and pinned commits. A complete tree read with nonzero `SKILL.md` counts and no matching folder/frontmatter name is an inspected negative, not a failed read. The four no-pin cases cannot be tested at a pinned Revision under the no-refresh/no-history constraint. Folder basename and exact frontmatter-name matching cannot rule out an intended skill under an unrelated name. No repair is recommended from the 30 evaluated cases. If later evidence identifies a lookup miss, preserve append-only Traces and Determinations and add corrected records rather than overwriting.
