/** XYAI Studio 开发空间（DSH 主对话）右下角的「@知识库」叠加层。
 * 仅在本机已就绪语料上检索并流式给出带溯源脚标的回答；文件不上传、不调用云端。
 * 本地模型就绪时（W-201）自动切换为本地模型直答，否则诚实标注“语料直答”。 */
export const KB_MENTION_OVERLAY_HTML = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
:root{color:#172033;font-family:"Segoe UI","Microsoft YaHei",sans-serif}*{box-sizing:border-box}html,body{margin:0;height:100%;overflow:hidden;background:transparent}
#kb-pill{position:absolute;right:0;bottom:0;display:flex;align-items:center;gap:8px;border:1px solid #d7e1f0;background:#ffffff;color:#234a7d;border-radius:14px 14px 14px 4px;padding:9px 12px;font-size:13px;cursor:pointer;box-shadow:0 10px 30px rgba(15,23,42,.18)}
#kb-pill:hover{background:#eef5ff}
#kb-panel{position:absolute;inset:0;display:flex;flex-direction:column;background:rgba(255,255,255,.97);border:1px solid #dce5f0;border-radius:16px 16px 16px 4px;box-shadow:0 18px 48px rgba(15,23,42,.22);overflow:hidden}
#kb-panel header{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e7edf5}
#kb-panel .h{flex:1;min-width:0}
#kb-panel .h b{font-size:14px}
#kb-panel .h small{display:block;color:#7a879b;font-size:11px;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#kb-close,#kb-model-refresh{border:1px solid #e1e8f2;background:#fff;border-radius:8px;width:26px;height:26px;cursor:pointer;color:#5b6b80}
#kb-scopes{display:flex;flex-wrap:wrap;gap:6px;padding:10px 12px 4px}
.chip{border:1px solid #dbe4f0;background:#fff;color:#4c5a6c;border-radius:999px;padding:5px 10px;font-size:12px;cursor:pointer}
.chip.on{background:#e8f1ff;border-color:#7ba9ef;color:#1f5fb8;font-weight:650}
#kb-msgs{flex:1;overflow:auto;padding:8px 12px 12px;display:flex;flex-direction:column;gap:8px}
.msg{max-width:92%;padding:8px 10px;border-radius:10px;font-size:13px;line-height:1.6;white-space:pre-wrap;word-break:break-word}
.msg.user{align-self:flex-end;background:#e8f1ff;color:#1b3a63}
.msg.assistant{align-self:flex-start;background:#f4f7fb;color:#1f2c3d}
.srcs{margin-top:8px;padding-top:8px;border-top:1px dashed #d7e1f0}
.src{display:block;text-align:left;background:#fff;border:1px solid #e2e9f3;border-radius:8px;padding:7px 9px;margin-top:6px;cursor:pointer;font-size:12px;color:#40506a}
.src .p{font-weight:650}
.src .sn{color:#7a879b;margin-top:3px;display:block}
.input-row{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #e7edf5}
#kb-input{flex:1;resize:none;border:1px solid #dbe4f0;border-radius:10px;padding:8px 10px;font:inherit;font-size:13px;color:#172033}
#kb-send{border:0;background:#2568c8;color:#fff;border-radius:10px;padding:0 14px;font-size:13px;cursor:pointer}
#kb-send:disabled{background:#a9c2e4;cursor:default}
.typing{color:#8a98ab}
@media (prefers-color-scheme: dark){
#kb-pill{background:#1b2434;border-color:#2c394b;color:#cfe0f5}
#kb-panel{background:rgba(23,31,45,.97);border-color:#2c394b}
#kb-panel header,#kb-scopes,#kb-msgs{border-color:#2c394b}
#kb-panel .h small{color:#8794a8}
#kb-close,#kb-model-refresh{background:#1b2434;border-color:#2c394b;color:#c3cede}
.chip{background:#1b2434;border-color:#2c394b;color:#b9c6d8}
.chip.on{background:#20304a;border-color:#3d6dbd;color:#cfe0f5}
.msg.user{background:#20304a;color:#d8e5f6}
.msg.assistant{background:#1a2332;color:#d3dde9}
.src{background:#1b2434;border-color:#2c394b;color:#b9c6d8}
#kb-input{background:#141c2a;border-color:#2c394b;color:#d3dde9}
}
</style></head><body>
<button id="kb-pill" title="在对话中 @知识库 引用本地语料">💬 @知识库</button>
<section id="kb-panel" hidden>
<header><div class="h"><b>💬 知识库问答</b><small id="kb-model-status">检测本机模型中…</small></div>
<button id="kb-model-refresh" title="重新检测本机模型">⟳</button><button id="kb-close" title="收起">−</button></header>
<div id="kb-scopes"></div><div id="kb-msgs"></div>
<div class="input-row"><textarea id="kb-input" rows="2" placeholder="@全部 或先选择知识库，再输入问题"></textarea><button id="kb-send">发送</button></div>
</section>
<script>
(function(){
var api=window.xyaiFounders;
var selectedMountId=null;
var streaming=false;
var curText='';
var curSources=[];
function esc(v){return String(v==null?'':v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]})}
function el(id){return document.getElementById(id)}
function open(){api.kbMentionToggle();el('kb-pill').hidden=true;el('kb-panel').hidden=false;renderModelStatus()}
function collapse(){api.kbMentionToggle();el('kb-pill').hidden=false;el('kb-panel').hidden=true}
function reset(){el('kb-pill').hidden=false;el('kb-panel').hidden=true}
el('kb-pill').onclick=open;el('kb-close').onclick=collapse;
el('kb-model-refresh').onclick=function(){el('kb-model-status').textContent='检测本机模型中…';api.knowledgeChatModelRefresh().then(renderModelStatus).catch(function(){el('kb-model-status').textContent='本机模型检测失败'})};
function renderModelStatus(st){
  st=st||null;
  if(!st){api.knowledgeChatModelStatus().then(renderModelStatus).catch(function(){el('kb-model-status').textContent='本机模型未就绪 · 语料直答（不上传）'});return}
  if(st.ready&&st.models&&st.models.length){el('kb-model-status').textContent='本机模型就绪：'+st.models[0]}
  else{el('kb-model-status').textContent='本机模型未就绪 · 语料直答（不上传）'}
}
function renderScopes(state){
  var host=el('kb-scopes');if(!host)return;
  var list=(state&&state.knowledgeMounts)||[];
  var clouds=(state&&state.cloudKnowledgeMounts)||[];
  var html='<button class="chip'+(selectedMountId===null?' on':'')+'" data-id="">@全部</button>';
  list.forEach(function(m){html+='<button class="chip'+(selectedMountId===m.id?' on':'')+'" data-id="'+esc(m.id)+'">@'+esc(m.name)+'</button>'});
  clouds.forEach(function(m){html+='<button class="chip'+(selectedMountId===m.id?' on':'')+'" data-id="'+esc(m.id)+'">☁ @'+esc(m.name)+'</button>'});
  host.innerHTML=html;
  host.querySelectorAll('[data-id]').forEach(function(b){b.onclick=function(){selectedMountId=b.getAttribute('data-id')||null;renderScopes(state)}});
}
function appendMsg(role,text){
  var host=el('kb-msgs');var d=document.createElement('div');d.className='msg '+role;d.textContent=text;host.appendChild(d);host.scrollTop=host.scrollHeight;return d;
}
function send(){
  var input=el('kb-input');var q=input.value.trim();if(!q||streaming)return;
  input.value='';streaming=true;curText='';curSources=[];
  appendMsg('user',q);
  var box=appendMsg('assistant','正在本机语料里查找…');
  api.knowledgeChatAsk({question:q,mountId:selectedMountId}).catch(function(err){
    if(!streaming)return;streaming=false;box.textContent='这次没能完成检索：'+(err&&err.message?err.message:'未知错误');
  });
}
el('kb-send').onclick=send;
el('kb-input').addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}});
api.knowledgeChatStream(function(ev){
  if(!ev)return;
  var msgs=el('kb-msgs');var last=msgs?msgs.lastChild:null;
  if(ev.type==='start'){
    if(ev.mode==='local-model'){var st=el('kb-model-status');if(st)st.textContent='本机模型：'+ev.model}
    else if(ev.mode==='cloud'){var s3=el('kb-model-status');if(s3)s3.textContent='ima 云端检索 · 未下载原文'}
    else{var s2=el('kb-model-status');if(s2)s2.textContent='语料直答 · 未调用云端'}
  }
  if(ev.type==='delta'&&streaming){curText+=ev.text||'';if(last)last.textContent=curText;if(msgs)msgs.scrollTop=msgs.scrollHeight}
  if(ev.type==='sources'){curSources=ev.sources||[]}
  if(ev.type==='done'&&streaming){
    streaming=false;
    if(last){last.textContent=curText||'本机语料里没有可直接引用的内容，请换个问法试试。';if(curSources.length){var s='<div class="srcs">';curSources.forEach(function(x){var head=x.title||String(x.relPath||'').split('/').pop();var meta=x.mediaId?'☁ ima 云端片段（未存储本地）':(esc(x.mountName)+' · '+esc(x.relPath||''));s+='<button class="src"><span class="p">〔'+x.index+'〕 '+esc(head)+'</span><span class="sn">'+meta+'</span><span class="sn">'+esc(x.snippet)+'</span></button>'});s+='</div>';var wrap=document.createElement('div');wrap.innerHTML=s;last.appendChild(wrap)}}
  }
});
api.getState().then(renderScopes);api.onState(renderScopes);renderModelStatus();
if(api.kbMentionOnReset)api.kbMentionOnReset(reset);
})();
</script></body></html>`
