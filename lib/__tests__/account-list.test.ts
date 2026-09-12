import { describe,it,expect } from "vitest";
import { accountList,type AccountListRow } from "../portal/account-list";
const row=(id:string,extra:Partial<AccountListRow>={}):AccountListRow=>({id,email:id+'@example.com',businessName:id,contactName:null,status:'active',websiteAccess:true,windowsApproved:false,windowsAccess:false,createdAt:new Date('2026-01-01'),lastLoginAt:null,...extra});
const rows=[row('Website'),row('Windows',{windowsApproved:true,windowsAccess:true}),row('Blocked',{windowsApproved:true,windowsAccess:false})];
describe('account page scope and filters',()=>{
 for(const tab of ['all','no-windows','windows','unexpected']) it('keeps website-only accounts outside Windows scope: '+tab,()=>{expect(accountList(rows,true,{tab}).filtered.map(a=>a.id)).toEqual(['Blocked','Windows']);});
 it('keeps blocked Windows accounts available for management',()=>{expect(accountList(rows,true,{tab:'suspended'}).filtered.map(a=>a.id)).toEqual(['Blocked']);});
 it('search never expands the scope',()=>{expect(accountList(rows,true,{q:'Website'}).filtered).toHaveLength(0);});
 it('shows only identities granted website access on the website page',()=>{expect(accountList(rows,false,{}).scoped).toHaveLength(3);});
 it('excludes Windows-only identities from the website page',()=>{expect(accountList([row('WindowsOnly',{windowsApproved:true,windowsAccess:true,websiteAccess:false})],false,{}).scoped).toHaveLength(0);});
 it('sorts last login with never-logged-in last and clamps invalid page',()=>{const result=accountList([row('A'),row('B',{lastLoginAt:new Date()})],false,{sort:'login',page:'999'});expect(result.visibleAccounts.map(a=>a.id)).toEqual(['B','A']);expect(result.page).toBe(1);});
 it('counts statuses within the Windows scope',()=>{const result=accountList(rows,true,{});expect(result.tabs.find(t=>t.id==='active')?.count).toBe(1);expect(result.tabs.find(t=>t.id==='all')?.label).toBe('Windows-accounts');});
});
