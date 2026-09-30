'use client';
import { useEffect, useRef, useState } from 'react';
import type { PublicPartner } from '@/lib/public-partners';
import 'leaflet/dist/leaflet.css';
export function PartnerMap({partners}:{partners:PublicPartner[]}){
 const ref=useRef<HTMLDivElement>(null);const[failed,setFailed]=useState(false);
 useEffect(()=>{let disposed=false;let map:import('leaflet').Map|undefined;import('leaflet').then(L=>{if(disposed||!ref.current)return;map=L.map(ref.current,{scrollWheelZoom:false}).setView([40,-1],5);L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'© OpenStreetMap contributors'}).addTo(map);const points: [number,number][]=[];for(const p of partners){if(p.latitude===null||p.longitude===null)continue;const position:[number,number]=[Number(p.latitude),Number(p.longitude)];points.push(position);const text=document.createElement('div');text.textContent=`${p.name} · ${p.address}, ${p.city}`;L.circleMarker(position,{radius:9,color:'#264b3b',fillColor:'#557b63',fillOpacity:.9,weight:2}).bindPopup(text).addTo(map);}if(points.length)map.fitBounds(L.latLngBounds(points),{padding:[40,40],maxZoom:13});}).catch(()=>setFailed(true));return()=>{disposed=true;map?.remove();};},[partners]);
 return <div>{failed&&<p>De kaart is niet beschikbaar. De adressen staan hieronder.</p>}<div ref={ref} className="h-[460px] w-full rounded-2xl border" aria-label="Kaart officiële verkooppunten"/></div>;
}
