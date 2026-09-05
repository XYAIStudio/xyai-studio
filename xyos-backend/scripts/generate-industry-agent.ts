/**
 * 行业智能体生成器 CLI 入口
 * 用法：
 *   node node_modules/tsx/dist/cli.mjs scripts/generate-industry-agent.ts \
 *     --name 热电尽调助手 --industry 热电/能源尽调 --desc "..." \
 *     --docs <资料目录> [--experience <经验文件>] [--out <输出目录>]
 */
import fs from "node:fs";
import path from "node:path";
import { generateIndustryAgent } from "../services/industry-agent-generator/generator";
import { IndustryDocument } from "../services/industry-agent-generator/types";

function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
      out[key] = val;
    }
  }
  return out;
}

function readDocs(dir: string): IndustryDocument[] {
  const files = fs.readdirSync(dir).filter(f => /\.(md|txt)$/i.test(f));
  return files.map(f => ({ name: f, content: fs.readFileSync(path.join(dir, f), "utf-8") }));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.name || !args.industry || !args.docs) {
    console.error("用法: --name <名> --industry <行业> --docs <资料目录> [--desc <描述>] [--experience <经验文件>] [--out <输出目录>]");
    process.exit(1);
  }

  const documents = readDocs(args.docs);
  console.log(`读入资料 ${documents.length} 份：${documents.map(d => d.name).join(", ")}`);
  if (documents.length === 0) { console.error("资料目录为空（需要 .md/.txt 文件）"); process.exit(1); }

  const experience = args.experience ? fs.readFileSync(args.experience, "utf-8") : undefined;
  const outputDir = args.out || path.join(process.env.XYOS_RUNTIME_WORKSPACE || path.join(process.cwd(), "runtime-workspace"), "industry-agent", `${Date.now()}`);
  const description = args.desc || `${args.industry} 行业智能体`;

  console.log("\n=== 开始生成行业智能体 ===");
  console.log(`名称: ${args.name}\n行业: ${args.industry}\n输出: ${outputDir}`);

  const result = await generateIndustryAgent({
    name: args.name,
    industry: args.industry,
    description,
    documents,
    experience,
    outputDir,
  });

  console.log("\n=== 生成完成 ===");
  console.log(`维度: ${result.distill.dimensions.join("、") || "（未识别）"}`);
  console.log(`脱敏映射条目: ${result.aliasCount}`);
  console.log(`建议 (${result.suggestions.length}):`);
  for (const s of result.suggestions) console.log(`  · ${s}`);
  console.log(`\n分发包 zip: ${result.zipPath}`);
  console.log(`私密对照: ${result.aliasMapPath}`);
  console.log(`能力包目录: ${result.packageDir}`);
  process.exit(0);
}

main().catch(e => { console.error("生成失败:", e); process.exit(1); });
