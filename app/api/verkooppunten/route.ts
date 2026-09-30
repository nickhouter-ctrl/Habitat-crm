import { publicPartners } from '@/lib/public-partners';
export const dynamic='force-dynamic';
export async function GET(){return Response.json(await publicPartners(),{headers:{'Cache-Control':'public, max-age=60'}});}
