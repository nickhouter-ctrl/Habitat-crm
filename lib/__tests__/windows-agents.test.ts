import {beforeEach,describe,it,expect,vi} from "vitest";
const mocks=vi.hoisted(()=>({auth:vi.fn(),execute:vi.fn()}));
vi.mock("server-only",()=>({}));
vi.mock("@/auth",()=>({auth:mocks.auth}));
vi.mock("@/lib/db",()=>({db:{execute:mocks.execute}}));
vi.mock("next/navigation",()=>({redirect:()=>{throw new Error("redirect");}}));
import {getWindowsAgents} from "@/lib/windows-agents";
beforeEach(()=>{vi.clearAllMocks();});
describe("CRM Windows agents",()=>{
  it("requires a CRM session before querying Windows records",async()=>{mocks.auth.mockResolvedValue(null);await expect(getWindowsAgents()).rejects.toThrow("redirect");expect(mocks.execute).not.toHaveBeenCalled();});
  it("keeps viewer accounts read-only",async()=>{mocks.auth.mockResolvedValue({user:{id:"u",role:"viewer"}});mocks.execute.mockResolvedValue([]);expect((await getWindowsAgents()).canAct).toBe(false);});
  it("handles migration not yet applied without inventing healthy results",async()=>{mocks.auth.mockResolvedValue({user:{id:"u",role:"admin"}});mocks.execute.mockResolvedValue([]);expect(await getWindowsAgents()).toMatchObject({ready:false,runs:[],proposals:[]});});
});
