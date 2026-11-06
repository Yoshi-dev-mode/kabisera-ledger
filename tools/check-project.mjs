#!/usr/bin/env node
// Kabisera Ledger project checker. No dependencies. Run from the project folder:  node tools/check-project.mjs
// It checks the things that most often break a first `npm run build` or weaken security, and prints PASS/FAIL.
// It is NOT a substitute for the TypeScript build, ESLint, the unit tests or running the SQL checks.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const results = [];
const check = (name, problems) => results.push({ name, problems });

function walk(dir, filter, out = []) {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== "node_modules" && e !== ".next") walk(p, filter, out); }
    else if (filter(p)) out.push(p);
  }
  return out;
}
const rel = (p) => relative(root, p).replaceAll("\\", "/");
const src = walk(join(root, "src"), (p) => /\.(ts|tsx)$/.test(p));
const text = new Map(src.map((p) => [p, readFileSync(p, "utf8")]));
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const directive = (t, d) => new RegExp(`^\\s*(?:/\\*[\\s\\S]*?\\*/\\s*|//[^\\n]*\\n\\s*)*["']${d}["']`).test(t);

// ---- import graph
function resolveImport(from, spec) {
  if (/\.(css|json|svg|png)$/.test(spec)) {
    const f = spec.startsWith("@/") ? join(root, "src", spec.slice(2)) : resolve(dirname(from), spec);
    return existsSync(f) ? null : undefined; // assets are checked for existence only
  }
  let base;
  if (spec.startsWith("@/")) base = join(root, "src", spec.slice(2));
  else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")]) {
    if (text.has(c)) return c;
  }
  return undefined; // internal path that does not exist
}
const importsOf = (p) => [...stripComments(text.get(p)).matchAll(/(?:import|export)\s[^'"]*?from\s*["']([^"']+)["']|import\s*["']([^"']+)["']/g)].map((m) => m[1] ?? m[2]);

// 1. every internal import resolves
{
  const problems = [];
  for (const p of src) for (const spec of importsOf(p)) if (resolveImport(p, spec) === undefined) problems.push(`${rel(p)} imports "${spec}", which does not exist`);
  check("every internal import points at a real file", problems);
}

// 2. client components never reach server-only code
{
  const problems = [];
  const serverOnly = new Set(src.filter((p) => /import\s+["']server-only["']/.test(text.get(p))));
  const usesNodeOnly = (p) => /from\s+["']node:(fs|path|crypto)(\/promises)?["']/.test(text.get(p)) || /next\/headers/.test(text.get(p));
  for (const p of src.filter((f) => directive(text.get(f), "use client"))) {
    const seen = new Set(); const stack = [[p, [rel(p)]]];
    while (stack.length) {
      const [cur, trail] = stack.pop();
      if (seen.has(cur)) continue; seen.add(cur);
      if (cur !== p && directive(text.get(cur), "use server")) continue; // server actions are fine to import
      if (serverOnly.has(cur) || (cur !== p && usesNodeOnly(cur))) { problems.push(`client component reaches server-only code: ${trail.join(" -> ")}`); continue; }
      for (const spec of importsOf(cur)) { const r = resolveImport(cur, spec); if (r) stack.push([r, [...trail, rel(r)]]); }
    }
  }
  check("client components never import server-only code", problems);
}

// 3. 'use server' files export only async functions and types
{
  const problems = [];
  for (const p of src.filter((f) => directive(text.get(f), "use server"))) {
    for (const m of text.get(p).matchAll(/^export\s+(?!async function|type |interface )(.*)$/gm)) problems.push(`${rel(p)}: "export ${m[1].slice(0, 40)}" is not allowed in a 'use server' file`);
  }
  check("server-action files export only async functions and types", problems);
}

// 4. pages and layouts have a default export; route handlers export only HTTP methods and config
{
  const problems = [];
  for (const p of src.filter((f) => /\/(page|layout|loading|error)\.tsx$/.test(rel(f)))) if (!/export default/.test(text.get(p))) problems.push(`${rel(p)} has no default export`);
  const allowed = new Set(["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS", "dynamic", "revalidate", "runtime", "fetchCache", "maxDuration", "preferredRegion", "dynamicParams"]);
  for (const p of src.filter((f) => /\/route\.ts$/.test(rel(f)))) for (const m of text.get(p).matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm)) if (!allowed.has(m[1])) problems.push(`${rel(p)} exports "${m[1]}", which a route handler may not export`);
  check("pages have default exports and route handlers export only allowed names", problems);
}

// 5. the service-role key is read in server-only files only
{
  const problems = [];
  for (const p of src) if (/process\.env\.SUPABASE_SERVICE_ROLE_KEY/.test(text.get(p)) && !/import\s+["']server-only["']/.test(text.get(p))) problems.push(`${rel(p)} reads the service-role key outside a server-only file`);
  check("the service-role key is only read in server-only files", problems);
}

// 6. no secrets and no browser storage of auth
{
  const problems = [];
  for (const p of [...src, ...walk(root, (f) => /\.env\.example$|\.md$|\.json$/.test(f) && !f.includes(".taste-skill"))]) {
    const t = readFileSync(p, "utf8");
    if (/eyJ[A-Za-z0-9_-]{20,}|sbp_[A-Za-z0-9]{10,}|sb_secret_[A-Za-z0-9]{10,}/.test(t)) problems.push(`${rel(p)} looks like it contains a key`);
  }
  for (const p of src) if (/(localStorage|sessionStorage)/.test(text.get(p))) problems.push(`${rel(p)} uses browser storage`);
  check("no keys in the project and no browser storage", problems);
}

// ---- SQL
const migDir = join(root, "supabase", "migrations");
const migs = existsSync(migDir) ? readdirSync(migDir).filter((f) => f.endsWith(".sql")).sort() : [];
const sqlText = new Map(migs.map((f) => [f, readFileSync(join(migDir, f), "utf8")]));
const scrub = (sql) => { let out = "", inStr = false; for (let i = 0; i < sql.length; i++) { const c = sql[i], n = sql[i + 1]; if (!inStr && c === "-" && n === "-") { while (i < sql.length && sql[i] !== "\n") i++; continue; } if (c === "'") { if (inStr && n === "'") { i++; continue; } inStr = !inStr; continue; } if (!inStr) out += c; } return { out, open: inStr }; };

// 7. migrations are well formed and everything they reference exists earlier
{
  const problems = [];
  const tables = new Set(), types = new Set(), funcs = new Set(), views = new Set();
  const stamps = migs.map((f) => f.split("_")[0]);
  if (new Set(stamps).size !== stamps.length) problems.push("two migrations share a timestamp");
  for (const f of migs) {
    const raw = sqlText.get(f); const { out, open } = scrub(raw);
    if (open) problems.push(`${f}: unterminated string`);
    if ((raw.match(/\$\$/g) || []).length % 2) problems.push(`${f}: odd number of $$`);
    let depth = 0; for (const ch of out) { if (ch === "(") depth++; if (ch === ")") depth--; } if (depth !== 0) problems.push(`${f}: unbalanced parentheses`);
    for (const m of out.matchAll(/create type public\.(\w+)/g)) types.add(m[1]);
    for (const m of out.matchAll(/create table public\.(\w+)/g)) tables.add(m[1]);
    for (const m of out.matchAll(/create (?:or replace )?function public\.(\w+)/g)) funcs.add(m[1]);
    for (const m of out.matchAll(/create view public\.(\w+)/g)) views.add(m[1]);
    for (const m of out.matchAll(/references public\.(\w+)/g)) if (!tables.has(m[1])) problems.push(`${f}: foreign key to unknown table ${m[1]}`);
    for (const m of out.matchAll(/execute function public\.(\w+)/g)) if (!funcs.has(m[1])) problems.push(`${f}: trigger uses unknown function ${m[1]}`);
    for (const m of out.matchAll(/\b(?:on|from|join|into|update) public\.(\w+)(?!\w|\s*\()/g)) if (!tables.has(m[1]) && !views.has(m[1])) problems.push(`${f}: reference to unknown relation ${m[1]}`);
    for (const m of out.matchAll(/public\.(\w+)\s*\(/g)) if (!funcs.has(m[1]) && !tables.has(m[1])) problems.push(`${f}: call to unknown function ${m[1]}()`);
  }
  check("migrations: balanced, ordered, and every reference exists", problems);
}

// 8. every SECURITY DEFINER function pins its search_path
{
  const problems = [];
  for (const f of migs) {
    for (const m of sqlText.get(f).matchAll(/create (?:or replace )?function public\.(\w+)\s*\(([\s\S]*?)\$\$/g)) {
      const head = m[0];
      if (/security definer/i.test(head) && !/set search_path/i.test(head)) problems.push(`${f}: ${m[1]} is SECURITY DEFINER without a fixed search_path`);
    }
  }
  check("security-definer functions fix their search_path", problems);
}

// 9. every function the browser can call checks who is calling
{
  const problems = [];
  const granted = new Set();
  for (const f of migs) for (const g of sqlText.get(f).matchAll(/grant execute on function([\s\S]*?)\bto authenticated\s*;/gi)) for (const n of g[1].matchAll(/public\.(\w+)\s*\(/g)) granted.add(n[1]);
  const helpers = new Set(["is_owner", "is_active_member", "has_permission", "business_date_of"]);
  const bodies = new Map();
  for (const f of migs) for (const m of sqlText.get(f).matchAll(/create (?:or replace )?function public\.(\w+)\s*\([\s\S]*?\$\$([\s\S]*?)\$\$/g)) bodies.set(m[1], m[2]);
  for (const name of granted) {
    if (helpers.has(name)) continue;
    const body = bodies.get(name);
    if (body === undefined) { problems.push(`${name} is granted but its body was not found`); continue; }
    if (!/(has_permission|is_owner|_can_close|auth\.uid\(\))/.test(body)) problems.push(`${name} is callable by signed-in users but never checks who is calling`);
  }
  check("every function callable from the browser checks the caller", problems);
}

// 10. nothing in the public schema is writable by the browser roles
{
  const problems = [];
  for (const f of migs) for (const m of sqlText.get(f).matchAll(/grant\s+(insert|update|delete|all)[\s\S]*?to\s+(authenticated|anon)/gi)) problems.push(`${f}: grants ${m[1]} to ${m[2]}`);
  check("the browser roles are never granted INSERT, UPDATE or DELETE", problems);
}

// 11. SQL test scripts exist for every migration group and end with the intentional rollback
{
  const problems = [];
  const dir = join(root, "supabase", "tests");
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith(".sql")) : [];
  for (const f of files) if (!/raise exception E'PHASE \d+ CHECKS/.test(readFileSync(join(dir, f), "utf8"))) problems.push(`${f} does not end with the intentional rollback report`);
  if (files.length < 8) problems.push(`expected at least 8 SQL check scripts, found ${files.length}`);
  check("SQL check scripts roll back and report", problems);
}

let failed = 0;
for (const r of results) {
  if (r.problems.length === 0) console.log(`PASS  ${r.name}`);
  else { failed++; console.log(`FAIL  ${r.name}`); for (const p of r.problems.slice(0, 15)) console.log(`        ${p}`); if (r.problems.length > 15) console.log(`        ...and ${r.problems.length - 15} more`); }
}
console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
process.exit(failed ? 1 : 0);
