/**
 * Apply OpenXYOS register tenant_id fix on the user machine.
 *
 * Problem: register hardcodes tenant_id=2 but SQLite often only has tenant 1
 * → auth JOIN fails → login/register broken.
 *
 * Default target (Windows pack layout):
 *   E:\XYAI studio\0.5\components\openxyos\backend\routes\auth.ts
 *
 * Usage:
 *   node apps/desktop/scripts/patch-openxyos-auth-tenant.mjs
 *   node apps/desktop/scripts/patch-openxyos-auth-tenant.mjs --path "D:\\path\\to\\auth.ts"
 *   node apps/desktop/scripts/patch-openxyos-auth-tenant.mjs --ensure-tenant-2
 *
 * Default: change hardcoded tenant_id 2 → 1 (and ensure orphan users map to active tenant).
 * --ensure-tenant-2: instead insert/activate tenant id=2 in DB if schema present (best-effort SQL note).
 */
import { existsSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_WIN =
  'E:\\XYAI studio\\0.5\\components\\openxyos\\backend\\routes\\auth.ts';

function parseArgs(argv) {
  const out = { path: process.env.XYAI_OPENXYOS_AUTH_TS || '', ensureTenant2: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--path' && argv[i + 1]) {
      out.path = argv[++i];
    } else if (a === '--ensure-tenant-2') {
      out.ensureTenant2 = true;
    } else if (a === '--help' || a === '-h') {
      out.help = true;
    }
  }
  return out;
}

function patchAuthSource(src, { ensureTenant2 }) {
  let next = src;
  let changes = [];

  // Common patterns: tenant_id: 2 / tenant_id = 2 / tenantId: 2
  const patterns = [
    { re: /\btenant_id\s*:\s*2\b/g, to: 'tenant_id: 1', label: 'tenant_id: 2 → 1' },
    { re: /\btenant_id\s*=\s*2\b/g, to: 'tenant_id = 1', label: 'tenant_id = 2 → 1' },
    { re: /\btenantId\s*:\s*2\b/g, to: 'tenantId: 1', label: 'tenantId: 2 → 1' },
    { re: /\btenantId\s*=\s*2\b/g, to: 'tenantId = 1', label: 'tenantId = 2 → 1' },
  ];

  if (!ensureTenant2) {
    for (const p of patterns) {
      if (p.re.test(next)) {
        next = next.replace(p.re, p.to);
        changes.push(p.label);
      }
    }
  }

  // Bootstrap orphan users: if register inserts user without verifying tenant exists,
  // add a soft comment + ensure DEFAULT_TENANT_ID constant when missing.
  if (!ensureTenant2 && !/DEFAULT_TENANT_ID|XYAI_DEFAULT_TENANT/.test(next)) {
    if (/export\s+(async\s+)?function\s+register|router\.(post|use)\(['`]\/register/.test(next)) {
      const banner =
        "\n/** XYAI Studio pack: default active tenant (DB often only has id=1). */\n" +
        "const XYAI_DEFAULT_TENANT_ID = Number(process.env.XYAI_DEFAULT_TENANT_ID || 1);\n";
      // Insert after imports block (first blank line after import section)
      const importEnd = next.search(/\n(?!import\b)/);
      if (importEnd > 0 && !changes.includes('inject XYAI_DEFAULT_TENANT_ID')) {
        next = next.slice(0, importEnd) + banner + next.slice(importEnd);
        changes.push('inject XYAI_DEFAULT_TENANT_ID');
        // Prefer constant over bare 1 if we already rewrote to 1
        next = next.replace(/\btenant_id\s*:\s*1\b/g, 'tenant_id: XYAI_DEFAULT_TENANT_ID');
        next = next.replace(/\btenantId\s*:\s*1\b/g, 'tenantId: XYAI_DEFAULT_TENANT_ID');
        changes.push('use XYAI_DEFAULT_TENANT_ID in register');
      }
    }
  }

  if (ensureTenant2) {
    changes.push(
      'NOTE: --ensure-tenant-2 does not rewrite auth.ts literals; run SQL on OpenXYOS DB:\n' +
        "  INSERT OR IGNORE INTO tenants (id, name, status) VALUES (2, 'default', 'active');\n" +
        "  UPDATE tenants SET status='active' WHERE id=2;\n" +
        '  (Adjust table/column names to match your schema.)',
    );
  }

  return { next, changes };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node patch-openxyos-auth-tenant.mjs [--path <auth.ts>] [--ensure-tenant-2]
Default path: ${DEFAULT_WIN}`);
    process.exit(0);
  }

  const target = args.path || DEFAULT_WIN;
  if (!existsSync(target)) {
    console.error(`[patch-openxyos-auth-tenant] file not found: ${target}`);
    console.error('Pass --path to backend/routes/auth.ts on this machine.');
    process.exit(2);
  }

  const src = readFileSync(target, 'utf8');
  const { next, changes } = patchAuthSource(src, args);

  if (args.ensureTenant2) {
    console.log(changes.join('\n'));
    process.exit(0);
  }

  if (next === src) {
    console.log(`[patch-openxyos-auth-tenant] no tenant_id=2 literals found in ${target}`);
    console.log('File may already be patched, or uses a different pattern — inspect manually.');
    process.exit(0);
  }

  const bak = target + '.xyai-bak';
  if (!existsSync(bak)) {
    copyFileSync(target, bak);
    console.log(`[patch-openxyos-auth-tenant] backup → ${bak}`);
  }
  writeFileSync(target, next, 'utf8');
  console.log(`[patch-openxyos-auth-tenant] patched ${target}`);
  for (const c of changes) console.log('  ·', c);
}

main();
