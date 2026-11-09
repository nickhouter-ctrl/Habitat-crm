import React from "react";
import { Document,Page,Text,View,StyleSheet,renderToBuffer } from "@react-pdf/renderer";
import { periodRange, type WorkerInvoice, type WeekDay } from "@/lib/worker-week";
import { weekT } from "@/lib/worker-week-i18n";
const styles=StyleSheet.create({page:{paddingTop:42,paddingBottom:45,paddingHorizontal:42,fontFamily:"Helvetica",fontSize:9,color:"#202020",lineHeight:1.5},title:{fontSize:25,fontFamily:"Helvetica-Bold",marginBottom:8},issuer:{fontSize:14,fontFamily:"Helvetica-Bold",marginBottom:4},columns:{flexDirection:"row",gap:25,marginVertical:18},column:{width:"50%"},label:{fontSize:8,color:"#666666"},rule:{borderBottomWidth:1,borderBottomColor:"#cccccc",marginVertical:12},line:{borderBottomWidth:.5,borderBottomColor:"#dddddd",paddingVertical:8},amounts:{marginTop:20,marginLeft:230},amountRow:{flexDirection:"row",justifyContent:"space-between",marginBottom:5},bold:{fontFamily:"Helvetica-Bold"},footer:{position:"absolute",bottom:20,left:42,right:42,fontSize:8,color:"#777777",textAlign:"right"}});
export async function renderWorkerInvoice(invoice:WorkerInvoice,days:WeekDay[],status:string) {
 const i=invoice,t=(key:Parameters<typeof weekT>[1])=>weekT(i.language,key),eur=(v:number)=>new Intl.NumberFormat(i.language,{style:"currency",currency:"EUR"}).format(v);
 const customer=i.language==="es"?"Cliente":i.language==="nl"?"Klant":"Customer";
 const title=i.language==="es"?"FACTURA":i.language==="nl"?"FACTUUR":"INVOICE";
 return renderToBuffer(<Document title={`${title} ${i.number}`} author={i.legalName}><Page size="A4" style={styles.page}>
   <Text style={styles.title}>{title} {i.number}</Text>
   {status!=="approved" && <Text style={styles.label}>{i.language==="es"?"Pendiente de revisión del cliente":i.language==="nl"?"Ter controle bij de klant":"Awaiting customer review"}</Text>}
   <View style={styles.columns}><View style={styles.column}><Text style={styles.label}>{i.language==="es"?"Emisor":i.language==="nl"?"Afzender":"Issuer"}</Text><Text style={styles.issuer}>{i.legalName}</Text><Text>{i.taxId}</Text><Text>{i.address}</Text><Text>{i.email}</Text></View><View style={styles.column}><Text style={styles.label}>{customer}</Text><Text style={styles.bold}>{i.customer.name}</Text><Text>{i.customer.taxId}</Text><Text>{i.customer.address}</Text></View></View>
   <Text>{t("invoiceDate")}: {i.date}</Text><Text>{i.projectName}</Text><Text>{periodRange(i.weekStart,i.language,days.at(-1)?.date)}</Text>
   <View style={styles.rule}/>
   {days.filter(d=>d.state==="work").flatMap(d=>d.crews.map((c,n)=><View key={`${d.date}:${n}`} style={styles.line}><Text style={styles.bold}>{d.date}{c.zone?` - ${c.zone}`:""}</Text><Text>{c.description}</Text><Text>{c.names.replace(/\n/g,", ")}</Text><Text>{c.people} × {c.hours} h = {c.people*c.hours} h · {eur(i.rate)}/h</Text></View>))}
   <View wrap={false} style={styles.amounts}>{[[t("total"),`${i.hours} h`],[t("subtotal"),eur(i.subtotal)],[`IVA ${i.vatRate}%`,eur(i.vat)],[`IRPF ${i.withholdingRate}%`,`- ${eur(i.withholding)}`],[t("amount"),eur(i.total)]].map(([label,value])=><View style={styles.amountRow} key={label}><Text>{label}</Text><Text style={styles.bold}>{value}</Text></View>)}</View>
   {i.taxNote && <Text style={{marginTop:18}}>{i.taxNote}</Text>}{i.iban && <Text style={{marginTop:15}}>IBAN: {i.iban}</Text>}
   <Text style={styles.footer} fixed render={({pageNumber,totalPages})=>`${pageNumber} / ${totalPages}`}/>
 </Page></Document>);
}
