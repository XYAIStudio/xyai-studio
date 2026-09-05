/**
 * Migrated from the verified legacy production-architecture.ts contract.
 * These are business asset lines, not a second Harness navigation model.
 */
export const FACTORY_LINES = ['knowledge', 'data', 'model', 'capability', 'agent', 'system', 'deployment'] as const
export type FactoryLine = typeof FACTORY_LINES[number]

export interface ProductionStageDefinition { readonly id: string; readonly label: string; readonly gate: string }
export interface ProductionLineDefinition { readonly id: FactoryLine; readonly label: string; readonly purpose: string; readonly dependsOn?: FactoryLine; readonly stages: readonly ProductionStageDefinition[] }

export const FACTORY_ARCHITECTURE: Readonly<Record<FactoryLine, ProductionLineDefinition>> = {
  knowledge: { id: 'knowledge', label: '知识生产线', purpose: '把本机与授权资料变成可追溯、可检索的知识资产', stages: [
    { id: 'attach', label: '挂接数据源', gate: '来源获得用户授权且已复制进入 XYAI 本地存储' },
    { id: 'inventory', label: '文件盘点', gate: '逐文件建立稳定标识和增量指纹' },
    { id: 'parse', label: '解析清洗', gate: '支持格式解析完成，失败文件可见且可重试' },
    { id: 'index', label: '分块索引', gate: '知识块保留文件、位置和版本引用' },
    { id: 'memory', label: '记忆蒸馏', gate: '记忆可回溯原文，不覆盖原始证据' },
    { id: 'access', label: '权限与引用', gate: '检索结果通过项目权限过滤并返回引用' },
  ] },
  data: { id: 'data', label: '数据生产线', purpose: '把已验收知识转成可审核、可复现的数据集版本', dependsOn: 'knowledge', stages: [
    { id: 'collect', label: '样本生成', gate: '每条样本保留上游知识引用' },
    { id: 'normalize', label: '规范化', gate: '格式、单位、术语和角色模板一致' },
    { id: 'deduplicate', label: '去重与冲突检测', gate: '近重复、冲突和泄漏样本已标记' },
    { id: 'review', label: '专家审核', gate: '未经审核的自动样本不得进入正式训练集' },
    { id: 'split', label: '冻结与分集', gate: '训练、验证和盲测集隔离且版本不可变' },
  ] },
  model: { id: 'model', label: '模型生产线', purpose: '按硬件安全档调优并登记可复现模型产物', dependsOn: 'data', stages: [
    { id: 'plan', label: '训练规划', gate: '底模许可、格式、显存和磁盘预算通过' },
    { id: 'train', label: '参数高效训练', gate: '检查点、日志和中止恢复可用' },
    { id: 'evaluate', label: '基线评测', gate: '质量、速度和退化指标通过阈值' },
    { id: 'package', label: '合并量化', gate: '训练产物可被目标推理后端加载' },
    { id: 'register', label: '模型登记', gate: '模型卡、数据版本、指标和回滚版本完整' },
  ] },
  capability: { id: 'capability', label: '能力生产线', purpose: '组合模型、Skills、插件、MCP 和连接器；纯 Skill/MCP 能力不强制依赖模型', stages: [
    { id: 'compose', label: '能力编排', gate: '依赖版本和权限声明完整' },
    { id: 'sandbox', label: '权限审计', gate: '高风险能力需要明确授权' },
    { id: 'integration', label: '集成测试', gate: '工具调用、失败回退和结果结构通过' },
    { id: 'bundle', label: '能力打包', gate: '可安装、可禁用、可卸载' },
  ] },
  agent: { id: 'agent', label: '智能体生产线', purpose: '把知识和能力固化为可验收的行业智能体', dependsOn: 'capability', stages: [
    { id: 'define', label: '角色与边界', gate: '目标、禁区、输出标准明确' },
    { id: 'bind', label: '资源绑定', gate: '知识、模型、工具和权限均为明确版本' },
    { id: 'simulate', label: '场景演练', gate: '正例、反例和异常路径均已覆盖' },
    { id: 'accept', label: '专家验收', gate: '行业专家确认后方可进入系统生产线' },
  ] },
  system: { id: 'system', label: '系统生产线', purpose: '把智能体装配成 XYOS 或独立本地管理系统', dependsOn: 'agent', stages: [
    { id: 'scaffold', label: '项目生成', gate: '成果写入 XYAI 自有本机工作区' },
    { id: 'integrate', label: '业务集成', gate: '数据、身份和智能体通道连通' },
    { id: 'test', label: '系统测试', gate: '功能、权限、数据迁移和恢复通过' },
    { id: 'build', label: '构建产物', gate: '独立运行且不依赖可变的 Harness 界面' },
  ] },
  deployment: { id: 'deployment', label: '部署生产线', purpose: '审计、打包、安装、升级和回滚完整资产链', dependsOn: 'system', stages: [
    { id: 'audit', label: '发布审计', gate: '资产血缘、许可、密钥和安全检查通过' },
    { id: 'package', label: '安装打包', gate: '按需组件不默认塞入主安装包' },
    { id: 'smoke', label: '安装验证', gate: '干净环境安装、启动和核心流程通过' },
    { id: 'release', label: '版本发布', gate: '版本、校验值和回滚方案完整' },
  ] },
}

export function previousFactoryLine(line: FactoryLine): FactoryLine | undefined { return FACTORY_ARCHITECTURE[line].dependsOn }
