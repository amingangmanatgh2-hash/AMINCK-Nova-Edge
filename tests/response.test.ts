import { describe, expect, it } from 'vitest';

import { json, noContent, normaliseHeaders, text, withHeader } from '../src/response.js';

describe('normaliseHeaders', () => {
  it('lowercases header names', () => {
    expect(normaliseHeaders({ 'Content-Type': 'text/plain', 'X-Foo': 'bar' })).toEqual({
      'content-type': 'text/plain',
      'x-foo': 'bar',
    });
  });
});

describe('json', () => {
  it('serialises the payload and sets JSON headers', () => {
    const response = json(200, { hello: 'world' });
    expect(response.status).toBe(200);
    expect(response.body).toBe('{"hello":"world"}');
    expect(response.headers['content-type']).toBe('application/json; charset=utf-8');
    expect(response.headers['content-length']).toBe('17');
  });

  it('computes content-length in bytes, not characters', () => {
    const response = json(200, { message: 'سلام' });
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(response.body)));
  });

  it('merges extra headers', () => {
    expect(json(201, {}, { Location: '/x' }).headers['location']).toBe('/x');
  });
});

describe('text', () => {
  it('sets a plain-text content type', () => {
    const response = text(200, 'hi');
    expect(response.headers['content-type']).toBe('text/plain; charset=utf-8');
    expect(response.body).toBe('hi');
  });
});

describe('noContent', () => {
  it('returns an empty 204', () => {
    const response = noContent();
    expect(response.status).toBe(204);
    expect(response.body).toBe('');
  });
});

describe('withHeader', () => {
  it('adds a header without mutating the original', () => {
    const original = json(200, {});
    const updated = withHeader(original, 'X-Cache', 'HIT');
    expect(updated.headers['x-cache']).toBe('HIT');
    expect(original.headers['x-cache']).toBeUndefined();
  });

  it('overwrites an existing header', () => {
    const response = withHeader(json(200, {}, { 'x-a': '1' }), 'X-A', '2');
    expect(response.headers['x-a']).toBe('2');
  });
});
