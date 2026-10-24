// Resolves Pi's host-provided packages (`@earendil-works/*`) from the Pi that runs here, as Pi does for extensions.
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

function piParentUrl() {
  if (process.env.PI_SOURCE_DIR) return pathToFileURL(`${process.env.PI_SOURCE_DIR}/package.json`).href;
  const bin = execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim();
  return pathToFileURL(realpathSync(bin)).href;
}

const parentURL = piParentUrl();

export function resolve(specifier, context, next) {
  if (specifier.startsWith("@earendil-works/")) return next(specifier, { ...context, parentURL });
  return next(specifier, context);
}
