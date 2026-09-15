// CI publishes only outcomes and a source commit; no logs, secrets or customer data.
const repositories = { "nickhouter-ctrl/Windows.habitat-one": "windows", "nickhouter-ctrl/Habitat-crm": "crm" };
const project = repositories[process.env.GITHUB_REPOSITORY];
const secret = process.env.AGENT_REPORT_SECRET;
if (!project || !secret || secret.length<24) throw new Error("Agent report configuration missing");
const outcome = name => ["success","failure","cancelled","skipped"].includes(process.env[name]) ? process.env[name] : "skipped";
const body = JSON.stringify({ project, commit:process.env.GITHUB_SHA, checks:{tests:outcome("TEST_OUTCOME"),typecheck:outcome("TYPECHECK_OUTCOME"),lint:outcome("LINT_OUTCOME"),security:outcome("SECURITY_OUTCOME")},runUrl:`https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` });
let success = false;
for (let attempt=0;attempt<6;attempt++) {
  try {
    const result = await fetch("https://windows.habitat-one.com/api/agents/quality", {method:"POST",headers:{"content-type":"application/json",authorization:`Bearer ${secret}`},body,signal:AbortSignal.timeout(15000)});
    if(result.ok) {success=true;break;}
  } catch {}
  if(attempt<5) await new Promise(resolve=>setTimeout(resolve,10000));
}
if(!success) throw new Error("Quality report could not be delivered");
console.log("Quality outcomes recorded in Habitat agent center");
