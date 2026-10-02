/**
 * Minimal robots.txt evaluation (pure, no server deps → unit-testable). Honors
 * Disallow rules for `*` and any user-agent whose token appears in our UA string.
 */
export function robotsAllows(robotsTxt: string, path: string, ua: string): boolean {
  const lines = robotsTxt.split(/\r?\n/).map((l) => l.replace(/#.*$/, "").trim());
  const groups: { agents: string[]; disallow: string[] }[] = [];
  let current: { agents: string[]; disallow: string[] } | null = null;
  for (const line of lines) {
    const [rawK, ...rest] = line.split(":");
    if (!rawK || rest.length === 0) continue;
    const k = rawK.toLowerCase().trim();
    const v = rest.join(":").trim();
    if (k === "user-agent") {
      if (current && current.disallow.length === 0 && current.agents.length) current.agents.push(v);
      else {
        current = { agents: [v], disallow: [] };
        groups.push(current);
      }
    } else if (k === "disallow" && current) {
      current.disallow.push(v);
    }
  }
  const uaLower = ua.toLowerCase();
  const applicable = groups.filter((g) =>
    g.agents.some((a) => a === "*" || uaLower.includes(a.toLowerCase())),
  );
  const rules = applicable.flatMap((g) => g.disallow).filter(Boolean);
  return !rules.some((rule) => path.startsWith(rule));
}
