/**
 * EDGE PANEL — VLESS-over-WebSocket proxy session engine.
 *
 * The heavy lifting (target classification, private-IP blocking, SMTP-port
 * blocking, UDP-53-only policy, DNS-over-HTTPS relay with resolver failover,
 * TCP connect retry, approximate traffic counting) lives here with injected
 * IO so it is fully unit-testable. The Cloudflare WebSocket + cloudflare:
 * sockets wiring lives in index.ts.
 */
import type { VlessTarget } from './protocol';
import { CMD_TCP, CMD_UDP } from './protocol';
import { isPrivateLiteral, isSmtpPort, sleep } from './utils';

export type BlockReason =
  | 'private-ip'
  | 'smtp-port'
  | 'udp-not-dns'
  | 'port-not-allowed'
  | 'bad-address-type'
  | 'dns-unresolvable'
  | 'connect-failed';

export type TargetDecision =
  | { allowed: true }
  | { allowed: false; reason: BlockReason };

/**
 * Pure classification of a VLESS target before any socket is opened.
 * - UDP is only permitted for DNS on port 53 (no open proxy)
 * - SMTP ports are always blocked
 * - outbound port must be an allowed TLS port (Cloudflare TLS ports)
 * - IP literals pointing at private/reserved space are blocked
 */
export function classifyTarget(
  target: VlessTarget,
  tlsPorts: number[],
  isPrivateIp: (s: string) => boolean = isPrivateLiteral,
): TargetDecision {
  if (target.command === CMD_UDP && target.port !== 53) {
    return { allowed: false, reason: 'udp-not-dns' };
  }
  if (isSmtpPort(target.port)) {
    return { allowed: false, reason: 'smtp-port' };
  }
  if (target.command === CMD_TCP && !tlsPorts.includes(target.port)) {
    return { allowed: false, reason: 'port-not-allowed' };
  }
  if (target.addressType !== 1 && target.addressType !== 2 && target.addressType !== 3) {
    return { allowed: false, reason: 'bad-address-type' };
  }
  const isIpLiteral =
    target.addressType === 1 || target.addressType === 3 || /^\d+\.\d+\.\d+\.\d+$/.test(target.address);
  if (isIpLiteral && isPrivateIp(target.address)) {
    return { allowed: false, reason: 'private-ip' };
  }
  return { allowed: true };
}

export interface ResolvedTarget {
  ip: string;
}

/**
 * Resolve a hostname through the DoH chain; every answer is checked and the
 * first public IP wins. If a resolver answers only with private IPs the
 * target is blocked. On failure the next resolver is tried (DNS failover).
 */
export async function resolvePublicTarget(
  hostname: string,
  fetchIps: (doh: string, name: string) => Promise<string[] | null>,
  dohList: string[],
  isPrivate = isPrivateLiteral,
): Promise<{ ok: true; target: ResolvedTarget } | { ok: false; reason: BlockReason }> {
  for (const doh of dohList) {
    try {
      const ips = await fetchIps(doh, hostname);
      if (!ips || ips.length === 0) continue;
      const ip = ips.find((candidate) => !isPrivate(candidate));
      if (!ip) return { ok: false, reason: 'private-ip' };
      return { ok: true, target: { ip } };
    } catch {
      // resolver down → DNS failover to the next one
    }
  }
  return { ok: false, reason: 'dns-unresolvable' };
}

// ---------------------------------------------------------------------------
// IO seams
// ---------------------------------------------------------------------------

export interface ClientTransport {
  /** Send bytes to the client (binary WS frame). */
  send(data: Uint8Array): void;
}

export interface TcpSocket {
  readonly opened: Promise<unknown>;
  write(data: Uint8Array): void;
  end(): void;
  onData(cb: (data: Uint8Array) => void): void;
  onClose(cb: () => void): void;
  onError(cb: (err: unknown) => void): void;
}

export interface SessionHooks {
  /** Establish a TCP(+TLS) upstream connection. */
  tcpConnect(
    host: string,
    port: number,
    opts: { timeoutMs: number; servername?: string },
  ): Promise<TcpSocket>;
  /** RFC 8484 DNS-over-HTTPS query with built-in resolver failover. */
  dohQuery(packet: Uint8Array): Promise<Uint8Array | null>;
}

export interface SessionReport {
  status: 'ok' | 'blocked' | 'error';
  reason?: string;
  bytesUp: number;
  bytesDown: number;
  dnsQueries: number;
}

export interface SessionPolicy {
  tlsPorts: number[];
  dohList: string[];
  tcpRetries: number;
  connectTimeoutMs: number;
}

const STATS_FLUSH_BYTES = 64 * 1024;

/**
 * One full VLESS session after the header was parsed.
 * - TCP: connect (with retry) then pump both directions.
 * - UDP: only port 53, serviced entirely through DoH with packet framing.
 * Byte counters are approximate (raw frame lengths) and reported via onStats.
 */
export class VlessSession {
  private bytesUp = 0;
  private bytesDown = 0;
  private dnsQueries = 0;
  private readonly client: ClientTransport;
  private readonly hooks: SessionHooks;
  private readonly policy: SessionPolicy;
  private udpBuffer: Uint8Array = new Uint8Array(0);
  private done = false;
  private tcpSocket: TcpSocket | null = null;
  private pendingTcp: Uint8Array | null = null;
  private settle!: (r: SessionReport) => void;
  readonly report: Promise<SessionReport>;
  onStats?: (up: number, down: number) => void;

  constructor(
    private readonly target: VlessTarget,
    opts: {
      client: ClientTransport;
      hooks: SessionHooks;
      policy: SessionPolicy;
      onStats?: (up: number, down: number) => void;
    },
  ) {
    this.client = opts.client;
    this.hooks = opts.hooks;
    this.policy = opts.policy;
    this.onStats = opts.onStats;
    this.report = new Promise<SessionReport>((resolve) => {
      this.settle = resolve;
    });
  }

  isDone(): boolean {
    return this.done;
  }

  /** Feed data that arrived from the client (after the header). */
  feed(chunk: Uint8Array): void {
    if (this.done) return;
    if (this.target.command === CMD_TCP) {
      this.bytesUp += chunk.length;
      this.maybeFlush();
      this.tcpSocket ? this.tcpSocket.write(chunk) : (this.pendingTcp = append(this.pendingTcp, chunk));
    } else if (this.target.command === CMD_UDP) {
      this.udpFeed(chunk);
    }
  }

  /** Begin the session (TCP connect phase). UDP sessions need no start. */
  async start(): Promise<void> {
    if (this.done) return;
    if (this.target.command === CMD_UDP) return;
    await this.startTcp();
  }

  /** The WebSocket client closed: stop pumping and settle. */
  clientClosed(): void {
    this.settleNow('ok');
  }

  /** Policy refused the target before any data flowed. */
  reject(reason: BlockReason): SessionReport {
    this.settleNow('blocked', reason);
    return { status: 'blocked', reason, bytesUp: 0, bytesDown: 0, dnsQueries: this.dnsQueries };
  }

  // ------------------------------------------------------------------ TCP

  private async startTcp(): Promise<void> {
    const target = this.target;
    let lastError = '';
    for (let attempt = 1; attempt <= this.policy.tcpRetries; attempt++) {
      try {
        const sock = await this.hooks.tcpConnect(target.address, target.port, {
          timeoutMs: this.policy.connectTimeoutMs,
          servername: target.addressType === 2 ? target.address : undefined,
        });
        await sock.opened;
        if (this.done) {
          sock.end();
          return;
        }
        this.tcpSocket = sock;
        sock.onData((data) => {
          this.bytesDown += data.length;
          this.maybeFlush();
          this.client.send(data);
        });
        sock.onClose(() => this.settleNow('ok'));
        sock.onError((err) => this.settleNow('error', err instanceof Error ? err.message : String(err)));
        if (this.pendingTcp) {
          sock.write(this.pendingTcp);
          this.pendingTcp = null;
        }
        return;
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        if (attempt >= this.policy.tcpRetries) {
          this.settleNow('error', lastError || 'connect-failed');
          return;
        }
        await sleep(100 * attempt);
      }
    }
    this.settleNow('error', lastError || 'connect-failed');
  }

  // ------------------------------------------------------------------ UDP

  private udpFeed(chunk: Uint8Array): void {
    this.bytesUp += chunk.length;
    this.maybeFlush();
    this.udpBuffer = this.udpBuffer.length === 0 ? chunk : append(this.udpBuffer, chunk);
    let off = 0;
    while (this.udpBuffer.length - off >= 2) {
      const len = (this.udpBuffer[off]! << 8) | this.udpBuffer[off + 1]!;
      if (this.udpBuffer.length - off - 2 < len) break;
      const packet = this.udpBuffer.slice(off + 2, off + 2 + len);
      off += 2 + len;
      void this.handleDnsPacket(packet);
    }
    this.udpBuffer = off === 0 ? this.udpBuffer : this.udpBuffer.slice(off);
  }

  private async handleDnsPacket(packet: Uint8Array): Promise<void> {
    this.dnsQueries += 1;
    const response = await this.hooks.dohQuery(packet);
    if (!response || this.done) return;
    this.bytesDown += response.length;
    this.maybeFlush();
    // VLESS UDP relay framing: 2-byte big-endian length prefix.
    const frame = new Uint8Array(response.length + 2);
    frame[0] = (response.length >> 8) & 0xff;
    frame[1] = response.length & 0xff;
    frame.set(response, 2);
    this.client.send(frame);
  }

  // ------------------------------------------------------------- lifecycle

  private maybeFlush(): void {
    if (this.bytesUp + this.bytesDown >= STATS_FLUSH_BYTES && this.onStats) {
      this.onStats(this.bytesUp, this.bytesDown);
      this.bytesUp = 0;
      this.bytesDown = 0;
    }
  }

  private settleNow(status: 'ok' | 'blocked' | 'error', reason?: string): void {
    if (this.done) return;
    this.done = true;
    if (this.tcpSocket) {
      try {
        this.tcpSocket.end();
      } catch {
        /* already closed */
      }
    }
    this.onStats?.(this.bytesUp, this.bytesDown);
    this.settle({ status, reason, bytesUp: this.bytesUp, bytesDown: this.bytesDown, dnsQueries: this.dnsQueries });
  }
}

function append(a: Uint8Array | null, b: Uint8Array): Uint8Array {
  if (!a || a.length === 0) return b;
  const out = new Uint8Array(a.length + b.length);
  out.set(a, 0);
  out.set(b, a.length);
  return out;
}