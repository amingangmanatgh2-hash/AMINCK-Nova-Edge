import { describe, expect, it } from 'vitest';
import {
  CMD_TCP,
  CMD_UDP,
  buildDnsQuery,
  encodeDnsName,
  frameUdpResponse,
  parseDnsAnswers,
  parseDnsQuestion,
  parseVlessHeader,
} from '../src/protocol';
import { formatUuid } from '../src/protocol';

const UUID = '01234567-89ab-4def-8123-456789abcdef';

function vlessDomain(name: string): Uint8Array {
  const b = new TextEncoder().encode(name);
  const out = new Uint8Array(1 + b.length);
  out[0] = b.length;
  out.set(b, 1);
  return out;
}

function uuidBytes(uuid = UUID): Uint8Array {
  const hex = uuid.replace(/-/g, '');
  const out = new Uint8Array(16);
  for (let i = 0; i < 16; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

/** Build a raw VLESS request: [ver][uuid16][addonLen][addons][cmd][port2][atyp][addr][payload] */
function buildVlessPacket(opts: {
  command?: number;
  port?: number;
  addrType?: number;
  address?: Uint8Array;
  payload?: Uint8Array;
  addons?: number;
}) {
  const command = opts.command ?? CMD_TCP;
  const port = opts.port ?? 443;
  const addrType = opts.addrType ?? 2;
  const address = opts.address ?? vlessDomain('example.com');
  const payload = opts.payload ?? new Uint8Array([1, 2, 3, 4]);
  const addons = opts.addons ?? 0;
  const head = new Uint8Array(18 + addons + 1 + 2 + 1 + address.length);
  head[0] = 0; // version
  head.set(uuidBytes(), 1);
  head[17] = addons;
  let off = 18 + addons;
  head[off] = command;
  head[off + 1] = port >> 8;
  head[off + 2] = port & 0xff;
  head[off + 3] = addrType;
  head.set(address, off + 4);
  const out = new Uint8Array(head.length + payload.length);
  out.set(head, 0);
  out.set(payload, head.length);
  return out;
}

describe('VLESS header parser', () => {
  it('parses a TCP request to an IPv4 address', () => {
    const pkt = buildVlessPacket({
      command: CMD_TCP,
      port: 443,
      addrType: 1,
      address: new Uint8Array([203, 0, 113, 9]),
      payload: new Uint8Array([9, 9]),
    });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('ready');
    if (r.state !== 'ready') return;
    expect(r.version).toBe(0);
    expect(r.uuid).toBe(UUID);
    expect(r.target.command).toBe(CMD_TCP);
    expect(r.target.port).toBe(443);
    expect(r.target.addressType).toBe(1);
    expect(r.target.address).toBe('203.0.113.9');
    expect(r.headerLength).toBe(pkt.length - 2);
    expect(r.payload.length).toBe(2);
  });

  it('parses a domain target', () => {
    const pkt = buildVlessPacket({ command: CMD_TCP, addrType: 2, address: vlessDomain('api.example.com') });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('ready');
    if (r.state !== 'ready') return;
    expect(r.target.address).toBe('api.example.com');
  });

  it('parses an IPv6 target', () => {
    const v6 = new Uint8Array(16);
    v6[0] = 0x20; v6[1] = 0x01; v6[2] = 0x0d; v6[3] = 0xb8;
    const pkt = buildVlessPacket({ command: CMD_TCP, addrType: 3, address: v6 });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('ready');
    if (r.state !== 'ready') return;
    expect(r.target.address).toContain('2001:db8');
  });

  it('parses UDP DNS (port 53) and keeps the DNS payload', () => {
    const dns = buildDnsQuery(0x1234, 'example.com', 1);
    const pkt = buildVlessPacket({ command: CMD_UDP, port: 53, addrType: 2, address: vlessDomain('dns.example'), payload: dns });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('ready');
    if (r.state !== 'ready') return;
    expect(r.target.command).toBe(CMD_UDP);
    expect(r.target.port).toBe(53);
    expect(r.payload.length).toBe(dns.length);
  });

  it('handles truncated headers with need-more', () => {
    const pkt = buildVlessPacket({ command: CMD_TCP });
    for (const len of [5, 17, 18, 20, 21]) {
      const r = parseVlessHeader(pkt.slice(0, len));
      expect(['need-more', 'ready']).toContain(r.state);
    }
    const partial = pkt.slice(0, 17);
    const r = parseVlessHeader(partial);
    expect(r.state).toBe('need-more');
  });

  it('rejects MUX commands', () => {
    const pkt = buildVlessPacket({ command: 0x03 });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('invalid');
  });

  it('rejects unknown commands', () => {
    const pkt = buildVlessPacket({ command: 0x7f });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('invalid');
  });

  it('supports addons of any length', () => {
    const pkt = buildVlessPacket({ addons: 4, command: CMD_TCP });
    const r = parseVlessHeader(pkt);
    expect(r.state).toBe('ready');
    if (r.state === 'ready') expect(r.target.port).toBe(443);
  });

  it('formats UUIDs correctly', () => {
    expect(formatUuid(uuidBytes(UUID))).toBe(UUID);
  });
});

describe('DNS wire helpers', () => {
  it('builds a DNS query and parses the question back', () => {
    const q = buildDnsQuery(0xabcd, 'sub.example.com', 1);
    const parsed = parseDnsQuestion(q);
    expect(parsed).not.toBeNull();
    expect(parsed!.id).toBe(0xabcd);
    expect(parsed!.name).toBe('sub.example.com');
    expect(parsed!.type).toBe(1);
  });

  it('parses A answers from a synthetic response', () => {
    const q = buildDnsQuery(7, 'example.com', 1);
    const resp = new Uint8Array(q.length + 16);
    resp.set(q, 0);
    const dv = new DataView(resp.buffer);
    dv.setUint16(2, 0x8180); // QR+RD+RA
    dv.setUint16(6, 1); // ancount
    // answer: pointer to question name (0xc00c), type A, class IN, ttl, rdlen 4, 8.8.8.8
    const off = q.length;
    resp[off] = 0xc0; resp[off + 1] = 0x0c;
    dv.setUint16(off + 2, 1);
    dv.setUint16(off + 4, 1);
    dv.setUint32(off + 6, 300);
    dv.setUint16(off + 10, 4);
    resp[off + 12] = 8; resp[off + 13] = 8; resp[off + 14] = 8; resp[off + 15] = 8;
    const answers = parseDnsAnswers(resp);
    expect(answers.length).toBe(1);
    expect(answers[0]!.type).toBe(1);
    expect(answers[0]!.data).toBe('8.8.8.8');
    expect(answers[0]!.ttl).toBe(300);
  });

  it('frames UDP responses with a 2-byte length prefix', () => {
    const f = frameUdpResponse(new Uint8Array([1, 2, 3]));
    expect(f.length).toBe(5);
    expect(f[0]).toBe(0);
    expect(f[1]).toBe(3);
    expect(f[2]).toBe(1);
  });

  it('encodes DNS names with length prefixes', () => {
    const bytes = encodeDnsName('a.b.c');
    expect(bytes[0]).toBe(1);
    expect(bytes[1]).toBe(97); // 'a'
    expect(bytes[bytes.length - 1]).toBe(0);
  });
});
