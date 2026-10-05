import { describe, expect, it } from 'vitest';
import { isSystemMailRecipient, isOfficeMailRecipient, NOTIFY_RECIPIENTS, SYSTEM_MAIL_RECIPIENTS, systemMailAddresses, withMandatoryBcc } from '../mail-bcc';

describe('systeemmeldingen: de vijf persoonlijke ontvangers', () => {
  it('gebruikt uitsluitend de genoemde collega’s', () => {
    expect(SYSTEM_MAIL_RECIPIENTS).toEqual(['nick@habitat-one.com','frederique@habitat-one.com','hans@habitat-one.com','teresa@habitat-one.com','mourad.h@habitat-one.com']);
    expect(NOTIFY_RECIPIENTS).toEqual(['nick@habitat-one.com','frederique@habitat-one.com','hans@habitat-one.com']);
    expect(isSystemMailRecipient('Info <HI@habitat-one.com>')).toBe(false);
    expect(isSystemMailRecipient('Hans <HANS@habitat-one.com>')).toBe(true);
    expect(isSystemMailRecipient('collega@example.com')).toBe(false);
  });
  it('houdt algemene controles bij kantoor, ook met expliciete oude kopieën', () => {
    expect(isOfficeMailRecipient('Teresa <teresa@habitat-one.com>')).toBe(false);
    expect(isOfficeMailRecipient('mourad.h@habitat-one.com')).toBe(false);
    expect(systemMailAddresses(SYSTEM_MAIL_RECIPIENTS.join(','), 'office')).toBe(NOTIFY_RECIPIENTS.join(', '));
    const copies = withMandatoryBcc('Teresa <teresa@habitat-one.com>, mourad.h@habitat-one.com, Hans <hans@habitat-one.com>', 'nick@habitat-one.com', true);
    expect(copies).not.toMatch(/teresa|mourad|hi@/i);
    expect(copies).toContain('Hans <hans@habitat-one.com>');
  });
  it('behoudt persoonlijke taakmails voor Mourad en Teresa', () => {
    expect(systemMailAddresses('mourad.h@habitat-one.com', 'team')).toBe('mourad.h@habitat-one.com');
    expect(systemMailAddresses('teresa@habitat-one.com', 'team')).toBe('teresa@habitat-one.com');
    expect(systemMailAddresses('mourad.h@habitat-one.com', 'office')).toBeUndefined();
  });
  it('filtert en dedupliceert displaynamen zonder ongewenste fallback', () => {
    expect(systemMailAddresses('HI@habitat-one.com, Nick <NICK@habitat-one.com>, nick@habitat-one.com, outsider@example.com')).toBe('Nick <NICK@habitat-one.com>');
    expect(systemMailAddresses('hi@habitat-one.com')).toBeUndefined();
  });
});
