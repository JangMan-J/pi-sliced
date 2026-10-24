// Client of the Author's server: HTTPS GET only, with its pinned certificate as the only CA.
//
// Everything fetched here (Catalogue listings, Details, licence texts, blobs) is held in memory only.
// Only the Slice writes, and only a Served skill's verified files into its session dir.
// None of these routes is ever advertised to the agent: no catalogue, skill, or blob URL reaches its
// context. The one server URL the agent may see is a Served skill's licence route, named in the
// served_skill load header (surface.ts).

import { readFileSync } from "node:fs";
import https from "node:https";
import { fileURLToPath } from "node:url";
import { gitBlobSha } from "./slice.ts";
import type { Catalogue, CatalogueApi, Detail, LicenceText } from "./types.ts";

export const DEFAULT_SERVER = "https://185.8.106.248:8790";
export const DEFAULT_CATALOGUE = "main";
export const PINNED_CERT = fileURLToPath(new URL("./author-server.pem", import.meta.url));

export interface AuthorClientOptions {
  /** Base URL, e.g. `https://185.8.106.248:8790`. */
  server: string;
  catalogueName: string;
  /** PEM of the only CA trusted for the server. */
  ca: string | Buffer;
  /** Per-request timeout (connect through end of body). */
  timeoutMs?: number;
  /** Maximum simultaneous connections. */
  maxSockets?: number;
}

export interface AuthorClient extends CatalogueApi {
  /** Raw blob bytes as the server sent them. The caller verifies them against the SHA. */
  blob(sha: string): Promise<Buffer>;
  close(): void;
}

const MAX_JSON = 64 * 1024 * 1024;
const MAX_BLOB = 256 * 1024 * 1024;
const SHA = /^[0-9a-f]{40}$/;
const SEG = /^[A-Za-z0-9._-]+$/;

const LICENCE_ROUTE = /^\/v1\/licences\/([A-Za-z0-9._-]+\/[A-Za-z0-9._-]+\/[A-Za-z0-9._-]+)@([0-9a-f]{40})$/;

/** The absolute URL of a server-relative licence route, or undefined when `route` is not one. */
export function licenceUrl(server: string, route: string): string | undefined {
  const m = LICENCE_ROUTE.exec(route);
  if (!m || m[1].split("/").some((p) => p === "." || p === "..")) return undefined;
  return server.replace(/\/+$/, "") + route;
}

export function readPinnedCert(path = PINNED_CERT): Buffer {
  return readFileSync(path);
}

export function createAuthorClient(opts: AuthorClientOptions): AuthorClient {
  const base = new URL(opts.server.replace(/\/+$/, "") + "/");
  if (base.protocol !== "https:") throw new Error(`PI_SLICED_SERVER must be https: ${opts.server}`);
  const timeoutMs = opts.timeoutMs ?? 60_000;
  const agent = new https.Agent({ ca: opts.ca, keepAlive: true, maxSockets: opts.maxSockets ?? 8 });

  function get(path: string, limit: number): Promise<{ type: string; body: Buffer }> {
    const url = new URL(path, base);
    return new Promise((resolve, reject) => {
      const req = https.request(url, { method: "GET", agent, ca: opts.ca, timeout: timeoutMs }, (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size > limit) req.destroy(new Error(`response from ${url.pathname} exceeds ${limit} bytes`));
          else chunks.push(c);
        });
        res.on("end", () => {
          const body = Buffer.concat(chunks);
          if (res.statusCode !== 200) {
            reject(new Error(`Author's server: GET ${url.pathname} → ${res.statusCode} ${body.toString("utf8", 0, 200)}`));
          } else resolve({ type: String(res.headers["content-type"] ?? ""), body });
        });
        res.on("error", reject);
      });
      const timer = setTimeout(() => req.destroy(new Error(`Author's server: GET ${url.pathname} timed out`)), timeoutMs);
      req.on("close", () => clearTimeout(timer));
      req.on("timeout", () => req.destroy(new Error(`Author's server: GET ${url.pathname} timed out`)));
      req.on("error", reject);
      req.end();
    });
  }

  async function getJson<T>(path: string): Promise<T> {
    const { body } = await get(path, MAX_JSON);
    return JSON.parse(body.toString("utf8")) as T;
  }

  let catalogue: Promise<Catalogue> | undefined;
  const details = new Map<string, Promise<Detail>>();
  const licences = new Map<string, Promise<LicenceText>>();

  return {
    catalogue() {
      catalogue ??= getJson<Catalogue>(`v1/catalogues/${encodeURIComponent(opts.catalogueName)}`).then((c) => {
        if (c.format !== "pi-sliced.catalogue/1") throw new Error(`unexpected catalogue format ${c.format}`);
        return c;
      });
      catalogue.catch(() => (catalogue = undefined));
      return catalogue;
    },
    detail(id, revision) {
      const parts = id.split("/");
      if (parts.length !== 3 || !parts.every((p) => SEG.test(p) && p !== "." && p !== "..")) {
        return Promise.reject(new Error(`not a Catalogue skill id: ${id}`));
      }
      if (!SHA.test(revision)) return Promise.reject(new Error(`not a Revision: ${revision}`));
      const key = `${id}@${revision}`;
      let p = details.get(key);
      if (!p) {
        p = getJson<Detail>(`v1/skills/${parts.map(encodeURIComponent).join("/")}@${revision}`).then((d) => {
          if (d.format !== "pi-sliced.detail/1" || d.id !== id || d.revision !== revision) {
            throw new Error(`Author's server returned a different Detail for ${key}`);
          }
          return d;
        });
        details.set(key, p);
        p.catch(() => details.delete(key));
      }
      return p;
    },
    licence(listing) {
      const ref = listing.licence;
      if (!ref) return Promise.reject(new Error(`${listing.id}: no licence was found in its source`));
      const m = LICENCE_ROUTE.exec(ref.route);
      if (!m || m[1] !== listing.id || m[2] !== listing.revision || !licenceUrl(opts.server, ref.route)) {
        return Promise.reject(new Error(`${listing.id}: not its licence route: ${ref.route}`));
      }
      const key = `${listing.id}@${listing.revision}`;
      let p = licences.get(key);
      if (!p) {
        p = getJson<LicenceText>(ref.route.slice(1)).then((t) => {
          if (t.format !== "pi-sliced.licence/1" || t.id !== listing.id || t.revision !== listing.revision) {
            throw new Error(`Author's server returned a different licence for ${key}`);
          }
          if (!Array.isArray(t.files) || t.files.length === 0) throw new Error(`${key}: licence has no files`);
          for (const f of t.files) {
            if (typeof f?.text !== "string" || gitBlobSha(Buffer.from(f.text, "utf8")) !== f.blob) {
              throw new Error(`${key}: licence file ${f?.path} failed verification against blob ${f?.blob}`);
            }
          }
          return t;
        });
        licences.set(key, p);
        p.catch(() => licences.delete(key));
      }
      return p;
    },
    async blob(sha) {
      if (!SHA.test(sha)) throw new Error(`not a blob SHA: ${sha}`);
      return (await get(`v1/blobs/${sha}`, MAX_BLOB)).body;
    },
    close() {
      agent.destroy();
    },
  };
}
