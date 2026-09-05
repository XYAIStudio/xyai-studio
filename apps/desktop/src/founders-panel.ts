/** XYAI-owned management panes.  The factory UI is adapted from the legacy
 * production-line view, backed by the migrated project-owned asset graph. */
export const FOUNDERS_PANEL_HTML = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
:root{font-family:"Segoe UI","Microsoft YaHei",sans-serif;color:#172033;background:#fff}*{box-sizing:border-box}body{margin:0}.page{max-width:1120px;padding:40px 48px 72px;margin:auto}.eyebrow{color:#5686cf;font-size:13px;font-weight:700}.heading{font-size:30px;letter-spacing:-.7px;margin:7px 0}.intro,.muted{color:#708098;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(7,minmax(92px,1fr));gap:7px;margin:28px 0 18px}.line{background:#fff;border:1px solid #dfe7f2;border-radius:12px;padding:12px 8px;color:#53647b;font:inherit;font-size:12px;cursor:pointer}.line b{display:block;font-size:18px;color:#2e6fc8;margin-bottom:4px}.line.active{border-color:#347ce1;background:#f3f8ff;color:#1e61ba}.line.ready{border-color:#85c9a3}.line.warn{border-color:#efbd6b}.card,.list,.form{border:1px solid #e1e8f2;border-radius:14px;background:#fff;padding:18px}.head{display:flex;align-items:center;justify-content:space-between;gap:12px}.head h2{font-size:18px;margin:0}.toolbar{display:flex;gap:9px;flex-wrap:wrap;margin:16px 0}.button{border:0;border-radius:9px;background:#367ce1;color:white;padding:10px 14px;font:inherit;cursor:pointer}.button.secondary{background:#edf3fc;color:#2869c4}.button.danger{background:#fff0f0;color:#b4424a}.button:disabled{opacity:.5;cursor:not-allowed}.form{display:grid;gap:11px;margin-top:16px;max-width:750px}.row{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:11px}label{display:grid;gap:6px;color:#52637a;font-size:13px}input,select,textarea{border:1px solid #dbe4f0;border-radius:8px;padding:10px;font:inherit;color:#172033;background:white}textarea{resize:vertical;min-height:70px}.stages{display:flex;gap:7px;flex-wrap:wrap;margin:13px 0}.stage{border-radius:10px;background:#f3f6fa;padding:8px 10px;font-size:12px;color:#516176}.stage b{color:#1e61ba}.item{padding:13px 0;border-bottom:1px solid #edf1f5}.item:last-child{border:0}.item-head{display:flex;gap:10px;justify-content:space-between;align-items:center;font-weight:650}.pill{font-size:12px;padding:3px 8px;border-radius:99px;background:#eef4ff;color:#2d70c9;white-space:nowrap}.pill.wait{background:#fff5e4;color:#a76a15}.pill.issue{background:#fff0f0;color:#bd4450}.empty{padding:24px 0;text-align:center;color:#8694a6}.note{margin-top:15px;padding:12px 14px;border-left:3px solid #6ba3ef;background:#f5f9ff;color:#5a7194;font-size:13px;line-height:1.6}.error{color:#bd4450;font-size:13px}.success{color:#21805a;font-size:13px}.summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:18px 0}.summary>div{border:1px solid #e3eaf4;border-radius:12px;padding:13px}.summary strong{display:block;font-size:24px;margin:5px 0}.summary span{font-size:12px;color:#76869c}@media(max-width:920px){.page{padding:30px 24px}.grid{grid-template-columns:repeat(2,1fr)}.row,.summary{grid-template-columns:1fr}}
/* ---- KB wizard, filters & theme (W-101/W-107) ---- */
#kb-theme-toggle{position:fixed;top:14px;right:18px;z-index:99;border:1px solid #dbe4f0;background:#fff;color:#34465e;border-radius:99px;padding:6px 13px;font:inherit;font-size:13px;cursor:pointer;box-shadow:0 1px 6px rgba(16,24,40,.10)}
.kb-wizard{margin-top:16px}
.wizard-steps{display:flex;gap:8px;flex-wrap:wrap;margin:13px 0 16px}
.wstep{border-radius:99px;background:#f3f6fa;padding:7px 12px;font-size:13px;color:#516176}
.wstep.on{background:#e7f0ff;color:#1e61ba;font-weight:700}
.wstep b{display:inline-block;min-width:20px;height:20px;line-height:20px;text-align:center;border-radius:50%;background:#367ce1;color:#fff;font-size:12px;margin-right:6px}
.wstep.on b{background:#1e61ba}
.pathrow{display:flex;gap:9px;align-items:center;flex-wrap:wrap}
.pathrow input{flex:1 1 300px}
.filterbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:13px 0 6px}
.filterchip{border:1px solid #dbe4f0;border-radius:99px;background:#f6f9fd;color:#516176;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.filterchip.on{background:#367ce1;border-color:#367ce1;color:#fff;font-weight:700}
.filterbar input{flex:1 1 220px}
.docmeta{font-size:12px;color:#8a97a9;margin-top:3px;display:block}
.pvbox{white-space:pre-wrap;max-height:300px;overflow:auto;background:#fbfcfe;border:1px solid #e6ecf4;border-radius:8px;padding:10px;margin-top:8px;font-size:13px}
body.dark{background:#0e141c;color:#dbe4ef}
body.dark .eyebrow{color:#7ea9e8}
body.dark .heading,body.dark .head h2{color:#e9eef6}
body.dark .intro,body.dark .muted{color:#9aa9bd}
body.dark .line,body.dark .card,body.dark .list,body.dark .form,body.dark .summary>div{border-color:#263241;background:#161e2a;color:#c7d3e2}
body.dark .line b{color:#5f97e8}
body.dark .line.active{border-color:#4d8bf0;background:#142a45;color:#a3c4f6}
body.dark .line.ready{border-color:#3f926a}
body.dark .line.warn{border-color:#a97b2e}
body.dark .button{background:#3d83ef}
body.dark .button.secondary{background:#1e2c40;color:#9cc0f5}
body.dark .button.danger{background:#3b2025;color:#f2a3a9}
body.dark .pill{background:#1b2a41;color:#8fb8f2}
body.dark .pill.wait{background:#3a2f15;color:#e6bb62}
body.dark .pill.issue{background:#3b2025;color:#f2a3a9}
body.dark .stage{background:#1a2231;color:#aeb9cb}
body.dark .stage b{color:#8fb8f2}
body.dark input,body.dark select,body.dark textarea{background:#0f1620;color:#e5ecf5;border-color:#2c394b}
body.dark .item{border-bottom-color:#212c3b}
body.dark .empty{color:#7f8da2}
body.dark .note{background:#131f30;border-left-color:#417fd6;color:#a9bdd8}
body.dark .error{color:#f08d95}
body.dark .success{color:#63d19c}
body.dark .wstep{background:#1b2231;color:#aeb9cb}
body.dark .wstep.on{background:#142a45;color:#a3c4f6}
body.dark .filterchip{background:#1a2231;color:#c2cede;border-color:#2c394b}
body.dark .filterchip.on{background:#3d83ef;border-color:#3d83ef;color:#fff}
body.dark .pvbox{background:#0f1620;border-color:#2c394b;color:#d6dfea}
body.dark #kb-theme-toggle{border-color:#2c394b;background:#1b2434;color:#d3dde9}
#kb-theme-toggle:focus{outline:2px solid #367ce1;outline-offset:2px}
.filterchip:focus{outline:2px solid #367ce1;outline-offset:1px}
/* ===== W-105 知识问答 ===== */
#kb-chat-layer{position:fixed;inset:0;z-index:420;display:none;font-family:"Segoe UI","Microsoft YaHei",sans-serif}
#kb-chat-layer.open{display:block}
.kb-chat-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.30)}
.kb-chat-card{position:absolute;right:20px;bottom:20px;width:min(880px,calc(100vw - 40px));height:min(660px,calc(100vh - 90px));background:#fff;border:1px solid #dbe4f0;border-radius:18px;box-shadow:0 22px 70px rgba(15,23,42,.22);display:flex;flex-direction:column;overflow:hidden}
.kb-chat-head{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid #e7edf6}
.kb-chat-head b{font-size:16px;color:#1b2940}
.small{font-size:12px;color:#7a879b}
.kb-chat-x{border:0;background:#eef2f7;color:#5a6b82;width:28px;height:28px;border-radius:50%;font-size:16px;cursor:pointer;line-height:1}
.kb-chat-x:hover{background:#ffe4e4;color:#c0392b}
.kb-chat-scope-hint{padding:8px 18px 4px;border-bottom:1px solid #f1f4f9;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:#7a879b}
.kb-scope-pill{border:1px solid #d8e1ee;background:#fff;color:#44566e;border-radius:99px;padding:3px 10px;font-size:12px;cursor:pointer}
.kb-scope-pill.active{background:#e9f1ff;border-color:#9ab7ee;color:#2467c5;font-weight:600}
.kb-chat-msgs{flex:1;overflow:auto;padding:14px 18px;display:flex;flex-direction:column;gap:10px}
.kb-msg{max-width:88%;padding:9px 13px;border-radius:13px;line-height:1.65;font-size:14px;white-space:normal;word-break:break-word}
.kb-msg.user{align-self:flex-end;background:#2467c5;color:#fff;border-bottom-right-radius:4px}
.kb-msg.assistant{align-self:flex-start;background:#f2f6fc;border:1px solid #e6edf7;color:#22344d;border-bottom-left-radius:4px}
.kb-cite{display:inline-block;border:0;background:#dbe9ff;color:#1d5fbe;border-radius:8px;padding:0 5px;margin:0 1px;font-size:12px;cursor:pointer;font-weight:600;vertical-align:1px}
.kb-cite:hover{background:#bcd7ff}
.kb-typing{color:#7a879b;font-style:italic}
.kb-chat-foot{border-top:1px solid #f1f4f9;padding:8px 18px;max-height:148px;overflow:auto;display:none}
.kb-chat-foot.show{display:block}
.kb-foot-title{font-size:12px;color:#7a879b;margin-bottom:6px}
.kb-src-row{display:flex;align-items:baseline;gap:8px;width:100%;text-align:left;border:0;background:transparent;padding:5px 6px;border-radius:8px;cursor:pointer;font:inherit;font-size:13px;color:#34465e}
.kb-src-row:hover{background:#f0f6ff}
.kb-src-row .n{font-weight:700;color:#2467c5}
.kb-src-row .p{color:#2c4d78;font-weight:600}
.kb-src-row .s{color:#7a879b;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kb-chat-inputrow{display:flex;gap:10px;align-items:flex-end;padding:10px 16px 14px;position:relative}
.kb-chat-inputrow textarea{flex:1;resize:none;border:1px solid #d5dfec;border-radius:12px;padding:10px 12px;font:inherit;font-size:14px;line-height:1.5;max-height:120px;min-height:42px;outline:none;background:#fff;color:#22344d}
.kb-chat-inputrow textarea:focus{border-color:#8fb5ee;box-shadow:0 0 0 3px rgba(36,103,197,.12)}
#kb-chat-send{border:0;border-radius:12px;background:#2467c5;color:#fff;padding:11px 18px;font-size:14px;cursor:pointer}
#kb-chat-send:disabled{background:#c3cddb;cursor:not-allowed}
.kb-atmenu{position:absolute;left:16px;bottom:70px;right:16px;background:#fff;border:1px solid #d8e1ee;border-radius:12px;box-shadow:0 14px 44px rgba(15,23,42,.16);max-height:220px;overflow:auto;z-index:5}
.kb-atmenu .kb-at-title{padding:7px 12px 3px;font-size:11px;color:#97a3b4}
.kb-at-opt{display:block;width:100%;text-align:left;border:0;background:#fff;padding:9px 12px;font:inherit;font-size:13px;color:#33455e;cursor:pointer}
.kb-at-opt:hover{background:#eef5ff}
.kb-at-opt .tag{color:#7a879b;font-size:12px}
.kb-chat-srcmodal{position:absolute;inset:0;background:rgba(15,23,42,.24);display:flex;align-items:center;justify-content:center;z-index:8}
.kb-chat-srcmodal .card{background:#fff;border-radius:16px;width:min(620px,92%);max-height:74%;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(15,23,42,.25)}
.kb-chat-srcmodal .card .hd{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #eef2f8}
.kb-chat-srcmodal .card .hd b{font-size:14px;color:#1b2940}
.kb-chat-srcmodal .card .meta{padding:8px 16px;color:#7a879b;font-size:12px;border-bottom:1px solid #f2f5fa}
.kb-chat-srcmodal .card .snip{padding:12px 16px;overflow:auto;font-size:13px;line-height:1.7;color:#33455e;white-space:pre-wrap;word-break:break-word}
.kb-chat-srcmodal .card .ft{padding:10px 16px;border-top:1px solid #f0f4fa;display:flex;justify-content:flex-end;gap:8px}
body.dark #kb-chat-card{background:#151d2c;border-color:#2a3a55}
body.dark .kb-chat-head{border-color:#26344a}
body.dark .kb-chat-head b,body.dark .kb-msg.assistant,body.dark .kb-chat-inputrow textarea,body.dark .kb-chat-srcmodal .card{color:#e7edf7}
body.dark .kb-msg.assistant{background:#1c2940;border-color:#2a3a55}
body.dark .kb-chat-inputrow textarea{background:#10182a;border-color:#33415e}
body.dark .kb-scope-pill{background:#10182a;border-color:#33415e;color:#c8d4e6}
body.dark .kb-atmenu,body.dark .kb-at-opt,body.dark .kb-chat-srcmodal .card{background:#16213a}
body.dark .kb-at-opt{background:#16213a;color:#dce6f5}
body.dark .kb-src-row:hover{background:#1d2c49}
body.dark .kb-chat-foot{border-color:#22314c}
body.dark .kb-chat-scope-hint{border-color:#22314c}
body.dark .kb-chat-srcmodal .card .hd{border-color:#263a5c}
body.dark .kb-chat-srcmodal .card .meta{border-color:#24324e}
body.dark .kb-chat-srcmodal .card .ft{border-color:#24324e}


/* ---- 插件能力：插件 / Skills 双标签（能力中心） ---- */
.cap-sec{margin:24px 0 8px;font-size:15px;color:#22334d;font-weight:700;display:flex;align-items:center;gap:8px}
body.dark .cap-sec{color:#dde6f1}
.cap-count{color:#8a97a9;font-weight:400;font-size:12px}
.cap-kw{flex:1 1 220px}
.cap-tgt{border:1px solid #dbe4f0;background:#f6f9fd;color:#516176;border-radius:99px;padding:5px 11px;font:inherit;font-size:12px;cursor:pointer;margin:4px 6px 0 0;line-height:1.4}
.cap-tgt.on{border-color:#85c9a3;background:#e9f7ef;color:#1f7a4d}
.cap-tgt:disabled{opacity:.55;cursor:default}
body.dark .cap-tgt{background:#1b2532;color:#b7c5d6;border-color:#2c3b4d}
body.dark .cap-tgt.on{background:#12301f;color:#6fd39a;border-color:#2e6b4a}
.cap-msg{margin-top:16px;padding:11px 14px;border-left:3px solid #6ba3ef;background:#f5f9ff;color:#5a7194;font-size:13px;line-height:1.6}
.cap-msg.ok{border-left-color:#3e9e72;background:#f2faf6;color:#23754e}
body.dark .cap-msg{background:#14202e;color:#a8c3e2;border-left-color:#35629c}
body.dark .cap-msg.ok{background:#0f2419;color:#7fd6a6;border-left-color:#2e7a52}
.cap-sub{font-size:13px;color:#5a7194;margin:2px 0 4px;line-height:1.6}
body.dark .cap-sub{color:#93a6bc}
.cap-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px;margin:0 0 8px}
.cap-card{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid #dbe4f0;border-radius:14px;background:#fff;box-shadow:0 1px 4px rgba(16,24,40,.04);min-height:168px}
.cap-card:hover{border-color:#9ab7ee;box-shadow:0 6px 18px rgba(36,103,197,.08)}
body.dark .cap-card{background:#1a2332;border-color:#2c394b;box-shadow:none}
body.dark .cap-card:hover{border-color:#4d8bf0}
.cap-card-top{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}
.cap-card-title{font-size:15px;font-weight:700;color:#172033;line-height:1.35}
body.dark .cap-card-title{color:#e8eef7}
.cap-card-desc{font-size:12.5px;line-height:1.55;color:#5a7194;flex:1}
body.dark .cap-card-desc{color:#9aa9bd}
.cap-card-meta{font-size:11px;color:#8a97a9}
body.dark .cap-card-meta{color:#7f8da2}
.cap-card-actions{display:flex;flex-wrap:wrap;gap:6px;margin-top:auto}
</style></head><body><main class="page" id="app"></main><script>
const app=document.getElementById('app');let state;let selectedLine='knowledge';let contractOpen=false;const LINES=[['knowledge','知识','把本机与授权资料变成可追溯、可检索的知识资产',''],['data','数据','把已验收知识转成可审核、可复现的数据集版本','knowledge'],['model','模型','按硬件安全档调优并登记可复现模型产物','data'],['capability','能力','组合模型、Skills、插件、MCP 和连接器',''],['agent','智能体','把知识和能力固化为可验收的行业智能体','capability'],['system','系统','把智能体装配成 XYOS 或独立本地管理系统','agent'],['deployment','部署','审计、打包、安装、升级和回滚资产链','system']];const STAGES={knowledge:[['attach','挂接数据源','来源已复制进入 XYAI 本地存储'],['inventory','文件盘点','逐文件建立稳定标识和指纹'],['parse','解析清洗','失败文件可见且可重试'],['index','分块索引','保留文件与版本引用'],['memory','记忆蒸馏','可回溯原始证据'],['access','权限与引用','按项目权限过滤']],data:[['collect','样本生成','保留上游知识引用'],['normalize','规范化','格式、单位和术语一致'],['deduplicate','去重检测','重复和冲突已标记'],['review','专家审核','未审样本不能进正式训练集'],['split','冻结分集','训练、验证、盲测隔离']],model:[['plan','训练规划','许可、格式和硬件预算通过'],['train','参数训练','检查点与恢复可用'],['evaluate','基线评测','质量和速度通过阈值'],['package','合并量化','目标推理后端可加载'],['register','模型登记','模型卡与回滚版本完整']],capability:[['compose','能力编排','依赖和权限声明完整'],['sandbox','权限审计','高风险能力须明确授权'],['integration','集成测试','失败回退和结果结构通过'],['bundle','能力打包','可安装、禁用、卸载']],agent:[['define','角色边界','目标、禁区、输出标准明确'],['bind','资源绑定','知识、模型、工具均有版本'],['simulate','场景演练','正反例和异常路径覆盖'],['accept','专家验收','专家确认后进入系统线']],system:[['scaffold','项目生成','写入 XYAI 自有工作区'],['integrate','业务集成','数据、身份、智能体通道连通'],['test','系统测试','权限、迁移与恢复通过'],['build','构建产物','不依赖可变 Harness 界面']],deployment:[['audit','发布审计','资产血缘、许可、密钥检查'],['package','安装打包','按需组件不塞主安装包'],['smoke','安装验证','干净环境核心流程通过'],['release','版本发布','校验值和回滚方案完整']]};const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const time=v=>v?new Date(v).toLocaleString('zh-CN',{hour12:false}):'';const label=id=>LINES.find(x=>x[0]===id)?.[1]||id;const latest=(assets,line)=>assets.filter(x=>x.line===line).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)))[0];
function frame(eyebrow,title,intro,content){app.innerHTML='<div class="eyebrow">'+eyebrow+'</div><h1 class="heading">'+title+'</h1><p class="intro">'+intro+'</p>'+content}
function status(asset){if(!asset)return'待盘点';return asset.status==='ready'?'已验收':asset.status==='needs-improvement'?'待回炉':asset.status==='needs-revalidation'?'待复验':asset.status==='ready-for-review'?'待发布审计':asset.status==='awaiting-training'?'待本地调优':'待构建'}
function factory(){const f=state.factory||{projects:[],assets:[]};const assets=f.assets||[];const project=f.project;const line=LINES.find(x=>x[0]===selectedLine)||LINES[0];const nodes='<div class="grid">'+LINES.map((x,i)=>{const a=latest(assets,x[0]);const c=(x[0]===selectedLine?' active':'')+(a?.status==='ready'?' ready':a?' warn':'');return '<button class="line'+c+'" data-line="'+x[0]+'"><b>'+String(i+1).padStart(2,'0')+'</b>'+x[1]+'<small>'+status(a)+'</small></button>'}).join('')+'</div>';if(!project){frame('XYAI FOUNDRY','七大 AI 生产线','历史成熟生产架构已迁入：每一项资产都有上游依赖、质量门、版本记录与反馈回炉。',nodes+'<section class="card"><div class="head"><h2>先创建本机生产项目</h2></div><p class="muted">项目、数据集、配方、智能体蓝图和部署清单都会写入 XYAI Studio 自有用户数据目录；不会依赖任意外部历史文件夹。</p><form id="project-form" class="form"><div class="row"><label>项目名称<input required name="name" maxlength="120" placeholder="例如：热电运行经验智能体"></label><label>系统基座<select name="systemBase"><option value="standalone">独立本地系统</option><option value="xyos">XYOS 扩展系统</option></select></label></div><label>生产目标<textarea name="goal" maxlength="1000" placeholder="将哪项行业经验沉淀成可验收的智能能力？"></textarea></label><button class="button">创建生产项目</button><div id="factory-result"></div></form></section>');document.querySelectorAll('[data-line]').forEach(b=>b.onclick=()=>{selectedLine=b.dataset.line;factory()});document.getElementById('project-form').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target);const r=document.getElementById('factory-result');try{await window.xyaiFounders.createFactoryProject({name:d.get('name'),goal:d.get('goal'),systemBase:d.get('systemBase')});r.className='success';r.textContent='项目已创建。'}catch(err){r.className='error';r.textContent=err.message||String(err)}};return}
const selected=project.id;const ready=assets.filter(a=>a.status==='ready');const dependency=line[3];const upstream=dependency?ready.filter(a=>a.line===dependency):ready.filter(a=>a.line==='model');const kbs=state.knowledgeAssets||[];const stageHtml=STAGES[selectedLine].map(s=>'<span class="stage"><b>'+s[1]+'</b><br>'+s[2]+'</span>').join('');const card='<section class="card"><div class="head"><div><h2>'+line[1]+'生产线</h2><p class="muted">'+line[2]+'</p></div><span class="pill">'+status(latest(assets,selectedLine))+'</span></div><div class="stages">'+stageHtml+'</div></section>';const projectSelect='<select id="project-select">'+f.projects.map(p=>'<option value="'+p.id+'" '+(p.id===selected?'selected':'')+'>'+esc(p.name)+'</option>').join('')+'</select>';const contract=f.contract;const contractBody=contract?'<div class="note"><b>结果契约 · 第 '+contract.revision+' 版</b><br>目标：'+esc(contract.goal)+'<br>交付：'+esc(contract.deliverable)+'<br>验收：'+esc(contract.acceptance)+'</div>':'';const contractForm=contractOpen?'<form id="contract-form" class="form"><label>生产目标<input required name="goal" value="'+esc(contract?.goal||project.goal||'')+'"></label><label>交付物<input required name="deliverable" value="'+esc(contract?.deliverable||'')+'" placeholder="知识包 / 模型 / 智能体 / 系统 / 安装包"></label><label>验收标准<textarea required name="acceptance">'+esc(contract?.acceptance||'')+'</textarea></label><div class="row"><label>隐私边界<select name="privacy"><option value="local">本地优先</option><option value="hybrid">本地 + 显式云端</option></select></label><label>硬件档<select name="hardwareTier"><option value="basic">基础档</option><option value="professional">专业档</option><option value="workstation">工作站档</option></select></label></div><button class="button">保存结果契约</button><div id="contract-result"></div></form>':'';const inputPart=selectedLine==='knowledge'?'<label>已导入知识资产<select name="knowledgeAssetId"><option value="">选择知识资产…</option>'+kbs.map(k=>'<option value="'+k.id+'">'+esc(k.name)+' · '+k.files.length+' 文件</option>').join('')+'</select></label>':selectedLine==='model'?'<label>本地基础模型<input name="baseModel" required placeholder="模型名、GGUF 或模型目录标识"></label>':dependency?'<label>已验收的'+label(dependency)+'产物<select name="upstream"><option value="">选择上游产物…</option>'+upstream.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select></label>':'<label>可选已验收模型产物<select name="upstream"><option value="">不绑定模型（纯 Skill/MCP 能力）</option>'+upstream.map(a=>'<option value="'+a.id+'">'+esc(a.name)+'</option>').join('')+'</select></label>';const assetForm='<form id="asset-form" class="form"><div class="row"><label>本线产物名称<input name="name" required maxlength="160" placeholder="'+line[1]+'产物名称"></label>'+inputPart+'</div><button class="button">生成并登记本线产物</button><div id="asset-result"></div></form>';const list=assets.filter(a=>a.line===selectedLine).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt)));const records='<div class="list">'+(list.length?list.map(a=>'<div class="item"><div class="item-head"><span>'+esc(a.name)+'</span><span class="pill '+(a.status==='ready'?'':a.status.includes('need')?'issue':'wait')+'">'+status(a)+'</span></div><div class="muted">'+time(a.updatedAt)+' · '+(a.metadata.records?'数据记录 '+a.metadata.records:'产物已登记')+'</div><div class="toolbar"><button class="button danger" data-feedback="'+a.id+'">反馈回炉</button></div></div>').join(''):'<div class="empty">当前项目还没有'+line[1]+'产物。</div>')+'</div>';frame('XYAI FOUNDRY','七大 AI 生产线','生产项目：'+esc(project.name)+'。所有状态均来自本机生产资产图，不是静态演示。',nodes+'<div class="toolbar">'+projectSelect+'<button class="button secondary" id="new-project">新建项目</button><button class="button secondary" id="contract-toggle">'+(contractOpen?'收起契约':'结果契约')+'</button></div>'+contractBody+contractForm+card+'<div class="summary"><div><span>已验收资产</span><strong>'+ready.length+'</strong><span>可进入下游编排</span></div><div><span>当前生产线</span><strong>'+line[1]+'</strong><span>'+status(latest(assets,selectedLine))+'</span></div><div><span>回炉事件</span><strong>'+((f.events||[]).filter(e=>e.kind==='feedback').length)+'</strong><span>按资产血缘回传</span></div></div>'+assetForm+'<div class="toolbar"><h2>本线资产</h2></div>'+records+'<div class="note">模型与智能体产物会先登记为“待本地调优 / 待构建”，不会把尚未真实生成的结果冒充已验收；能力线可以独立组合经审查的 Skill/MCP。</div>');document.querySelectorAll('[data-line]').forEach(b=>b.onclick=()=>{selectedLine=b.dataset.line;factory()});document.getElementById('project-select').onchange=async e=>{await window.xyaiFounders.selectFactoryProject(e.target.value)};document.getElementById('new-project').onclick=()=>{state.factory.project=null;state.factory.projects=[];factory()};document.getElementById('contract-toggle').onclick=()=>{contractOpen=!contractOpen;factory()};const cf=document.getElementById('contract-form');if(cf)cf.onsubmit=async e=>{e.preventDefault();const d=new FormData(cf);const r=document.getElementById('contract-result');try{await window.xyaiFounders.saveFactoryContract({projectId:selected,goal:d.get('goal'),deliverable:d.get('deliverable'),acceptance:d.get('acceptance'),privacy:d.get('privacy'),hardwareTier:d.get('hardwareTier')});r.className='success';r.textContent='结果契约已保存。'}catch(err){r.className='error';r.textContent=err.message||String(err)}};document.getElementById('asset-form').onsubmit=async e=>{e.preventDefault();const d=new FormData(e.target);const r=document.getElementById('asset-result');const upstream=d.get('upstream');try{await window.xyaiFounders.createFactoryAsset({projectId:selected,line:selectedLine,name:d.get('name'),knowledgeAssetId:d.get('knowledgeAssetId'),baseModel:d.get('baseModel'),inputIds:upstream?[upstream]:[]});r.className='success';r.textContent='本线产物已生成并登记。'}catch(err){r.className='error';r.textContent=err.message||String(err)}};document.querySelectorAll('[data-feedback]').forEach(b=>b.onclick=async()=>{const message=window.prompt('请输入将沿资产血缘回传的改进意见：');if(!message)return;try{await window.xyaiFounders.sendFactoryFeedback({projectId:selected,assetId:b.dataset.feedback,message})}catch(err){window.alert(err.message||String(err))}})}

let capTab='plugins';let capFilter='';let capBusy=false;let capFlash='';let capFlashOk=false;
function capShort(rootId){var m={'xyai-dsh':'本应用','codex':'Codex','claude':'Claude','workbuddy':'WorkBuddy','shared':'共享'};return m[rootId]||rootId}
function pluginZh(id){var m={'welcomemode-code':'Welcome 模式 · Code 代码补全','welcomemode-work':'Welcome 模式 · Work 工作台','welcomemode-design':'Welcome 模式 · Design 设计助手','weixinpay':'微信支付','sheetagent':'表格智能体','tencent-docx':'腾讯文档','tencent-pptx':'腾讯幻灯片','mcp-ardot-mcp-app':'Ardot MCP 应用','spreadsheets':'表格处理（Codex Spreadsheets）','remotion':'Remotion 视频生成','plugin-management':'插件管理','openai-developers':'OpenAI 开发者','openai-templates':'OpenAI 模板','codex-app-tools':'Codex 应用工具','skill-library':'技能库管理','welcomemode':'Welcome 模式','playwright-cli':'Playwright 自动化','browser-use':'浏览器自动化','browser':'浏览器自动化（Codex Browser）'};return m[id]||''}
function capStatBar(cat){
  var imported=cat.plugins.filter(function(p){return p.imported}).length;
  return '<div class="summary"><div><strong>'+cat.skills.length+'</strong><span>本机已识别 Skills</span></div><div><strong>'+cat.plugins.length+'</strong><span>本机已识别插件</span></div><div><strong>'+cat.builtins.length+'</strong><span>出厂能力</span></div><div><strong>'+imported+'</strong><span>已导入本应用</span></div></div><div class="cap-sub">自动扫描 DSH / Codex / Claude / WorkBuddy 等本机智能体软件的插件与 Skills；支持分类卡片浏览、一键安装到目标软件，以及从本机文件夹导入。识别与导入只在本机完成，不上传你的文件。</div>'
}
function capPluginCardHtml(p){
  var zh=pluginZh(p.id);var title=esc(zh!==''?zh:(p.displayName||p.id));
  var summary=esc(p.summary||(zh!==''?(p.displayName||p.id):'已识别的本机插件包'));
  var ver=p.version?' · v'+esc(p.version):'';
  var status=p.imported?(p.managed?'已导入本应用':'本应用已有副本'):'可导入';
  var actions='';
  if(p.path)actions+='<button class="button secondary cap-open" data-path="'+esc(p.path)+'">打开目录</button>';
  if(p.path&&!p.imported)actions+='<button class="button cap-plugin-import" data-path="'+esc(p.path)+'">导入到本应用</button>';
  if(p.imported&&p.managed)actions+='<button class="button danger cap-plugin-remove" data-dir="'+esc(p.id)+'">移除导入</button>';
  if(p.imported&&p.importDestination)actions+='<button class="button secondary cap-open" data-path="'+esc(p.importDestination)+'">打开副本</button>';
  return '<article class="cap-card"><div class="cap-card-top"><div class="cap-card-title">🧩 '+title+'</div><span class="pill">'+(p.imported?'✓ ':'')+esc(status)+'</span></div><div class="cap-card-desc">'+summary+'</div><div class="cap-card-meta">来源：'+esc(p.sourceLabel)+ver+(p.kind?' · '+esc(String(p.kind).replace(/^[._]+/,'')):'')+'</div><div class="cap-card-actions">'+actions+'</div></article>'
}
function capBuiltinCardHtml(b){
  return '<article class="cap-card"><div class="cap-card-top"><div class="cap-card-title">✨ '+esc(b.zhName)+'</div><span class="pill">出厂</span></div><div class="cap-card-desc">'+esc(b.zhDesc)+'</div><div class="cap-card-meta">'+esc(b.name)+' · '+esc(b.category)+'</div></article>'
}
function capPluginsHtml(cat){
  var kw=(capFilter||'').toLowerCase();
  var out=capStatBar(cat);
  out+='<div class="filterbar"><input id="cap-kw" class="cap-kw" placeholder="搜索插件名称 / 说明 / 来源…" value="'+esc(capFilter)+'"><button class="button secondary" data-cap-import-plugin="1">＋ 导入本机插件文件夹</button><span class="cap-count">插件 '+cat.plugins.length+' · 出厂 '+cat.builtins.length+'</span></div>';
  var builtins=cat.builtins.filter(function(b){return !kw||(b.zhName+' '+b.zhDesc+' '+b.name+' '+b.category).toLowerCase().indexOf(kw)>=0});
  if(builtins.length){
    var groups={};
    builtins.forEach(function(b){(groups[b.category]=groups[b.category]||[]).push(b)});
    Object.keys(groups).forEach(function(sec){
      out+='<div class="cap-sec">'+esc(sec)+'<span class="cap-count">'+groups[sec].length+' 项</span></div><div class="cap-cards">'+groups[sec].map(capBuiltinCardHtml).join('')+'</div>'
    });
  }
  var external=cat.plugins.filter(function(p){return !kw||((p.displayName||'')+' '+(p.summary||'')+' '+p.id+' '+p.sourceLabel+' '+(pluginZh(p.id)||'')).toLowerCase().indexOf(kw)>=0});
  var agents=[];var seen={};
  external.forEach(function(p){if(!seen[p.sourceLabel]){seen[p.sourceLabel]=true;agents.push(p.sourceLabel)}});
  if(!external.length)out+='<div class="empty">'+(kw?'没有匹配“'+esc(capFilter)+'”的插件。':'Codex / Claude / WorkBuddy / DSH 暂未发现可解析的插件清单。可点上方「导入本机插件文件夹」。')+'</div>';
  agents.forEach(function(label){
    var items=external.filter(function(p){return p.sourceLabel===label});
    out+='<div class="cap-sec">🔌 '+esc(label)+'<span class="cap-count">'+items.length+' 项</span></div><div class="cap-cards">'+items.map(capPluginCardHtml).join('')+'</div>'
  });
  out+=capMcpHtml();
  return out
}
function capMcpHtml(){
  var rows=(state.plugins&&state.plugins.length)?state.plugins.map(function(p){return '<div class="item"><div class="item-head"><span>'+esc(p.name)+'</span><span class="pill">'+esc(p.status)+'</span></div><div class="muted">'+esc(p.command)+' · '+(p.credentialNames&&p.credentialNames.length?'需要 '+esc(p.credentialNames.join(', ')):'不需要密钥')+'</div></div>'}).join(''):'<div class="empty">尚无插件审查记录。</div>';
  var form='<form class="form" id="plugin-form"><div class="row"><label>插件名称<input name="name" required maxlength="120"></label><label>命令<input name="command" required placeholder="例如：node"></label></div><div class="row"><label>参数（空格分隔）<input name="args"></label><label>密钥变量（逗号分隔）<input name="credentials" placeholder="EXAMPLE_API_KEY"></label></div><button class="button">提交审查</button><div id="plugin-result"></div></form>';
  return '<div class="cap-sec">MCP 服务审查登记（本应用内）</div><div class="list">'+rows+'</div>'+form
}
function plugins(){renderCapPage()}
function renderCapPage(){
  var cat=state.agentCatalog||null;
  if(cat)capBusy=false;
  var tabBtn=function(key,label){return '<button class="filterchip'+(capTab===key?' on':'')+'" data-captab="'+key+'">'+label+'</button>'};
  var intro='自动识别本机已安装智能体软件（XYAI/DSH、Codex、Claude、WorkBuddy）的插件与 Skills，按来源分类成卡片；支持安装到目标软件，或从本机文件夹导入。';
  var flashHtml=capFlash!==''?'<div class="cap-msg'+(capFlashOk?' ok':'')+'">'+esc(capFlash)+'</div>':'';
  frame('XYAI EXTENSIONS','插件能力',intro,'<div class="filterbar">'+tabBtn('plugins','🧩 插件')+tabBtn('skills','🛠️ Skills 技能')+'<button class="filterchip" data-caprefresh="1"'+(capBusy?' disabled':'')+'>'+(capBusy?'识别中…':'↻ 重新识别')+'</button></div>'+flashHtml+'<div id="cap-body"></div>');
  var body=document.getElementById('cap-body');
  if(!body)return;
  if(capBusy){body.innerHTML='<div class="empty">正在识别本机已安装的智能体软件与技能，首次约需数秒…</div>';bindCapCommon();return}
  if(!cat){
    capBusy=true;renderCapPage();
    window.xyaiFounders.agentCatalogRefresh().catch(function(){capBusy=false;capFlash='识别失败，请稍后重试。';capFlashOk=false;renderCapPage()});
    return
  }
  body.innerHTML=capTab==='skills'?capSkillsHtml(cat):capPluginsHtml(cat);
  bindCapCommon();
  if(capTab==='skills')bindCapSkills(cat);else bindCapPlugins()
}
function bindCapCommon(){
  var refresh=document.querySelector('[data-caprefresh]');
  if(refresh&&!refresh.disabled)refresh.onclick=function(){capBusy=true;capFlash='';renderCapPage();window.xyaiFounders.agentCatalogRefresh().catch(function(){capBusy=false;capFlash='重新识别失败，请稍后重试。';capFlashOk=false;renderCapPage()})};
  document.querySelectorAll('[data-captab]').forEach(function(b){b.onclick=function(){capTab=b.dataset.captab;capFilter='';capFlash='';renderCapPage()}});
  var kw=document.getElementById('cap-kw');
  if(kw){kw.oninput=function(){capFilter=kw.value;var body=document.getElementById('cap-body');var cat=state.agentCatalog;if(body&&cat){body.innerHTML=capTab==='skills'?capSkillsHtml(cat):capPluginsHtml(cat);if(capTab==='skills')bindCapSkills(cat);else bindCapPlugins();var again=document.getElementById('cap-kw');if(again){again.value=capFilter;again.focus()}}}}
  var importSkill=document.querySelector('[data-cap-import-skill]');
  if(importSkill)importSkill.onclick=async function(){try{var o=await window.xyaiFounders.agentSkillImportLocal();if(o&&o.cancelled)return;capFlash=o&&o.message?o.message:'已导入技能。';capFlashOk=!!(o&&o.ok)}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()};
  var importPlugin=document.querySelector('[data-cap-import-plugin]');
  if(importPlugin)importPlugin.onclick=async function(){try{var o=await window.xyaiFounders.agentPluginImportLocal();if(o&&o.cancelled)return;capFlash=o&&o.message?o.message:'已导入插件。';capFlashOk=!!(o&&o.ok)}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}
}
function capTargetButtons(s){
  var home=s.installState.find(function(t){return t.rootId===s.agentId});
  return s.installState.map(function(t){
    var isSource=home&&t.rootId===home.rootId;
    var canRemove=t.installed&&t.managed&&!isSource;
    var label=capShort(t.rootId);
    var cls=t.installed?' on':'';
    var title=t.installed?(canRemove?'已安装到'+label+'（本页装入的副本，点击可移除）':'已安装到'+label):(isSource?'来自'+label+'（本处）':'安装到'+label);
    if(isSource)return '<span class="cap-tgt on" title="'+title+'" style="cursor:default">📍 '+esc(label)+' 来源</span>';
    return '<button class="cap-tgt'+cls+'" data-tgt-skill="'+esc(s.path)+'" data-tgt-root="'+esc(t.rootId)+'" data-tgt-dir="'+esc(t.dirName)+'"'+(canRemove?' data-tgt-remove="1"':' data-tgt-install="1"')+' title="'+title+'">'+(t.installed?'✓ ':'＋ ')+esc(label)+(canRemove?'（移除）':t.installed?'（已装）':'')+'</button>'
  }).join('')
}
function capSkillCardHtml(s){
  var name=esc(s.displayName||s.id);
  var desc=esc(s.descriptionZh||s.description||'(该技能未附说明)');
  var meta='目录：'+esc(s.dir)+(s.version?' · v'+esc(s.version):'')+' · 来源：'+esc(s.sourceLabel);
  return '<article class="cap-card"><div class="cap-card-top"><div class="cap-card-title">🛠️ '+name+'</div><span class="pill">'+esc(s.sourceLabel)+'</span></div><div class="cap-card-desc">'+desc+'</div><div class="cap-card-meta">'+meta+(s.id&&s.id!==s.displayName?' · id '+esc(s.id):'')+'</div><div class="cap-card-actions">'+capTargetButtons(s)+'</div></article>'
}
function capSkillsHtml(cat){
  var kw=(capFilter||'').toLowerCase();
  var all=cat.skills.filter(function(s){return !kw||(s.displayName+' '+(s.descriptionZh||'')+' '+(s.description||'')+' '+s.id+' '+s.sourceLabel).toLowerCase().indexOf(kw)>=0});
  var agents=[];var seen={};
  all.forEach(function(s){if(!seen[s.sourceLabel]){seen[s.sourceLabel]=true;agents.push(s.sourceLabel)}});
  var filterBox=capStatBar(cat)+'<div class="filterbar"><input id="cap-kw" class="cap-kw" placeholder="搜索技能名称 / 中文说明 / 来源…" value="'+esc(capFilter)+'"><button class="button secondary" data-cap-import-skill="1">＋ 导入本机 Skills 文件夹</button><span class="cap-count">共 '+all.length+' 个技能</span></div>';
  if(!cat.skills.length)return filterBox+'<div class="empty">本机各软件暂未识别到技能目录。可点「导入本机 Skills 文件夹」，或在各软件 skills 目录放置含 SKILL.md 的技能后点“重新识别”。</div>';
  var bodyHtml=agents.map(function(label){
    var items=all.filter(function(s){return s.sourceLabel===label});
    return '<div class="cap-sec">📂 '+esc(label)+'<span class="cap-count">'+items.length+' 项</span></div><div class="cap-cards">'+items.map(capSkillCardHtml).join('')+'</div>'
  }).join('');
  if(!all.length)bodyHtml='<div class="empty">没有匹配“'+esc(capFilter)+'”的技能。</div>';
  return filterBox+bodyHtml
}
function bindCapPlugins(){
  document.querySelectorAll('.cap-open').forEach(function(b){b.onclick=async function(){try{await window.xyaiFounders.agentOpenPath(b.dataset.path);capFlash='已打开所在目录。';capFlashOk=true}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}});
  document.querySelectorAll('.cap-plugin-import').forEach(function(b){b.onclick=async function(){b.disabled=true;b.textContent='导入中…';try{var o=await window.xyaiFounders.agentPluginInstall({sourceDir:b.dataset.path});capFlash=o&&o.message?o.message:'已导入。';capFlashOk=!!(o&&o.ok)}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}});
  document.querySelectorAll('.cap-plugin-remove').forEach(function(b){b.onclick=async function(){b.disabled=true;b.textContent='移除中…';try{var o=await window.xyaiFounders.agentPluginRemove({dirName:b.dataset.dir});capFlash=o&&o.message?o.message:'已移除。';capFlashOk=!!(o&&o.ok)}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}});
  var form=document.getElementById('plugin-form');
  if(form)form.onsubmit=async function(e){e.preventDefault();var d=new FormData(form);var r=document.getElementById('plugin-result');try{await window.xyaiFounders.registerPlugin({name:d.get('name'),command:d.get('command'),args:String(d.get('args')||'').split(/\s+/).filter(Boolean),credentialNames:String(d.get('credentials')||'').split(',').map(function(x){return x.trim()}).filter(Boolean)});capFlash='已提交 MCP 审查登记。';capFlashOk=true}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}
}
function bindCapSkills(cat){
  document.querySelectorAll('[data-tgt-install]').forEach(function(b){b.onclick=async function(){b.disabled=true;b.textContent='安装中…';try{var o=await window.xyaiFounders.agentSkillInstall({sourceDir:b.dataset.tgtSkill,targetRootId:b.dataset.tgtRoot});capFlash=o&&o.message?o.message:'已安装。';capFlashOk=!!(o&&o.ok)}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}});
  document.querySelectorAll('[data-tgt-remove]').forEach(function(b){b.onclick=async function(){b.disabled=true;b.textContent='移除中…';try{var o=await window.xyaiFounders.agentSkillRemove({targetRootId:b.dataset.tgtRoot,dirName:b.dataset.tgtDir});capFlash=o&&o.message?o.message:'已移除。';capFlashOk=!!(o&&o.ok)}catch(err){capFlash=err.message||String(err);capFlashOk=false}renderCapPage()}})
}
const kbPrefs={open:{},filters:{},keywords:{}};
const kbWizard={open:false,step:1,path:'',result:null,busy:false,error:'',ok:''};
function fmtBytes(n){n=n||0;if(n>=1048576)return (n/1048576).toFixed(1)+' MB';if(n>=1024)return (n/1024).toFixed(1)+' KB';return n+' B'}
function kbIcon(s){return s==='ready'?'✔️':s==='failed'?'❌':s==='parsing'?'⏳':'⏸️'}
function kbBadge(s){if(s==='ready')return '<span class="pill">已就绪</span>';if(s==='failed')return '<span class="pill issue">失败</span>';if(s==='parsing')return '<span class="pill wait">解析中</span>';return '<span class="pill wait">待解析</span>'}
function kbMountStatus(s){if(s==='offline')return '离线';if(s==='permission-denied')return '无权限';return '已挂接'}
const kbToast=(function(){let el=null;let timer=null;return function(msg){if(!el){el=document.createElement('div');el.id='kb-toast';document.body.appendChild(el)}el.textContent=msg;el.classList.add('show');if(timer)clearTimeout(timer);timer=setTimeout(function(){el.classList.remove('show')},3200)}})();
function knowledge(){
const mounts=state.knowledgeMounts||[];const assets=state.knowledgeAssets||[];
const parseBox=function(id){const entry=((state.knowledgeParse||{})[id]||{});return {scanning:!!entry.scanning,busy:!!entry.busy,lastError:entry.lastError||'',summary:entry.summary||{total:0,pending:0,parsing:0,ready:0,failed:0}}};
const mountHtml=mounts.length?mounts.map(function(m){const p=parseBox(m.id);const s=p.summary;const chips='<div class="parse-chips"><span class="pill">就绪 '+s.ready+'</span><span class="pill wait">待解析 '+s.pending+'</span><span class="pill wait">解析中 '+s.parsing+'</span><span class="pill issue">失败 '+s.failed+'</span>'+(p.scanning?'<span class="pill wait">扫描中…</span>':'')+(p.busy&&!p.scanning?'<span class="pill wait">处理中…</span>':'')+'</div>';const stCls=m.status==='offline'||m.status==='permission-denied'?' issue':'';return '<div class="item"><div class="item-head"><span>📁 '+esc(m.name)+'</span><span class="pill'+stCls+'">'+kbMountStatus(m.status)+'</span></div><div class="muted">'+esc(m.rootPath)+' · 挂接于 '+time(m.mountedAt)+'</div>'+(p.lastError?'<div class="error">'+esc(p.lastError)+'</div>':'')+chips+'<div class="toolbar"><button class="button secondary" data-expand="'+m.id+'">展开目录</button><button class="button secondary" data-parse="'+m.id+'">'+(kbPrefs.open[m.id]?'收起':'解析中心')+'</button><button class="button secondary" data-rescan="'+m.id+'"'+(p.scanning||p.busy?' disabled':'')+'>'+(p.scanning?'扫描中…':'重新扫描')+'</button><button class="button secondary" data-retry="'+m.id+'"'+(s.failed>0?'':' disabled')+'>重试失败</button><button class="button danger" data-unmount="'+m.id+'">解除挂接</button></div><div id="tree-'+m.id+'"></div><div id="parse-'+m.id+'"></div></div>'}).join(''):'<div class="empty">还没有挂接的文件夹。点上方「＋ 挂接本地文件夹」选一个目录即可：文件只在本机解析，不上传。</div>';
const assetHtml=assets.length?assets.map(function(a){return '<div class="item"><div class="item-head"><span>📄 '+esc(a.name)+'</span><span class="pill">'+a.files.length+' 个文件</span></div><div class="muted">'+fmtBytes(a.totalBytes)+' · '+time(a.importedAt)+'</div></div>'}).join(''):'<div class="empty">还没有复制型知识资产。</div>';
const intro='挂接后系统自动在本机静默解析，不上传任何文件：文档逐个从「待解析」变成「已就绪」，之后可被对话引用。支持整个盘符或任意文件夹；新增或修改的文件会被自动跟踪解析。';
frame('XYAI KNOWLEDGE','知识库',intro,'<div class="toolbar"><button id="mount-knowledge" class="button">＋ 挂接本地文件夹</button><button id="import-knowledge" class="button secondary">复制导入知识文件</button><button id="ima-mount-open" class="button secondary" title="挂接 ima 云知识库，只读列表、不下载不解析" onclick="imaMountOpen()">☁ 挂接 ima 云知识库</button><button id="kb-chat-open" class="button secondary" title="基于本机已就绪语料提问，文件不上传" onclick="kbChatOpen()">💬 知识问答</button></div><div id="kb-wizard-slot"></div>'+(kbWizard.ok?'<div class="success" style="margin:12px 0">'+esc(kbWizard.ok)+'</div>':'')+'<h2>本地挂接源 · 解析中心</h2><div class="list">'+mountHtml+'</div><div class="note">解析范围：txt / md / json / csv / docx / pdf 等常见格式自动抽取；无文字层的扫描版 PDF 会保留失败原因，后续由本机 OCR 接手。就绪语料只保存在本机 XYAI 数据目录。系统默认自动跳过 .git、node_modules、回收站等目录，避免把系统文件当资料。</div><h2>云知识库 · ima 只读借阅</h2><div id="ima-section"></div><h2>复制型知识资产</h2><div class="list">'+assetHtml+'</div>');
kbWizard.ok='';
renderKnowledgeWizard();
renderImaSection();
bindKnowledgeEvents();
const openIds=mounts.map(function(m){return m.id}).filter(function(id){return kbPrefs.open[id]});
openIds.forEach(function(id){const b=document.querySelector('[data-parse="'+id+'"]');if(b)b.textContent='收起';void renderParse(id)});
}

function renderKnowledgeWizard(){
const slot=document.getElementById('kb-wizard-slot');if(!slot)return;
if(!kbWizard.open){slot.innerHTML='';return}
let body='';let actions='';
if(kbWizard.step===1){
body='<p class="muted">把本机的一个文件夹（或整个盘符）挂成知识库。挂接后文件只在你电脑上被扫描解析，不会上传云端。</p><div class="pathrow"><input id="kb-wiz-path" value="'+esc(kbWizard.path)+'" placeholder="在这里粘贴文件夹路径" spellcheck="false"></div><p class="muted">也可以点「浏览文件夹…」直接挑选。首次挂接大目录时会先扫描一阵子，属正常现象。</p>'+(kbWizard.error?'<div class="error">'+esc(kbWizard.error)+'</div>':'');
actions='<button class="button secondary" data-wz="cancel">取消</button><button class="button secondary" id="kb-wiz-browse">浏览文件夹…</button><button class="button" id="kb-wiz-next">下一步：检查目录</button>';
}else if(kbWizard.step===2){
const r=kbWizard.result;
if(kbWizard.busy){body='<div class="muted">正在检查该目录…</div>'}
if(!kbWizard.busy&&r){
const lines=[];
lines.push('<div class="item-head"><span>📁 '+esc(r.rootPath)+'</span></div>');
lines.push('<div class="item"><span class="success">✓ 已找到该文件夹</span></div>');
if(r.readable===false)lines.push('<div class="item"><span class="error">✗ 没有读取权限：请换成你有权限打开的文件夹</span></div>');
if(r.alreadyMounted)lines.push('<div class="item"><span class="pill issue">已挂接</span><span class="muted"> 该文件夹已作为「'+esc(r.alreadyMounted.name)+'」挂接，无需重复添加。</span></div>');
const warns=r.warnings||[];
if(warns.length){lines.push('<div class="item"><b>挂接前提示</b></div>');warns.forEach(function(w){lines.push('<div class="muted">· '+esc(w)+'</div>')})}
body='<div class="list">'+lines.join('')+'</div><p class="muted">确认后系统会开始扫描并逐个解析文档（txt / md / json / csv / docx / pdf）。随时可以在列表里「重新扫描」或「重试失败」。</p>'+(kbWizard.error?'<div class="error">'+esc(kbWizard.error)+'</div>':'');
}
actions='<button class="button secondary" data-wz="back">上一步</button><button class="button secondary" data-wz="cancel">取消</button><button class="button" id="kb-wiz-mount"'+(kbWizard.busy||!r||!r.exists||r.readable===false||r.alreadyMounted?' disabled':'')+'>确认挂接并开始解析</button>';
}else{
body='<div class="muted">正在建立索引并开始解析…首次扫描较大的目录需要一点时间，稍后在列表顶部可以看到每个库的进度。</div>';
actions='<button class="button secondary" data-wz="cancel">关闭</button>';
}
slot.innerHTML='<div class="card kb-wizard"><div class="head"><h2>挂接本地文件夹</h2></div><div class="wizard-steps"><span class="wstep'+(kbWizard.step===1?' on':'')+'"><b>1</b>选文件夹</span><span class="wstep'+(kbWizard.step===2?' on':'')+'"><b>2</b>检查目录</span><span class="wstep'+(kbWizard.step>=3?' on':'')+'"><b>3</b>开始解析</span></div>'+body+'<div class="toolbar">'+actions+'</div></div>';
bindWizard();
}
function bindWizard(){
const br=document.getElementById('kb-wiz-browse');
if(br)br.onclick=async function(){try{const picked=await window.xyaiFounders.knowledgePickDirectory();if(picked){kbWizard.path=picked;const inp=document.getElementById('kb-wiz-path');if(inp)inp.value=picked;kbWizard.error=''}}catch(e){kbWizard.error=e.message||String(e);renderKnowledgeWizard()}};
const inp=document.getElementById('kb-wiz-path');
if(inp)inp.oninput=function(){kbWizard.path=inp.value.trim()};
const nx=document.getElementById('kb-wiz-next');
if(nx)nx.onclick=async function(){const path=(inp?inp.value.trim():kbWizard.path.trim());kbWizard.path=path;if(!path){kbWizard.error='请先填写或选择要挂接的文件夹路径';renderKnowledgeWizard();return}kbWizard.error='';kbWizard.step=2;kbWizard.busy=true;kbWizard.result=null;renderKnowledgeWizard();try{const r=await window.xyaiFounders.knowledgePrecheck(path);kbWizard.result=r;kbWizard.busy=false;if(!r||!r.exists){kbWizard.error=r&&r.isDirectory===false?'该路径不是文件夹，请重新选择':'没有找到这个文件夹，请检查路径后重试'}else if(r.readable===false){kbWizard.error='该文件夹没有读取权限，请换成有权限的文件夹'}renderKnowledgeWizard()}catch(e){kbWizard.busy=false;kbWizard.error=e.message||String(e);renderKnowledgeWizard()}};
const bk=document.querySelector('[data-wz="back"]');if(bk)bk.onclick=function(){kbWizard.step=1;kbWizard.error='';kbWizard.result=null;renderKnowledgeWizard()};
const cl=document.querySelector('[data-wz="cancel"]');if(cl)cl.onclick=function(){kbWizard.open=false;kbWizard.step=1;kbWizard.error='';kbWizard.result=null;renderKnowledgeWizard()};
const mt=document.getElementById('kb-wiz-mount');
if(mt)mt.onclick=async function(){if(!kbWizard.result)return;kbWizard.busy=true;kbWizard.step=3;kbWizard.error='';renderKnowledgeWizard();try{await window.xyaiFounders.knowledgeMountPath(kbWizard.path);kbWizard.open=false;kbWizard.step=1;kbWizard.path='';kbWizard.result=null;kbWizard.ok='挂接成功：已在后台开始扫描解析，文档会逐个从「待解析」变成「已就绪」。';const st=await window.xyaiFounders.getState();render(st)}catch(e){kbWizard.busy=false;kbWizard.step=2;kbWizard.error=e.message||String(e);renderKnowledgeWizard()}};
}
async function renderParse(id){
const box=document.getElementById('parse-'+id);if(!box)return;
const prefs=kbPrefs.filters[id]||'all';const kw=(kbPrefs.keywords[id]||'').toLowerCase();
box.innerHTML='<div class="muted">读取解析清单…</div>';
try{
const files=await window.xyaiFounders.knowledgeParseFiles(id);
if(!files||!files.length){box.innerHTML='<div class="empty">还没有可解析文档。挂接后系统会自动扫描并解析；当前不支持的格式不会出现在这里。</div>';return}
const total=files.length;const ready=files.filter(function(f){return f.status==='ready'}).length;const pend=files.filter(function(f){return f.status==='pending'||f.status==='parsing'}).length;const failed=files.filter(function(f){return f.status==='failed'}).length;
let list=files;
if(prefs==='ready')list=list.filter(function(f){return f.status==='ready'});
if(prefs==='pending')list=list.filter(function(f){return f.status==='pending'||f.status==='parsing'});
if(prefs==='failed')list=list.filter(function(f){return f.status==='failed'});
if(kw)list=list.filter(function(f){return f.relPath.toLowerCase().indexOf(kw)>=0});
const chip=function(label,key,count,on){return '<button class="filterchip'+(on?' on':'')+'" data-f="'+key+'">'+label+' '+count+'</button>'};
let rows='';
if(list.length){
rows='<div class="list">'+list.map(function(f){
const rel=esc(f.relPath);
const meta=[fmtBytes(f.bytes),f.status==='ready'?(f.characters+' 字'+(f.truncated?'（已截断）':'')):'',f.parsedAt?time(f.parsedAt):''].filter(function(x){return !!x}).join(' · ');
return '<div class="item"><div class="item-head"><span>'+kbIcon(f.status)+' '+rel+'</span>'+kbBadge(f.status)+'</div><span class="docmeta muted">'+meta+'</span>'
+(f.status==='failed'?'<div class="muted issue">'+(f.error?esc(f.error):'解析失败，可点上方「重试失败」重新尝试。')+'</div>':'')
+(f.status==='pending'?'<div class="muted">等待解析…挂接完成后会自动逐个处理，也可点上方「重新扫描」立即处理。</div>':'')
+(f.status==='ready'?'<div class="toolbar"><button class="button secondary" data-preview="'+id+'" data-path="'+rel+'">预览语料</button></div>':'')
+'<pre class="pvbox" id="pv-'+id+'-'+encodeURIComponent(f.relPath)+'" style="display:none"></pre></div>'}).join('')+'</div>';
}else{rows='<div class="empty">没有符合当前筛选的文件。</div>'}
box.innerHTML='<div class="summary"><div><strong>'+total+'</strong><span>已登记</span></div><div><strong>'+ready+'</strong><span>已就绪</span></div><div><strong>'+pend+'</strong><span>待处理</span></div><div><strong>'+failed+'</strong><span>失败</span></div></div><div class="filterbar">'+chip('全部','all',total,prefs==='all')+chip('已就绪','ready',ready,prefs==='ready')+chip('待处理','pending',pend,prefs==='pending')+chip('失败','failed',failed,prefs==='failed')+'<input id="kb-kw-'+id+'" value="'+esc(kbPrefs.keywords[id]||'')+'" placeholder="按文件名搜索…"></div>'+rows;
bindParsePanel(id);
}catch(e){box.innerHTML='<div class="error">读取解析清单失败：'+esc(e.message||String(e))+'</div>'}
}
function bindParsePanel(id){
const box=document.getElementById('parse-'+id);if(!box)return;
box.querySelectorAll('[data-preview]').forEach(function(b){b.onclick=async function(){const pv=document.getElementById('pv-'+b.dataset.preview+'-'+encodeURIComponent(b.dataset.path));if(!pv)return;if(pv.style.display!=='none'){pv.style.display='none';return}pv.style.display='block';pv.textContent='读取中…';try{const text=await window.xyaiFounders.knowledgeParsePreview(b.dataset.preview,b.dataset.path);pv.textContent=(text===undefined||text==='')?'（暂无可用语料）':text}catch(e){pv.textContent='预览失败：'+(e.message||String(e))}}});
box.querySelectorAll('[data-f]').forEach(function(b){b.onclick=function(){kbPrefs.filters[id]=b.dataset.f;void renderParse(id)}});
const kw=document.getElementById('kb-kw-'+id);
if(kw)kw.oninput=function(){kbPrefs.keywords[id]=kw.value;if(window.__kbKwTimer)clearTimeout(window.__kbKwTimer);window.__kbKwTimer=setTimeout(function(){void renderParse(id);requestAnimationFrame(function(){const el=document.getElementById('kb-kw-'+id);if(el){el.focus();const v=el.value;try{el.setSelectionRange(v.length,v.length)}catch(e){}}})},400)};
}
async function renderTree(id,path,box){
try{
const nodes=await window.xyaiFounders.listKnowledgeChildren(id,path);
box.innerHTML='<div class="list">'+nodes.map(function(n){
if(n.kind==='directory')return '<div class="item"><button class="button secondary" data-dir="'+id+'" data-path="'+esc(n.path)+'">📁 '+esc(n.name)+'</button><div id="node-'+id+'-'+encodeURIComponent(n.path)+'"></div></div>';
return '<div class="item"><button class="button secondary" data-file="'+id+'" data-path="'+esc(n.path)+'">📄 '+esc(n.name)+'</button><span class="docmeta muted">'+fmtBytes(n.bytes||0)+'</span><pre class="pvbox" id="file-'+id+'-'+encodeURIComponent(n.path)+'" style="display:none"></pre></div>'}).join('')+'</div>';
box.querySelectorAll('[data-dir]').forEach(function(b){b.onclick=function(){void renderTree(b.dataset.dir,b.dataset.path,document.getElementById('node-'+b.dataset.dir+'-'+encodeURIComponent(b.dataset.path)))}});
box.querySelectorAll('[data-file]').forEach(function(b){b.onclick=async function(){const pre=document.getElementById('file-'+b.dataset.file+'-'+encodeURIComponent(b.dataset.path));if(!pre)return;if(pre.style.display!=='none'){pre.style.display='none';return}pre.style.display='block';pre.textContent='读取中…';try{pre.textContent=await window.xyaiFounders.readMountedKnowledge(b.dataset.file,b.dataset.path)}catch(e){pre.textContent='读取失败：'+(e.message||String(e))}}});
}catch(e){box.innerHTML='<div class="error">'+esc(e.message||String(e))+'</div>'}
}
function bindKnowledgeEvents(){
const mb=document.getElementById('mount-knowledge');
if(mb)mb.onclick=function(){kbWizard.open=!kbWizard.open;kbWizard.error='';renderKnowledgeWizard()};
const im=document.getElementById('import-knowledge');
if(im)im.onclick=async function(){try{await window.xyaiFounders.importKnowledge();kbToast('已导入到「复制型知识资产」。')}catch(e){kbToast(e.message||String(e))}};
document.querySelectorAll('[data-expand]').forEach(function(b){b.onclick=function(){const box=document.getElementById('tree-'+b.dataset.expand);if(box)void renderTree(b.dataset.expand,'',box)}});
document.querySelectorAll('[data-parse]').forEach(function(b){b.onclick=function(){const id=b.dataset.parse;const box=document.getElementById('parse-'+id);if(!box)return;if(kbPrefs.open[id]){kbPrefs.open[id]=false;box.innerHTML='';b.textContent='解析中心'}else{kbPrefs.open[id]=true;b.textContent='收起';void renderParse(id)}}});
document.querySelectorAll('[data-rescan]').forEach(function(b){b.onclick=async function(){try{await window.xyaiFounders.knowledgeParseRefresh(b.dataset.rescan);kbToast('已开始重新扫描该目录…')}catch(e){kbToast(e.message||String(e))}}});
document.querySelectorAll('[data-retry]').forEach(function(b){b.onclick=async function(){try{const n=await window.xyaiFounders.knowledgeParseRetryFailed(b.dataset.retry);kbToast(n>0?('已重试 '+n+' 个失败文件。'):'没有可重试的失败文件。')}catch(e){kbToast(e.message||String(e))}}});
document.querySelectorAll('[data-unmount]').forEach(function(b){b.onclick=async function(){const mu=(state.knowledgeMounts||[]).find(function(x){return x.id===b.dataset.unmount});const label=mu?mu.name:b.dataset.unmount;try{await window.xyaiFounders.unmountKnowledge(b.dataset.unmount);delete kbPrefs.open[b.dataset.unmount];delete kbPrefs.filters[b.dataset.unmount];delete kbPrefs.keywords[b.dataset.unmount];kbToast('已解除挂接「'+label+'」（语料保留在本机）。')}catch(e){kbToast(e.message||String(e))}}}) ;
}
function account(){const a=state.account;const detail=a.authenticated?'<div class="note">当前已登录：<b>'+esc(a.nickname||a.email)+'</b>。认证令牌只留在桌面主进程。</div>':'<form id="account-form" class="form"><div class="row"><label>邮箱<input type="email" name="email" required></label><label>密码<input type="password" name="password" minlength="6" required></label></div><div class="row"><label>昵称（注册可选）<input name="nickname"></label><label>组织名称（注册可选）<input name="company"></label></div><div><button class="button" name="mode" value="login">登录</button> <button class="button secondary" name="mode" value="register">注册并登录</button></div><div id="account-result"></div></form>';frame('XYAI ACCOUNT','登录 / 注册','账号认证由本地 XYOS 后端完成，开发空间与业务空间共用身份体系。',detail);const form=document.getElementById('account-form');if(form)form.onclick=async e=>{const b=e.target;if(b.tagName!=='BUTTON')return;e.preventDefault();const d=new FormData(form);const r=document.getElementById('account-result');try{await window.xyaiFounders.authenticate({mode:b.value,email:d.get('email'),password:d.get('password'),nickname:d.get('nickname'),company:d.get('company')});r.className='success';r.textContent='认证成功。'}catch(err){r.className='error';r.textContent=err.message||String(err)}}}
function render(next){state=next;const module=next.activeModule==='workspace'?'production':next.activeModule;({production:factory,plugins:plugins,knowledge:knowledge,account:account}[module]||factory)()}window.xyaiFounders.getState().then(render);window.xyaiFounders.onState(render);
let kbTheme='system';
function kbLoadTheme(){try{kbTheme=localStorage.getItem('xyai-panel-theme')||'system'}catch(e){kbTheme='system'}}
function kbSaveTheme(mode){try{localStorage.setItem('xyai-panel-theme',mode)}catch(e){}}
function kbSystemDark(){try{return !!(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches)}catch(e){return false}}
function kbEffectiveDark(){return kbTheme==='dark'||(kbTheme==='system'&&kbSystemDark())}
function kbRefreshToggleLabel(){const el=document.getElementById('kb-theme-toggle');if(!el)return;const dark=kbEffectiveDark();let label=dark?'☀️ 亮色模式':'🌙 暗色模式';if(kbTheme==='system')label=label+'（跟随系统）';el.textContent=label;el.title='当前'+(kbTheme==='system'?'跟随系统外观':'手动选择')+(dark?' · 暗色':' · 亮色')+'，点击可切换。与顶栏主题按钮同步'}
function kbApplyTheme(){document.body.classList.toggle('dark',kbEffectiveDark());kbRefreshToggleLabel()}
function kbApplyThemeState(state){if(!state)return;kbTheme=state.preference==='light'||state.preference==='dark'||state.preference==='system'?state.preference:'system';kbSaveTheme(kbTheme);document.body.classList.toggle('dark',!!state.dark);kbRefreshToggleLabel()}
function kbCycleTheme(){if(window.xyaiFounders&&window.xyaiFounders.cycleTheme){window.xyaiFounders.cycleTheme().then(kbApplyThemeState).catch(function(){kbTheme=kbTheme==='system'?'light':(kbTheme==='light'?'dark':'system');kbSaveTheme(kbTheme);kbApplyTheme()});return}kbTheme=kbTheme==='system'?'light':(kbTheme==='light'?'dark':'system');kbSaveTheme(kbTheme);kbApplyTheme()}
function kbInstallThemeToggle(){if(document.getElementById('kb-theme-toggle'))return;const b=document.createElement('button');b.id='kb-theme-toggle';b.setAttribute('aria-label','切换明暗主题');b.onclick=function(){kbCycleTheme()};document.body.appendChild(b);kbRefreshToggleLabel()}
function kbWatchSystem(){try{const mq=window.matchMedia('(prefers-color-scheme: dark)');if(!mq)return;const onChange=function(){if(kbTheme==='system')kbApplyTheme()};if(mq.addEventListener)mq.addEventListener('change',onChange);else if(mq.addListener)mq.addListener(onChange)}catch(e){}try{if(window.xyaiFounders&&window.xyaiFounders.getTheme)window.xyaiFounders.getTheme().then(kbApplyThemeState);if(window.xyaiFounders&&window.xyaiFounders.onThemeChange)window.xyaiFounders.onThemeChange(kbApplyThemeState)}catch(e){}}
/* ===== W-105 知识问答（@本地库 引用 + 溯源脚标） ===== */
var kbChat={open:false,streaming:false,messages:[],mountId:null,mountName:'',anyReady:false,fullText:'',sources:[],unsub:null,finished:false};
/* ===== W-106 ima 云知识库（只读借阅 + @云库检索） ===== */
var imaWiz={open:false,clientId:'',apiKey:'',busy:false,bases:[],listing:false,listError:'',expanded:{},items:{},itemsBusy:{},uploadBusy:{}};
function imaMountOpen(){imaWiz.open=!imaWiz.open;renderImaSection()}
function imaCloudMounts(){return state.cloudKnowledgeMounts||[]}
function renderImaItems(id,items){
  if(!items.length)return '<div class="empty">这个知识库里暂时没有可列出的内容。</div>';
  return items.map(function(f){
    var read=f.mediaId?'<button class="button secondary" data-ima-read="'+id+'" data-media="'+esc(f.mediaId)+'">查看原文</button><pre class="pvbox" id="ima-read-'+id+'-'+encodeURIComponent(f.mediaId)+'" style="display:none"></pre>':'';
    return '<div class="item"><span>📄 '+esc(f.title)+'</span>'+read+'</div>';
  }).join('');
}
function renderImaSection(){
  var box=document.getElementById('ima-section');if(!box)return;
  var cloud=imaCloudMounts();
  var configured=!!state.imaConfigured;
  var mountedHtml=cloud.length?cloud.map(function(m){
    var items=imaWiz.items[m.id];
    var body=imaWiz.expanded[m.id]
      ? '<div class="list" id="ima-items-'+m.id+'">'+(items===undefined?'<div class="muted">正在读取文件列表…（只读，不下载、不解析）</div>':renderImaItems(m.id,items))+'</div>'
      : '';
    return '<div class="item"><div class="item-head"><span>☁ '+esc(m.name)+'</span><span class="pill">ima · 云库</span></div><div class="muted">挂接于 '+time(m.mountedAt)+' · 未下载任何内容、不做本地解析</div><div class="toolbar"><button class="button secondary" data-ima-items="'+m.id+'">'+(imaWiz.expanded[m.id]?'收起文件':'查看文件（只读）')+'</button><button class="button secondary" data-ima-upload="'+m.id+'" title="把本机文件直接传到该 ima 知识库根目录，由 ima 云端解析">⬆ 上传本机文件</button><button class="button danger" data-ima-unmount="'+m.id+'">解除挂接</button></div><div id="ima-upnote-'+m.id+'" class="muted"></div>'+body+'</div>';
  }).join(''):'<div class="empty">还没有挂接 ima 云知识库。挂接后会自动显示库内文件列表（只读，不下载、不解析）。</div>';
  var credForm='<div class="form" style="max-width:660px"><div class="row"><label>Client ID<input id="ima-cid" value="'+esc(imaWiz.clientId)+'" placeholder="在 ima.qq.com/agent-interface 获取"></label><label>API Key<input id="ima-key" type="password" value="'+esc(imaWiz.apiKey)+'" placeholder="粘贴 API Key"></label></div>'+(imaWiz.busy?'<div class="muted">正在连接 ima…</div>':'')+(imaWiz.listError?'<div class="error">'+esc(imaWiz.listError)+'</div>':'')+'<div class="toolbar"><button class="button" data-ima-connect>连接 ima</button></div></div>';
  box.innerHTML=(configured?'<div class="success" style="margin:0 0 10px">已连接 ima。凭据经系统级加密保存，永远不会下发到界面或日志。</div>':credForm)+
    '<div class="toolbar" style="margin:8px 0"><button class="button secondary" data-ima-list>列出我的知识库</button></div><div id="ima-bases"></div><div class="list">'+mountedHtml+'</div>'+
    '<div class="note">ima 云库只做「只读借阅」：挂接仅登记目录，不下载、不本地解析；只有在对话里 @该云库 或点开查看原文时，才按需调用 ima 官方接口拉取片段。写入笔记 / 导入网页等操作需在 ima 授权范围内使用。</div>';
  bindImaEvents();
}
function renderImaBases(){
  var box=document.getElementById('ima-bases');if(!box)return;
  if(imaWiz.listing){box.innerHTML='<div class="muted">正在列出你的 ima 知识库…</div>';return}
  if(!imaWiz.bases.length){box.innerHTML='';return}
  var cloud=imaCloudMounts();
  box.innerHTML='<div class="list">'+imaWiz.bases.map(function(kb){
    var already=cloud.some(function(m){return m.knowledgeBaseId===kb.id});
    return '<div class="item"><div class="item-head"><span>☁ '+esc(kb.name)+'</span>'+(kb.description?'<span class="docmeta muted">'+esc(kb.description)+'</span>':'')+'</div>'+(already?'<span class="pill issue">已挂接</span>':'<button class="button secondary" data-ima-add="'+esc(kb.id)+'" data-name="'+esc(kb.name)+'">挂接</button>')+'</div>';
  }).join('')+'</div>';
  box.querySelectorAll('[data-ima-add]').forEach(function(b){b.onclick=async function(){var id=b.getAttribute('data-ima-add');var name=b.getAttribute('data-name');try{await window.xyaiFounders.imaMount({knowledgeBaseId:id,name:name});kbToast('已挂接「'+name+'」');imaWiz.bases=[];renderImaSection()}catch(e){kbToast(e.message||String(e))}}});
}
async function imaLoadItems(id){
  if(imaWiz.itemsBusy[id])return;
  imaWiz.itemsBusy[id]=true;
  try{var r=await window.xyaiFounders.imaListItems({mountId:id});imaWiz.items[id]=r.items||[]}catch(e){imaWiz.items[id]=[{mediaId:'',title:'读取文件列表失败：'+(e.message||String(e))}]}
  imaWiz.itemsBusy[id]=false;
  renderImaSection();
}
function bindImaEvents(){
  var cid=document.getElementById('ima-cid');var key=document.getElementById('ima-key');
  if(cid)cid.oninput=function(){imaWiz.clientId=cid.value};
  if(key)key.oninput=function(){imaWiz.apiKey=key.value};
  var connect=document.querySelector('[data-ima-connect]');
  if(connect)connect.onclick=async function(){
    imaWiz.busy=true;imaWiz.listError='';renderImaSection();
    try{await window.xyaiFounders.imaConfigure({clientId:imaWiz.clientId,apiKey:imaWiz.apiKey});kbToast('已连接 ima。')}catch(e){imaWiz.listError=e.message||String(e)}
    imaWiz.busy=false;renderImaSection();
  };
  var list=document.querySelector('[data-ima-list]');
  if(list)list.onclick=async function(){
    imaWiz.listing=true;imaWiz.listError='';renderImaSection();
    try{var r=await window.xyaiFounders.imaListKnowledgeBases();imaWiz.bases=r.bases||[]}catch(e){imaWiz.listError=e.message||String(e);imaWiz.bases=[]}
    imaWiz.listing=false;renderImaSection();
    renderImaBases();
  };
  renderImaBases();
  document.querySelectorAll('[data-ima-items]').forEach(function(b){b.onclick=function(){var id=b.getAttribute('data-ima-items');imaWiz.expanded[id]=!imaWiz.expanded[id];if(imaWiz.expanded[id])void imaLoadItems(id);renderImaSection()}});
  document.querySelectorAll('[data-ima-unmount]').forEach(function(b){b.onclick=async function(){var id=b.getAttribute('data-ima-unmount');try{await window.xyaiFounders.imaUnmount(id);delete imaWiz.expanded[id];delete imaWiz.items[id];var n=document.getElementById('ima-upnote-'+id);if(n){n.className='success';n.textContent='已解除挂接（只解除引用，不影响 ima 云端内容）。'}}catch(e){var n2=document.getElementById('ima-upnote-'+id);if(n2){n2.className='error';n2.textContent=e.message||String(e)}}}});
  document.querySelectorAll('[data-ima-upload]').forEach(function(b){b.onclick=async function(){
    var id=b.getAttribute('data-ima-upload');
    if(imaWiz.uploadBusy[id])return;
    var setNote=function(cls,msg){var el=document.getElementById('ima-upnote-'+id);if(el){el.className=cls;el.textContent=msg}};
    imaWiz.uploadBusy[id]=true;setNote('muted','正在选择并上传本机文件…（传到该知识库根目录，由 ima 云端解析）');
    try{
      var r=await window.xyaiFounders.imaUploadLocalFiles({mountId:id});
      if(!r){return}
      if(r.canceled){setNote('muted','已取消，未上传文件。');return}
      var arr=r.results||[];var ok=0;var bad=[];
      arr.forEach(function(x){if(x&&x.ok){ok+=1}else{bad.push((x&&x.fileName?x.fileName:'?')+': '+(x&&x.message?x.message:'上传失败'))}});
      var okMsg='上传完成：成功 '+ok+' 个，已交由 ima 云端解析。';
      var badMsg=bad.length>0?('未上传 '+bad.length+' 个：'+bad.join('；')):'';
      setNote(bad.length>0?'error':'success',bad.length>0?(okMsg+badMsg):okMsg);
      if(imaWiz.expanded[id]){delete imaWiz.items[id];await imaLoadItems(id)}else{renderImaSection()}
      setNote(bad.length>0?'error':'success',bad.length>0?(okMsg+badMsg):okMsg);
    }catch(e){setNote('error','上传失败：'+(e.message||String(e)))}
    imaWiz.uploadBusy[id]=false;
  }});
  document.querySelectorAll('[data-ima-read]').forEach(function(b){b.onclick=async function(){var id=b.getAttribute('data-ima-read');var media=b.getAttribute('data-media');var pre=document.getElementById('ima-read-'+id+'-'+encodeURIComponent(media));if(!pre)return;if(pre.style.display!=='none'){pre.style.display='none';return}pre.style.display='block';pre.textContent='正在从 ima 读取…';try{var info=await window.xyaiFounders.imaReadItem({mediaId:media});if(info.noteContent){pre.textContent=info.noteContent}else if(info.url){pre.textContent='可访问链接：\\n'+info.url+'\\n\\n（为保护数据，本机不自动下载正文，可复制链接在浏览器或 ima 中打开）'}else{pre.textContent='该条目需在 ima 客户端中查看原文。'}}catch(e){pre.textContent='读取失败：'+(e.message||String(e))}}});
}
function kbAtTarget(raw){
  var sp=Math.max(raw.lastIndexOf(' '),raw.lastIndexOf(String.fromCharCode(10)));
  var at=raw.lastIndexOf('@');
  if(at<0||at<sp)return null;
  var tail=raw.slice(at+1);
  if(tail.indexOf(' ')>-1||tail.indexOf('@')>-1||tail.indexOf('　')>-1)return null;
  return tail;
}
function kbChatSetup(){
  if(document.getElementById('kb-chat-layer'))return;
  var layer=document.createElement('div');layer.id='kb-chat-layer';
  layer.innerHTML=
   '<div class="kb-chat-backdrop" id="kb-chat-backdrop"></div>'+
   '<div class="kb-chat-card">'+
   '<div class="kb-chat-head"><div><b>知识问答</b><div class="small">本地库在本机检索 · @云库 按需检索 ima 片段（不下载原文）</div></div>'+
   '<button class="kb-chat-x" id="kb-chat-close" title="关闭" aria-label="关闭">×</button></div>'+
   '<div class="kb-chat-scope-hint" id="kb-chat-scope-hint"><span>范围：</span><span id="kb-chat-scopes"></span></div>'+
   '<div class="kb-chat-msgs" id="kb-chat-msgs"></div>'+
   '<div class="kb-chat-foot" id="kb-chat-foot"></div>'+
   '<div class="kb-chat-inputrow">'+
   '<div class="kb-atmenu" id="kb-atmenu" hidden></div>'+
   '<textarea id="kb-chat-input" rows="1" placeholder="问你的知识库…（输入 @ 可指定某个挂接库）"></textarea>'+
   '<button id="kb-chat-send">发送</button>'+
   '</div>'+
   '<div class="kb-chat-srcmodal" id="kb-chat-srcmodal" hidden></div>'+
   '</div>';
  document.body.appendChild(layer);
  document.getElementById('kb-chat-close').onclick=function(){kbChatClose()};
  document.getElementById('kb-chat-backdrop').onclick=function(){kbChatClose()};
  document.getElementById('kb-chat-send').onclick=function(){kbChatSend()};
  var input=document.getElementById('kb-chat-input');
  input.addEventListener('keydown',function(e){
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();kbChatSend();return}
    if(e.key==='Escape')document.getElementById('kb-atmenu').hidden=true;
  });
  input.addEventListener('input',function(){kbChatSyncAt()});
  kbChat.unsub=window.xyaiFounders.knowledgeChatStream(function(ev){kbChatOnStream(ev)});
}
function kbChatReadyMounts(){
  var out=[];
  (state.knowledgeMounts||[]).forEach(function(m){
    var st=((state.knowledgeParse||{})[m.id]||{});
    var sum=st.summary||{};
    if((sum.ready||0)>0)out.push({id:m.id,name:m.name,ready:sum.ready});
  });
  return out;
}
function kbChatSyncScopes(){
  kbChatSetup();
  var host=document.getElementById('kb-chat-scopes');if(!host)return;
  var mounts=kbChatReadyMounts();
  kbChat.anyReady=mounts.length>0||(state.cloudKnowledgeMounts||[]).length>0;
  var html='';
  var allActive=!kbChat.mountId;
  html+='<button class="kb-scope-pill'+(allActive?' active':'')+'" data-scope="all">全部库</button>';
  mounts.forEach(function(m){
    html+='<button class="kb-scope-pill'+(kbChat.mountId===m.id?' active':'')+'" data-scope="'+m.id+'">'+esc(m.name)+' <span class="tag">'+m.ready+' 就绪</span></button>';
  });
  (state.cloudKnowledgeMounts||[]).forEach(function(m){
    html+='<button class="kb-scope-pill'+(kbChat.mountId===m.id?' active':'')+'" data-scope="'+m.id+'">☁ '+esc(m.name)+' <span class="tag">ima 云库</span></button>';
  });
  html+='<span class="small"> · 在输入框打 @ 也可选择</span>';
  host.innerHTML=html;
  host.querySelectorAll('[data-scope]').forEach(function(b){
    b.onclick=function(){var scope=b.getAttribute('data-scope');kbChatSetScope(scope==='all'?null:scope);kbChatSyncScopes()};
  });
  var send=document.getElementById('kb-chat-send');
  var inp=document.getElementById('kb-chat-input');
  if(send)send.disabled=!kbChat.anyReady||kbChat.streaming;
  if(inp)inp.placeholder=kbChat.anyReady?'问你的知识库…（输入 @ 可指定某个挂接库）':'先把文件挂接并解析到「已就绪」，再回来提问';
}
function kbChatSetScope(mountId){
  kbChat.mountId=mountId;
  if(mountId){
    var mounts=kbChatReadyMounts();
    var found=mounts.filter(function(m){return m.id===mountId})[0];
    if(!found){var cm=(state.cloudKnowledgeMounts||[]).filter(function(m){return m.id===mountId})[0];if(cm)found=cm}
    kbChat.mountName=found?found.name:'所选库';
  }else kbChat.mountName='';
}
function kbChatSyncAt(){
  var menu=document.getElementById('kb-atmenu');var input=document.getElementById('kb-chat-input');
  if(!menu||!input)return;
  var filter=kbAtTarget(input.value);
  if(filter===null){menu.hidden=true;return}
  var mounts=kbChatReadyMounts();
  var text=filter.toLowerCase();
  var html='<div class="kb-at-title">选择知识库（本地库检索本机语料，云库检索 ima 片段）</div>';
  html+='<button class="kb-at-opt" data-at="all"><span>全部库</span> <span class="tag">所有已就绪语料</span></button>';
  var matched=0;
  mounts.forEach(function(m){
    if(text&&m.name.toLowerCase().indexOf(text)<0&&m.id.toLowerCase().indexOf(text)<0)return;
    matched++;html+='<button class="kb-at-opt" data-at="'+m.id+'"><span>'+esc(m.name)+'</span> <span class="tag">'+m.ready+' 个就绪</span></button>';
  });
  (state.cloudKnowledgeMounts||[]).forEach(function(m){
    if(text&&m.name.toLowerCase().indexOf(text)<0)return;
    matched++;html+='<button class="kb-at-opt" data-at="'+m.id+'"><span>☁ '+esc(m.name)+'</span> <span class="tag">ima 云库 · 云端检索</span></button>';
  });
  if(matched===0)html+='<div class="kb-at-title">没有名字匹配的知识库，试试“全部库”或输入关键词</div>';
  menu.innerHTML=html;menu.hidden=false;
  menu.querySelectorAll('[data-at]').forEach(function(b){
    b.onclick=function(){var v=b.getAttribute('data-at');kbChatSetScope(v==='all'?null:v);input.value=input.value.replace(/@[^@]*$/,'');kbChatSyncScopes();kbChatSyncAt();input.focus()};
  });
}
function kbChatMsgEl(msg){
  var d=document.createElement('div');
  d.className='kb-msg '+(msg.role==='user'?'user':'assistant');
  d.innerHTML=msg.html||'';
  return d;
}
function kbChatRenderAll(){
  var box=document.getElementById('kb-chat-msgs');if(!box)return;
  box.innerHTML='';
    if(!kbChat.messages.length&&!kbChat.streaming&&!kbChat.anyReady){
    var tip=document.createElement('div');tip.className='kb-msg assistant';
    tip.innerHTML='你好，我是你的本地知识问答助手。<br>目前还没有“已就绪”的语料。请先点上方「＋ 挂接本地文件夹」挂接一个目录，等解析中心的文档从「待解析」变成「已就绪」，就能在这里 @ 并提问。所有检索都在你电脑上完成，不会上传任何文件。';
    box.appendChild(tip);return;
  }
  kbChat.messages.forEach(function(msg){box.appendChild(kbChatMsgEl(msg))});
  if(kbChat.streaming&&kbChat.messages.length===0){
    var w=document.createElement('div');w.className='kb-msg assistant';w.id='kb-streaming';w.textContent='正在本机语料里查找…';box.appendChild(w);
  }
  var list=box;list.scrollTop=list.scrollHeight;
  kbChatRenderFoot();
}
function kbChatPushUser(text){
  kbChat.messages.push({role:'user',html:esc(text).split(String.fromCharCode(10)).join('<br>')});
  kbChat.fullText='';kbChat.sources=[];kbChat.finished=false;
  kbChat.messages.push({role:'assistant',html:'',pending:true});
}
function kbChatSend(){
  var input=document.getElementById('kb-chat-input');
  var q=input?input.value.trim():'';
  if(!q||kbChat.streaming)return;
  input.value='';
  kbChat.streaming=true;kbChat.anyQuestion=q;
  kbChatPushUser(q);
  kbChatRenderAll();
  var bub=document.getElementById('kb-chat-msgs').lastChild;
  if(bub)bub.textContent='正在本机语料里查找…';
  window.xyaiFounders.knowledgeChatAsk({question:q,mountId:kbChat.mountId}).catch(function(err){
    if(!kbChat.streaming)return;
    kbChat.streaming=false;
    var msg=kbChat.messages[kbChat.messages.length-1];
    if(msg)msg.html='<span class="kb-typing">这次没能完成检索：'+(err&&err.message?esc(String(err.message)):'未知错误')+'。请稍后再试。</span>';
    kbChatRenderAll();
  });
}
function kbChatOnStream(ev){
  if(!ev)return;
  if(ev.type==='delta'&&kbChat.streaming&&!kbChat.finished){
    kbChat.fullText+=ev.text||'';
    var box=document.getElementById('kb-chat-msgs');
    var bub=box?box.lastChild:null;
    if(bub&&!bub.classList.contains('user'))bub.textContent=kbChat.fullText;
    var list=box;if(list)list.scrollTop=list.scrollHeight;
  }
  if(ev.type==='sources')kbChat.sources=ev.sources||[];
  if(ev.type==='done'&&kbChat.streaming){
    kbChatComplete();
  }
}
function kbChatComplete(){
  kbChat.streaming=false;kbChat.finished=true;
  var last=kbChat.messages[kbChat.messages.length-1];
  if(!last)return;
  if(kbChat.fullText){
    last.html=kbCitesHtml(kbChat.fullText);
  }else{
    last.html='<span class="kb-typing">本机语料里没有可直接引用的内容，请换个问法试试。</span>';
  }
  var box=document.getElementById('kb-chat-msgs');
  if(box){var el=box.lastChild;if(el)el.innerHTML=last.html;box.scrollTop=box.scrollHeight;}
  kbChatRenderFoot();
  kbChatSyncScopes();
}
function kbCitesHtml(text){
  var safe=esc(text).split(String.fromCharCode(10)).join('<br>');
  var out='';var i=0;
  while(i<safe.length){
    var j=safe.indexOf('〔',i);
    if(j<0){out+=safe.slice(i);break}
    out+=safe.slice(i,j);
    var k=safe.indexOf('〕',j+1);
    if(k<0){out+=safe.slice(j);break}
    var num=safe.slice(j+1,k);
    if(/^[0-9]+$/.test(num)){
      out+='<button class="kb-cite" data-cite="'+num+'" title="查看来源">〔'+num+'〕</button>';
      i=k+1;
    }else{out+=safe.slice(j,j+1);i=j+1}
  }
  return out;
}
function kbChatRenderFoot(){
  var foot=document.getElementById('kb-chat-foot');if(!foot)return;
  if(!kbChat.sources.length){foot.className='kb-chat-foot';foot.innerHTML='';return}
  foot.className='kb-chat-foot show';
  var html='<div class="kb-foot-title">来源（点击可看原文片段）</div>';
  kbChat.sources.forEach(function(s){
    var head=s.title||(s.relPath||'').split('/').pop();
    var meta=s.mediaId?'☁ ima 云端片段（未存储本地）':(esc(s.mountName)+' · '+esc(s.relPath||''));
    html+='<button class="kb-src-row" data-src="'+s.index+'"><span class="n">〔'+s.index+'〕</span><span class="p">'+esc(head)+'</span><span class="s">'+meta+'</span></button>';
  });
  foot.innerHTML=html;
  foot.querySelectorAll('[data-src]').forEach(function(b){
    b.onclick=function(){var n=Number(b.getAttribute('data-src'));kbChatShowSource(n)};
  });
}
function kbChatShowSource(n){
  var s=kbChat.sources.filter(function(x){return x.index===n})[0];
  if(!s)return;
  var modal=document.getElementById('kb-chat-srcmodal');if(!modal)return;
  var name=s.title||(s.relPath||'').split('/').pop();
  var meta=s.mediaId?('库：'+esc(s.mountName)+' · 命中片段来自 ima 云端检索，本机未下载原文'):('库：'+esc(s.mountName)+' · 文件：'+esc(s.relPath||'')+' · 命中片段为本地语料，未上传');
  modal.innerHTML='<div class="card">'+
   '<div class="hd"><b>'+esc(name)+'</b><button class="kb-chat-x" data-close>×</button></div>'+
   '<div class="meta">'+meta+'</div>'+
   '<div class="snip">'+esc(s.snippet)+'</div>'+
   '<div class="ft"><button class="button secondary" data-close>关闭</button></div>'+
   '</div>';
  modal.hidden=false;
  modal.querySelectorAll('[data-close]').forEach(function(b){b.onclick=function(){modal.hidden=true}});
}
function kbChatOpen(){
  kbChatSetup();
  kbChatSyncScopes();
  kbChatRenderAll();
  document.getElementById('kb-chat-layer').classList.add('open');
  kbChat.open=true;
  var inp=document.getElementById('kb-chat-input');
  if(inp)setTimeout(function(){inp.focus()},60);
}
function kbChatClose(){
  var layer=document.getElementById('kb-chat-layer');
  if(layer)layer.classList.remove('open');
  kbChat.open=false;
  document.getElementById('kb-atmenu').hidden=true;
  var modal=document.getElementById('kb-chat-srcmodal');
  if(modal)modal.hidden=true;
}

kbLoadTheme();kbApplyTheme();kbInstallThemeToggle();kbWatchSystem();
</script></main></body></html>`
