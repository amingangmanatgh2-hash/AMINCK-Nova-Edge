/**
 * EDGE PANEL — VLESS protocol handling and DNS wire helpers.
 * Pure module: no Cloudflare runtime APIs, directly unit-tested.
 */

export const VLESS_VERSION = 0;
export const CMD_TCP = 0x01;
export const CMD_UDP = 0x02;
export const CMD_MUX = 0x03;

export const ATYP_IPV4 = 0x01;
export const ATYP_DOMAIN = 0x02;
export const ATYP_IPV6 = 0x03;

export type VlessCommand = typeof CMD_TCP | typeof CMD_UDP | typeof CMD_MUX;

export interface VlessTarget {
  command: VlessCommand;
  port: number;
  addressType: number;
  /** IPv4 dotted / domain / IPv6 text. */
  address: string;
}

export type HeaderParseResult =
  | { state: 'need-more'; need: number }
  | { state: 'invalid'; reason: string }
  | {
      state: 'ready';
      version: number;
      uuid: string;
      target: VlessTarget;
      /** Index in `buf` where the payload starts (header is `headerLength` bytes). */
      headerLength: number;
      payload: Uint8Array;
    };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function formatUuid(bytes: Uint8Array): string {
  const h = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function isValidUuid(u: string): boolean {
  return UUID_RE.test(u);
}

/**
 * Parse a VLESS request header from a buffer. When the buffer does not yet
 * contain the full header, returns { state: 'need-more', need }.
 * This parser is stream-safe: feed it chunks until 'ready'.
 */
export function parseVlessHeader(buf: Uint8Array): HeaderParseResult {
  if (buf.length < 18) return { state: 'need-more', need: 18 - buf.length };
  const version = buf[0]!;
  if (version !== 0 && version !== 1) {
    // VLESS version must be 0; 1 is not in the wild — reject anything else.
    return { state: 'invalid', reason: `unsupported-vless-version:${version}` };
  }
  const uuidBytes = buf.slice(1, 17);
  const addonLen = buf[17]!;
  const headerBase = 18 + addonLen;
  if (buf.length < headerBase + 1) return { state: 'need-more', need: headerBase + 1 - buf.length };

  const command = buf[headerBase]!;
  if (command !== CMD_TCP && command !== CMD_UDP && command !== CMD_MUX) {
    return { state: 'invalid', reason: `unsupported-command:${command}` };
  }
  if (command === CMD_MUX) {
    return { state: 'invalid', reason: 'mux-unsupported' };
  }

  const portOff = headerBase + 1;
  if (buf.length < portOff + 3) return { state: 'need-more', need: portOff + 3 - buf.length };
  const port = (buf[portOff]! << 8) | buf[portOff + 1]!;
  const atyp = buf[portOff + 2]!;

  let address = '';
  let addrLen = 0;
  let addressOffset = portOff + 3;
  if (atyp === ATYP_IPV4) {
    addrLen = 4;
    if (buf.length < addressOffset + addrLen) return { state: 'need-more', need: addressOffset + addrLen - buf.length };
    address = Array.from(buf.slice(addressOffset, addressOffset + 4)).join('.');
  } else if (atyp === ATYP_DOMAIN) {
    if (buf.length < addressOffset + 1) return { state: 'need-more', need: addressOffset + 1 - buf.length };
    const dlen = buf[addressOffset]!;
    addrLen = 1 + dlen;
    if (dlen === 0 || dlen > 255) return { state: 'invalid', reason: 'bad-domain-length' };
    if (buf.length < addressOffset + addrLen) return { state: 'need-more', need: addressOffset + addrLen - buf.length };
    address = new TextDecoder().decode(buf.slice(addressOffset + 1, addressOffset + 1 + dlen));
  } else if (atyp === ATYP_IPV6) {
    addrLen = 16;
    if (buf.length < addressOffset + addrLen) return { state: 'need-more', need: addressOffset + addrLen - buf.length };
    const b = buf.slice(addressOffset, addressOffset + 16);
    const groups: string[] = [];
    for (let i = 0; i < 8; i++) groups.push(((b[i * 2]! << 8) | b[i * 2 + 1]!).toString(16));
    address = groups.join(':');
  } else {
    return { state: 'invalid', reason: `unsupported-atyp:${atyp}` };
  }

  const headerLength = addressOffset + addrLen;
  return {
    state: 'ready',
    version,
    uuid: formatUuid(addBytesOnly(uuidBytes)),
    target: {
      command: command as VlessCommand,
      port,
      addressType: atyp,
      address,
    },
    headerLength,
    payload: buf.slice(headerLength),
  };
}

function addBytesOnly(bytes: Uint8Array): Uint8Array {
  return bytes;
}

// ---------------------------------------------------------------------------
// DNS wire format helpers (for UDP/53 interception via DoH)
// ---------------------------------------------------------------------------

/** Build a DNS query packet for DoH (RFC 8484) — `id` is random per query. */
export function buildDnsQuery(id: number, name: string, type: 1 | 28): Uint8Array {
  const nameBytes = encodeDnsName(name);
  const out = new Uint8Array(12 + nameBytes.length + 4);
  const dv = new DataView(out.buffer);
  dv.setUint16(0, id & 0xffff);
  dv.setUint16(2, 0x0100); // RD=1
  dv.setUint16(4, 1); // qdcount
  dv.setUint16(6, 0);
  dv.setUint16(8, 0);
  dv.setUint16(10, 0);
  out.set(nameBytes, 12);
  dv.setUint16(12 + nameBytes.length, type);
  dv.setUint16(14 + nameBytes.length, 1); // IN
  return out;
}

export function encodeDnsName(name: string): Uint8Array {
  const labels = name.split('.');
  let total = 1;
  for (const l of labels) total += 1 + l.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const l of labels) {
    out[off] = l.length;
    off += 1;
    for (let i = 0; i < l.length; i++) out[off + i] = l.charCodeAt(i);
    off += l.length;
  }
  out[off] = 0;
  return out;
}

/** Extract the question name/id from a raw client DNS query. */
export function parseDnsQuestion(pkt: Uint8Array): { id: number; name: string; type: number } | null {
  if (pkt.length < 12) return null;
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  const id = dv.getUint16(0);
  // find end of qname
  let off = 12;
  let name = '';
  let jumped = false;
  while (off < pkt.length) {
    const len = pkt[off]!;
    if (len === 0) {
      off += 1;
      break;
    }
    if ((len & 0xc0) === 0xc0) {
      jumped = true;
      off += 2;
      break;
    }
    if (off + 1 + len > pkt.length) return null;
    const label = new TextDecoder().decode(pkt.slice(off + 1, off + 1 + len));
    if (!/^[a-zA-Z0-9._-]+$/.test(label)) return null;
    name += (name ? '.' : '') + label;
    off += 1 + len;
  }
  if (!jumped && off + 4 > pkt.length) return null;
  return { id, name: name.toLowerCase(), type: dv.getUint16(off) };
}

export interface DnsAnswer {
  name: string;
  type: number;
  ttl: number;
  data: string; // IP for A/AAAA, raw string otherwise
}

/** Minimal DNS answer parser (skips compression pointers safely). */
export function parseDnsAnswers(pkt: Uint8Array): DnsAnswer[] {
  const dv = new DataView(pkt.buffer, pkt.byteOffset, pkt.byteLength);
  if (pkt.length < 12) return [];
  const qdcount = dv.getUint16(4);
  const ancount = dv.getUint16(6);
  let off = 12;
  for (let i = 0; i < qdcount; i++) {
    const r = skipName(pkt, off);
    if (!r) return [];
    off = r + 4;
  }
  const out: DnsAnswer[] = [];
  for (let i = 0; i < ancount; i++) {
    const r = skipName(pkt, off);
    if (!r) return out;
    let o = r;
    if (o + 10 > pkt.length) return out;
    const type = dv.getUint16(o);
    const rdlen = dv.getUint16(o + 8);
    const dataStart = o + 10;
    if (dataStart + rdlen > pkt.length) return out;
    let data = '';
    if (type === 1 && rdlen === 4) {
      const b = pkt.slice(dataStart, dataStart + 4);
      data = `${b[0]}.${b[1]}.${b[2]}.${b[3]}`;
    } else if (type === 28 && rdlen === 16) {
      const b = pkt.slice(dataStart, dataStart + 16);
      const groups: string[] = [];
      for (let g = 0; g < 8; g++) groups.push(((b[g * 2]! << 8) | b[g * 2 + 1]!).toString(16));
      data = groups.join(':');
    } else {
      data = Array.from(pkt.slice(dataStart, dataStart + Math.min(rdlen, 40)))
        .map((x) => x.toString(16).padStart(2, '0'))
        .join('');
    }
    const name = `#${i}`;
    out.push({ name, type, ttl: dv.getUint32(o + 4), data });
    o = dataStart + rdlen;
    off = o;
  }
  return out;
}

function skipName(pkt: Uint8Array, start: number): number | null {
  let off = start;
  let hops = 0;
  while (off < pkt.length) {
    const len = pkt[off]!;
    if (len === 0) return off + 1;
    if ((len & 0xc0) === 0xc0) {
      hops++;
      if (hops > 8) return null;
      return off + 2;
    }
    if (off + 1 + len > pkt.length) return null;
    off += 1 + len;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Misc wire helpers
// ---------------------------------------------------------------------------

/** UDP-over-stream framing: 2-byte big-endian length prefix (VLESS UDP relay). */
export function frameUdpResponse(payload: Uint8Array): Uint8Array {
  const out = new Uint8Array(payload.length + 2);
  out[0] = (payload.length >> 8) & 0xff;
  out[1] = payload.length & 0xff;
  out.set(payload, 2);
  return out;
}