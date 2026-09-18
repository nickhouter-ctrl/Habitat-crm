// Local, read-only browser smoke check. Uses a short-lived session for an existing
// team member; no auth code is bypassed or changed, and no form is submitted.
import {chromium} from '/private/tmp/habitat-browser/node_modules/playwright/index.mjs';
import {encode} from 'next-auth/jwt';
import postgres from 'postgres';
const db=postgres(process.env.DATABASE_URL,{max:1,prepare:false,ssl:'require'});
let browser;
try {
  const [user]=await db`select id,name,email,role from users where role='admin' limit 1`;
  if(!user) throw new Error('Geen testgebruiker beschikbaar');
  const salt='authjs.session-token';
  const token=await encode({secret:process.env.AUTH_SECRET,salt,maxAge:600,token:{sub:user.id,id:user.id,name:user.name,email:user.email,role:user.role}});
  browser=await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addCookies([{name:salt,value:token,domain:'localhost',path:'/',httpOnly:true,sameSite:'Lax'}]);
  const page=await context.newPage();const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const response=await page.goto('http://localhost:3001/calculator',{waitUntil:'networkidle',timeout:90000});
  await page.getByRole('heading',{name:'Offerte-configurator',exact:true}).waitFor();
  await page.getByRole('button',{name:'Badkamer toevoegen',exact:true}).click();
  await page.getByLabel('Kleur voor alle badkamers').selectOption('GG');
  await page.getByLabel('Vrijstaande baden',{exact:true}).fill('1');
  await page.getByLabel(/^Wasbakken/).selectOption('2');
  await page.screenshot({path:'/private/tmp/habitat-calculator-desktop.png',fullPage:true});
  const total=await page.locator('[aria-live="polite"]').innerText();
  const errorsVisible=(await page.getByRole('alert').allTextContents()).filter(s=>s.trim());
  await page.getByRole('button',{name:'Concept lokaal bewaren',exact:true}).click();
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'Concept herstellen',exact:true}).click();
  const restoredTotal=await page.locator('[aria-live="polite"]').innerText();
  if(total!==restoredTotal) throw new Error('Hersteld concept wijkt af');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'/private/tmp/habitat-calculator-mobile.png',fullPage:true});
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth);
  await page.goto('http://localhost:3001/calculator/prijzen',{waitUntil:'networkidle'});
  const monocapa=await page.getByRole('row').filter({hasText:'Stucwerk buiten / gevel'}).innerText();
  if(!monocapa.includes('31,63')) throw new Error('Monocapa-tarief wijkt af');
  const projectsResponse=await page.goto('http://localhost:3001/projects?funding=attention',{waitUntil:'networkidle',timeout:90000});
  await page.getByRole('heading',{name:'Projecten',exact:true}).waitFor();
  const link=page.locator('a[href*="#voorschot-opvragen"]').first();
  if(await link.count()) {await link.click();await page.waitForLoadState('networkidle');await page.locator('h1').waitFor();}
  console.log(JSON.stringify({calculatorStatus:response.status(),total,restoredTotal,monocapa,errorsVisible,overflow,projectsStatus:projectsResponse.status(),browserErrors:errors}));
  if(errors.length||errorsVisible.length||overflow) process.exitCode=1;
} catch(e){console.error('Browsercontrole mislukt:',e.message);process.exitCode=1;}
finally{await browser?.close();await db.end({timeout:3});}
