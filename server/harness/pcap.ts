// Small pcap reader for pasta's --pcap output (classic pcap, Ethernet link type).
// Extracts every TCP connection attempt (SYN without ACK) and every UDP flow seen on the
// namespace's interface, plus TCP payload bytes per remote endpoint.
import { readFileSync } from "node:fs";

export interface Flow {
  proto: "tcp" | "udp";
  src: string;
  sport: number;
  dst: string;
  dport: number;
}
export interface PcapSummary {
  packets: number;
  /** TCP connection attempts (SYN, no ACK), in order. */
  connects: Flow[];
  /** Distinct UDP flows by (src, sport, dst, dport). */
  udp: Flow[];
  /** TCP payload bytes per "<remote ip>:<port>" in each direction, relative to `local`. */
  bytes: Record<string, { in: number; out: number }>;
  /** IP protocols other than TCP/UDP/ICMP seen, by number. */
  otherProtocols: number[];
}

const ip4 = (b: Buffer, o: number) => `${b[o]}.${b[o + 1]}.${b[o + 2]}.${b[o + 3]}`;
const ip6 = (b: Buffer, o: number) => {
  const parts: string[] = [];
  for (let i = 0; i < 16; i += 2) parts.push(b.readUInt16BE(o + i).toString(16));
  return parts.join(":");
};

export function readPcap(path: string, local: string): PcapSummary {
  const b = readFileSync(path);
  const magic = b.readUInt32LE(0);
  let le: boolean;
  if (magic === 0xa1b2c3d4 || magic === 0xa1b23c4d) le = true;
  else if (magic === 0xd4c3b2a1 || magic === 0x4d3cb2a1) le = false;
  else throw new Error(`${path}: not a pcap file`);
  const u32 = (o: number) => (le ? b.readUInt32LE(o) : b.readUInt32BE(o));
  const linktype = u32(20);
  if (linktype !== 1) throw new Error(`${path}: link type ${linktype}, expected Ethernet (1)`);
  const out: PcapSummary = { packets: 0, connects: [], udp: [], bytes: {}, otherProtocols: [] };
  const udpSeen = new Set<string>();
  let o = 24;
  while (o + 16 <= b.length) {
    const incl = u32(o + 8);
    const p = o + 16;
    o = p + incl;
    if (o > b.length) break;
    out.packets++;
    let ethType = b.readUInt16BE(p + 12);
    let l3 = p + 14;
    if (ethType === 0x8100) {
      ethType = b.readUInt16BE(p + 16);
      l3 += 4;
    }
    let proto: number;
    let src: string;
    let dst: string;
    let l4: number;
    let l3end: number;
    if (ethType === 0x0800) {
      const ihl = (b[l3] & 0x0f) * 4;
      proto = b[l3 + 9];
      src = ip4(b, l3 + 12);
      dst = ip4(b, l3 + 16);
      l4 = l3 + ihl;
      l3end = l3 + b.readUInt16BE(l3 + 2);
    } else if (ethType === 0x86dd) {
      proto = b[l3 + 6];
      src = ip6(b, l3 + 8);
      dst = ip6(b, l3 + 24);
      l4 = l3 + 40;
      l3end = l4 + b.readUInt16BE(l3 + 4);
    } else continue; // ARP and other link-layer frames carry no connection
    if (proto === 6) {
      const sport = b.readUInt16BE(l4);
      const dport = b.readUInt16BE(l4 + 2);
      const flags = b[l4 + 13];
      const dataOff = (b[l4 + 12] >> 4) * 4;
      const payload = Math.max(0, l3end - (l4 + dataOff));
      if (flags & 0x02 && !(flags & 0x10)) out.connects.push({ proto: "tcp", src, sport, dst, dport });
      if (src === local) {
        const k = `${dst}:${dport}`;
        (out.bytes[k] ??= { in: 0, out: 0 }).out += payload;
      } else if (dst === local) {
        const k = `${src}:${sport}`;
        (out.bytes[k] ??= { in: 0, out: 0 }).in += payload;
      }
    } else if (proto === 17) {
      const f: Flow = { proto: "udp", src, sport: b.readUInt16BE(l4), dst, dport: b.readUInt16BE(l4 + 2) };
      const k = `${f.src}|${f.sport}|${f.dst}|${f.dport}`;
      if (!udpSeen.has(k)) {
        udpSeen.add(k);
        out.udp.push(f);
      }
    } else if (proto !== 1 && proto !== 58 && !out.otherProtocols.includes(proto)) out.otherProtocols.push(proto);
  }
  return out;
}
