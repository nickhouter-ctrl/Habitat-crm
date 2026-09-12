import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({guard:vi.fn(),contact:vi.fn(),matches:vi.fn(),grant:vi.fn(),insert:vi.fn(),update:vi.fn(),revalidate:vi.fn()}));
vi.mock("@/lib/auth/guards",()=>({requireWriteUser:m.guard}));
vi.mock("next/cache",()=>({revalidatePath:m.revalidate}));
vi.mock("@/lib/portal/windows-access",()=>({grantWindowsAccess:m.grant}));
vi.mock("@/lib/gmail",()=>({sendMail:vi.fn()}));
vi.mock("@/lib/db",()=>({db:{query:{contacts:{findFirst:m.contact},customerAccounts:{findMany:m.matches}},insert:m.insert,update:m.update}}));
import { createAccountForContact } from "@/app/(app)/accounts/actions";
const contactId="a588b9a5-88c2-4446-937f-681a32cc1a23";
const account={id:"existing",contactId,email:"customer@example.com",status:"active"};
const form=()=>{const f=new FormData();f.set("system","windows");return f;};
beforeEach(()=>{vi.clearAllMocks();m.guard.mockResolvedValue({id:"admin"});m.contact.mockResolvedValue({id:contactId,email:account.email,name:"Customer"});m.matches.mockResolvedValue([account]);});
describe("contact account access",()=>{
 it("grants existing linked account Windows access without recreating it",async()=>{await createAccountForContact(contactId,form());expect(m.grant).toHaveBeenCalledWith(account);expect(m.insert).not.toHaveBeenCalled();expect(m.revalidate).toHaveBeenCalledWith("/windows-accounts");});
 it("does not take over an account linked to another contact",async()=>{m.matches.mockResolvedValue([{...account,contactId:"other"}]);await expect(createAccountForContact(contactId,form())).rejects.toThrow("ander contact");expect(m.grant).not.toHaveBeenCalled();expect(m.update).not.toHaveBeenCalled();});
 it("rejects ambiguous contact/email matches",async()=>{m.matches.mockResolvedValue([account,{...account,id:"second"}]);await expect(createAccountForContact(contactId,form())).rejects.toThrow("meerdere");expect(m.grant).not.toHaveBeenCalled();});
 it("keeps website-only actions separate from Windows approval",async()=>{await createAccountForContact(contactId,new FormData());expect(m.grant).not.toHaveBeenCalled();});
 it("rejects read-only staff before looking up or changing accounts",async()=>{m.guard.mockRejectedValueOnce(new Error("Alleen-lezen"));await expect(createAccountForContact(contactId,form())).rejects.toThrow("Alleen-lezen");expect(m.contact).not.toHaveBeenCalled();expect(m.grant).not.toHaveBeenCalled();});
});
