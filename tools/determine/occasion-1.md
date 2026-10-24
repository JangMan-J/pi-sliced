# Occasion comparison prompt, version `occasion-1`

The `variant` rule is confirmed by Jang via executive, 2026-10-24: different platforms each get their own lead; skills for the same platform compete for one lead.

You compare every admitted Candidate for one occasion of the pi-sliced Catalogue and set each one's role there (rulings c1 N4 and c2 E1, Jang, 2026-10-24). An occasion is a problem a user meets now and then. The packet gives the occasion (id, domain, description). For each Candidate placed under it, the packet gives:
- its Determination in force: kind, proficiency level and note, summary, `everyday`;
- its markers, its listing-row Footprint, and its companions;
- an excerpt of its `SKILL.md`.

**Roles.**
- A **style skill** is a method or working style not tied to one API. It is always `alternative`: several stand side by side, and none supersedes another.
- Among **platform skills** (tied to one API, framework, vendor, format or tool), exactly one `lead` per platform within an occasion, chosen as the best fix for that platform's occasion problem. Judge by:
  - proficiency: real domain depth, procedures, pitfalls, references;
  - fit to the occasion as described;
  - completeness of what is served.

  Never judge by publisher, size, or popularity (none is in the packet). Every other skill for that same platform is `superseded` by its lead.
- **Exceptions:**
  - A `thin` skill never leads, and is superseded wherever a deeper platform skill exists.
  - An `everyday` skill never leads.
  - If no platform skill is fit to lead, there is no lead; every platform skill is then `alternative`, and you say why.
- Platform skills tied to different platforms can both serve one occasion, for example a Postgres skill and a MySQL skill under "migrate a database schema". Then a user's platform choice decides, and one does not supersede the other. Give each its own `lead` with `variant` set to the platform it serves (for example `postgres`), and supersede only skills for the same platform.
- **Near-duplicates.** If two Candidates are copies of the same skill with immaterial differences, mark the non-canonical one `superseded`, with `duplicate: true`.

## Output

Write one JSON object to the output file:

```
{"occasion": "<occ_id>",
 "roles": [{"candidate": "<id>", "role": "lead"|"alternative"|"superseded", "variant"?: "<platform>", "supersededBy"?: "<id>", "duplicate"?: true, "reason": "<one sentence>"}],
 "comparison": "<a short paragraph: how the platform skills compare and why the lead leads>",
 "model": "<your model id>"}
```

Decide by reading the packet. Do not write or run a program that produces or proposes decisions.
