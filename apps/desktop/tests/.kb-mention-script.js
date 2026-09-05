
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
