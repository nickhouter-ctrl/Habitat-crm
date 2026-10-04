import { describe, expect, it } from 'vitest';
import { isSystemMailRecipient, NOTIFY_RECIPIENTS, systemMailAddresses } from '../mail-bcc';

describe('systeemmeldingen: de vijf persoonlijke ontvangers', () => {
  it('gebruikt uitsluitend de genoemde collega’s', () => {
    expect(NOTIFY_RECIPIENTS).toEqual(['nick@habitat-one.com','frederique@habitat-one.com','hans@habitat-one.com','teresa@habitat-one.com','mourad.h@habitat-one.com']);
    expect(isSystemMailRecipient('Info <HI@habitat-one.com>')).toBe(false);
    expect(isSystemMailRecipient('Hans <HANS@habitat-one.com>')).toBe(true);
    expect(isSystemMailRecipient('collega@example.com')).toBe(false);
  });
  it('filtert en dedupliceert displaynamen zonder ongewenste fallback', () => {
    expect(systemMailAddresses('HI@habitat-one.com, Nick <NICK@habitat-one.com>, nick@habitat-one.com, outsider@example.com')).toBe('Nick <NICK@habitat-one.com>');
    expect(systemMailAddresses('hi@habitat-one.com')).toBeUndefined();
  });
});
