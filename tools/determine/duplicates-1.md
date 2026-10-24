# Duplicates prompt, version `duplicates-1`

You decide the canonical copy within groups of agent skills that share an identical `SKILL.md` (rulings c2 E3, Jang, 2026-10-24). Each group in the packet lists:
- its members (Candidate ids, source repositories, Revisions, file counts);
- the exact-duplicate classes: members whose whole traced file sets match;
- for each member after the first, the files it lacks or adds against the first member;
- each member's provenance evidence: the repository README, plugin manifests, licence and notice files.

**Exact duplicates.** Within each exact-duplicate class of two or more members, pick one canonical member. Upstream origin wins: the member from the repository where the skill was written, as opposed to a repository that vendors, mirrors or bundles it. Evidence for this includes:
- a README or manifest that says "vendored from", "mirrors" or "collection of";
- a licence or notice crediting another project;
- a plugin marketplace that bundles other authors' skills;
- a repository whose name or owner matches the skill's author.

There is one exception. If the upstream member's served set lacks files the vendored member has, or the upstream member is unresolvable, the complete member is canonical, and your reason says why. Every other member of the class is a duplicate of the canonical member.

**Near-duplicates.** These are members that share `SKILL.md` but differ elsewhere. Say whether each is:
- `same`: the differences are immaterial to what the skill does (a README, licence or metadata file);
- `distinct`: the differences change what the skill serves (other references, scripts or assets).

A `same` member counts as a duplicate of the canonical member of the group. A `distinct` member is decided on its own later.

Never use popularity, stars or install counts; they are not in the packet.

## Output

Write one JSON line per group, in packet order:

```
{"group": <group number>, "classes": [{"members": ["<id>", …], "canonical": "<id>", "reason": "<one or two sentences: the upstream evidence, or the exception>"}],
 "near": [{"member": "<id>", "verdict": "same"|"distinct", "canonicalOf": "<id it duplicates when same>", "reason": "<one sentence>"}],
 "model": "<your model id>"}
```

`classes` holds every exact-duplicate class that has two or more members. `near` holds every member whose file set differs from the canonical member's.

Decide every group by reading its packet entry. You may read a source's other files from its clone (`git -C ~/.cache/pi-sliced/git/<owner>/<repo>.git show <revision>:<path>`) when the evidence in the packet is not enough. Do not write or run a program that produces or proposes decisions.
