/** Printbare verkooppuntvoorstellen. Alleen externe prijzen en voorwaarden;
 * kostprijzen en interne bijdragen worden nooit in de PDF opgenomen. */
import path from "node:path";
import { Document, Font, Image as PdfImage, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import { COMPANY } from "@/lib/company";
import type { DistributeurItem, DistributeurMaat } from "@/lib/distributeur-catalogus";
import { DEALER_STAFFELS, staffelMetId, type PrijsOpties } from "@/lib/distributeur-prijzen";
import { dealerPdfImages } from "@/lib/dealer-pdf-images";

const FONT_DIR = path.join(process.cwd(), "public/fonts/sora");
const LOGO = path.join(process.cwd(), "public/brand/habitat-one-logo.png");
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
    rules:["Staffels worden schriftelijk bevestigd op basis van betaalde paneelafname, na retouren en creditnota’s. Een hogere staffel geldt voor volgende orders; geen terugwerkende korting.","De korting is productafhankelijk. De prijzen per maat in dit voorstel gelden; de doelkorting is geen onvoorwaardelijke korting op ieder artikel. Prijzen op aanvraag worden afzonderlijk bevestigd.","Showroommateriaal: maximaal 60% korting, uitsluitend op vooraf afgesproken displaypanelen voor de eigen locatie. Maten en aantallen schriftelijk vastleggen. Geen stapeling met staffelkorting.","Transport naar het verkooppunt, montage, lijm, samples en architectenkoffers worden apart geoffreerd. Displaypanelen en samples tellen niet mee voor de jaarstaffel.","Dit is een prijsvoorstel. Definitieve prijzen, transport, beschikbaarheid en afname worden bevestigd vóór de bestelling. Bestaande schriftelijke afspraken blijven gelden."],
    size:"Maat / oppervlak", retail:"Adviesprijs", dealer:"Jouw inkoopprijs", showroom:"Showroom", ex:"ex. btw", inc:"incl. btw", stock:"voorraad", request:"Op aanvraag", adjusted:"Aangepaste korting", footer:"Prijsvoorstel · adviesprijzen vrijblijvend · transport en montage afzonderlijk · prijzen onder voorbehoud", panels:"Wandpanelen", sampleTitle:"Samples voor architecten", sampleText:"Een eigen samplekoffer met uitneembare trays, texturen en productinformatie maakt materiaalkeuzes tastbaar. Samenstelling, kosten en eventuele bruikleen worden afzonderlijk afgesproken."
  },
  en: {
    title:"Flexible Stone", label:"Retail partner pricing proposal", subtitle:"A collection to see. A material to feel.",
    intro:"For shops and showrooms reselling Flexible Stone. Every panel size has its own price. Recommended retail prices are non-binding: you set your own selling prices and promotions.",
    annual:"Paid panel purchases per 12 months", discount:"Target discount up to", selected:"Selected annual tier", terms:"Working together",
    rules:["Tiers are confirmed in writing based on paid panel purchases, after returns and credit notes. A higher tier applies to future orders; no retrospective discount.","Discounts depend on the product. The size-specific prices in this proposal apply; the target discount is not an unconditional discount on every item. On-request prices are confirmed separately.","Showroom material: up to 60% off agreed display panels for your own premises only. Sizes and quantities must be agreed in writing. Not combined with tier discounts.","Delivery to the retailer, installation, adhesive, samples and architect sample cases are quoted separately. Display panels and samples do not count towards the annual tier.","This is a pricing proposal. Final prices, transport, availability and purchases are confirmed before ordering. Existing written agreements remain applicable."],
    size:"Size / area", retail:"Recommended", dealer:"Your purchase price", showroom:"Showroom", ex:"excl. VAT", inc:"incl. VAT", stock:"in stock", request:"On request", adjusted:"Adjusted discount", footer:"Pricing proposal · non-binding retail prices · transport and installation separate · subject to confirmation", panels:"Wall panels", sampleTitle:"Samples for architects", sampleText:"A dedicated sample case with removable trays, textures and product information brings material choices to life. Contents, costs and any loan arrangement are agreed separately."
  },
  es: {
    title:"Flexible Stone", label:"Propuesta de precios para puntos de venta", subtitle:"Una colección para ver. Un material para sentir.",
    intro:"Para tiendas y showrooms que revenden Flexible Stone. Cada medida tiene su propio precio. Los precios de venta recomendados no son vinculantes: tú decides tus precios y promociones.",
    annual:"Compra pagada de paneles por 12 meses", discount:"Descuento objetivo hasta", selected:"Tramo anual seleccionado", terms:"Cómo colaboramos",
    rules:["Los tramos se confirman por escrito según las compras de paneles pagadas, descontando devoluciones y abonos. Un tramo superior se aplica a pedidos futuros, sin descuentos retroactivos.","El descuento depende del producto. Se aplican los precios por medida de esta propuesta; el descuento objetivo no es incondicional para cada artículo. Los precios a consultar se confirman por separado.","Material de showroom: hasta un 60% de descuento en paneles de exposición acordados para tu propio local. Medidas y cantidades por escrito. No acumulable al descuento por volumen.","Transporte al punto de venta, instalación, adhesivo, muestras y maletines para arquitectos se presupuestan aparte. Los paneles de exposición y las muestras no computan en el tramo anual.","Esta es una propuesta. Los precios definitivos, el transporte, la disponibilidad y las compras se confirman antes del pedido. Siguen vigentes los acuerdos escritos existentes."],
    size:"Medida / superficie", retail:"P. recomendado", dealer:"Tu precio de compra", showroom:"Showroom", ex:"sin IVA", inc:"con IVA", stock:"en stock", request:"A consultar", adjusted:"Descuento ajustado", footer:"Propuesta · precios recomendados no vinculantes · transporte e instalación aparte · sujeto a confirmación", panels:"Paneles de pared", sampleTitle:"Muestras para arquitectos", sampleText:"Un maletín propio con bandejas extraíbles, texturas e información del producto facilita la elección de materiales. El contenido, el coste y cualquier préstamo se acuerdan por separado."
  },
  de: {
    title:"Flexible Stone", label:"Preisvorschlag für Verkaufsstellen", subtitle:"Eine Kollektion zum Sehen. Ein Material zum Fühlen.",
    intro:"Für Geschäfte und Showrooms, die Flexible Stone weiterverkaufen. Jede Plattengröße hat ihren eigenen Preis. Empfohlene Verkaufspreise sind unverbindlich: Sie bestimmen Ihre Preise und Aktionen selbst.",
    annual:"Bezahlter Plattenbezug pro 12 Monate", discount:"Zielrabatt bis", selected:"Ausgewählte Jahresstaffel", terms:"Unsere Zusammenarbeit",
    rules:["Staffeln werden anhand bezahlter Plattenbezüge nach Rückgaben und Gutschriften schriftlich bestätigt. Eine höhere Staffel gilt für künftige Bestellungen, ohne rückwirkenden Rabatt.","Rabatte sind produktabhängig. Es gelten die Preise je Größe in diesem Vorschlag; der Zielrabatt gilt nicht vorbehaltlos für jeden Artikel. Preise auf Anfrage werden separat bestätigt.","Showroommaterial: bis zu 60% Rabatt auf vereinbarte Ausstellungsplatten für den eigenen Standort. Größen und Mengen schriftlich vereinbaren. Nicht mit Staffelrabatten kombinierbar.","Transport zur Verkaufsstelle, Montage, Kleber, Muster und Architektenkoffer werden separat angeboten. Ausstellungsplatten und Muster zählen nicht zum Jahresbezug.","Dies ist ein Preisvorschlag. Endgültige Preise, Transport, Verfügbarkeit und Abnahme werden vor der Bestellung bestätigt. Bestehende schriftliche Vereinbarungen bleiben gültig."],
    size:"Größe / Fläche", retail:"Empfehlung", dealer:"Ihr Einkaufspreis", showroom:"Showroom", ex:"zzgl. MwSt.", inc:"inkl. MwSt.", stock:"auf Lager", request:"Auf Anfrage", adjusted:"Angepasster Rabatt", footer:"Preisvorschlag · unverbindliche Verkaufspreise · Transport und Montage separat · vorbehaltlich Bestätigung", panels:"Wandplatten", sampleTitle:"Muster für Architekten", sampleText:"Ein eigener Musterkoffer mit herausnehmbaren Einsätzen, Texturen und Produktinformationen erleichtert die Materialwahl. Inhalt, Kosten und eine mögliche Leihgabe werden separat vereinbart."
  }
} as const;
type Copy = typeof DEALER_DOCUMENT_TEXT[PrijslijstTaal];
const s = StyleSheet.create({
  page:{fontFamily:"Sora",fontSize:8,color:COMPANY.charcoal,backgroundColor:"#fdfaf5",paddingHorizontal:40,paddingTop:32,paddingBottom:60},
  header:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",borderBottomWidth:1,borderBottomColor:COMPANY.gold,paddingBottom:12,marginBottom:18},
  logo:{width:96,height:43,objectFit:"contain"}, eyebrow:{fontSize:7,color:COMPANY.terracotta,letterSpacing:1.4,textTransform:"uppercase"},
  title:{fontSize:34,fontWeight:600,color:COMPANY.brown,letterSpacing:-1,marginTop:10}, subtitle:{fontSize:10,color:COMPANY.muted,marginTop:9},
  intro:{fontSize:9,lineHeight:1.7,marginTop:14,marginBottom:17},h2:{fontSize:12,fontWeight:600,color:COMPANY.brown,marginBottom:9},
  row:{flexDirection:"row",paddingVertical:8,borderBottomWidth:.5,borderBottomColor:COMPANY.sand}, head:{fontSize:7,fontWeight:600,color:COMPANY.muted},
  volume:{width:"65%"}, discount:{width:"35%",textAlign:"right",fontWeight:600},rule:{fontSize:8,lineHeight:1.65,marginBottom:8},
  note:{padding:12,backgroundColor:COMPANY.sand,marginTop:15},
  footer:{position:"absolute",left:40,right:40,bottom:22,borderTopWidth:.5,borderTopColor:COMPANY.sand,paddingTop:8,height:30,fontSize:6.5,color:COMPANY.muted,lineHeight:1.5},
  group:{fontSize:16,fontWeight:600,color:COMPANY.brown,marginTop:14,marginBottom:10},
  product:{marginBottom:12},prodHead:{flexDirection:"row",alignItems:"center",marginBottom:6},photo:{width:40,height:40,objectFit:"cover",marginRight:12},name:{fontSize:10,fontWeight:600,color:COMPANY.brown},sku:{fontSize:7,color:COMPANY.terracotta,marginTop:3},
  th:{flexDirection:"row",borderBottomWidth:.8,borderBottomColor:COMPANY.brown,paddingBottom:5},dim:{width:"25%"},price:{width:"25%",textAlign:"right",paddingLeft:8},
  priceRow:{flexDirection:"row",borderBottomWidth:.4,borderBottomColor:COMPANY.sand,paddingVertical:7,alignItems:"center"},
  strong:{fontSize:9,fontWeight:600},small:{fontSize:6.8,color:COMPANY.muted,marginTop:2},unit:{fontSize:6.8,color:COMPANY.muted,marginTop:5},stock:{fontSize:6.5,color:COMPANY.sage,marginTop:4},adjusted:{fontSize:6.5,color:COMPANY.terracotta,marginTop:3},
});
function euro(v:number,taal:PrijslijstTaal){return new Intl.NumberFormat(taal,{style:"currency",currency:"EUR"}).format(v);}
function volume(v:typeof DEALER_STAFFELS[number],taal:PrijslijstTaal){const n=(x:number)=>x.toLocaleString(taal);return v.totM2==null?`${n(v.vanafM2)}+ m²`:`${n(v.vanafM2)}–<${n(v.totM2)} m²`;}
function Amount({ex,incl,m,t,taal,adjusted}:{ex:number|null;incl:number|null;m:DistributeurMaat;t:Copy;taal:PrijslijstTaal;adjusted?:boolean}){
 return <View style={s.price}>{ex==null?<Text style={s.small}>{t.request}</Text>:<>
   <Text style={s.strong}>{euro(ex,taal)} {t.ex}</Text><Text style={s.small}>{euro(incl!,taal)} {t.inc}</Text>
   {m.areaM2&&<><Text style={s.unit}>{euro(ex/m.areaM2,taal)}/m² {t.ex}</Text><Text style={s.small}>{euro(incl!/m.areaM2,taal)}/m² {t.inc}</Text></>}
   {adjusted&&<Text style={s.adjusted}>{t.adjusted}</Text>}
 </>}</View>;
}
function Footer({t}:{t:Copy}){return <><View style={s.footer} fixed><Text>{COMPANY.legalName} · {COMPANY.website} · {COMPANY.email}</Text><Text>{t.footer}</Text></View><Text style={{position:"absolute",bottom:12,right:40,width:50,height:12,fontSize:6.5,textAlign:"right",color:COMPANY.muted}} render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`} fixed/></>;}
function Prijslijst({items,ondertitel,taal,opties}:{items:DistributeurItem[];ondertitel:string;taal:PrijslijstTaal;opties:PrijsOpties}){
 const t=DEALER_DOCUMENT_TEXT[taal],staffel=staffelMetId(opties.staffelId),date=new Date().toLocaleDateString(taal);
 const groepen=new Map<string,DistributeurItem[]>();for(const i of items)groepen.set(i.groep,[...(groepen.get(i.groep)??[]),i]);
 return <Document title={`${t.label} · ${ondertitel}`} author={COMPANY.name}>
   <Page size="A4" style={s.page}>
     <View style={s.header}><PdfImage src={LOGO} style={s.logo}/><Text style={s.eyebrow}>{date}</Text></View>
     <Text style={s.eyebrow}>{t.label}</Text><Text style={s.title}>{t.title}</Text><Text style={s.subtitle}>{t.subtitle}</Text><Text style={s.intro}>{t.intro}</Text>
     <View style={s.th}><Text style={[s.volume,s.head]}>{t.annual}</Text><Text style={[s.discount,s.head]}>{t.discount}</Text></View>
     {DEALER_STAFFELS.map(v=><View key={v.id} style={[s.row,v.id===staffel.id?{backgroundColor:COMPANY.sand}:{}]}><Text style={s.volume}>{volume(v,taal)}</Text><Text style={s.discount}>{v.kortingPct.toLocaleString(taal)}%</Text></View>)}
     <Text style={[s.small,{marginTop:8,marginBottom:18}]}>{t.selected}: {volume(staffel,taal)} · {staffel.kortingPct.toLocaleString(taal)}%</Text>
     <Text style={s.h2}>{t.terms}</Text>{t.rules.map((r,i)=><Text key={i} style={s.rule}>{i+1}. {r}</Text>)}
     <View style={s.note}><Text style={[s.h2,{fontSize:9}]}>{t.sampleTitle}</Text><Text style={[s.rule,{marginBottom:0}]}>{t.sampleText}</Text></View>
     <Footer t={t}/>
   </Page>
   {/* Keep pagination local to each series. A single 303-product flow makes
       React PDF repeatedly lay out the entire catalogue while splitting it. */}
   {[...groepen].map(([groep,panelen])=><Page key={groep} size="A4" orientation="landscape" style={s.page}>
     <View style={s.header} fixed><PdfImage src={LOGO} style={{width:66,height:30,objectFit:"contain"}}/><Text style={s.eyebrow}>{t.label} · {date}</Text></View>
     <Text style={s.small}>{t.selected}: {volume(staffel,taal)} · {staffel.kortingPct.toLocaleString(taal)}% · {ondertitel}</Text>
     {panelen.map((it,index)=><View key={it.id} style={s.product} wrap={false}>
         {index===0&&<Text style={s.group}>{groep}</Text>}
         <View style={s.prodHead}>{it.imageUrl&&<PdfImage src={it.imageUrl} style={s.photo}/>}<View><Text style={s.name}>{it.naam.startsWith(`${it.groep} - `)?it.naam.slice(it.groep.length+3):it.naam}</Text><Text style={s.sku}>{it.sku}</Text></View></View>
         <View style={s.th}><Text style={[s.dim,s.head]}>{t.size}</Text><Text style={[s.price,s.head]}>{t.retail}</Text><Text style={[s.price,s.head]}>{t.dealer}</Text><Text style={[s.price,s.head]}>{t.showroom} · ≤60%</Text></View>
         {it.maten.map((m,i)=><View key={i} style={s.priceRow}><View style={s.dim}><Text style={s.strong}>{m.dim}</Text><Text style={s.small}>{m.areaM2?.toLocaleString(taal)} m² · {taal === "es" ? "IVA" : taal === "de" ? "MwSt." : taal === "nl" ? "btw" : "VAT"} {m.vatRate}%</Text>{m.inStock&&<Text style={s.stock}>{t.stock}</Text>}</View>
           <Amount ex={m.adviesEx} incl={m.adviesIncl} m={m} t={t} taal={taal}/><Amount ex={m.verkooppunt} incl={m.verkooppuntIncl} m={m} t={t} taal={taal} adjusted={m.dealer.begrensd}/><Amount ex={m.showroom} incl={m.showroomIncl} m={m} t={t} taal={taal} adjusted={m.display.begrensd}/>
         </View>)}
     </View>)}
     <Footer t={t}/>
   </Page>)}
 </Document>;
}
export async function renderDistributeurPrijslijst(args:{items:DistributeurItem[];ondertitel:string;taal?:PrijslijstTaal;opties?:PrijsOpties}):Promise<Buffer>{
 const items = await dealerPdfImages(args.items);
 return renderToBuffer(<Prijslijst items={items} ondertitel={args.ondertitel} taal={args.taal??"nl"} opties={args.opties??{}}/>);
}
