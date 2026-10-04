/** Printbare verkooppuntvoorstellen. Alleen externe prijzen en voorwaarden;
 * kostprijzen en interne bijdragen worden nooit in de PDF opgenomen. */
import path from "node:path";
import { Document, Font, Image as PdfImage, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { COMPANY } from "@/lib/company";
import type { DistributeurItem, DistributeurMaat } from "@/lib/distributeur-catalogus";
import { DEALER_STAFFELS, KORTING_SHOWROOM, margeVerkooppunt, staffelMetId, type PrijsOpties } from "@/lib/distributeur-prijzen";
import { dealerPdfImages } from "@/lib/dealer-pdf-images";

const FONT_DIR = path.join(process.cwd(), "public/fonts/sora");
Font.register({ family: "Sora", fonts: [
  {src:path.join(FONT_DIR,"Sora-Regular.ttf"),fontWeight:400},
  {src:path.join(FONT_DIR,"Sora-SemiBold.ttf"),fontWeight:600},
  {src:path.join(FONT_DIR,"Sora-Bold.ttf"),fontWeight:700},
]});
export type PrijslijstTaal = "nl" | "de" | "en" | "es";
export const DEALER_DOCUMENT_TEXT = {
  nl: {
    title:"Flexible Stone", label:"Prijsvoorstel voor verkooppunten", subtitle:"Een collectie om te zien. Een materiaal om te voelen.",
    intro:"Voor winkels en showrooms die Flexible Stone doorverkopen. Elke paneelmaat heeft een eigen prijs. De adviesverkoopprijs is vrijblijvend: je bepaalt zelfstandig je verkoopprijzen en acties.",
    annual:"Betaalde paneelafname per 12 maanden", discount:"Doelkorting tot", selected:"Geselecteerde jaarstaffel", terms:"Zo werken we samen",
    unit:"Eenheid", perPanel:"Per paneel", perM2:"Per m²", guide:"Zo lees je de prijzen", panelGuide:"De prijs voor één paneel in de vermelde maat.", areaGuide:"De vergelijkprijs per m² voor dezelfde maat en uitvoering.", vatGuide:"Elke prijs staat exclusief én inclusief het btw-percentage van het artikel vermeld.", priceNote:"De inkoopprijs geldt bij de geselecteerde jaarstaffel. Showroomprijzen gelden uitsluitend voor afgesproken displaypanelen. Bij een aangepaste korting staat het werkelijke percentage per maat.", selection:"Selectie", maximum:"Maximale showroomkorting", continuation:"vervolg",
    margin:"Jouw brutobijdrage*", marginShort:"Brutomarge", marginGuide:"Wat je overhoudt bij verkoop tegen adviesprijs, exclusief btw en vóór je eigen kosten.", marginNote:"* Jouw brutobijdrage = adviesverkoopprijs ex. btw − jouw inkoopprijs ex. btw. Brutomarge = brutobijdrage / adviesprijs ex. btw. Eigen vervoer, personeel, huur en overige kosten gaan hier nog vanaf.",
    rules:["Staffels worden schriftelijk bevestigd op basis van betaalde paneelafname, na retouren en creditnota’s. Een hogere staffel geldt voor volgende orders; geen terugwerkende korting.","De korting is productafhankelijk. De prijzen per maat in dit voorstel gelden; de doelkorting is geen onvoorwaardelijke korting op ieder artikel. Prijzen op aanvraag worden afzonderlijk bevestigd.","Showroommateriaal: maximaal 60% korting, uitsluitend op vooraf afgesproken displaypanelen voor de eigen locatie. Maten en aantallen schriftelijk vastleggen. Geen stapeling met staffelkorting.","Transport naar het verkooppunt, montage, lijm, samples en architectenkoffers worden apart geoffreerd. Displaypanelen en samples tellen niet mee voor de jaarstaffel.","Dit is een prijsvoorstel. Definitieve prijzen, transport, beschikbaarheid en afname worden bevestigd vóór de bestelling. Bestaande schriftelijke afspraken blijven gelden."],
    size:"Maat / oppervlak", retail:"Adviesverkoopprijs", dealer:"Jouw inkoopprijs", showroom:"Showroom", ex:"ex. btw", inc:"incl. btw", stock:"voorraad", request:"Op aanvraag", adjusted:"Werkelijke korting", footer:"Prijsvoorstel · adviesprijzen vrijblijvend · transport en montage afzonderlijk · prijzen onder voorbehoud", panels:"Wandpanelen", sampleTitle:"Samples voor architecten", sampleText:"Een eigen samplekoffer met uitneembare trays, texturen en productinformatie maakt materiaalkeuzes tastbaar. Samenstelling, kosten en eventuele bruikleen worden afzonderlijk afgesproken."
  },
  en: {
    title:"Flexible Stone", label:"Retail partner pricing proposal", subtitle:"A collection to see. A material to feel.",
    intro:"For shops and showrooms reselling Flexible Stone. Every panel size has its own price. Recommended retail prices are non-binding: you set your own selling prices and promotions.",
    annual:"Paid panel purchases per 12 months", discount:"Target discount up to", selected:"Selected annual tier", terms:"Working together",
    unit:"Unit", perPanel:"Per panel", perM2:"Per m²", guide:"How to read the prices", panelGuide:"The price for one panel in the stated size.", areaGuide:"The comparison price per m² for the same size and finish.", vatGuide:"Every price is shown excluding and including the product’s VAT rate.", priceNote:"Purchase prices apply to the selected annual tier. Showroom prices apply only to agreed display panels. Where a discount is adjusted, the actual percentage is shown for that size.", selection:"Selection", maximum:"Maximum showroom discount", continuation:"continued",
    margin:"Your gross contribution*", marginShort:"Gross margin", marginGuide:"What you retain when selling at the recommended price, excluding VAT and before your own costs.", marginNote:"* Your gross contribution = recommended retail price excl. VAT − your purchase price excl. VAT. Gross margin = contribution / retail price excl. VAT. Your own delivery, staff, rent and other costs still come out of this amount.",
    rules:["Tiers are confirmed in writing based on paid panel purchases, after returns and credit notes. A higher tier applies to future orders; no retrospective discount.","Discounts depend on the product. The size-specific prices in this proposal apply; the target discount is not an unconditional discount on every item. On-request prices are confirmed separately.","Showroom material: up to 60% off agreed display panels for your own premises only. Sizes and quantities must be agreed in writing. Not combined with tier discounts.","Delivery to the retailer, installation, adhesive, samples and architect sample cases are quoted separately. Display panels and samples do not count towards the annual tier.","This is a pricing proposal. Final prices, transport, availability and purchases are confirmed before ordering. Existing written agreements remain applicable."],
    size:"Size / area", retail:"Recommended retail price", dealer:"Your purchase price", showroom:"Showroom", ex:"excl. VAT", inc:"incl. VAT", stock:"in stock", request:"On request", adjusted:"Actual discount", footer:"Pricing proposal · non-binding retail prices · transport and installation separate · subject to confirmation", panels:"Wall panels", sampleTitle:"Samples for architects", sampleText:"A dedicated sample case with removable trays, textures and product information brings material choices to life. Contents, costs and any loan arrangement are agreed separately."
  },
  es: {
    title:"Flexible Stone", label:"Propuesta de precios para puntos de venta", subtitle:"Una colección para ver. Un material para sentir.",
    intro:"Para tiendas y showrooms que revenden Flexible Stone. Cada medida tiene su propio precio. Los precios de venta recomendados no son vinculantes: tú decides tus precios y promociones.",
    annual:"Compra pagada de paneles por 12 meses", discount:"Descuento objetivo hasta", selected:"Tramo anual seleccionado", terms:"Cómo colaboramos",
    unit:"Unidad", perPanel:"Por panel", perM2:"Por m²", guide:"Cómo leer los precios", panelGuide:"El precio de un panel en la medida indicada.", areaGuide:"El precio de comparación por m² para la misma medida y acabado.", vatGuide:"Cada precio se indica sin y con el tipo de IVA del artículo.", priceNote:"Los precios de compra corresponden al tramo anual seleccionado. Los precios de showroom solo se aplican a paneles de exposición acordados. Si se ajusta el descuento, se indica el porcentaje real de esa medida.", selection:"Selección", maximum:"Descuento máximo de showroom", continuation:"continuación",
    margin:"Tu contribución bruta*", marginShort:"Margen bruto", marginGuide:"Lo que te queda al vender al precio recomendado, sin IVA y antes de tus propios gastos.", marginNote:"* Tu contribución bruta = precio de venta recomendado sin IVA − tu precio de compra sin IVA. Margen bruto = contribución / precio recomendado sin IVA. Aún debes descontar transporte propio, personal, alquiler y otros gastos.",
    rules:["Los tramos se confirman por escrito según las compras de paneles pagadas, descontando devoluciones y abonos. Un tramo superior se aplica a pedidos futuros, sin descuentos retroactivos.","El descuento depende del producto. Se aplican los precios por medida de esta propuesta; el descuento objetivo no es incondicional para cada artículo. Los precios a consultar se confirman por separado.","Material de showroom: hasta un 60% de descuento en paneles de exposición acordados para tu propio local. Medidas y cantidades por escrito. No acumulable al descuento por volumen.","Transporte al punto de venta, instalación, adhesivo, muestras y maletines para arquitectos se presupuestan aparte. Los paneles de exposición y las muestras no computan en el tramo anual.","Esta es una propuesta. Los precios definitivos, el transporte, la disponibilidad y las compras se confirman antes del pedido. Siguen vigentes los acuerdos escritos existentes."],
    size:"Medida / superficie", retail:"Precio de venta recomendado", dealer:"Tu precio de compra", showroom:"Showroom", ex:"sin IVA", inc:"con IVA", stock:"en stock", request:"A consultar", adjusted:"Descuento real", footer:"Propuesta · precios recomendados no vinculantes · transporte e instalación aparte · sujeto a confirmación", panels:"Paneles de pared", sampleTitle:"Muestras para arquitectos", sampleText:"Un maletín propio con bandejas extraíbles, texturas e información del producto facilita la elección de materiales. El contenido, el coste y cualquier préstamo se acuerdan por separado."
  },
  de: {
    title:"Flexible Stone", label:"Preisvorschlag für Verkaufsstellen", subtitle:"Eine Kollektion zum Sehen. Ein Material zum Fühlen.",
    intro:"Für Geschäfte und Showrooms, die Flexible Stone weiterverkaufen. Jede Plattengröße hat ihren eigenen Preis. Empfohlene Verkaufspreise sind unverbindlich: Sie bestimmen Ihre Preise und Aktionen selbst.",
    annual:"Bezahlter Plattenbezug pro 12 Monate", discount:"Zielrabatt bis", selected:"Ausgewählte Jahresstaffel", terms:"Unsere Zusammenarbeit",
    unit:"Einheit", perPanel:"Pro Platte", perM2:"Pro m²", guide:"So lesen Sie die Preise", panelGuide:"Der Preis für eine Platte in der angegebenen Größe.", areaGuide:"Der Vergleichspreis pro m² für dieselbe Größe und Ausführung.", vatGuide:"Jeder Preis wird ohne und mit dem Mehrwertsteuersatz des Artikels angegeben.", priceNote:"Einkaufspreise gelten für die ausgewählte Jahresstaffel. Showroompreise gelten nur für vereinbarte Ausstellungsplatten. Bei angepassten Rabatten wird der tatsächliche Prozentsatz je Größe angegeben.", selection:"Auswahl", maximum:"Maximaler Showroomrabatt", continuation:"Fortsetzung",
    margin:"Ihr Bruttobeitrag*", marginShort:"Bruttomarge", marginGuide:"Ihr verbleibender Betrag bei Verkauf zum empfohlenen Preis, ohne MwSt. und vor eigenen Kosten.", marginNote:"* Ihr Bruttobeitrag = empfohlener Verkaufspreis ohne MwSt. − Ihr Einkaufspreis ohne MwSt. Bruttomarge = Beitrag / Verkaufspreis ohne MwSt. Eigener Transport, Personal, Miete und weitere Kosten sind noch abzuziehen.",
    rules:["Staffeln werden anhand bezahlter Plattenbezüge nach Rückgaben und Gutschriften schriftlich bestätigt. Eine höhere Staffel gilt für künftige Bestellungen, ohne rückwirkenden Rabatt.","Rabatte sind produktabhängig. Es gelten die Preise je Größe in diesem Vorschlag; der Zielrabatt gilt nicht vorbehaltlos für jeden Artikel. Preise auf Anfrage werden separat bestätigt.","Showroommaterial: bis zu 60% Rabatt auf vereinbarte Ausstellungsplatten für den eigenen Standort. Größen und Mengen schriftlich vereinbaren. Nicht mit Staffelrabatten kombinierbar.","Transport zur Verkaufsstelle, Montage, Kleber, Muster und Architektenkoffer werden separat angeboten. Ausstellungsplatten und Muster zählen nicht zum Jahresbezug.","Dies ist ein Preisvorschlag. Endgültige Preise, Transport, Verfügbarkeit und Abnahme werden vor der Bestellung bestätigt. Bestehende schriftliche Vereinbarungen bleiben gültig."],
    size:"Größe / Fläche", retail:"Empfohlener Verkaufspreis", dealer:"Ihr Einkaufspreis", showroom:"Showroom", ex:"zzgl. MwSt.", inc:"inkl. MwSt.", stock:"auf Lager", request:"Auf Anfrage", adjusted:"Tatsächlicher Rabatt", footer:"Preisvorschlag · unverbindliche Verkaufspreise · Transport und Montage separat · vorbehaltlich Bestätigung", panels:"Wandplatten", sampleTitle:"Muster für Architekten", sampleText:"Ein eigener Musterkoffer mit herausnehmbaren Einsätzen, Texturen und Produktinformationen erleichtert die Materialwahl. Inhalt, Kosten und eine mögliche Leihgabe werden separat vereinbart."
  }
} as const;
type Copy = typeof DEALER_DOCUMENT_TEXT[PrijslijstTaal];
const s = StyleSheet.create({
  page:{fontFamily:"Sora",fontSize:9,color:COMPANY.charcoal,backgroundColor:"#fdfaf5",paddingHorizontal:40,paddingTop:30,paddingBottom:60},
  pricePage:{paddingHorizontal:32,paddingTop:24,paddingBottom:74},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderBottomWidth:1,borderBottomColor:COMPANY.gold,paddingBottom:12,marginBottom:20},
  wordmark:{width:190,height:43,justifyContent:"center"},brand:{fontSize:12,fontWeight:600,color:COMPANY.brown,letterSpacing:2},eyebrow:{fontSize:7,color:COMPANY.terracotta,letterSpacing:1.1,textTransform:"uppercase"},
  title:{fontSize:34,fontWeight:600,color:COMPANY.brown,letterSpacing:-1,marginTop:10},subtitle:{fontSize:11,color:COMPANY.muted,marginTop:9},
  intro:{fontSize:9.5,lineHeight:1.65,marginTop:16,marginBottom:20},h2:{fontSize:13,fontWeight:600,color:COMPANY.brown,marginBottom:10},
  summary:{flexDirection:"row",backgroundColor:COMPANY.sand,padding:14,marginBottom:22},summaryHalf:{width:"50%",paddingRight:12},summaryLabel:{fontSize:8,color:COMPANY.muted,marginBottom:5},summaryValue:{fontSize:18,fontWeight:600,color:COMPANY.brown},
  row:{flexDirection:"row",paddingVertical:9,paddingHorizontal:10,borderBottomWidth:.5,borderBottomColor:COMPANY.sand},head:{fontSize:8,fontWeight:600,color:COMPANY.brown},
  volume:{width:"65%"},discount:{width:"35%",textAlign:"right",fontWeight:600},
  guideRow:{flexDirection:"row",marginTop:10},guideLabel:{width:"28%",fontWeight:600,color:COMPANY.brown,fontSize:9},guideText:{width:"72%",fontSize:9,lineHeight:1.55,color:COMPANY.muted},
  rule:{flexDirection:"row",paddingVertical:14,borderBottomWidth:.5,borderBottomColor:COMPANY.sand},ruleNumber:{width:"9%",fontSize:18,fontWeight:600,color:COMPANY.terracotta},ruleText:{width:"91%",fontSize:10,lineHeight:1.7},
  note:{padding:16,backgroundColor:COMPANY.sand,marginTop:22},
  footer:{position:"absolute",left:40,right:40,bottom:22,borderTopWidth:.5,borderTopColor:COMPANY.sand,paddingTop:8,height:30,fontSize:6.5,color:COMPANY.muted,lineHeight:1.5},
  priceFooter:{left:32,right:32,height:46},marginNote:{fontSize:7.2,lineHeight:1.4,marginBottom:4,color:COMPANY.charcoal},
  priceHeader:{marginBottom:12,paddingBottom:9,borderBottomWidth:1,borderBottomColor:COMPANY.gold},brandRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},
  seriesRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginTop:8},group:{fontSize:15,fontWeight:600,color:COMPANY.brown},selected:{fontSize:8,color:COMPANY.muted,textAlign:"right",maxWidth:"52%"},
  product:{marginBottom:12},prodHead:{flexDirection:"row",alignItems:"center",marginBottom:7},photo:{width:32,height:32,objectFit:"cover",marginRight:10},name:{fontSize:11,fontWeight:600,color:COMPANY.brown},sku:{fontSize:7.5,color:COMPANY.terracotta,marginTop:3},
  th:{flexDirection:"row",borderBottomWidth:.8,borderBottomColor:COMPANY.brown,paddingVertical:6,alignItems:"center"},dimHead:{width:"18%"},unitHead:{width:"10%",paddingLeft:8},priceHead:{width:"18%",textAlign:"right",paddingHorizontal:8},
  sizeRow:{flexDirection:"row",borderBottomWidth:.7,borderBottomColor:COMPANY.sand},dim:{width:"18%",paddingVertical:7,paddingRight:10},sizePrices:{width:"82%"},
  unitRow:{flexDirection:"row",alignItems:"center",paddingVertical:4,minHeight:28},areaRow:{borderTopWidth:.4,borderTopColor:COMPANY.sand},unit:{width:"12.19512%",paddingLeft:8,fontSize:8,fontWeight:600,color:COMPANY.muted},price:{width:"21.95122%",paddingHorizontal:8},
  amountRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},vatLabel:{fontSize:6.8,color:COMPANY.muted},amountEx:{fontSize:9.5,fontWeight:600,color:COMPANY.brown},amountInc:{fontSize:8.5,color:COMPANY.muted,marginTop:1},
  contribution:{backgroundColor:"#f0ece2"},marginValue:{fontSize:7,color:COMPANY.muted,marginTop:2,textAlign:"right"},
  strong:{fontSize:10,fontWeight:600},small:{fontSize:7.2,color:COMPANY.muted,marginTop:3},stock:{fontSize:7,color:COMPANY.sage,marginTop:3},adjusted:{fontSize:6.8,color:COMPANY.terracotta,marginTop:3,lineHeight:1.3},
});
function euro(v:number,taal:PrijslijstTaal){return new Intl.NumberFormat(taal,{style:"currency",currency:"EUR"}).format(v);}
function percent(v:number,taal:PrijslijstTaal){return `${v.toLocaleString(taal,{maximumFractionDigits:1})}%`;}
function volume(v:typeof DEALER_STAFFELS[number],taal:PrijslijstTaal){const n=(x:number)=>x.toLocaleString(taal);return v.totM2==null?`${n(v.vanafM2)}+ m²`:`${n(v.vanafM2)}–<${n(v.totM2)} m²`;}
function Amount({ex,incl,t,taal}:{ex:number|null;incl:number|null;t:Copy;taal:PrijslijstTaal}){
  return <View style={s.price}>{ex==null?<Text style={s.small}>{t.request}</Text>:<>
    <View style={s.amountRow}><Text style={s.vatLabel}>{t.ex}</Text><Text style={s.amountEx}>{euro(ex,taal)}</Text></View>
    <View style={s.amountRow}><Text style={s.vatLabel}>{t.inc}</Text><Text style={s.amountInc}>{euro(incl!,taal)}</Text></View>
  </>}</View>;
}
function RetailContribution({m,divisor,t,taal}:{m:DistributeurMaat;divisor:number;t:Copy;taal:PrijslijstTaal}){
  // The retailer's contribution uses only public retail/purchase prices.
  // Our own cost price and contribution must never enter this document.
  const contribution=margeVerkooppunt(m);
  return <View style={[s.price,s.contribution]}>{contribution==null?<Text style={s.small}>{t.request}</Text>:<>
    <View style={s.amountRow}><Text style={s.vatLabel}>{t.ex}</Text><Text style={s.amountEx}>{euro(contribution/divisor,taal)}</Text></View>
    <Text style={s.marginValue}>{t.marginShort} {percent(contribution/m.adviesEx*100,taal)}</Text>
  </>}</View>;
}
function SizePrices({m,t,taal}:{m:DistributeurMaat;t:Copy;taal:PrijslijstTaal}){
  return <View style={s.sizeRow} wrap={false}>
    <View style={s.dim}><Text style={s.strong}>{m.dim}</Text><Text style={s.small}>{m.areaM2!=null?`${m.areaM2.toLocaleString(taal)} m² · `:""}{taal==="es"?"IVA":taal==="de"?"MwSt.":taal==="nl"?"btw":"VAT"} {m.vatRate}%</Text>{m.sku&&<Text style={s.small}>{m.sku}</Text>}{m.inStock&&<Text style={s.stock}>{t.stock}</Text>}
      {m.dealer.begrensd&&m.dealer.kortingPct!=null&&<Text style={s.adjusted}>{t.adjusted} · {t.dealer}: {percent(m.dealer.kortingPct,taal)}</Text>}
      {m.display.begrensd&&m.display.kortingPct!=null&&<Text style={s.adjusted}>{t.adjusted} · {t.showroom}: {percent(m.display.kortingPct,taal)}</Text>}
    </View>
    <View style={s.sizePrices}>
      {[{label:t.perPanel,divisor:1},...(m.areaM2!=null?[{label:t.perM2,divisor:m.areaM2}]:[])].map(({label,divisor},index)=><View key={index} style={[s.unitRow,index===1?s.areaRow:{}]}>
        <Text style={s.unit}>{label}</Text>
        <Amount ex={m.adviesEx/divisor} incl={m.adviesIncl/divisor} t={t} taal={taal}/>
        <Amount ex={m.verkooppunt!=null?m.verkooppunt/divisor:null} incl={m.verkooppuntIncl!=null?m.verkooppuntIncl/divisor:null} t={t} taal={taal}/>
        <RetailContribution m={m} divisor={divisor} t={t} taal={taal}/>
        <Amount ex={m.showroom!=null?m.showroom/divisor:null} incl={m.showroomIncl!=null?m.showroomIncl/divisor:null} t={t} taal={taal}/>
      </View>)}
    </View>
  </View>;
}
function Wordmark({compact=false}:{compact?:boolean}){return <View style={[s.wordmark,compact?{height:26}:{}]}><Text style={s.brand}>FLEXIBLE STONE</Text></View>;}
function Footer({t,prices=false}:{t:Copy;prices?:boolean}){return <><View style={[s.footer,prices?s.priceFooter:{}]} fixed>{prices&&<Text style={s.marginNote}>{t.marginNote}</Text>}<Text>{t.title}</Text><Text>{t.footer}</Text></View><Text style={{position:"absolute",bottom:10,right:40,width:50,height:12,fontSize:6.5,textAlign:"right",color:COMPANY.muted}} render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`} fixed/></>;}
function Prijslijst({items,ondertitel,taal,opties}:{items:DistributeurItem[];ondertitel:string;taal:PrijslijstTaal;opties:PrijsOpties}){
  const t=DEALER_DOCUMENT_TEXT[taal],staffel=staffelMetId(opties.staffelId),date=new Date().toLocaleDateString(taal);
  const groepen=new Map<string,DistributeurItem[]>();for(const i of items)groepen.set(i.groep,[...(groepen.get(i.groep)??[]),i]);
  return <Document title={`${t.label} · ${ondertitel}`} author={t.title}>
    <Page size="A4" style={s.page}>
      <View style={s.header}><Wordmark/><Text style={s.eyebrow}>{date}</Text></View>
      <Text style={s.eyebrow}>{t.label}</Text><Text style={s.title}>{t.title}</Text><Text style={s.subtitle}>{t.subtitle}</Text><Text style={s.intro}>{t.intro}</Text>
      <View style={s.summary}><View style={s.summaryHalf}><Text style={s.summaryLabel}>{t.selected}</Text><Text style={s.summaryValue}>{percent(staffel.kortingPct,taal)}</Text><Text style={s.small}>{volume(staffel,taal)}</Text></View><View style={s.summaryHalf}><Text style={s.summaryLabel}>{t.maximum}</Text><Text style={s.summaryValue}>≤{KORTING_SHOWROOM}%</Text><Text style={s.small}>{t.selection}: {ondertitel}</Text></View></View>
      <View style={[s.row,{backgroundColor:COMPANY.sand}]}><Text style={[s.volume,s.head]}>{t.annual}</Text><Text style={[s.discount,s.head]}>{t.discount}</Text></View>
      {DEALER_STAFFELS.map(v=><View key={v.id} style={[s.row,v.id===staffel.id?{backgroundColor:"#f0ece2"}:{}]}><Text style={s.volume}>{volume(v,taal)}</Text><Text style={[s.discount,{color:v.id===staffel.id?COMPANY.terracotta:COMPANY.brown}]}>{percent(v.kortingPct,taal)}</Text></View>)}
      <Text style={[s.h2,{marginTop:24}]}>{t.guide}</Text>
      {[[t.perPanel,t.panelGuide],[t.perM2,t.areaGuide],[t.margin.replace("*",""),t.marginGuide]].map(([label,text])=><View key={label} style={s.guideRow}><Text style={s.guideLabel}>{label}</Text><Text style={s.guideText}>{text}</Text></View>)}
      <Text style={[s.small,{marginTop:14,lineHeight:1.5}]}>{t.vatGuide}</Text>
      <Footer t={t}/>
    </Page>
    <Page size="A4" style={s.page}>
      <View style={s.header}><Wordmark/><Text style={s.eyebrow}>{t.label}</Text></View>
      <Text style={[s.h2,{fontSize:22,marginTop:8}]}>{t.terms}</Text>
      {t.rules.map((rule,i)=><View key={i} style={s.rule} wrap={false}><Text style={s.ruleNumber}>{String(i+1).padStart(2,"0")}</Text><Text style={s.ruleText}>{rule}</Text></View>)}
      <View style={s.note} wrap={false}><Text style={s.h2}>{t.sampleTitle}</Text><Text style={{fontSize:9,lineHeight:1.65}}>{t.sampleText}</Text></View>
      <Footer t={t}/>
    </Page>
    {/* Local series flows plus bounded product blocks keep large catalogues
        quick to paginate and prevent a five-size product overflowing a page. */}
    {[...groepen].map(([groep,panelen])=><Page key={groep} size="A4" orientation="landscape" style={[s.page,s.pricePage]}>
      <View style={s.priceHeader} fixed><View style={s.brandRow}><Wordmark compact/><Text style={s.eyebrow}>{t.label} · {date}</Text></View><View style={s.seriesRow}><Text style={s.group}>{groep}</Text><Text style={s.selected}>{t.selected}: {volume(staffel,taal)} · {percent(staffel.kortingPct,taal)}</Text></View></View>
      {panelen.flatMap(it=>Array.from({length:Math.ceil(it.maten.length/3)},(_,block)=>({it,block,maten:it.maten.slice(block*3,block*3+3)}))).map(({it,block,maten})=><View key={`${it.id}-${block}`} style={s.product} wrap={false}>
        <View style={s.prodHead}>{it.imageUrl&&<PdfImage src={it.imageUrl} style={s.photo}/>}<View><Text style={s.name}>{it.naam.startsWith(`${it.groep} - `)?it.naam.slice(it.groep.length+3):it.naam}{block>0?` · ${t.continuation}`:""}</Text><Text style={s.sku}>{it.sku}</Text></View></View>
        <View style={s.th}><Text style={[s.dimHead,s.head]}>{t.size}</Text><Text style={[s.unitHead,s.head]}>{t.unit}</Text><Text style={[s.priceHead,s.head]}>{t.retail}</Text><View style={s.priceHead}><Text style={s.head}>{t.dealer}</Text><Text style={s.small}>{t.discount} {percent(staffel.kortingPct,taal)}</Text></View><Text style={[s.priceHead,s.head]}>{t.margin}</Text><View style={s.priceHead}><Text style={s.head}>{t.showroom}</Text><Text style={s.small}>≤{KORTING_SHOWROOM}%</Text></View></View>
        {maten.map((m,i)=><SizePrices key={i} m={m} t={t} taal={taal}/>)}
      </View>)}
      <Footer t={t} prices/>
    </Page>)}
  </Document>;
}
export async function renderDistributeurPrijslijst(args:{items:DistributeurItem[];ondertitel:string;taal?:PrijslijstTaal;opties?:PrijsOpties}):Promise<Buffer>{
 const items = await dealerPdfImages(args.items);
 return renderToBuffer(<Prijslijst items={items} ondertitel={args.ondertitel} taal={args.taal??"nl"} opties={args.opties??{}}/>);
}
