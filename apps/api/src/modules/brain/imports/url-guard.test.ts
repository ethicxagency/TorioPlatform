import { describe, expect, it } from 'vitest';
import { isBlockedAddress, parsePublicUrl, UnsafeUrlError } from './url-guard';

describe('parsePublicUrl', () => {
  it('accepts an ordinary public site and drops the fragment', () => {
    expect(parsePublicUrl(' https://Example.com/shop#top ').toString()).toBe(
      'https://example.com/shop',
    );
  });
  it.each([
    'ftp://example.com',
    'file:///etc/passwd',
    'javascript:alert(1)',
    'https://user:pw@example.com',
    'https://example.com:8080',
    'http://localhost',
    'http://127.0.0.1',
    'http://[::1]/',
    'http://10.0.0.5',
    'http://192.168.1.1',
    'http://172.16.0.1',
    'http://169.254.169.254/latest/meta-data',
    'http://100.64.0.1',
    'http://[::ffff:127.0.0.1]/',
    'http://[fd00::1]/',
    'http://intranet',
    'http://printer.local',
    'not a url',
  ])('rejects %s', (u) => {
    expect(() => parsePublicUrl(u)).toThrow(UnsafeUrlError);
  });
});

describe('isBlockedAddress', () => {
  it('blocks private, loopback, link-local, multicast and unparsable addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.31.0.1',
      '192.168.0.1',
      '169.254.1.1',
      '224.0.0.1',
      '0.0.0.0',
      '::1',
      'fe80::1',
      'fc00::1',
      'nonsense',
    ])
      expect(isBlockedAddress(ip)).toBe(true);
  });
  it('allows public addresses', () => {
    for (const ip of ['8.8.8.8', '1.1.1.1', '93.184.216.34', '2606:4700:4700::1111'])
      expect(isBlockedAddress(ip)).toBe(false);
  });
});
