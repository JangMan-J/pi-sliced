// Client of the Author's server: HTTPS GET only, with its pinned certificate as the only CA.

import { readFileSync } from "node:fs";
import https from "node:https";
import { fileURLToPath } from "node:url";
import type { Catalogue, CatalogueApi, Detail } from "./types.ts";

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
    async blob(sha) {
      if (!SHA.test(sha)) throw new Error(`not a blob SHA: ${sha}`);
      return (await get(`v1/blobs/${sha}`, MAX_BLOB)).body;
    },
    close() {
      agent.destroy();
    },
  };
}
