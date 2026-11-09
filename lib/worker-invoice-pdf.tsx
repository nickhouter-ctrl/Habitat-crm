import React from "react";
import { Document,Page,Text,View,StyleSheet,renderToBuffer } from "@react-pdf/renderer";
import { periodRange, type WorkerInvoice, type WeekDay } from "@/lib/worker-week";

// Altijd in het Spaans: het is een Spaanse factuur van een Spaanse zelfstandige
// aan Habitat One SL, ongeacht de taal waarin de bouwer het portaal gebruikt.
const ink="#1b2333",muted="#6a7383",line="#dde2ea",band="#f2f5f9",accent="#1f3864";
const s=StyleSheet.create({
 page:{paddingTop:40,paddingBottom:56,paddingHorizontal:44,fontFamily:"Helvetica",fontSize:9,color:ink,lineHeight:1.4},
 head:{flexDirection:"row",justifyContent:"space-between",alignItems:"flex-end",paddingBottom:14},
 strip:{flexDirection:"row",backgroundColor:band,borderTopWidth:3,borderTopColor:accent,borderRadius:3,marginTop:2},
 cell:{flex:1,paddingVertical:10,paddingHorizontal:12,borderRightWidth:.5,borderRightColor:line},
 number:{fontSize:18,fontFamily:"Helvetica-Bold",color:accent,lineHeight:1.1},
 cellValue:{fontSize:11,fontFamily:"Helvetica-Bold",lineHeight:1.3,marginTop:3},
  small:{fontSize:8,color:muted},
 title:{fontSize:28,fontFamily:"Helvetica-Bold",color:accent,letterSpacing:2,lineHeight:1,marginBottom:8},
 parties:{flexDirection:"row",gap:24,marginTop:22,marginBottom:4},
 party:{flex:1,borderLeftWidth:3,borderLeftColor:accent,paddingLeft:12,paddingVertical:2},
 partyName:{fontSize:12,fontFamily:"Helvetica-Bold",marginBottom:4},
 partyId:{flexDirection:"row",marginTop:6,paddingTop:5,borderTopWidth:.5,borderTopColor:line},
 boxLabel:{fontSize:7,color:muted,textTransform:"uppercase",letterSpacing:1,marginBottom:4},
 bold:{fontFamily:"Helvetica-Bold"},
 th:{flexDirection:"row",backgroundColor:accent,color:"#ffffff",paddingVertical:6,paddingHorizontal:6,marginTop:16,fontFamily:"Helvetica-Bold",fontSize:8},
 tr:{flexDirection:"row",paddingVertical:7,paddingHorizontal:6,borderBottomWidth:.5,borderBottomColor:line},
 detailHead:{marginTop:26,fontSize:7,color:muted,textTransform:"uppercase",letterSpacing:1},
 dRow:{flexDirection:"row",paddingVertical:4,borderBottomWidth:.5,borderBottomColor:line,fontSize:8},
 cDate:{width:62},cDesc:{flex:1,paddingRight:8},cNum:{width:46,textAlign:"right"},cAmt:{width:70,textAlign:"right"},
 totals:{marginTop:14,marginLeft:"auto",width:230},
 tRow:{flexDirection:"row",justifyContent:"space-between",paddingVertical:3},
 grand:{flexDirection:"row",justifyContent:"space-between",backgroundColor:accent,color:"#ffffff",padding:8,marginTop:6,borderRadius:3,fontFamily:"Helvetica-Bold",fontSize:11},
 pay:{marginTop:22,borderTopWidth:.5,borderTopColor:line,paddingTop:10},
 status:{fontSize:8,color:accent,textAlign:"right",borderWidth:.75,borderColor:accent,borderRadius:3,paddingVertical:3,paddingHorizontal:6},
 footer:{position:"absolute",bottom:24,left:44,right:44,flexDirection:"row",justifyContent:"space-between",fontSize:7,color:muted},
});
/** "Calle 1, Local 2, 03730 Jávea (Alicante), España" → straat / postcode + plaats. */
const adres=(a:string)=>{const m=a.match(/^(.*?),\s*(\d{5}\b.*)$/);return m?[m[1],m[2]]:[a];};
const fecha=(d:string)=>{const [y,m,dd]=d.split("-");return `${dd}/${m}/${y}`;};
const dia=(d:string)=>new Date(`${d}T12:00:00Z`).toLocaleDateString("es-ES",{timeZone:"UTC",weekday:"short",day:"2-digit",month:"2-digit"});
export async function renderWorkerInvoice(invoice:WorkerInvoice,days:WeekDay[],status:string) {
 const i=invoice,eur=(v:number)=>new Intl.NumberFormat("es-ES",{style:"currency",currency:"EUR",useGrouping:"always"}).format(v),num=(v:number)=>v.toLocaleString("es-ES",{maximumFractionDigits:2});
 // Eén regel per werkdag: omschrijving, wie er waren, uren × tarief.
 const rows=days.filter(d=>d.state==="work").map(d=>{
   const hours=d.crews.reduce((t,c)=>t+c.people*c.hours,0);
   const desc=[...new Set(d.crews.map(c=>c.description.trim()).filter(Boolean))].join(" · ");
   const names=d.crews.flatMap(c=>c.names.split("\n").map(n=>n.trim()).filter(Boolean));
   return {date:d.date,hours,desc,names,people:d.crews.reduce((t,c)=>t+c.people,0)};
 }).filter(r=>r.hours>0);
 const last=days.at(-1)?.date;
 return renderToBuffer(<Document title={`Factura ${i.number}`} author={i.legalName} language="es"><Page size="A4" style={s.page}>
   <View style={s.head}>
     <View><Text style={s.title}>FACTURA</Text><Text style={{color:muted}}>{i.legalName} · NIF/NIE {i.taxId}</Text></View>
     {status!=="approved" && <Text style={s.status}>Pendiente de revisión{"\n"}por el cliente</Text>}
   </View>
   <View style={s.strip}>
     <View style={s.cell}><Text style={s.boxLabel}>Factura nº</Text><Text style={s.number}>{i.number}</Text></View>
     <View style={s.cell}><Text style={s.boxLabel}>Fecha de factura</Text><Text style={s.cellValue}>{fecha(i.date)}</Text></View>
     <View style={s.cell}><Text style={s.boxLabel}>Periodo</Text><Text style={s.cellValue}>{fecha(i.weekStart)} – {fecha(last??i.weekStart)}</Text></View>
     <View style={[s.cell,{borderRightWidth:0}]}><Text style={s.boxLabel}>Total a pagar</Text><Text style={[s.cellValue,{color:accent}]}>{eur(i.total)}</Text></View>
   </View>
   <View style={s.parties}>
     {[{label:"Emisor",name:i.legalName,idLabel:"NIF/NIE",id:i.taxId,address:i.address,extra:i.email},{label:"Cliente",name:i.customer.name,idLabel:"NIF",id:i.customer.taxId,address:i.customer.address,extra:""}].map(p=><View key={p.label} style={s.party}>
       <Text style={s.boxLabel}>{p.label}</Text>
       <Text style={s.partyName}>{p.name}</Text>
       {adres(p.address).map((l,n)=><Text key={n}>{l}</Text>)}
       <View style={s.partyId}><Text style={{color:muted,width:42}}>{p.idLabel}</Text><Text style={s.bold}>{p.id}</Text></View>
       {p.extra?<Text style={{color:muted,marginTop:2}}>{p.extra}</Text>:null}
     </View>)}
   </View>
   <View style={s.th}><Text style={s.cDesc}>Concepto</Text><Text style={s.cNum}>Horas</Text><Text style={s.cAmt}>Precio/hora</Text><Text style={s.cAmt}>Importe</Text></View>
   <View style={s.tr}>
     <View style={s.cDesc}><Text style={s.bold}>Mano de obra — {i.projectName}</Text><Text style={s.small}>Periodo {periodRange(i.weekStart,"es",last)} · {rows.length} {rows.length===1?"día":"días"} trabajados</Text></View>
     <Text style={s.cNum}>{num(i.hours)}</Text><Text style={s.cAmt}>{eur(i.rate)}</Text><Text style={[s.cAmt,s.bold]}>{eur(i.subtotal)}</Text>
   </View>
   <View style={s.totals} wrap={false}>
     <View style={s.tRow}><Text style={{color:muted}}>Total horas</Text><Text style={s.bold}>{num(i.hours)} h</Text></View>
     <View style={s.tRow}><Text style={{color:muted}}>Base imponible</Text><Text style={s.bold}>{eur(i.subtotal)}</Text></View>
     <View style={s.tRow}><Text style={{color:muted}}>IVA {num(i.vatRate)}%</Text><Text style={s.bold}>{eur(i.vat)}</Text></View>
     {i.withholdingRate>0 && <View style={s.tRow}><Text style={{color:muted}}>Retención IRPF {num(i.withholdingRate)}%</Text><Text style={s.bold}>− {eur(i.withholding)}</Text></View>}
     <View style={s.grand}><Text>Total a pagar</Text><Text>{eur(i.total)}</Text></View>
   </View>
   <View style={s.pay} wrap={false}>
     <Text style={s.boxLabel}>Forma de pago</Text>
     <Text>Transferencia bancaria</Text>{i.iban?<View style={{flexDirection:"row",marginTop:3}}><Text style={{width:60,color:muted}}>Titular</Text><Text style={s.bold}>{i.legalName}</Text></View>:null}{i.iban?<View style={{flexDirection:"row"}}><Text style={{width:60,color:muted}}>IBAN</Text><Text style={[s.bold,{letterSpacing:.5}]}>{i.iban}</Text></View>:null}
     {i.taxNote?<Text style={{marginTop:10,fontFamily:"Helvetica-Oblique"}}>{i.taxNote}</Text>:null}
   </View>
   {rows.length>0 && <View>
     <Text style={s.detailHead}>Detalle de horas</Text>
     {rows.map(r=><View key={r.date} style={s.dRow} wrap={false}>
       <Text style={[s.cDate,{textTransform:"capitalize"}]}>{dia(r.date)}</Text>
       <View style={s.cDesc}><Text>{r.desc||"Mano de obra"}</Text>{r.names.length?<Text style={s.small}>{r.names.join(", ")}</Text>:null}</View>
       <Text style={s.cNum}>{r.people} pers.</Text><Text style={s.cNum}>{num(r.hours)} h</Text>
     </View>)}
   </View>}
   <View style={s.footer} fixed><Text>{i.legalName} · NIF {i.taxId}</Text><Text render={({pageNumber,totalPages})=>`Factura ${i.number} · ${pageNumber}/${totalPages}`}/></View>
 </Page></Document>);
}
