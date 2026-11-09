import { crewNames, type WeekDay } from "./worker-week";
export function weekRoster(days: WeekDay[], saved: string[] = []): string[] {
  return [...new Map([...saved,...days.flatMap(d=>d.crews.flatMap(c=>crewNames(c.names)))].map(n=>[n.trim().toLowerCase(),n.trim()])).values()].filter(Boolean);
}
export function dayDescription(day: WeekDay) {
  return [...new Set(day.crews.map(c=>[c.zone,c.description].filter(Boolean).join(": ")))].join("\n");
}
export function personHours(day: WeekDay, name: string) {
  return day.crews.reduce((sum,c)=>sum+(crewNames(c.names).some(n=>n.toLowerCase()===name.toLowerCase())?c.hours:0),0);
}
/** One description per day; group equal hours without changing the hour ledger. */
export function gridDay(day: WeekDay, names: string[], hours: number[], description: string): WeekDay {
  const groups=new Map<number,string[]>();
  names.forEach((name,i)=>{if(hours[i]>0){const group=groups.get(hours[i])??[];group.push(name);groups.set(hours[i],group);}});
  return {...day,state:groups.size?"work":"off",crews:[...groups].map(([hours,names])=>({people:names.length,names:names.join("\n"),hours,description,zone:""}))};
}
