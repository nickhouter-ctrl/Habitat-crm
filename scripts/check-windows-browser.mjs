// Read-only local smoke check: no records, accounts or messages are created.
import {chromium} from '/private/tmp/habitat-browser/node_modules/playwright/index.mjs';
import {encode} from 'next-auth/jwt';
import postgres from 'postgres';
const db=postgres(process.env.DATABASE_URL,{max:1,prepare:false,ssl:'require'});
let browser;
const euro=n=>new Intl.NumberFormat('nl-NL',{style:'currency',currency:'EUR'}).format(n);
try {
  const [user]=await db`select id,name,email,role from users where role='admin' limit 1`;
  const fixtures=await db`select d.id,ca.contact_id,d.company_name,
    (select count(*) from windows.orders o where o.dealer_id=d.id) as orders,
    (select count(*) from windows.quotes q where q.dealer_id=d.id) as quotes,
    (select coalesce(sum(coalesce((o.factory_final->>'dealerPrice')::numeric,(o.snapshot->'totals'->>'dealer')::numeric)),0)/100 from windows.orders o where o.dealer_id=d.id and o.status<>'cancelled') as value,
    (select coalesce(sum(i.gross_cents),0)/100.0 from windows.invoices i join windows.orders o on o.id=i.order_id where o.dealer_id=d.id and i.issuer='habitat' and i.status='sent') as open
    from windows.dealers d join customer_accounts ca on ca.id::text=d.portal_account_id where ca.contact_id is not null order by orders desc`;
  const f=fixtures[0];if(!f)throw new Error('Geen gekoppelde dealer');
  const salt='authjs.session-token';
  const token=await encode({secret:process.env.AUTH_SECRET,salt,maxAge:600,token:{sub:user.id,id:user.id,name:user.name,email:user.email,role:user.role}});
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:salt,value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const visit=async path=>{const r=await page.goto(`http://localhost:3001${path}`,{waitUntil:'networkidle',timeout:60000});if(r.status()!==200)throw new Error(`${path}: HTTP ${r.status()}`);};
  const checkTotals=async fixture=>{
    for(const [label,value] of [['Orderwaarde',fixture.value],['Nog te ontvangen',fixture.open]]){
      const tile=page.locator('p').filter({hasText:new RegExp(`^${label}$`)}).locator('..');
      if(!(await tile.innerText()).includes(euro(Number(value))))throw new Error(`${label} wijkt af voor ${fixture.id}`);
    }
  };
  await visit('/kozijnen');await page.getByRole('heading',{name:'Kozijnen',exact:true}).waitFor();
  await page.screenshot({path:'/private/tmp/habitat-windows-desktop.png',fullPage:true});
  await page.getByLabel('Filter op dealer').selectOption(f.id);await checkTotals(f);
  if(await page.locator('tbody tr').count()!==Number(f.orders))throw new Error('Orderaantal wijkt af');
  await page.getByRole('tab',{name:/Offertes/}).click();await page.getByLabel('Ook eerdere versies').check();
  if(Number(f.quotes)>0&&await page.locator('tbody tr').count()!==Number(f.quotes))throw new Error('Offerteversies wijken af');
  await page.getByRole('tab',{name:/Dealers/}).click();
  await page.getByRole('link',{name:f.company_name,exact:true}).click();await page.waitForURL(`**/kozijnen/dealers/${f.id}`);await page.waitForLoadState('networkidle');await checkTotals(f);
  const expected=`/kozijnen/portaal?next=${encodeURIComponent(`/admin/dealers/${f.id}`)}`;
  if(await page.getByRole('link',{name:'Windows-dashboard',exact:true}).getAttribute('href')!==expected)throw new Error('Verkeerde Windows-dashboardlink');
  await page.getByRole('link',{name:'CRM-klantdossier',exact:true}).click();await page.waitForURL(`**/contacts/${f.contact_id}?tab=kozijnen`);await page.waitForLoadState('networkidle');
  if(!page.url().includes(f.contact_id)||!page.url().includes('tab=kozijnen'))throw new Error('Verkeerd CRM-contact');
  await checkTotals(f);await page.screenshot({path:'/private/tmp/habitat-windows-contact.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'/private/tmp/habitat-windows-mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  if(overflow)throw new Error('Horizontale pagina-overflow');
  for(const fixture of fixtures){await visit(`/contacts/${fixture.contact_id}?tab=kozijnen`);await checkTotals(fixture);}
  await page.setViewportSize({width:1440,height:1000});
  await visit('/windows-accounts');if(!await page.getByRole('columnheader',{name:'Kozijnen',exact:true}).count())throw new Error('Accountnavigatie ontbreekt');
  if(!await page.getByRole('link',{name:'Website-accounts',exact:true}).count())throw new Error('Lokale navigatie loopt achter');
  console.log(JSON.stringify({checkedAccounts:fixtures.length,sourceTotalsMatch:true,overflow,browserErrors:errors}));
  if(errors.length)process.exitCode=1;
} catch(e){console.error('Windows-browsercontrole mislukt:',e.message);process.exitCode=1;}
finally{await browser?.close();await db.end({timeout:3});}
