import { describe, expect, it } from 'vitest';

import {
  BadRequestError,
  HttpError,
  MethodNotAllowedError,
  NotFoundError,
  PayloadTooLargeError,
  TooManyRequestsError,
  toHttpError,
} from '../src/errors.js';

describe('HttpError', () => {
  it('exposes the status, message and derived code', () => {
    const error = new HttpError(409, 'conflict happened');
    expect(error.status).toBe(409);
    expect(error.code).toBe('conflict');
    expect(error).toBeInstanceOf(Error);
  });

  it('accepts an explicit code', () => {
    expect(new HttpError(400, 'x', 'custom_code').code).toBe('custom_code');
  });

  it('falls back to a generic code for unmapped statuses', () => {
    expect(new HttpError(418, 'teapot').code).toBe('error');
    expect(new HttpError(599, 'weird').code).toBe('internal_server_error');
  });

  it('serialises to JSON, omitting absent details', () => {
    expect(new HttpError(500, 'boom').toJSON()).toEqual({
      error: 'internal_server_error',
      message: 'boom',
      status: 500,
    });
  });

  it('includes details when provided', () => {
    expect(new HttpError(400, 'bad', 'bad_request', { field: 'id' }).toJSON()).toMatchObject({
      details: { field: 'id' },
    });
  });
});

describe('error subclasses', () => {
  it('BadRequestError defaults to 400', () => {
    const error = new BadRequestError();
    expect(error.status).toBe(400);
    expect(error.name).toBe('BadRequestError');
  });

  it('NotFoundError defaults to 404', () => {
    expect(new NotFoundError().status).toBe(404);
  });

  it('MethodNotAllowedError carries the allow list', () => {
    const error = new MethodNotAllowedError(['GET', 'HEAD']);
    expect(error.status).toBe(405);
    expect(error.allow).toEqual(['GET', 'HEAD']);
    expect(error.toJSON()).toMatchObject({ details: { allow: ['GET', 'HEAD'] } });
  });

  it('TooManyRequestsError carries retryAfterSeconds', () => {
    const error = new TooManyRequestsError(30);
    expect(error.status).toBe(429);
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('PayloadTooLargeError reports the limit', () => {
    const error = new PayloadTooLargeError(1024);
    expect(error.status).toBe(413);
    expect(error.toJSON()).toMatchObject({ details: { limitBytes: 1024 } });
  });
});

describe('toHttpError', () => {
  it('returns HttpError instances unchanged', () => {
    const original = new NotFoundError('gone');
    expect(toHttpError(original)).toBe(original);
  });

  it('wraps a plain Error as a 500 and keeps the stack', () => {
    const wrapped = toHttpError(new Error('oops'));
    expect(wrapped.status).toBe(500);
    expect(wrapped.message).toBe('oops');
    expect(wrapped.stack).toBeDefined();
  });

  it('wraps a non-Error throw', () => {
    const wrapped = toHttpError('just a string');
    expect(wrapped.status).toBe(500);
    expect(wrapped.toJSON()).toMatchObject({ details: { thrown: 'just a string' } });
  });

  it('handles an Error with an empty message', () => {
    expect(toHttpError(new Error('')).message).toBe('Internal Server Error');
  });
});
