import type { WeekLang } from "./worker-week";
const copy={
 overview:["Overzicht","Resumen","Overview"],weeks:["Urenstaten","Partes de horas","Timesheets"],invoices:["Facturen","Facturas","Invoices"],
 title:["Mijn overzicht","Mi resumen","My overview"],invoiceTitle:["Mijn facturen","Mis facturas","My invoices"],document:["Factuur","Factura","Invoice"],
 intro:["Je urenstaten en facturen voor deze klus, op één plek.","Tus partes de horas y facturas de esta obra, en un solo lugar.","Your timesheets and invoices for this project, all in one place."],
 current:["Uren invullen","Rellenar horas","Enter hours"],recent:["Recente urenstaten","Partes recientes","Recent timesheets"],allWeeks:["Alle urenstaten bekijken","Ver todos los partes","View all timesheets"],
 noWeeks:["Je hebt voor deze klus nog geen urenstaat opgeslagen.","Todavía no has guardado ningún parte para esta obra.","You have not saved a timesheet for this project yet."],
 noInvoices:["Je hebt voor deze klus nog geen facturen gemaakt.","Todavía no has creado facturas para esta obra.","You have not created any invoices for this project yet."],
 invoiceHint:["Eerdere facturen blijven hier beschikbaar. Open de factuur of download opnieuw de PDF.","Las facturas anteriores siguen disponibles aquí. Ábrelas o vuelve a descargar el PDF.","Previous invoices remain available here. Open an invoice or download its PDF again."],
 view:["Bekijken","Ver","View"],viewPdf:["PDF bekijken","Ver PDF","View PDF"],back:["Terug naar facturen","Volver a facturas","Back to invoices"],
 history:["Eerdere urenstaten","Partes anteriores","Previous timesheets"],older:["Deze oudere urenstaat kun je hier teruglezen. Neem voor wijzigingen contact op met kantoor.","Puedes consultar este parte antiguo. Contacta con la oficina para realizar cambios.","You can read this older timesheet here. Contact the office for changes."],
 completed:["Deze klus is afgerond. Je urenstaten en facturen blijven hier beschikbaar om te bekijken en downloaden.","Esta obra ha finalizado. Puedes seguir consultando tus partes y descargando tus facturas.","This project is completed. Your timesheets and invoices remain available to view and download."],
 savedDetails:["Je factuurgegevens zijn bewaard","Tus datos de facturación están guardados","Your invoice details are saved"],
 savedHint:["We vullen ze bij een volgende factuur alvast in. Je kunt ze daar aanpassen. Factuurnummer en belastingen kies je per factuur.","Los rellenaremos en tu próxima factura y podrás modificarlos. El número y los impuestos se eligen en cada factura.","We will prefill them on your next invoice, where you can update them. Choose the number and taxes for each invoice."],
 changes:["Kantoor heeft om een aanpassing gevraagd. Bekijk de teruggestuurde urenstaat.","La oficina ha solicitado una corrección. Consulta el parte devuelto.","The office requested a correction. Open the returned timesheet."],
 issuer:["Van","Emisor","From"],customer:["Aan","Cliente","To"],number:["Factuurnummer","Número de factura","Invoice number"],
 previous:["Vorige","Anterior","Previous"],next:["Volgende","Siguiente","Next"],page:["Pagina","Página","Page"],
 details:["Werkzaamheden op deze factuur","Trabajos incluidos en esta factura","Work on this invoice"],
 openWeek:["Bijbehorende urenstaat","Parte de horas correspondiente","Related timesheet"],
 invoiceDetails:["Factuurgegevens","Datos de la factura","Invoice details"],
} as const;
export type DashboardCopyKey=keyof typeof copy;
export const dashboardT=(lang:WeekLang,key:DashboardCopyKey)=>copy[key][lang==="nl"?0:lang==="es"?1:2];
