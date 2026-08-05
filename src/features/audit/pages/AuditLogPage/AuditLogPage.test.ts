import { describe, expect, it } from 'vitest';
import { sanitizeMetadataForDisplay } from '../../auditMetadata';

describe('sanitizeMetadataForDisplay', () => {
  it('redacts sensitive metadata recursively before the audit UI renders it', () => {
    expect(
      sanitizeMetadataForDisplay({
        requestId: 'req-1',
        authorization: 'Bearer private',
        nested: { refreshToken: 'private', safe: 'value' },
      }),
    ).toEqual({
      requestId: 'req-1',
      authorization: '[REDACTED]',
      nested: { refreshToken: '[REDACTED]', safe: 'value' },
    });
  });
});
