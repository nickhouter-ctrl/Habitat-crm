import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import ts from 'typescript';
import { localizeReportInput } from '../report-localization';
import { en } from '../i18n/en';
import { es } from '../i18n/es';

describe('generated PDF translations', () => {
  it('translates report labels without translating customer data or changing amounts', () => {
    const input = { title:'Financieel overzicht', generatedAt:new Date(), kpis:[{label:'Lage voorraad',value:'€ 1.234,56'}], tables:[{title:'Voortgang per bouwfase', columns:[{header:'Begroot'}], rows:[['Kostprijs','€ 123,45']],subtitle:'In volgorde van uitvoering. De balk toont hoe ver elke fase is.'}] };
    for (const locale of ['en','es'] as const) {
      const result=localizeReportInput(input,locale);
      expect(result.title).toBe(locale==='en'?'Financial overview':'Resumen financiero');
      expect(result.tables[0].columns[0].header).toBe(locale==='en'?'Budgeted':'Presupuestado');
      expect(result.tables[0].rows).toBe(input.tables[0].rows);
      expect(result.kpis[0].value).toBe(input.kpis[0].value);
    }
  });
  it('covers generated titles, headings, hints and empty states in every report template', () => {
    const missing: string[]=[];
    for (const file of ['lib/budget-pdf.ts','lib/voortgang-pdf.ts','app/(app)/rapporten/pdf/route.ts','app/(app)/products/pdf/route.ts']) {
      const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true);
      const visit=(node:ts.Node)=>{
        if(ts.isStringLiteral(node)&&/[A-Za-zÀ-ÿ]/.test(node.text)) {
          let ancestor: ts.Node|undefined=node.parent;
          while(ancestor&&!ts.isPropertyAssignment(ancestor)&&!ts.isVariableStatement(ancestor)) ancestor=ancestor.parent;
          const property=ancestor&&ts.isPropertyAssignment(ancestor)?ancestor.name.getText(source):'';
          const translationCall=ts.isCallExpression(node.parent)&&node.parent.expression.getText(source)==='t';
          if((translationCall||['title','subtitle','header','label','hint','emptyText'].includes(property))&&(!(node.text in en)||!(node.text in es))) missing.push(`${file}: ${node.text}`);
        }
        ts.forEachChild(node,visit);
      };visit(source);
    }
    expect(missing).toEqual([]);
  });
});
