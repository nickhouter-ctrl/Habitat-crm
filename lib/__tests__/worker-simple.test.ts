import {expect,it} from "vitest";
import {emptyWeek,periodRange,totalWeekHours,validateWeek} from "../worker-week";
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
it("saves incomplete daily drafts but requires a description and normalizes empty days on final submission",()=>{
 const days=emptyWeek("2026-11-02");days[0]=gridDay(days[0],["Morad"],[8],"");
 expect(validateWeek(days,"2026-11-02","2026-11-09",false).error).toBeUndefined();
 expect(validateWeek(days,"2026-11-02","2026-11-09",true).error).toBe("description");
 days[0].crews[0].description="Wanden van de badkamer betegeld.";
 expect(validateWeek(days,"2026-11-02","2026-11-09",true).days?.[6].state).toBe("off");
 for(let i=1;i<7;i++)days[i]=gridDay(days[i],["Morad"],[0],"");
 expect(validateWeek(days,"2026-11-02","2026-11-09",true).error).toBeUndefined();
});

it("starts on Saturday 31 October, skips Sunday and continues into November",()=>{
 const names=["Morad","Bilal","Yasir","Mohamed","Mounir"];
 const dates=["2026-10-31","2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"];
 const hours=[[0,0,8,0,8],[8,8,8,8,8],[8,8,8,8,8],[8,8,0,8,0],[8,8,8,8,0],[8,8,8,8,8]];
 const days=dates.map((date,i)=>gridDay(emptyWeek(date)[0],names,hours[i],"Badkamerwanden voorbereid en betegeld."));
 expect(validateWeek(days,dates[0],"2026-11-09",true).days).toEqual(days);
 expect(totalWeekHours(days)).toBe(192);
 expect(periodRange(dates[0],"nl",dates.at(-1))).toBe("31 oktober t/m 6 november");
 expect(periodRange(dates[0],"es",dates.at(-1))).toBe("31 de octubre al 6 de noviembre");
 expect(validateWeek([days[0]],dates[0],"2026-11-09",false).days).toHaveLength(1);
 expect(validateWeek([days[0],days[0]],dates[0],"2026-11-09",false).error).toBe("week");
 expect(validateWeek([days[1],days[0]],dates[1],"2026-11-09",false).error).toBe("week");
 expect(validateWeek(days,dates[1],"2026-11-09",false).error).toBe("week");
});
