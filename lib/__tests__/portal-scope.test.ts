import { beforeEach, describe, expect, it, vi } from "vitest";
const m=vi.hoisted(()=>({verify:vi.fn(),account:vi.fn(),execute:vi.fn()}));
vi.mock("@/lib/portal/token",()=>({verifyPortalToken:m.verify}));
vi.mock("@/lib/db",()=>({db:{query:{customerAccounts:{findFirst:m.account}},execute:m.execute}}));
import { portalAuth } from "@/lib/portal/api";
import { registrationSchema } from "@/lib/portal/registration-schema";
const request=new Request("https://crm.habitat-one.com/api/portal/me",{headers:{authorization:"Bearer test"}});
beforeEach(()=>{vi.clearAllMocks();m.verify.mockReturnValue({sub:"account",scope:"windows"});m.account.mockResolvedValue({id:"account",status:"active",websiteAccess:false});m.execute.mockResolvedValue([{allowed:true}]);});
describe("independent portal access",()=>{
 it("permits Windows-only customers in Windows",async()=>{expect(await portalAuth(request,"windows")).toMatchObject({sub:"account"});});
 it("rejects Windows session tokens on website endpoints even when website permission exists",async()=>{m.account.mockResolvedValue({id:"account",status:"active",websiteAccess:true});expect(await portalAuth(request)).toBeNull();});
 it("rejects website session tokens on Windows endpoints",async()=>{m.verify.mockReturnValue({sub:"account",scope:"website"});expect(await portalAuth(request,"windows")).toBeNull();});
 it("revokes an already issued Windows session immediately",async()=>{expect(await portalAuth(request,"windows")).not.toBeNull();m.execute.mockResolvedValue([{allowed:false}]);expect(await portalAuth(request,"windows")).toBeNull();});
 it("revokes website access without revoking Windows",async()=>{m.verify.mockReturnValue({sub:"account",scope:"website"});expect(await portalAuth(request)).toBeNull();m.verify.mockReturnValue({sub:"account",scope:"windows"});expect(await portalAuth(request,"windows")).not.toBeNull();});
 it.each(["pending","suspended"])("rejects %s accounts in both systems",async(status)=>{m.account.mockResolvedValue({id:"account",status,websiteAccess:true});m.verify.mockReturnValue({sub:"account"});expect(await portalAuth(request)).toBeNull();expect(await portalAuth(request,"windows")).toBeNull();});
 it("checks current permissions on legacy sessions without a scope",async()=>{m.verify.mockReturnValue({sub:"account"});expect(await portalAuth(request)).toBeNull();expect(await portalAuth(request,"windows")).not.toBeNull();});
});
const application={source:"windows",kind:"zakelijk",name:"Dealer",email:"dealer@example.com",businessName:"Dealer BV",vatNumber:"NL123456789B01"};
describe("Windows business registration",()=>{
 it("requires a business account even when bypassing the form",()=>{expect(registrationSchema.safeParse({...application,kind:"particulier"}).success).toBe(false);});
 it.each(["", "   ",undefined])("rejects missing VAT: %s",vatNumber=>{expect(registrationSchema.safeParse({...application,vatNumber}).success).toBe(false);});
 it("accepts complete business applications",()=>{expect(registrationSchema.safeParse(application).success).toBe(true);});
 it("still permits private website customers",()=>{expect(registrationSchema.safeParse({...application,source:"website",kind:"particulier",vatNumber:"",businessName:""}).success).toBe(true);});
});
