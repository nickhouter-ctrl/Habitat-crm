export type AccountListRow = {
 id: string; email: string; businessName: string|null; contactName: string|null;
 status: "active"|"pending"|"suspended"; websiteAccess: boolean; windowsAccess: boolean; windowsApproved: boolean;
 createdAt: Date; lastLoginAt: Date|null;
};
export function accountStatus(a:AccountListRow,windows:boolean) {
 return windows && !a.windowsAccess ? "suspended" : a.status;
}
export function accountList<T extends AccountListRow>(accounts:T[],windows:boolean,params:{tab?:string;q?:string;sort?:string;page?:string}) {
 // Eerst de scope bepalen: geen URL-filter mag websiteaccounts aan Windows toevoegen.
 const scoped=windows ? accounts.filter(a=>a.windowsApproved) : accounts.filter(a=>a.websiteAccess);
 const tab=["active","pending","suspended"].includes(params.tab??"")?params.tab!:"all";
 const query=(params.q??"").trim().slice(0,200);
 const sort=["name","email","login","newest"].includes(params.sort??"")?params.sort!:"name";
 const name=(a:T)=>a.businessName||a.contactName||a.email;
 const filtered=scoped.filter(a=>(tab==="all"||accountStatus(a,windows)===tab)&&(!query||[a.email,a.businessName,a.contactName].some(v=>v?.toLocaleLowerCase("nl").includes(query.toLocaleLowerCase("nl"))))).sort((a,b)=>{
  const primary=sort==="email"?a.email.localeCompare(b.email,"nl"):sort==="login"?(b.lastLoginAt?.getTime()??0)-(a.lastLoginAt?.getTime()??0):sort==="newest"?b.createdAt.getTime()-a.createdAt.getTime():name(a).localeCompare(name(b),"nl",{sensitivity:"base"});
  return primary||a.id.localeCompare(b.id);
 });
 const totalPages=Math.max(1,Math.ceil(filtered.length/25));const requested=Number(params.page);
 const page=Number.isSafeInteger(requested)?Math.min(totalPages,Math.max(1,requested)):1;
 const tabs=[{id:"all",label:windows?"Windows-accounts":"Alle websiteaccounts",count:scoped.length},
 ...([['active','Actief'],['pending','Wacht op activatie'],['suspended','Geblokkeerd']] as const).map(([id,label])=>({id,label,count:scoped.filter(a=>accountStatus(a,windows)===id).length}))];
 return {scoped,tab,query,sort,filtered,totalPages,page,tabs,visibleAccounts:filtered.slice((page-1)*25,page*25)};
}
