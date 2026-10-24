// A local HTTPS stand-in for the Author's server, with a throwaway self-signed cert.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import os from "node:os";
import { join } from "node:path";
import { gitBlobSha } from "../slice.ts";
import type { Catalogue, Detail, LicenceRef, LicenceText } from "../types.ts";

export function throwawayCert(): { key: Buffer; cert: Buffer } {
  const dir = mkdtempSync(join(os.tmpdir(), "pi-sliced-test-cert-"));
  try {
    execFileSync("openssl", [
      "req", "-x509", "-newkey", "ec", "-pkeyopt", "ec_paramgen_curve:prime256v1", "-nodes",
      "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem"), "-days", "1",
      "-subj", "/CN=127.0.0.1", "-addext", "subjectAltName=IP:127.0.0.1",
    ], { stdio: "ignore" });
    return { key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export interface FakeFile {
  path: string;
  bytes: Buffer;
  mode?: string;
}

export const REVISION = "0123456789abcdef0123456789abcdef01234567";

export function makeDetail(id: string, skillPath: string, files: FakeFile[], licence: LicenceRef | null = null): Detail {
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const outside = files.filter((f) => !f.path.startsWith(skillPath + "/"));
  const md = files.find((f) => f.path === `${skillPath}/SKILL.md`)!;
  return {
    format: "pi-sliced.detail/1",
    id,
    name: id.split("/")[2],
    description: `Description of ${id}`,
    summary: "s",
    domain: "d",
    source: id.split("/").slice(0, 2).join("/"),
    revision: REVISION,
    skillPath,
    footprint: {
      files: files.length,
      bytes: total,
      outsideFolder: { files: outside.length, bytes: outside.reduce((n, f) => n + f.bytes.length, 0) },
      outside: [],
      summary: `${files.length} files`,
      short: `${files.length} files`,
    },
    heavy: false,
    heavyBecause: [],
    markers: [],
    security: {},
    companions: { named: [], pulled: [] },
    classification: `classifications/${id}.json`,
    licence,
    files: files.map((f) => ({ path: f.path, size: f.bytes.length, blob: gitBlobSha(f.bytes), mode: f.mode ?? "100644" })),
    skillMd: md.bytes.toString("utf8"),
  };
}

/** A licence document for `detail`, whose files are `{ path, text }` hashed as git blobs. */
export function makeLicence(detail: Detail, files: Array<{ path: string; text: string }>): LicenceText {
  return {
    format: "pi-sliced.licence/1",
    id: detail.id,
    source: detail.source,
    revision: detail.revision,
    spdx: detail.licence?.spdx ?? null,
    copyright: detail.licence?.copyright ?? null,
    files: files.map((f) => ({ ...f, blob: gitBlobSha(Buffer.from(f.text, "utf8")) })),
  };
}

export async function startFake(details: Detail[], blobs: Map<string, Buffer>, licences: LicenceText[] = []) {
  const { key, cert } = throwawayCert();
  const requests: string[] = [];
  const catalogue: Catalogue = {
    format: "pi-sliced.catalogue/1",
    name: "test",
    domains: { d: "Domain" },
    skills: details.map(({ format: _f, files: _x, skillMd: _m, ...listing }) => listing),
  };
  const server = https.createServer({ key, cert }, (req, res) => {
    requests.push(req.url ?? "");
    const url = req.url ?? "";
    let m: RegExpExecArray | null;
    if (url === "/v1/catalogues/test") return void res.end(JSON.stringify(catalogue));
    if ((m = /^\/v1\/skills\/(.+)@([0-9a-f]{40})$/.exec(url))) {
      const d = details.find((x) => x.id === m![1] && x.revision === m![2]);
      if (d) return void res.end(JSON.stringify(d));
    }
    if ((m = /^\/v1\/licences\/(.+)@([0-9a-f]{40})$/.exec(url))) {
      const t = licences.find((x) => x.id === m![1] && x.revision === m![2]);
      if (t) return void res.end(JSON.stringify(t));
    }
    if ((m = /^\/v1\/blobs\/([0-9a-f]{40})$/.exec(url)) && blobs.has(m[1])) {
      res.setHeader("content-type", "application/octet-stream");
      return void res.end(blobs.get(m[1]));
    }
    res.statusCode = 404;
    res.end("not found");
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `https://127.0.0.1:${port}`,
    ca: cert,
    requests,
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}
