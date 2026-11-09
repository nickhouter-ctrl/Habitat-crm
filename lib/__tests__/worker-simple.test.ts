import {expect,it} from "vitest";
import {emptyWeek,totalWeekHours,validateWeek} from "../worker-week";
import {weekRoster,personHours,gridDay,dayDescription} from "../worker-week-grid";
it("converts a paper-style crew with absences and different hours without changing totals",()=>{
 const days=emptyWeek("2026-11-02");const names=["Morad","Bilal","Yasir","Mohamed","Mounir"];
 days[0]=gridDay(days[0],names,[8,8,8,8,8],"Wanden voorbereid en betegeld.");
 days[1]=gridDay(days[1],names,[8,8,0,8,0],"Voegen afgewerkt in de badkamer.");
 days[2]=gridDay(days[2],names,[8,6.5,8,4,0],"Plafondplaten bevestigd en afgewerkt.");
 expect(totalWeekHours(days)).toBe(90.5);expect(weekRoster(days)).toEqual(names);
 expect(personHours(days[1],"Yasir")).toBe(0);expect(personHours(days[2],"Bilal")).toBe(6.5);
 expect(days[2].crews).toHaveLength(3);
});
it("preserves previous grouped people, work descriptions and site zones",()=>{
 const d=emptyWeek("2026-11-02")[0];d.state="work";d.crews=[{people:2,names:"Ana\nLuis",hours:8,description:"Tiled wall",zone:"Bathroom"},{people:1,names:"Ana",hours:1,description:"Cleaning",zone:""}];
 expect(weekRoster([d],["Luis"])).toEqual(["Luis","Ana"]);expect(personHours(d,"Ana")).toBe(9);expect(dayDescription(d)).toContain("Bathroom: Tiled wall");expect(dayDescription(d)).toContain("Cleaning");
});
it("saves incomplete daily drafts but requires description and explicit remaining days before sending",()=>{
 const days=emptyWeek("2026-11-02");days[0]=gridDay(days[0],["Morad"],[8],"");
 expect(validateWeek(days,"2026-11-02","2026-11-09",false).error).toBeUndefined();
 expect(validateWeek(days,"2026-11-02","2026-11-09",true).error).toBe("description");
 days[0].crews[0].description="Wanden van de badkamer betegeld.";
 expect(validateWeek(days,"2026-11-02","2026-11-09",true).error).toBe("missingDay");
 for(let i=1;i<7;i++)days[i]=gridDay(days[i],["Morad"],[0],"");
 expect(validateWeek(days,"2026-11-02","2026-11-09",true).error).toBeUndefined();
});
