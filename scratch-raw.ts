import vm from "node:vm";
(async () => {
  const res = await fetch("https://futbolvivo.tv/", { headers: { "User-Agent": "Mozilla/5.0" } });
  const html = await res.text();
  const scripts: string[] = [];
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) if (m[1] && m[1].trim().length > 50) scripts.push(m[1]);
  const el = () => ({ style:{}, classList:{add(){},remove(){},toggle(){},contains:()=>false}, setAttribute(){}, appendChild(){}, addEventListener(){} });
  const sandbox: Record<string, unknown> = {
    document: { getElementById:()=>el(), querySelector:()=>el(), querySelectorAll:()=>[], addEventListener(){}, createElement:el, documentElement:{appendChild(){}}, body:{appendChild(){}} },
    navigator: { userAgent: "Mozilla/5.0" }, location: { href: "https://futbolvivo.tv/" },
    console, setTimeout, clearTimeout, setInterval, clearInterval, TextDecoder, TextEncoder, atob, btoa, fetch, crypto,
    addEventListener(){},
  };
  sandbox.window = sandbox; sandbox.self = sandbox;
  vm.createContext(sandbox);
  try { vm.runInContext(scripts.join("\n;\n"), sandbox, { timeout: 15000 }); } catch {}
  for (const idx of [0,2,3]) {
    const data: any = await (sandbox.__lx as any).call(sandbox, idx);
    const list = data?.matches ?? [];
    const combat = list.filter((x:any)=>["boxing","mma"].includes(x.sport));
    console.log(`--- __lx(${idx}): ${list.length} matches, ${combat.length} combat`);
    for (const x of combat) console.log(" ", x.id, x.sport, "|", x.title?.slice(0,50), "|", x.starts_at, "| ts:", x.timestamp);
  }
  process.exit(0);
})();
