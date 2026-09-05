/**
 * 六类敏感实体脱敏引擎（TS 版，扩展自 ima-mcp/desensitize.py）
 *
 * 实体：company 公司 / place 地名 / person 人名 / project 项目 / product 产品名 / brand 商标品牌
 * 设计原则：
 *   1. 一致性：同一实体全文映射到同一代号
 *   2. 可逆性：维护 original → alias 映射（alias_map.json），存私密区、不进分发包
 *   3. 可配置：每类词表可扩展
 *   4. 保守：拿不准的保留原文，不误伤技术术语
 */
import fs from "node:fs";
import path from "node:path";
import { EntityKind, DesensitizeResult } from "./types";

/** 每类实体代号前缀 */
const KIND_PREFIX: Record<EntityKind, string> = {
  company: "公司",
  place: "地点",
  person: "人名",
  project: "项目",
  product: "产品",
  brand: "品牌",
  credit_code: "信用代码",
  organization: "单位",
  customer: "客户",
  business_data: "数据",
  personal_info: "个人信息",
};

// ============================================================
// 词表与启发式规则
// ============================================================

/** 企业名后缀（命中即判为公司名） */
const COMPANY_SUFFIX = [
  "有限公司", "股份公司", "有限责任公司",
  "公司", "集团", "控股", "股份", "有限",
  "热电厂", "发电厂", "电厂", "工厂", "厂",
  "热电", "发电", "能源", "电力",
];

/** 已知企业词根（精准命中） */
const KNOWN_COMPANIES = [
  "华能", "大唐", "华电", "国电", "国家能源", "中电投", "神华",
  "国网", "南网", "中广核", "华润电力", "京能", "浙能", "粤电",
  "鲁能", "晋能", "陕煤", "兖矿", "平煤", "淮北", "皖能", "深能",
];

/** 地名词缀 */
const PLACE_SUFFIX = ["省", "市", "区", "县", "镇", "乡", "村", "高新区", "开发区", "工业园", "产业园"];

/** 已知地名（城市） */
const KNOWN_PLACES = [
  "北京", "上海", "广州", "天津", "重庆", "杭州", "南京", "武汉", "西安",
  "青岛", "大连", "沈阳", "太原", "石家庄", "济南", "合肥", "长沙", "南昌",
  "福州", "昆明", "哈尔滨", "长春", "呼和浩特", "乌鲁木齐", "兰州", "贵阳",
  "海口", "银川", "西宁", "拉萨", "包头", "鄂尔多斯", "大同", "阳泉",
  "长治", "晋城", "朔州", "运城", "临汾", "吕梁", "晋中", "忻州",
];

/** 姓氏（百家姓） */
const SURNAMES = "赵钱孙李周吴郑王冯陈褚卫蒋沈韩杨朱秦尤许何吕施张孔曹严华金魏陶姜戚谢邹喻柏水窦章云苏潘葛奚范彭郎鲁韦昌马苗凤花方俞任袁柳酆鲍史唐费廉岑薛雷贺倪汤滕殷罗毕郝邬安常乐于时傅皮卞齐康伍余元卜顾孟平黄和穆萧尹姚邵湛汪祁毛禹狄米贝明臧计伏成戴谈宋茅庞熊纪舒屈项祝董梁杜阮蓝闵席季麻强贾路娄危江童颜郭梅盛林刁钟徐邱骆高夏蔡田樊胡凌霍虞万支柯昝管卢莫经房裘缪干解应宗丁宣贲邓郁单杭洪包诸左石崔吉钮龚程嵇邢滑裴陆荣翁荀羊於惠甄曲家封芮羿储靳汲邴糜松井段富巫乌焦巴弓牧隗山谷车侯宓蓬全郗班仰秋仲伊宫宁仇栾暴甘斜厉戎祖武符刘景詹束龙叶幸司韶郜黎蓟薄印宿白怀蒲邰从鄂索咸籍赖卓蔺屠蒙池乔阴郁胥能苍双闻莘党翟谭贡劳逄姬申扶堵冉宰郦雍却璩桑桂濮牛寿通边扈燕冀郏浦尚农温别庄晏柴瞿阎充慕连茹习宦艾鱼容向古易慎戈廖庾终暨居衡步都耿满弘匡国文寇广禄阙东欧殳沃利蔚越夔隆师巩厍聂晁勾敖融冷訾辛阚那简饶空曾毋沙乜养鞠须丰巢关蒯相查后荆红游竺权逯盖益桓公";

/** 人名用字（保守集合） */
const NAME_CHARS = "伟刚勇毅俊峰强军平保东文辉力明永健世广志义兴良海山仁波宁贵福生龙元全国胜学祥才发武新利清飞彬富顺信子杰涛昌成康星光天达安岩中茂进林有坚和彪博诚先敬震振壮会思群豪心邦承乐绍功松善厚庆磊民友裕河哲江超浩亮政谦亨奇固之轮翰朗伯宏言若鸣朋斌梁栋维启克伦翔旭鹏泽晨辰士以建家致树炎德行时泰盛雄琛钧冠策腾楠榕风航弘";

/** 项目名关键词 */
const PROJECT_KEYWORDS = ["项目", "工程", "技改", "改造", "扩建", "新建", "一期", "二期", "三期", "标段", "机组", "装置", "系统改造"];

/** 产品名关键词（新增） */
const PRODUCT_KEYWORDS = ["产品", "系统", "平台", "方案", "软件", "应用", "小程序", "客户端", "服务"];

/** 商标品牌关键词（新增） */
const BRAND_KEYWORDS = ["品牌", "商标", "旗下", "自有品牌", "注册商标", "™", "®"];

// ============================================================
// 脱敏器
// ============================================================

export class Desensitizer {
  private mapping: Record<string, string> = {};
  private counters: Record<EntityKind, number> = {
    company: 0, place: 0, person: 0, project: 0, product: 0, brand: 0,
    credit_code: 0, organization: 0, customer: 0, business_data: 0, personal_info: 0,
  };

  constructor(mappingPath?: string) {
    if (mappingPath && fs.existsSync(mappingPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(mappingPath, "utf-8"));
        this.mapping = data.mapping || {};
        const c = data.counters || {};
        for (const k of Object.keys(this.counters) as EntityKind[]) this.counters[k] = c[k] ?? 0;
      } catch { /* 映射加载失败则从零开始 */ }
    }
  }

  /** 载入 LLM 已生成的原文→代号映射，使后续经验文本沿用同一代号并从现有编号后继续。 */
  loadMappings(source: Record<string, string>): void {
    const kindByPrefix: Record<string, EntityKind> = Object.fromEntries(Object.entries(KIND_PREFIX).map(([kind, prefix]) => [prefix, kind])) as Record<string, EntityKind>;
    for (const [rawKey, alias] of Object.entries(source)) {
      const match = alias.match(/^【([^0-9】]+)(\d+)】$/);
      if (!match) continue;
      const kind = kindByPrefix[match[1]];
      if (!kind) continue;
      const original = rawKey.includes(":") ? rawKey.slice(rawKey.indexOf(":") + 1) : rawKey;
      if (!original) continue;
      this.mapping[`${kind}:${original}`] = alias;
      this.counters[kind] = Math.max(this.counters[kind], Number(match[2]));
    }
  }

  /** 返回实体的稳定代号；新实体分配新代号 */
  private aliasFor(original: string, kind: EntityKind): string {
    const key = `${kind}:${original}`;
    if (this.mapping[key]) return this.mapping[key];
    this.counters[kind] += 1;
    const alias = `【${KIND_PREFIX[kind]}${this.counters[kind]}】`;
    this.mapping[key] = alias;
    return alias;
  }

  /** 按模式替换：先匹配，再统一替换（避免迭代中重复匹配） */
  private maskByPattern(text: string, kind: EntityKind, regex: RegExp, maxLen = 30): string {
    const replacements: Array<[string, string]> = [];
    for (const m of text.matchAll(regex)) {
      const cand = m[0];
      if (cand.length > maxLen) continue;
      if (replacements.some(r => r[0] === cand)) continue;
      replacements.push([cand, this.aliasFor(cand, kind)]);
    }
    let out = text;
    for (const [orig, alias] of replacements) out = out.split(orig).join(alias);
    return out;
  }

  private maskCompany(text: string): string {
    let out = text;
    // 完整公司名优先：词根 + 可选后缀（华能集团 / 华润电力 / 华能），避免「华能」单独替换后残留「集团」挡住后续人名
    for (const comp of KNOWN_COMPANIES) {
      const fullRegex = new RegExp(`${comp}(?:集团|控股|股份|有限公司|有限责任公司|公司|电力|能源|电厂|热电)?`, "g");
      out = out.replace(fullRegex, (m) => this.aliasFor(m, "company"));
    }
    // 通用公司名模式：Xxx热电/发电/能源/电力 + 后缀
    out = this.maskByPattern(out, "company", /[\u4e00-\u9fa5A-Za-z0-9]{2,12}?(?:热电|发电|能源|电力)(?:有限公司|股份公司|有限责任公司|公司|集团|厂|股份)/g);
    // 通用：Xxx公司/集团/控股/股份
    out = this.maskByPattern(out, "company", /[\u4e00-\u9fa5A-Za-z0-9]{2,12}?(?:公司|集团|控股|股份)/g);
    return out;
  }

  private maskPlace(text: string): string {
    let out = text;
    for (const pl of KNOWN_PLACES) {
      if (out.includes(pl)) out = out.split(pl).join(this.aliasFor(pl, "place"));
    }
    out = this.maskByPattern(out, "place", /[\u4e00-\u9fa5]{2,8}?(?:省|市|区|县|镇|高新区|开发区|工业园|产业园)/g);
    return out;
  }

  private maskPerson(text: string): string {
    // 先识别带明确职责/动作上下文的人名；中文句子中姓名前通常也是汉字，不能仅靠词边界判断。
    const contextual = new RegExp(`([${SURNAMES}][${NAME_CHARS}]{1,2})(?=(?:确认|审核|复核|批准|负责|经理|老师|工程师|先生|女士|主任|总监|，|。|、|；|;|\\s))`, "g");
    const contextualOutput = text.replace(contextual, (name) => this.aliasFor(name, "person"));
    // 姓氏 + 名（1-2 个名字用字），且名后不紧跟名字用字——
    // 这样"王伟工程师"匹配"王伟"（后是职务"工"），"王伟明"匹配"王伟明"（后非名字用字）。
    const regex = new RegExp(`(?<![\\u4e00-\\u9fa5])([${SURNAMES}])([${NAME_CHARS}]{1,2})(?![${NAME_CHARS}])`, "g");
    const replacements: Array<[string, string]> = [];
    for (const m of contextualOutput.matchAll(regex)) {
      const full = m[0];
      if (replacements.some(r => r[0] === full)) continue;
      replacements.push([full, this.aliasFor(full, "person")]);
    }
    let out = contextualOutput;
    for (const [orig, alias] of replacements) out = out.split(orig).join(alias);
    return out;
  }

  private maskProject(text: string): string {
    return this.maskByPattern(text, "project", /[\u4e00-\u9fa5A-Za-z0-9]{2,20}?(?:项目|工程|技改|改造|扩建|新建)/g, 24);
  }

  private maskProduct(text: string): string {
    return this.maskByPattern(text, "product", /[\u4e00-\u9fa5A-Za-z0-9]{2,20}?(?:产品|系统|平台|方案|软件|应用|小程序|客户端)/g, 24);
  }

  private maskBrand(text: string): string {
    let out = text;
    // 商标符号
    out = this.maskByPattern(out, "brand", /[\u4e00-\u9fa5A-Za-z0-9]{1,15}?[™®]/g);
    // Xxx品牌 / Xxx商标
    out = this.maskByPattern(out, "brand", /[\u4e00-\u9fa5A-Za-z0-9]{2,15}?(?:品牌|商标)/g);
    return out;
  }

  /** 统一社会信用代码（18 位，数字+大写字母，不含 I/O/Z/S/V） */
  private maskCreditCode(text: string): string {
    return this.maskByPattern(text, "credit_code", /[0-9A-HJ-NPQRTUWXY]{18}/g, 18);
  }

  /** 公司/单位/机构名称（学校/医院/协会/局委办等，比 company 更广） */
  private maskOrganization(text: string): string {
    return this.maskByPattern(
      text, "organization",
      /[\u4e00-\u9fa5A-Za-z0-9]{2,16}?(?:学校|大学|学院|医院|研究院|研究所|设计院|中心|委员会|协会|学会|基金会|管理局|管委会|事务所|银行|保险)/g,
      24
    );
  }

  /** 客户名单（"客户"上下文里的单位/公司名） */
  private maskCustomer(text: string): string {
    // 先匹配「前N大客户/主要客户/客户名单」等，再把紧跟其后的单位名脱敏（简化：客户关键词后的单位名）
    let out = text;
    out = this.maskByPattern(out, "customer", /(?:前\s*[0-9一二三四五六七八九十]+\s*大客户|主要客户|核心客户|客户名单|客户[:：])[\s\S]{0,60}?[\u4e00-\u9fa5A-Za-z0-9]{2,12}?(?:公司|集团|有限公司|厂|单位)/g, 80);
    // 客户名（含"客户"字样）
    out = this.maskByPattern(out, "customer", /[\u4e00-\u9fa5A-Za-z0-9]{2,16}?客户/g);
    return out;
  }

  /** 敏感的未公开经营数据：数字 + 单位（营收/利润/产能/销量/金额等） */
  private maskBusinessData(text: string): string {
    // 数字 + 常见经营数据单位；保留维度词，只替换数值
    return this.maskByPattern(
      text, "business_data",
      /-?\d+(?:\.\d+)?\s*(?:亿元|万元|元|GWh|MWh|kWh|GW|MW|kW|万kW|吨|万吨|人|亩|%|kV|V|Ah|件|台|套)/g,
      30
    );
  }

  /** 个人敏感信息：身份证号 / 手机号 / 银行卡号 / 邮箱 */
  private maskPersonalInfo(text: string): string {
    let out = text;
    // 身份证号（18 位：17 数字 + 数字/X；15 位纯数字）
    out = this.maskByPattern(out, "personal_info", /\b\d{17}[\dXx]\b/g, 18);
    out = this.maskByPattern(out, "personal_info", /\b\d{15}\b/g, 15);
    // 手机号（1 开头 11 位）
    out = this.maskByPattern(out, "personal_info", /\b1[3-9]\d{9}\b/g, 11);
    // 银行卡号（16-19 位数字）
    out = this.maskByPattern(out, "personal_info", /\b\d{16,19}\b/g, 19);
    // 邮箱
    out = this.maskByPattern(out, "personal_info", /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, 60);
    return out;
  }

  /** 对全文执行十一类脱敏 */
  process(text: string): DesensitizeResult {
    if (!text) return { text, mapping: { ...this.mapping } };
    let out = text;
    out = this.maskPersonalInfo(out); // 先精确匹配身份证/手机号/银行卡/邮箱，避免被切碎
    out = this.maskCreditCode(out);   // 再精确匹配信用代码
    out = this.maskCompany(out);
    out = this.maskOrganization(out);
    out = this.maskPlace(out);
    out = this.maskBusinessData(out); // 先保护“100万元”等完整经营数值，避免“万元”被误识别人名
    out = this.maskPerson(out);
    out = this.maskProject(out);
    out = this.maskProduct(out);
    out = this.maskBrand(out);
    out = this.maskCustomer(out);
    return { text: out, mapping: { ...this.mapping } };
  }

  getMapping(): Record<string, string> {
    return { ...this.mapping };
  }

  /** 保存映射（存私密区，不进分发包） */
  saveMapping(filePath: string): void {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(
      filePath,
      JSON.stringify({ mapping: this.mapping, counters: this.counters }, null, 2),
      "utf-8"
    );
  }
}
