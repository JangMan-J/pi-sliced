# Occasion domain map

Occasions are problems a Pi user meets now and then, not every day, grouped by the problem the user recognises. 156 occasions in 79 domains, in 14 groups. The data is `catalogue/occasions.tsv` (one row per occasion: weight, audience and its basis, Stack Overflow and GitHub counts with the tags and topics counted). The survey extracts are in `docs/catalogue/survey-so2024.md`.

## How the weights were set

Each occasion has a weight from 1 to 5 for how often and how widely Pi users meet it. Skills.sh install counts and star counts were not used anywhere.

`weight = round(0.6 × A + 0.2 × B_so + 0.2 × B_gh)`, clamped to 1–5.

- **A, audience (1–5).** A judgement of who meets the occasion, anchored on the Stack Overflow Developer Survey 2024 (role shares and technology-use shares) and on O\*NET 15-1252.00 *Software Developers* task statements. Both were fetched live; the extracts are in `survey-so2024.md`. Pi users are mostly developers (survey: full-stack 30.7%, back-end 16.7%, front-end 5.6%, mobile 3.4%, embedded 2.7%, data/ML ~3.6%). Non-developer occasions (legal, finance, marketing, science) get lower A unless every developer meets them too (privacy policy, a hard email, a spreadsheet). The reason for each A is in the table.
- **B_so, problem breadth on Stack Overflow (1–5).** The sum of question counts for the occasion's tags, from the Stack Exchange API. Bands: <1k, 1k–10k, 10k–50k, 50k–200k, ≥200k. This counts questions asked about a problem area, not anything about a skill.
- **B_gh, problem breadth on GitHub (1–5).** The sum of repository counts for the occasion's GitHub topics (repository counts, not stars). Bands: <1k, 1k–5k, 5k–20k, 20k–80k, ≥80k. GitHub topics catch recent areas, such as MCP or LLM evals, that Stack Overflow under-counts.

The tags, topics and raw counts are columns of `catalogue/occasions.tsv`. Weight distribution: 5 → 1 occasion, 4 → 25, 3 → 73, 2 → 52, 1 → 5.

Known bias: the audience term favours developer occasions, by design, because Pi users are mostly developers. Stack Overflow counts favour old, broad technologies; GitHub counts favour fashionable ones. `craft.regex` gets weight 4 from sheer breadth, but one outside author retired his regex skill because "the base model generates, explains" regexes well, so a skill adds little there.

