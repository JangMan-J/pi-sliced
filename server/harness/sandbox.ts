// Host side: stage the extension and harness, then run drive.ts inside a sandbox.
//   filesystem (bwrap): / read-only; /home replaced by a tmpfs holding only the Pi install, the
//     staged copy, an empty HOME, an empty cwd and the out dir; private /tmp, /var/tmp, /dev/shm.
//     So the Author's store, ~/.config/pi-sliced, ~/.cache/pi-sliced and the repo are not visible.
//   network "isolated" (pasta + nft): own namespace at 10.213.0.2 whose only reachable
//     non-loopback destination is the Author's server; every frame recorded with --pcap.
//   network "host": the host's network (for checks that also need the Skills.sh proxy).
import { execFileSync, spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

export const repo = resolve(dirname(new URL(import.meta.url).pathname), "../..");
export const DEFAULT_SERVER = "https://185.8.106.248:8790";
export const serverUrl = () => process.env.PI_SLICED_SERVER || DEFAULT_SERVER;

/** Host paths a session must not see (the Author's local files). */
export function authorPaths(): string[] {
  const h = process.env.HOME!;
  return [
    join(process.env.XDG_DATA_HOME || join(h, ".local/share"), "pi-sliced"),
    join(h, ".config/pi-sliced"),
    join(h, ".cache/pi-sliced"),
    join(repo, "server"),
    join(repo, "traces"),
  ];
}

export function piCli(): string {
  const p = process.env.PI_SLICED_PI_CLI || execFileSync("sh", ["-c", "command -v pi"], { encoding: "utf8" }).trim();
  return realpathSync(p);
}
/** The Pi install root to expose read-only (the monorepo root when Pi runs from a checkout). */
function piRoot(cli: string): string {
  const mono = resolve(cli, "../../../..");
  if (existsSync(join(mono, "node_modules/@earendil-works"))) return mono;
  return resolve(cli, "../..");
}

export interface SandboxOptions {
  name: string;
  /** Scenario module, repo-relative (staged with the harness). */
  scenario: string;
  net: "isolated" | "host";
  /** Extra env for every Pi session (on top of HOME/PATH/LANG/TERM and the mock port). */
  sessionEnv: Record<string, string>;
  /** Scenario arguments (JSON), read by the scenario as `h.args`. */
  args?: unknown;
}
export interface SandboxRun {
  work: string;
  /** Host-side paths of the sandbox's HOME, /tmp, cwd and out dir. */
  home: string;
  tmp: string;
  proj: string;
  out: string;
  pcap?: string;
  code: number | null;
  /** Namespace address (isolated only). */
  local?: string;
  allow?: { host: string; port: number };
  cleanup(): void;
}

const NS_ADDR = "10.213.0.2";
const NS_GW = "10.213.0.1";

export async function runSandbox(o: SandboxOptions): Promise<SandboxRun> {
  const work = mkdtempSync(join(tmpdir(), `pisliced-harness-${o.name}-`));
  const stage = join(work, "stage");
  const dirs = { home: join(work, "home"), tmp: join(work, "tmp"), proj: join(work, "proj"), out: join(work, "out") };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });
  cpSync(join(repo, "extensions/pi-sliced"), join(stage, "extensions/pi-sliced"), { recursive: true });
  cpSync(join(repo, "server/harness"), join(stage, "server/harness"), {
    recursive: true,
    filter: (src) => !src.startsWith(join(repo, "server/harness/out")),
  });
  cpSync(join(repo, "package.json"), join(stage, "package.json"));

  const cli = piCli();
  const IN = { stage: "/home/stage", home: "/home/stranger", proj: "/home/proj", out: "/home/out" };
  const bwrap = [
    "bwrap",
    "--ro-bind", "/", "/",
    "--tmpfs", "/home",
    "--tmpfs", "/root",
    "--tmpfs", "/run/user",
    "--tmpfs", "/var/tmp",
    "--dev", "/dev",
    "--tmpfs", "/dev/shm",
    "--proc", "/proc",
    "--ro-bind", piRoot(cli), piRoot(cli),
    "--ro-bind", stage, IN.stage,
    "--bind", dirs.home, IN.home,
    "--bind", dirs.proj, IN.proj,
    "--bind", dirs.out, IN.out,
    "--bind", dirs.tmp, "/tmp",
    "--chdir", IN.proj,
    "--unshare-pid", "--unshare-ipc", "--unshare-uts", "--die-with-parent",
    "--clearenv",
    "--setenv", "HOME", IN.home,
    "--setenv", "PATH", "/usr/bin:/bin",
    "--setenv", "LANG", "C.UTF-8",
    "--setenv", "PI_SLICED_PI_CLI", cli,
    "--setenv", "PI_SLICED_HARNESS_OUT", IN.out,
    "--setenv", "PI_SLICED_SESSION_ENV", JSON.stringify(o.sessionEnv),
    "--setenv", "PI_SLICED_HIDDEN", authorPaths().join(":"),
    "--setenv", "PI_SLICED_SCENARIO_ARGS", JSON.stringify(o.args ?? {}),
    "--",
    "/usr/bin/node", join(IN.stage, "server/harness/drive.ts"), join(IN.stage, o.scenario),
  ];

  let argv: string[];
  let pcap: string | undefined;
  let allow: { host: string; port: number } | undefined;
  if (o.net === "isolated") {
    const u = new URL(o.sessionEnv.PI_SLICED_SERVER || serverUrl());
    if (!/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname)) throw new Error(`isolated net needs an IPv4 server address, got ${u.hostname}`);
    allow = { host: u.hostname, port: Number(u.port || 443) };
    pcap = join(work, "net.pcap");
    const nft = join(work, "nft.conf");
    writeFileSync(
      nft,
      `table inet pisliced {
  chain out {
    type filter hook output priority 0; policy drop;
    oifname "lo" accept
    ct state established,related accept
    ip daddr ${allow.host} tcp dport ${allow.port} accept
    meta l4proto tcp counter reject with tcp reset
    counter reject
  }
}
`,
    );
    const inner = `nft -f "$0" || exit 99; "$@"; rc=$?; nft list ruleset > ${dirs.out}/nft.txt; exit $rc`;
    argv = [
      "pasta", "--config-net", "-4", "-a", NS_ADDR, "-n", "24", "-g", NS_GW, "--no-map-gw",
      "-t", "none", "-u", "none", "-T", "none", "-U", "none", "--pcap", pcap, "-q", "-f",
      "--", "/bin/sh", "-c", inner, nft, ...bwrap,
    ];
  } else argv = bwrap;

  const code = await new Promise<number | null>((res) => {
    const p = spawn(argv[0], argv.slice(1), { stdio: ["ignore", "inherit", "inherit"], env: { PATH: "/usr/bin:/bin" } });
    p.on("exit", (c) => res(c));
  });
  return {
    work,
    ...dirs,
    pcap,
    code,
    local: o.net === "isolated" ? NS_ADDR : undefined,
    allow,
    cleanup: () => {
      if (!process.env.PI_SLICED_KEEP) rmSync(work, { recursive: true, force: true });
    },
  };
}
