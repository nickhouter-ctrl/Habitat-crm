import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beursBijlagen } from '@/lib/beurs-bijlagen';
import { followupDesigns, type FollowupMailKind } from '@/lib/followup-mail';
import type { EmailAttachment } from '@/lib/email';

/** Alleen vaste gebundelde ontwerpen; een formulier kan geen bestandspad aanleveren. */
export async function followupAttachments(kind: FollowupMailKind): Promise<EmailAttachment[]> {
  const sheets = await beursBijlagen();
  const designs = await Promise.all(followupDesigns(kind).map(async ({ filename }) => {
    const content = await readFile(path.join(process.cwd(), 'public', 'mail', 'followup', filename));
    if (content.length > 2_000_000 || content[0] !== 0xff || content[1] !== 0xd8 || content[2] !== 0xff) {
      throw new Error('Ongeldig presentatieontwerp');
    }
    return { filename, content, contentType: 'image/jpeg' };
  }));
  return [...sheets, ...designs];
}
