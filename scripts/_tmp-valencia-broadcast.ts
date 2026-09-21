import fs from 'node:fs';
for(const f of ['.env','.env.local']){try{process.loadEnvFile(f)}catch{}}
const url=new URL(process.env.DATABASE_URL!);url.searchParams.set('sslmode','require');process.env.DATABASE_URL=url.toString();
async function main(){
 const {db}=await import('../lib/db');
 const {prospects,emailCampaigns,users}=await import('../lib/db/schema');
 const {eq,sql}=await import('drizzle-orm');
 const {signEmailToken}=await import('../lib/leads/unsub-token');
 const {vulWachtrij}=await import('../lib/leads/queue');
 const dir='reports/valencia-2026';
 const audience=JSON.parse(fs.readFileSync(`${dir}/audience.json`,'utf8')).recipients as {email:string;name:string;sheet:string;segment:string}[];
 const [nick]=await db.select({id:users.id}).from(users).where(eq(users.email,'nick@habitat-one.com'));if(!nick)throw Error('Owner not found');
 const result=[];
 for(const segment of ['kozijnen','algemeen']){
  const mail=JSON.parse(fs.readFileSync(`${dir}/${segment}.json`,'utf8'));
  const recipients=audience.filter(r=>r.segment===segment);
  const name=`Valencia 2026 · ${segment==='kozijnen'?'Kozijnenbedrijven':'Overige bedrijven'} · ES + EN · 21 september`;
  const campaign=await db.transaction(async tx=>{
   await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${name}))`);
   const [existing]=await tx.select().from(emailCampaigns).where(eq(emailCampaigns.name,name));if(existing)return existing;
   for(const r of recipients)await tx.insert(prospects).values({companyName:r.name,email:r.email,category:segment==='kozijnen'?'overig':r.sheet==='Aannemers'?'aannemer':r.sheet==='Timmerbedrijven'?'interieur':'projectontwikkelaar',sector:r.sheet,source:'import',sourceRef:`valencia2026:${r.email}`,unsubscribeToken:signEmailToken(r.email),lawfulBasisNote:'Openbaar zakelijk contact uit Habitat_One_Prospectlijst_Javea_100km.xlsx; brongegevens in het originele bestand.',notes:'Valencia 2026: expliciet geselecteerd uit aangeleverde Excel-lijst.'}).onConflictDoNothing();
   const [created]=await tx.insert(emailCampaigns).values({name,subject:mail.subject.replace(/^\[TEST[^\]]*\]\s*/,''),introText:mail.text,language:'es',groups:[],audience:{categories:[],includeCustomers:false,explicitEmails:recipients.map(r=>r.email),approvedMail:{html:mail.html,text:mail.text}},createdById:nick.id,testSentAt:new Date(JSON.parse(fs.readFileSync(`${dir}/${segment}-test-sent.json`,'utf8')).sentAt),status:'draft'}).returning();return created;
  });
  if(process.argv.includes('--queue')){
   if(!['draft','queued','sending','sent'].includes(campaign.status))throw Error('Campaign paused; do not resume implicitly');
   const added=await vulWachtrij(campaign);
   if(campaign.status==='draft')await db.update(emailCampaigns).set({status:'queued',queuedCount:added,updatedAt:new Date()}).where(eq(emailCampaigns.id,campaign.id));
   result.push({segment,id:campaign.id,selected:recipients.length,added});
  }else result.push({segment,id:campaign.id,selected:recipients.length,status:campaign.status});
 }
 fs.writeFileSync(`${dir}/broadcast-campaigns.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)});
