/**
 * 一键安装：把已生成的行业智能体能力包解包到三个目标。
 *
 * - `dsh`：写到 `<dshHome>/skills/<slug>/`（SKILL.md + knowledge/知识架构树.md），
 *   `skill-filesystem` 热加载后 Agent 即可通过 `skill` 工具调用。
 * - `preset`：写到 `<dshHome>/.agent-presets/<slug>/`（agent.cordis.yml + preset.yml），
 *   该 preset 挂 persona + skill 发现 + 基础工具，用户在会话里选择即可对话。
 * - `xyos`：写到 `<capabilitiesDir>/<slug>/`（SKILL.md + knowledge），作为 AI 员工能力资产。
 *
 * 关键安全点：安装只复制「分发包」里的内容（已脱敏）；`alias_map` 私密对照
 * 永远不进任一目标目录（packager 已把它排除在 zip/package 之外）。
 */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export type InstallTarget = "dsh" | "preset" | "xyos";

export interface InstallOutcome {
  installed: InstallTarget[];
  paths: Partial<Record<InstallTarget, string[]>>;
  errors: { target: InstallTarget; error: string }[];
}

/** 解析 DSH home：显式 $DSH_HOME 优先，否则 ~/.dsh。 */
function dshHome(): string {
  return process.env.DSH_HOME || path.join(os.homedir(), ".dsh");
}

/** manifest.id 即 slug（packager 生成符合 DSH 规则的稳定 ASCII id）。 */
function slugOf(manifest: Record<string, unknown>): string {
  return typeof manifest.id === "string" && manifest.id.length > 0 ? manifest.id : "industry-agent";
}

/** 生成 agent.cordis.yml：persona + skill 发现 + 基础工具（照 standard preset 行名）。 */
function buildAgentCordis(persona: string): string {
  const body = persona.split("\n").map(line => (line.length === 0 ? "" : `          ${line}`)).join("\n");
  return [
    "# XYAI 行业智能体 preset（由智能体定制一键安装）",
    "- id: identity",
    "  name: cordis:group",
    "  group: true",
    "  isolate:",
    "    persona: true",
    "  config:",
    "    - id: persona",
    "      name: '@deepseek-ai/dsh-persona'",
    "      config:",
    "        text: |-",
    body,
    "",
    "- id: skill-filesystem",
    "  name: '@deepseek-ai/dsh-skill-filesystem'",
    "",
    "- id: tool-skill",
    "  name: '@deepseek-ai/dsh-tool-skill'",
    "",
    "- id: tool-fs",
    "  name: '@deepseek-ai/dsh-tool-fs'",
    "",
    "- id: tool-web",
    "  name: '@deepseek-ai/dsh-tool-web'",
    "  config:",
    "    fetch: false",
    "    searchTimeoutMs: 60000",
    "",
  ].join("\n");
}

/** 复制 skill + 知识树到目标目录。 */
function copySkillAssets(srcPackageDir: string, targetDir: string): string[] {
  const srcSkill = path.join(srcPackageDir, "skill", "SKILL.md");
  const srcKnowledge = path.join(srcPackageDir, "knowledge", "知识架构树.md");
  fs.mkdirSync(path.join(targetDir, "knowledge"), { recursive: true });
  fs.copyFileSync(srcSkill, path.join(targetDir, "SKILL.md"));
  fs.copyFileSync(srcKnowledge, path.join(targetDir, "knowledge", "知识架构树.md"));
  return [path.join(targetDir, "SKILL.md"), path.join(targetDir, "knowledge", "知识架构树.md")];
}

/**
 * 把一个已生成能力包安装到指定目标。
 * @param packageDir - packager 产出的 package/ 目录（含 skill/persona/knowledge）。
 * @param manifest - packager 产出的 manifest.json 内容。
 * @param targets - 安装目标集合。
 * @param xyosCapabilitiesDir - XYOS `services/capabilities` 目录（仅 xyos 目标需要）。
 * @returns 每个目标的结果（成功 installed / 失败 errors），单个失败不阻断其它目标。
 */
export function installPackage(
  packageDir: string,
  manifest: Record<string, unknown>,
  targets: InstallTarget[],
  xyosCapabilitiesDir?: string,
): InstallOutcome {
  const slug = slugOf(manifest);
  const home = dshHome();
  const outcome: InstallOutcome = { installed: [], paths: {}, errors: [] };

  for (const target of targets) {
    try {
      if (target === "dsh") {
        const dir = path.join(home, "skills", slug);
        outcome.paths.dsh = copySkillAssets(packageDir, dir);
        outcome.installed.push("dsh");
      } else if (target === "preset") {
        const persona = fs.readFileSync(path.join(packageDir, "persona.md"), "utf-8");
        const name = typeof manifest.name === "string" ? manifest.name : slug;
        const description = typeof manifest.description === "string" ? manifest.description : "";
        const dir = path.join(home, ".agent-presets", slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "agent.cordis.yml"), buildAgentCordis(persona), "utf-8");
        fs.writeFileSync(path.join(dir, "preset.yml"), `name: ${name}\ndescription: ${description}\n`, "utf-8");
        outcome.paths.preset = [path.join(dir, "agent.cordis.yml"), path.join(dir, "preset.yml")];
        outcome.installed.push("preset");
      } else if (target === "xyos") {
        if (!xyosCapabilitiesDir) throw new Error("XYOS 能力目录未配置");
        const dir = path.join(xyosCapabilitiesDir, slug);
        outcome.paths.xyos = copySkillAssets(packageDir, dir);
        outcome.installed.push("xyos");
      }
    } catch (err) {
      outcome.errors.push({ target, error: err instanceof Error ? err.message : String(err) });
    }
  }

  return outcome;
}
