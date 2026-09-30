import { requireCron } from '@/lib/auth/require-cron';
import { getMailAccounts } from '@/lib/gmail';
import { syncPartnerSent } from '@/lib/partner-mail-sync';
export const maxDuration=300;
export async function GET(req:Request){const denied=requireCron(req);if(denied)return denied;
 try{let imported=0;for(const account of getMailAccounts()){const result=await syncPartnerSent(account);imported+=result.imported;}return Response.json({ok:true,imported});}
 catch{return Response.json({ok:false,error:'Synchronisatie niet volledig afgerond'},{status:500});}}
