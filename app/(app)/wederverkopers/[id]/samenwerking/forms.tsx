"use client";
import { useState } from 'react';
import { contractDetailsInput, contractTerms, DEFAULT_PARTNER_ASSORTMENT, partnerContractDocument, partnerContractTemplate, readContractDetails, type ContractDetails } from '@/lib/partner-contract';
import { ActionForm, Field } from '../../../beurs/opvolging/forms';
import { createContract, registerSigned, activatePartner } from './actions';
import type { partnerContracts, partnerProfiles } from '@/lib/db/schema';
const input='w-full rounded-lg border border-border bg-surface px-3 py-2 text-foreground';
type Contract=typeof partnerContracts.$inferSelect;
export function ContractForm({ id, body: initialBody, previous, name, location }: {
  id: string; body: string; previous: Contract | null; name: string;
  location: { address: string; latitude: string | null; longitude: string | null };
}) {
  const stored = readContractDetails(previous?.territoryTerms);
  const [body, setBody] = useState(initialBody);
  const [details, setDetails] = useState<ContractDetails>(() => stored ?? {
    brandName: '', assortment: DEFAULT_PARTNER_ASSORTMENT, area: location.address,
    minimumPurchases: '', service: '', exceptions: previous?.territoryTerms ?? '',
  });
  const [exclusive, setExclusive] = useState(previous?.exclusive ?? false);
  const [latitude, setLatitude] = useState(previous?.latitude ?? location.latitude ?? '');
  const [longitude, setLongitude] = useState(previous?.longitude ?? location.longitude ?? '');
  const [radius, setRadius] = useState(previous?.radiusKm ?? '');
  const [locationOpen, setLocationOpen] = useState(!(previous?.latitude ?? location.latitude) || !(previous?.longitude ?? location.longitude));
  const [from, setFrom] = useState(previous?.validFrom ?? '');
  const [until, setUntil] = useState(previous?.validUntil ?? '');
  const set = (key: keyof ContractDetails, value: string) => setDetails(d => ({ ...d, [key]: value }));
  const termsResult = contractDetailsInput.safeParse(details);
  const terms = termsResult.success ? contractTerms(termsResult.data) : 'Vul de producten en afspraken in.';
  const preview = partnerContractDocument({ body, territoryTerms: terms, validFrom: from, validUntil: until, exclusive, latitude, longitude, radiusKm: radius });
  const section = 'space-y-4 border-b border-border pb-5';
  const onMap = latitude && longitude && Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude));

  return <ActionForm action={createContract} label="Concept opslaan">
    <input type="hidden" name="contactId" value={id} />
    <input type="hidden" name="formMode" value="guided" />
    <input type="hidden" name="exclusive" value={exclusive ? 'on' : ''} />
    <div className={section}>
      <h3 className="font-semibold">1. Merk en producten</h3>
      <Field label="Eigen merknaam"><input className={input} name="brandName" value={details.brandName} onChange={e => set('brandName', e.target.value)} maxLength={120} placeholder="Nog te bepalen" /></Field>
      <Field label="Welke producten vallen onder de afspraak?"><textarea className={input} name="assortment" aria-label="Welke producten vallen onder de afspraak?" rows={2} required maxLength={2000} value={details.assortment} onChange={e => set('assortment', e.target.value)} /></Field>
      <p className="text-xs text-muted">Panelen, lijm en toebehoren worden onder jullie merk verkocht. Toekomstige producten kunnen aan de afspraak worden toegevoegd.</p>
    </div>
    <div className={section}>
      <h3 className="font-semibold">2. Gebied en voorwaarden</h3>
      <Field label="Plaats / showroomadres"><input className={input} name="area" value={details.area} onChange={e => set('area', e.target.value)} maxLength={500} placeholder="Bijvoorbeeld het showroomadres in Valencia" /></Field>
      <fieldset className="space-y-2"><legend className="mb-2 text-sm font-medium">Exclusiviteit</legend>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="exclusivityChoice" value="none" checked={!exclusive} onChange={() => setExclusive(false)} />Nog niet afspreken</label>
        <label className="flex items-center gap-2 text-sm"><input type="radio" name="exclusivityChoice" value="exclusive" checked={exclusive} onChange={() => setExclusive(true)} />Een exclusief gebied afspreken</label>
      </fieldset>
      {exclusive ? <div className="space-y-3 rounded-lg border border-border bg-background/50 p-4">
        <Field label="Straal rondom het middelpunt (km)"><input className={input} name="radiusKm" type="number" min="0.01" max="1000" step="any" required value={radius} onChange={e => setRadius(e.target.value)} placeholder="Bijvoorbeeld 10" /></Field>
        <details open={locationOpen} onToggle={e => setLocationOpen(e.currentTarget.open)}><summary className="cursor-pointer text-sm font-medium">Middelpunt op de kaart controleren</summary>
          <p className="my-3 text-xs text-muted">De kaartpositie van het contact is een voorstel. Controleer het juiste middelpunt voordat je exclusiviteit afspreekt.</p>
          <div className="grid gap-3 sm:grid-cols-2"><Field label="Breedtegraad middelpunt"><input className={input} name="latitude" type="number" min="-90" max="90" step="any" required value={latitude} onChange={e => setLatitude(e.target.value)} /></Field><Field label="Lengtegraad middelpunt"><input className={input} name="longitude" type="number" min="-180" max="180" step="any" required value={longitude} onChange={e => setLongitude(e.target.value)} /></Field></div>
          {onMap && <a className="mt-3 inline-block text-sm text-accent underline" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`} target="_blank" rel="noopener noreferrer">Bekijk het middelpunt op Google Maps</a>}
        </details>
      </div> : <><input type="hidden" name="radiusKm" value="" /><input type="hidden" name="latitude" value="" /><input type="hidden" name="longitude" value="" /></>}
      <Field label="Minimumafname (optioneel)"><input className={input} name="minimumPurchases" value={details.minimumPurchases} onChange={e => set('minimumPurchases', e.target.value)} maxLength={500} placeholder="Bijvoorbeeld een bedrag per jaar, of geen minimum" /></Field>
      <Field label="Showroom en service (optioneel)"><textarea className={input} name="service" aria-label="Showroom en service (optioneel)" rows={2} value={details.service} onChange={e => set('service', e.target.value)} maxLength={2000} placeholder="Bijvoorbeeld samples presenteren en klanten adviseren" /></Field>
      <Field label="Uitzonderingen / extra afspraken (optioneel)"><textarea className={input} name="exceptions" aria-label="Uitzonderingen / extra afspraken (optioneel)" rows={2} value={details.exceptions} onChange={e => set('exceptions', e.target.value)} maxLength={6000} placeholder="Bijvoorbeeld bestaande verkooppunten, weborders of verdeling van aanvragen" /></Field>
      {previous && !stored && <p className="text-xs text-muted">De vrije afspraken uit de vorige versie staan bij ‘Uitzonderingen / extra afspraken’.</p>}
    </div>
    <div className={section}>
      <h3 className="font-semibold">3. Looptijd</h3>
      <div className="grid gap-4 sm:grid-cols-2"><Field label="Begindatum"><input className={input} name="validFrom" type="date" required value={from} onChange={e => setFrom(e.target.value)} /></Field><Field label="Einddatum"><input className={input} name="validUntil" type="date" required value={until} onChange={e => setUntil(e.target.value)} /></Field></div>
    </div>
    <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-semibold">Concept bekijken en aanpassen</summary>
      <p className="my-3 text-xs text-muted">De ingevulde afspraken komen automatisch in de contractdownload. Adviesprijzen zijn vrijblijvend; exclusiviteit staat los van kortingen.</p>
      <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap font-sans text-sm">{preview}</pre>
      <details className="mt-4"><summary className="cursor-pointer text-sm text-accent underline">Basistekst zelf aanpassen</summary>
        <Field label="Contracttekst"><textarea className={`${input} mt-3`} name="body" aria-label="Contracttekst" rows={18} value={body} onChange={e => setBody(e.target.value)} minLength={100} maxLength={50000} required /></Field>
        {previous && <button type="button" className="mt-3 text-sm text-accent underline" onClick={() => setBody(partnerContractTemplate(name))}>Gebruik het nieuwste contractmodel</button>}
      </details>
    </details>
    <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Juridische controle vastleggen</summary>
      <p className="my-3 text-xs text-muted">Dit hoeft nog niet voor een concept. Laat de volledige overeenkomst en bijlagen controleren voordat beide partijen tekenen en het verkooppunt wordt geactiveerd.</p>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="legalReviewed" />Deze contractversie en alle bijlagen zijn juridisch gecontroleerd.</label>
    </details>
    <p className="text-xs text-muted">Opslaan maakt een nieuwe conceptversie. Eerdere versies blijven bewaard; er wordt niets verstuurd.</p>
  </ActionForm>;
}
export function SignedForm({c}:{c:Contract}){return <ActionForm action={registerSigned} label="Ondertekend contract vastleggen"><input type="hidden" name="id" value={c.id}/><input type="hidden" name="contactId" value={c.contactId}/><Field label="PDF met beide handtekeningen (max. 4 MB)"><input className={input} name="file" type="file" accept="application/pdf" required/></Field><Field label="Bevoegde ondertekenaar Habitat One"><input className={input} name="habitatSigner" required minLength={3}/></Field><Field label="Bevoegde ondertekenaar verkooppunt"><input className={input} name="partnerSigner" required minLength={3}/></Field><Field label="Datum beide handtekeningen compleet"><input className={input} name="signedOn" type="date" required/></Field><label className="flex items-start gap-2 text-sm"><input name="confirm" type="checkbox" required/>Ik heb beide handtekeningen, bevoegdheden en alle bijlagen gecontroleerd. Deze PDF komt overeen met deze contractversie en de gebiedsafspraken.</label></ActionForm>;}
export function ActivationForm({id,contracts,p,name}:{id:string;contracts:Contract[];p:typeof partnerProfiles.$inferSelect|null;name:string}){return <ActionForm action={activatePartner} label="Activeren / publicatie bijwerken"><input type="hidden" name="contactId" value={id}/><Field label="Ondertekende overeenkomst"><select className={input} name="contractId" required defaultValue={p?.activeContractId??''}><option value="">Kies een ondertekende versie</option>{contracts.filter(c=>c.signedPath).map(c=><option key={c.id} value={c.id}>Versie {c.version} · {c.validFrom} — {c.validUntil}</option>)}</select></Field><div className="grid gap-4 sm:grid-cols-2">{[['publicName','Publieke bedrijfsnaam',p?.publicName??name],['publicAddress','Showroomadres',p?.publicAddress],['publicCity','Plaats',p?.publicCity],['publicCountry','Land',p?.publicCountry],['publicEmail','Publiek zakelijk e-mailadres',p?.publicEmail],['publicPhone','Publieke telefoon',p?.publicPhone],['publicWebsite','Website (https://)',p?.publicWebsite],['latitude','Exacte breedtegraad showroom',p?.latitude],['longitude','Exacte lengtegraad showroom',p?.longitude]].map(([n,l,v])=><Field key={n} label={l!}><input className={input} name={n!} defaultValue={v??''} required={!['publicEmail','publicPhone','publicWebsite'].includes(n!)} type={['latitude','longitude'].includes(n!)?'number':'text'} step="any"/></Field>)}</div><label className="flex gap-2 text-sm"><input type="checkbox" name="publish" defaultChecked={p?.published}/>Publiceer deze bedrijfsgegevens op de openbare verkooppuntenkaart</label><label className="flex gap-2 text-sm"><input type="checkbox" name="confirm" required/>De samenwerking is goedgekeurd en deze bedrijfsgegevens mogen openbaar worden getoond.</label></ActionForm>;}
