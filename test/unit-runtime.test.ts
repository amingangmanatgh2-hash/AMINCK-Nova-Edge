import { describe, expect, it } from 'vitest';
import { decodeWsEarlyData } from '../src/index';
import { VlessSession, type TcpSocket } from '../src/proxy';
import { ATYP_DOMAIN, CMD_TCP, type VlessTarget } from '../src/protocol';

describe('WebSocket early data', () => {
  it('decodes base64url and enforces the configured maximum', () => {
    const bytes = Uint8Array.from([0, 255, 10, 20, 30]);
    const encoded = Buffer.from(bytes).toString('base64url');
    expect(Array.from(decodeWsEarlyData(encoded, 16) ?? [])).toEqual(Array.from(bytes));
    expect(decodeWsEarlyData(encoded, 2)).toBeNull();
    expect(decodeWsEarlyData('not,a,protocol-list', 100)).toBeNull();
    expect(decodeWsEarlyData('***', 100)).toBeNull();
  });
});

describe('VLESS downstream framing', () => {
  it('prefixes only the first upstream frame with the VLESS response header', async () => {
    const dataCallbacks: Array<(data: Uint8Array) => void> = [];
    const closeCallbacks: Array<() => void> = [];
    const errorCallbacks: Array<(error: unknown) => void> = [];
    const writes: Uint8Array[] = [];
    const socket: TcpSocket = {
      opened: Promise.resolve(),
      write: (data) => writes.push(data),
      end: () => undefined,
      onData: (cb) => dataCallbacks.push(cb),
      onClose: (cb) => closeCallbacks.push(cb),
      onError: (cb) => errorCallbacks.push(cb),
    };
    const sent: Uint8Array[] = [];
    const target: VlessTarget = {
      command: CMD_TCP,
      port: 443,
      addressType: ATYP_DOMAIN,
      address: 'example.com',
    };
    const session = new VlessSession(target, {
      client: { send: (data) => sent.push(data) },
      hooks: {
        tcpConnect: async () => socket,
        dohQuery: async () => null,
      },
      policy: {
        tcpPorts: [80, 443],
        dohList: ['https://cloudflare-dns.com/dns-query'],
        tcpRetries: 1,
        connectTimeoutMs: 1000,
      },
    });

    session.feed(Uint8Array.from([9, 8]));
    await session.start();
    expect(Array.from(writes[0] ?? [])).toEqual([9, 8]);

    dataCallbacks[0]!(Uint8Array.from([1, 2, 3]));
    dataCallbacks[0]!(Uint8Array.from([4, 5]));
    expect(Array.from(sent[0] ?? [])).toEqual([0, 0, 1, 2, 3]);
    expect(Array.from(sent[1] ?? [])).toEqual([4, 5]);

    session.clientClosed();
    await session.report;
    expect(closeCallbacks.length).toBeGreaterThan(0);
    expect(errorCallbacks.length).toBeGreaterThan(0);
  });
});
