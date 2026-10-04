import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { renderCrmGuide } from '../lib/crm-guide-pdf';
async function main(){for(const locale of ['nl','en','es'] as const){const bytes=await renderCrmGuide(locale);await writeFile(path.join(process.cwd(),'public/docs',`crm-quick-guide-${locale}.pdf`),bytes);console.log(locale,bytes.byteLength);}}
main().catch(()=>{console.error('Guide PDF render failed');process.exitCode=1;});
