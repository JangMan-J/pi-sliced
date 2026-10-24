// The licence that governs a Candidate: the nearest licence file at or above its
// skill folder, its SPDX id when the text is recognisable, and any `license:`
// value in the SKILL.md frontmatter. Recorded alongside the Trace; it does not
// change the traced file set (see the "licence notice vs exact served set" note).
import { posix } from "node:path";
import { readBlobs, type Repo } from "./git.ts";

export interface Licence {
  path: string | null;
  spdx: string | null;
  frontmatter: string | null;
}

const NAME = /^(?:LICEN[CS]E|COPYING)(?:[-.][\w.-]+)?$/i;

const SPDX: [string, RegExp][] = [
  ["Apache-2.0", /Apache License[\s\S]{0,40}Version 2\.0/i],
  ["MIT", /Permission is hereby granted, free of charge/i],
  ["BSD-3-Clause", /Redistribution and use in source and binary forms[\s\S]*Neither the name/i],
  ["BSD-2-Clause", /Redistribution and use in source and binary forms/i],
  ["ISC", /Permission to use, copy, modify, and\/or distribute this software for any purpose/i],
  ["MPL-2.0", /Mozilla Public License,? (?:Version|v\.?) 2\.0/i],
  ["GPL-3.0", /GNU GENERAL PUBLIC LICENSE\s+Version 3/i],
  ["AGPL-3.0", /GNU AFFERO GENERAL PUBLIC LICENSE\s+Version 3/i],
  ["CC-BY-4.0", /Creative Commons Attribution 4\.0/i],
  ["Unlicense", /This is free and unencumbered software released into the public domain/i],
];

export function governingLicence(repo: Repo, skillPath: string, skillMd: string): Licence {
  const fm = skillMd.startsWith("---") ? skillMd.split("\n---")[0] : "";
  const fmLicence = fm.match(/^license:\s*(.+)$/m)?.[1].trim().replace(/^["']|["']$/g, "") ?? null;
  for (let d = skillPath; ; d = posix.dirname(d)) {
    const dir = d === "." ? "" : d;
    const hits = [...repo.tree.keys()]
      .filter((p) => posix.dirname(p) === (dir || ".") && NAME.test(posix.basename(p)))
      .sort();
    if (hits.length) {
      const path = hits[0];
      const text = readBlobs(repo, [repo.tree.get(path)!.blob]).get(repo.tree.get(path)!.blob)!.toString("utf8");
      const spdx = SPDX.find(([, re]) => re.test(text))?.[0] ?? null;
      return { path, spdx, frontmatter: fmLicence };
    }
    if (dir === "") break;
  }
  return { path: null, spdx: null, frontmatter: fmLicence };
}
