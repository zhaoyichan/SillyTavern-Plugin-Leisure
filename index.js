// ============================================================
// 待时闲暇 · SillyTavern 插件（v0.3.0 列表书架版）
// 悬浮球 + 小窗：首页(最近阅读+2048) + 列表书架 + 阅读器
// 拿铁奶油主题 · 书架存 localStorage
// ============================================================
'use strict';
const LT_VERSION='0.3.0';
function ltGetCtx(){let ctx=null;try{ctx=SillyTavern&&typeof SillyTavern.getContext==='function'?SillyTavern.getContext():null;}catch(e){}return{ctx,es:ctx?.eventSource||(typeof eventSource!=='undefined'?eventSource:null),et:ctx?.event_types||(typeof event_types!=='undefined'?event_types:null)};}
const LTLS={get(k,d){try{const v=localStorage.getItem(k);return v?JSON.parse(v):d}catch(e){return d}},set(k,v){try{localStorage.setItem(k,JSON.stringify(v))}catch(e){}}};
const LT={initialized:false,theme:LTLS.get('lt_theme','day'),G:null,lib:LTLS.get('lt_library',[]),cur:null,font:LTLS.get('lt_font',17),logs:[],selMode:false,selSet:null};
const K_LIB='lt_library';
const MAX_LOG=200;
/* 排序：刚看的（lastRead 大）在最上面；未读的排最后 */
function ltSortLib(){try{if(!Array.isArray(LT.lib)){LT.lib=[];}LT.lib=LT.lib.filter(bk=>bk&&bk.name&&Array.isArray(bk.chapters));
  LT.lib.sort((a,b)=>(b.lastRead||0)-(a.lastRead||0));ltSaveLib();}catch(e){}}
/* ---- 日志系统（内存记录 + 可选的 console 转发），并拦截 console 与未捕获错误 ---- */
function ltFmt(a){try{return a.map(x=>{if(x instanceof Error)return x.stack||x.message;try{if(typeof x==='object')return JSON.stringify(x).slice(0,300);}catch(e){}return String(x);}).join(' ');}catch(e){return String(a);}}
function ltPush(level,...a){try{const t=new Date(),ts=('0'+t.getHours()).slice(-2)+':'+('0'+t.getMinutes()).slice(-2)+':'+('0'+t.getSeconds()).slice(-2);LT.logs.push({ts:ts,lv:level,msg:ltFmt(a)});if(LT.logs.length>MAX_LOG)LT.logs.splice(0,LT.logs.length-MAX_LOG);ltRenderLogs&&ltRenderLogs();}catch(e){}}
function ltLog(...a){try{console.log('[待时闲暇]',...a);ltPush('info',...a);}catch(e){}}
function ltWarn(...a){try{console.warn('[待时闲暇]',...a);ltPush('warn',...a);}catch(e){}}
function ltErr(...a){try{console.error('[待时闲暇]',...a);ltPush('error',...a);}catch(e){}}
function ltCaptureAll(){try{
  const orig={log:console.log,warn:console.warn,error:console.error,info:console.info};
  console.log=function(...a){orig.log.apply(console,a);try{if((''+ltFmt(a)).indexOf('[待时闲暇]')<0)ltPush('info',...a);}catch(e){}};
  console.warn=function(...a){orig.warn.apply(console,a);try{ltPush('warn',...a);}catch(e){}};
  console.error=function(...a){orig.error.apply(console,a);try{ltPush('error',...a);}catch(e){}};
  console.info=function(...a){orig.info.apply(console,a);try{ltPush('info',...a);}catch(e){}};
  window.addEventListener('error',e=>{try{ltPush('error',(e&&e.message)||'error');}catch(er){}});
  window.addEventListener('unhandledrejection',e=>{try{ltPush('error','promise:'+((e&&e.reason&&e.reason.message)||'reject'));}catch(er){}});
  ltLog('日志拦截已启用');
}catch(e){}}
function ltSaveLib(){LTLS.set(K_LIB,LT.lib);}
function ltEsc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'"');}

/* 书籍导入与分章 */
function ltSplitChapters(text){
  const lines=text.split(/\r?\n/),chapters=[],buf=[];let title=null;
  const isT=l=>/^\s*(第\s*[\d一二三四五六七八九十百千万零〇]+\s*[章节回卷集部篇]|楔子|序章|引言|尾声|番外|引子|完本感言|后记)\s*[：:、.。]?.*$/i.test(l);
  function flush(){if(title!==null)chapters.push({t:title,p:buf.filter(s=>s.trim()).map(s=>s.trim())});buf.length=0;}
  for(const line of lines){if(isT(line)){flush();title=line.trim();}else buf.push(line);}
  flush();
  if(!chapters.length)chapters.push({t:'全文',p:buf.filter(s=>s.trim()).map(s=>s.trim())});
  return chapters;
}
function ltToast(msg){try{let t=document.getElementById('lt-toast');if(!t){t=document.createElement('div');t.id='lt-toast';t.style.cssText='position:absolute;top:44px;left:50%;transform:translateX(-50%);background:#5b4632;color:#f6e6cd;padding:7px 14px;border-radius:18px;font-size:12px;z-index:50;white-space:nowrap;transition:opacity .3s';document.getElementById('lt-modal').appendChild(t);}t.textContent=msg;t.style.opacity='1';clearTimeout(t._tm);t._tm=setTimeout(()=>t.style.opacity='0',2000);}catch(e){}}
/* 读取文本：自动识别 UTF-8 / GBK / GB18030，兼容更多中文小说 */
function ltReadTextBuf(buf){
  try{
    if(typeof TextDecoder!=='undefined'){
      var t=new TextDecoder('utf-8',{fatal:false}).decode(buf);
      var bad=(t.match(/\uFFFD/g)||[]).length;
      // 出现较多替换符 → 试 GBK（可解 GB2312/GBK）
      if(bad>0&&bad>t.length*0.01){
        try{var g=new TextDecoder('gbk').decode(buf);if((g.match(/\uFFFD/g)||[]).length<(g.length*0.01))return g;}catch(e){}
      }
      return t;
    }
  }catch(e){}
  return '';
}
function ltAddBook(file){
  try{
    if(file&&typeof file.arrayBuffer==='function'){
      file.arrayBuffer().then(function(buf){try{
        var text=ltReadTextBuf(buf);var name=(file.name||'untitled').replace(/\.[^.]+$/,'');
        var ch=ltSplitChapters(text);
        LT.lib.push({id:'bk'+Date.now()+Math.random().toString(36).slice(2,6),name:name,
          type:(file.name.split('.').pop()||'txt').toLowerCase(),
          chapters:ch,pos:{ch:0,p:0},lastRead:Date.now()});
        ltSaveLib();ltRenderLib();ltRenderRecent();
        ltToast('已导入「'+name+'」('+ch.length+'章)');
      }catch(e){ltWarn('导入解析失败',e);ltToast('导入失败：'+e.message);}}).catch(function(e){ltWarn('导入失败',e);ltToast('读取文件失败');});
      return;
    }
    const rd=new FileReader();
    rd.onload=function(){try{const text=rd.result||'';const name=(file.name||'untitled').replace(/\.[^.]+$/,'');
      LT.lib.push({id:'bk'+Date.now()+Math.random().toString(36).slice(2,6),name:name,
        type:(file.name.split('.').pop()||'txt').toLowerCase(),
        chapters:ltSplitChapters(text),pos:{ch:0,p:0},lastRead:Date.now()});
      ltSaveLib();ltRenderLib();ltRenderRecent();
      ltToast('已导入「'+name+'」');
    }catch(e){ltWarn('导入解析失败',e);ltToast('导入失败：'+e.message);}};
    rd.onerror=function(){ltToast('读取文件失败');};
    rd.readAsText(file,'utf-8');
  }catch(e){ltWarn('导入异常',e);ltToast('导入异常：'+e.message);}
}
/* 动态创建文件选择器（规避隐藏 input 在部分 WebView 不弹选择器的问题） */
function ltOpenFile(){
  const inp=document.createElement('input');
  inp.type='file';inp.accept='.txt,.md,text/plain,text/markdown';inp.multiple=true;
  inp.style.cssText='position:absolute;left:-9999px;top:0;opacity:0';
  document.getElementById('lt-modal').appendChild(inp);
  inp.onchange=e=>{try{Array.from(e.target.files||[]).forEach(ltAddBook);}finally{inp.remove();}};
  inp.oncancel=()=>{inp.remove();};
  try{inp.click();}catch(e){ltToast('无法打开文件选择器');}
}

/* 2048 */
function ltEmptyGrid(){return Array.from({length:4},()=>[0,0,0,0])}
function ltAddTile(){const g=LT.G.grid,e=[];for(let r=0;r<4;r++)for(let c=0;c<4;c++)if(!g[r][c])e.push([r,c]);if(!e.length)return;const p=e[Math.floor(Math.random()*e.length)];g[p[0]][p[1]]=Math.random()<0.9?2:4;}
function ltSlideRow(row){const a=row.filter(v=>v),o=[],src=[];let g=0;const t=[...a];for(let i=0;i<t.length;i++){if(i+1<t.length&&t[i]===t[i+1]){o.push(t[i]*2);g+=t[i]*2;i++;}else o.push(t[i]);}while(o.length<4)o.push(0);return{row:o,g};}
function ltCanMove(gr){for(let r=0;r<4;r++)for(let c=0;c<4;c++){if(!gr[r][c])return true;if(c<3&&gr[r][c]===gr[r][c+1])return true;if(r<3&&gr[r][c]===gr[r+1][c])return true;}return false;}
function ltNewGame(){LT.G={grid:ltEmptyGrid(),score:0,best:LTLS.get('lt_best',0),over:false,undo:[]};ltAddTile();ltAddTile();ltRenderBoard();ltRenderStats();ltOvHide();}
function ltMove(dir){const G=LT.G;if(!G||G.over)return;G.undo.push(JSON.stringify({grid:G.grid.map(r=>r.slice()),score:G.score}));let mv=false,sc=0;
 const L=()=>{for(let r=0;r<4;r++){const s=ltSlideRow(G.grid[r]);for(let c=0;c<4;c++)if(G.grid[r][c]!==s.row[c])mv=true;G.grid[r]=s.row;sc+=s.g;}};
 const R=()=>{for(let r=0;r<4;r++){const rev=G.grid[r].slice().reverse(),s=ltSlideRow(rev).row.reverse();for(let c=0;c<4;c++)if(G.grid[r][c]!==s[c])mv=true;G.grid[r]=s;sc+=ltSlideRow(rev).g;}};
 const U=()=>{for(let c=0;c<4;c++){const col=[];for(let r=0;r<4;r++)col.push(G.grid[r][c]);const s=ltSlideRow(col).row;for(let r=0;r<4;r++)if(G.grid[r][c]!==s[r])mv=true;for(let r=0;r<4;r++)G.grid[r][c]=s[r];sc+=ltSlideRow(col).g;}};
 const D=()=>{for(let c=0;c<4;c++){const col=[];for(let r=3;r>=0;r--)col.push(G.grid[r][c]);const s=ltSlideRow(col).row.reverse();for(let r=0;r<4;r++)if(G.grid[r][c]!==s[r])mv=true;for(let r=0;r<4;r++)G.grid[r][c]=s[r];sc+=ltSlideRow(col).g;}};
 if(dir==='left')L();else if(dir==='right')R();else if(dir==='up')U();else D();
 if(!mv){G.undo.pop();return;}G.score+=sc;if(G.score>G.best){G.best=G.score;LTLS.set('lt_best',G.best);}ltAddTile();ltRenderBoard();ltRenderStats();
 if(!ltCanMove(G.grid)){G.over=true;ltOvShow('游戏结束','得分 '+G.score);}}
function ltUndo(){const G=LT.G;if(!G||!G.undo.length)return;const s=JSON.parse(G.undo.pop());G.grid=s.grid;G.score=s.score;G.over=false;ltOvHide();ltRenderBoard();ltRenderStats();}
function ltTileClass(v){return v>=2048?'super':(v>=1024?'lv1024':(v>=512?'lv512':(v>=256?'lv256':(v>=128?'lv128':(v>=64?'lv64':(v>=32?'lv32':(v>=16?'lv16':(v>=8?'lv8':(v>=4?'lv4':'lv2')))))))))}
function ltRenderBoard(){const b=$g('lt-board');if(!b)return;b.innerHTML='';for(let r=0;r<4;r++)for(let c=0;c<4;c++){const cell=document.createElement('div');cell.className='lt-cell';const v=LT.G.grid[r][c];if(v){const t=document.createElement('div');t.className='lt-tile '+ltTileClass(v);t.textContent=v;t.classList.add('pop');cell.appendChild(t);}b.appendChild(cell);}}
function ltRenderStats(){const gs=$g('lt-g-score'),gb=$g('lt-g-best');if(gs)gs.textContent=LT.G.score;if(gb)gb.textContent=LT.G.best;}
function ltOvShow(t,s){const o=$g('lt-overlay');if(!o)return;const a=$g('lt-ov-title'),b=$g('lt-ov-sub');if(a)a.textContent=t;if(b)b.textContent=s;o.classList.add('show');}
function ltOvHide(){const o=$g('lt-overlay');if(o)o.classList.remove('show');}

/* DOM 辅助 */
function $g(id){return document.getElementById(id);}

/* ============ 小窗 HTML ============ */
function ltModalHtml(){return ''+
'<div id="lt-backdrop"></div><div id="lt-modal"><div class="lt-shell">'+
'<div class="lt-topbar" id="lt-titlebar"><button class="lt-back" id="lt-back" style="display:none"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button>'+
'<div class="lt-brand"><div class="lt-logo"><svg viewBox="0 0 24 24" fill="none" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg></div><b id="lt-title">待时闲暇</b></div>'+
'<button class="lt-tbtn" id="lt-theme"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg></button>'+
'<button class="lt-tbtn" id="lt-full"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg></button>'+
'<button class="lt-tbtn" id="lt-close"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18M6 6l12 12"/></svg></button></div>'+
'<div class="lt-view" id="lt-home"><div class="lt-sec-hd"><span class="lt-ttl"><i></i>最近阅读</span><span class="lt-more" id="lt-goShelf">进入书架 ›</span></div>'+
'<div class="lt-shelfrow" id="lt-recent"></div>'+
'<div class="lt-game-card"><div class="lt-game-top"><div class="lt-gscore"><div class="lt-lb">得分</div><div class="lt-vl"><span id="lt-g-score">0</span> · 最高 <span id="lt-g-best">0</span></div></div>'+
'<button class="lt-gtbtn lt-gold" id="lt-new"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg></button>'+
'<button class="lt-gtbtn" id="lt-undo"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg></button></div>'+
'<div id="lt-boardWrap"><div class="lt-board" id="lt-board"></div><div class="lt-overlay" id="lt-overlay"><div class="big" id="lt-ov-title">游戏结束</div><div class="sub" id="lt-ov-sub"></div><button class="lt-ovbtn" id="lt-ovnew">再来一局</button></div></div></div></div>'+
'<div class="lt-view" id="lt-shelf" style="display:none"><div class="lt-shelf-hd"><span class="lt-s-ttl">全部书架</span><span class="lt-s-cnt" id="lt-bkCount">共 0 本</span>'+
'<div class="lt-hd-actions"><button class="lt-multi" id="lt-multi">多选</button><button class="lt-import" id="lt-import"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="m17 8-5-5-5 5"/><path d="M12 3v12"/></svg>导入</button></div></div>'+
'<div class="lt-selbar" id="lt-selbar" style="display:none"><button class="lt-sb" id="lt-selAll">全选</button><button class="lt-sb" id="lt-selCancel">取消</button><button class="lt-sb lt-del" id="lt-selDel">删除(0)</button></div>'+
'<input type="file" id="lt-file" accept=".txt,.md,text/plain,text/markdown" multiple style="display:none">'+
'<div class="lt-list" id="lt-list"></div></div>'+
'<div class="lt-reader" id="lt-reader" style="display:none"><div class="lt-rbod" id="lt-rbod"></div>'+
'<div class="lt-rfoot"><button class="lt-ibtn lt-arrow" id="lt-rprev"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 18-6-6 6-6"/></svg></button><span class="lt-rpos" id="lt-rpos"></span><button class="lt-ibtn lt-arrow" id="lt-rnext"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 18 6-6-6-6"/></svg></button></div></div>'+
'<div class="lt-view" id="lt-log" style="display:none"><div class="lt-log-hd"><span class="lt-s-ttl">运行日志</span>'+
'<span class="lt-log-cnt" id="lt-logCnt">0 条</span></div>'+
'<div class="lt-log-actions"><button class="lt-logbtn" id="lt-logCopy">复制</button><button class="lt-logbtn" id="lt-logClear">清空</button></div>'+
'<div class="lt-log-body" id="lt-logBody"></div></div>'+
'<div class="lt-bottombar" id="lt-bottombar"><button class="lt-log-fab" id="lt-openLog">⚙ 日志</button></div>'+
'<textarea id="lt-copytxt" readonly style="display:none;position:absolute;left:-9999px;top:0;opacity:0;width:1px;height:1px"></textarea>'+
'</div></div>';}
function ltFabHtml(){return '<button id="lt-fab" title="待时闲暇"><svg class="lt-fab-ic" viewBox="0 0 24 24" fill="none" stroke="#6a563c" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2"/></svg><span class="lt-fab-badge"></span></button>';}

/* ============ 渲染 ============ */
const LT_COLORS=['c0','c1','c2','c3','c4','c5'];
function ltSanitizeLib(){try{if(!Array.isArray(LT.lib)){LT.lib=[];}
  const clean=LT.lib.filter(bk=>bk&&bk.name&&Array.isArray(bk.chapters));
  clean.forEach((bk,i)=>{if(!bk.id)bk.id='bk'+i+'_'+Math.random().toString(36).slice(2,6);});
  LT.lib=clean;ltSaveLib();}catch(e){}}
function ltPct(bk){try{if(!bk||!Array.isArray(bk.chapters)||!bk.chapters.length)return 0;const tp=bk.chapters.reduce((a,c)=>a+(c&&Array.isArray(c.p)?c.p.length:0),0);if(!tp)return 0;let d=0;const ch=bk.pos&&bk.pos.ch!=null?bk.pos.ch:0,p=bk.pos&&bk.pos.p!=null?bk.pos.p:0;for(let i=0;i<Math.min(ch,bk.chapters.length);i++)d+=(bk.chapters[i]&&Array.isArray(bk.chapters[i].p)?bk.chapters[i].p.length:0);d+=p;return Math.min(100,Math.round(d/tp*100));}catch(e){return 0;}}
function ltRenderRecent(){const r=$g('lt-recent');if(!r)return;r.innerHTML='';ltSortLib();if(!LT.lib.length){r.innerHTML='<div class="lt-empty-recent">书架还是空的 · 点「进入书架」导入</div>';return;}LT.lib.slice(0,6).forEach((bk,i)=>{if(!bk||!Array.isArray(bk.chapters))return;const nm=ltEsc((bk.name||'书').slice(0,2));r.innerHTML+='<div class="lt-bkmini" data-idx="'+i+'" data-recent="1"><div class="lt-cv '+LT_COLORS[i%6]+'">'+nm+'</div><div class="lt-nm">'+ltEsc(bk.name||'书')+'</div><div class="lt-pr"><i style="width:'+ltPct(bk)+'%"></i></div></div>';});}
function ltRenderLib(){const l=$g('lt-list');if(!l)return;const c=$g('lt-bkCount');ltSortLib();if(c)c.textContent='共 '+LT.lib.length+' 本';l.innerHTML='';
  ltRenderSelBar();
  if(!LT.lib.length){l.innerHTML='<div class="lt-empty"><div class="lt-emoji"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" style="width:30px;height:30px;color:var(--gold-deep)"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg></div><p>书架空空如也<br>导入你的第一本小说吧</p><button class="lt-bigimport" data-import="1">＋ 导入小说</button></div>';return;}
  LT.lib.forEach((bk,i)=>{if(!bk||!Array.isArray(bk.chapters))return;const chCnt=bk.chapters.length;
    const sel=LT.selMode&&LT.selSet&&LT.selSet.has(i)?' on':'';
    const box=LT.selMode?'<span class="lt-cbox'+sel+'"></span>':'';
    l.innerHTML+='<div class="lt-lbook'+(LT.selMode?' sel-mode':'')+'" data-idx="'+i+'" data-id="'+ltEsc(bk.id||'')+'">'+box+
    '<div class="lt-lcv '+LT_COLORS[i%6]+'">'+ltEsc((bk.name||'书').slice(0,2))+'</div><div class="lt-lmeta"><div class="lt-row"><b>'+ltEsc(bk.name||'书')+'</b><span class="lt-tag">'+ltEsc(bk.type||'txt')+'</span></div><div class="lt-sub">'+chCnt+' 章 · 已读 '+ltPct(bk)+'%</div><div class="lt-pr"><i style="width:'+ltPct(bk)+'%"></i></div></div><span class="lt-lgo">›</span></div>';});}
/* 阅读器 */
function ltView(v){LT.view=v;const home=$g('lt-home'),shelf=$g('lt-shelf'),rd=$g('lt-reader'),lg=$g('lt-log'),bb=$g('lt-bottombar');
  home.style.display=v==='home'?'block':'none';shelf.style.display=v==='shelf'?'block':'none';rd.style.display=v==='reader'?'flex':'none';lg.style.display=v==='log'?'block':'none';
  $g('lt-back').style.display=(v==='home')?'none':'flex';
  $g('lt-title').textContent=v==='home'?'待时闲暇':v==='shelf'?'我的书架':v==='log'?'运行日志':'';
  if(bb)bb.style.display=(v==='reader')?'none':'flex';
  if(v==='log')ltRefreshLogs();}
/* 日志视图 */
function ltRenderLogs(){const b=$g('lt-logBody');if(!b||b.style.display==='none'&&$g('lt-log').style.display==='none'){}try{let c=$g('lt-logCnt');if(c)c.textContent=LT.logs.length+' 条';if(b&&$g('lt-log').style.display!=='none')ltRefreshLogs();}catch(e){}}
function ltRefreshLogs(){const b=$g('lt-logBody');if(!b)return;const c=$g('lt-logCnt');if(c)c.textContent=LT.logs.length+' 条';b.innerHTML=LT.logs.slice().reverse().map(l=>'<div class="lt-logline lv-'+l.lv+'"><span class="ts">'+l.ts+'</span><span class="lv">'+l.lv+'</span><span class="msg">'+ltEsc(l.msg)+'</span></div>').join('')||'<div class="lt-logline lv-info"><span class="msg">（暂无日志）</span></div>';}
function ltCopyLogs(){try{const txt=LT.logs.map(l=>'['+l.ts+']['+l.lv+'] '+l.msg).join('\n');
  function done(ok){ltToast(ok?'已复制日志':'复制失败，已展示文本框请长按复制');}
  function fallback(){try{const ta=document.getElementById('lt-copytxt');if(ta){ta.value=txt;ta.style.display='block';ta.select();ta.setSelectionRange(0,txt.length);try{if(document.execCommand('copy')){done(true);}else{done(false);}}catch(er){done(false);}}}catch(e){done(false);}}
  if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(txt).then(()=>done(true)).catch(()=>fallback());}else{fallback();}
}catch(e){ltToast('复制异常');}}
function ltClearLogs(){LT.logs.length=0;ltRefreshLogs();ltToast('日志已清空');}
function ltOpenReader(i){if(LT.selMode)return;const bk=LT.lib[i];if(!bk)return;LT.cur=i;bk.lastRead=Date.now();ltSaveLib();ltView('reader');$g('lt-title').textContent=bk.name;ltRenderChapter();}
/* ===== 多选删除（基于数组下标 index，最可靠） ===== */
function ltActiveIds(){const ids=[];if(!Array.isArray(LT.lib))return ids;for(let i=0;i<LT.lib.length;i++){if(LT.lib[i]&&Array.isArray(LT.lib[i].chapters))ids.push(i);}return ids;}
function ltEnterSel(){LT.selMode=true;if(!LT.selSet)LT.selSet=new Set();ltUpdateSelBtn();ltRenderLib();ltToast('已进入多选模式');}
function ltExitSel(){LT.selMode=false;LT.selSet=null;ltUpdateSelBtn();ltRenderLib();}
function ltToggleSel(){LT.selMode?ltExitSel():ltEnterSel();}
function ltSelOne(idx){if(!LT.selMode)return;if(!LT.selSet)LT.selSet=new Set();if(idx==null)return;if(LT.selSet.has(idx))LT.selSet.delete(idx);else LT.selSet.add(idx);ltRenderSelBar();ltRenderLib();}
function ltSelAll(){if(!LT.selMode)ltEnterSel();if(!LT.selSet)LT.selSet=new Set();const ids=ltActiveIds();const allSel=ids.length&&ids.every(i=>LT.selSet&&LT.selSet.has(i));LT.selSet=new Set(allSel?[]:ids);ltRenderSelBar();ltRenderLib();}
function ltSelCount(){return LT.selSet?LT.selSet.size:0;}
function ltUpdateSelBtn(){const b=$g('lt-multi');const lb=$g('lt-selbar');if(!b)return;b.classList.toggle('active',!!LT.selMode);b.textContent=LT.selMode?'完成':'多选';if(lb)lb.style.display=LT.selMode?'flex':'none';if(LT.selMode)ltRenderSelBar();}
function ltRenderSelBar(){const lb=$g('lt-selbar');if(!lb)return;if(!LT.selMode){lb.style.display='none';return;}lb.style.display='flex';
  const n=ltSelCount();const d=$g('lt-selDel');if(d)d.textContent='删除('+n+')';const a=$g('lt-selAll');if(a){const ids=ltActiveIds();a.textContent=(n===ids.length&&ids.length)?'取消全选':'全选';}}
function ltDeleteSel(){if(!LT.selMode||!LT.selSet||!LT.selSet.size){ltToast('未选择任何书');return;}if(!confirm('确定删除选中的 '+LT.selSet.size+' 本书？'))return;
  LT.lib=LT.lib.filter((b,i)=>!LT.selSet.has(i));LT.cur=null;ltSaveLib();ltExitSel();ltRenderRecent();ltToast('已删除');}
function ltRenderChapter(){let bk=LT.lib[LT.cur];if(!bk)return;bk.pos=bk.pos||{ch:0,p:0};if(!Array.isArray(bk.chapters)||!bk.chapters.length)return;const ch=Math.min(bk.pos.ch||0,bk.chapters.length-1);const c=bk.chapters[ch]||{t:'全文',p:[]};
  const pd=LT.font+'px';let html='<h2 style="font-size:18px;margin:4px 0 16px">'+ltEsc(c.t||'')+'</h2>';
  html+=(c.p&&c.p.length)?c.p.map(p=>'<p style="font-size:'+pd+';text-indent:2em;line-height:2;color:var(--ink)">'+ltEsc(p)+'</p>').join(''):'<p style="text-align:center;color:var(--ink3)">（本章为空）</p>';
  const rbo=$g('lt-rbod');if(rbo){rbo.innerHTML=html;rbo.scrollTop=0;}
  const rpo=$g('lt-rpos');if(rpo)rpo.textContent=(ch+1)+' / '+bk.chapters.length+' 章';ltSaveLib();}
function ltRnav(d){let bk=LT.lib[LT.cur];if(!bk||!Array.isArray(bk.chapters)||!bk.chapters.length)return;bk.pos=bk.pos||{ch:0,p:0};let ch=bk.pos.ch||0;ch+=d;if(ch<0||ch>=bk.chapters.length)return;bk.pos.ch=ch;bk.pos.p=0;ltRenderChapter();}
function ltFontD(d){LT.font=Math.max(13,Math.min(24,LT.font+d));LTLS.set('lt_font',LT.font);document.querySelectorAll('#lt-rbod p').forEach(p=>p.style.fontSize=LT.font+'px');}

/* ============ 初始化：注入 + 绑定 + 拖拽 ============ */
function ltDoInit(){
  if(LT.initialized)return;LT.initialized=true;
  ltCaptureAll();ltSanitizeLib();
  try{if(!$g('lt-fab'))document.documentElement.insertAdjacentHTML('beforeend',ltFabHtml());ltBindFabDrag();}catch(e){ltWarn('FAB失败',e);}
  try{if(!$g('lt-modal'))document.documentElement.insertAdjacentHTML('beforeend',ltModalHtml());ltBind();ltMakeDraggable();ltApplyTheme();ltNewGame();ltRenderRecent();ltRenderLib();}catch(e){ltWarn('小窗失败',e);}
  ltExpose();
  ltLog('初始化完成 v'+LT_VERSION);
}
/* 把需要内联 onclick 调用的函数显式挂到全局（规避模块/严格模式作用域问题） */
function ltExpose(){try{
  window.ltOpenReader=ltOpenReader;window.ltOpenFile=ltOpenFile;
  window.ltView=ltView;window.ltFontD=ltFontD;window.ltRnav=ltRnav;
  window.ltRenderLib=ltRenderLib;window.ltRenderRecent=ltRenderRecent;
  window.ltToggleTheme=ltToggleTheme;window.ltToggleFull=ltToggleFull;
  window.ltCopyLogs=ltCopyLogs;window.ltClearLogs=ltClearLogs;
  window.ltToggleSel=ltToggleSel;window.ltExitSel=ltExitSel;window.ltSelAll=ltSelAll;window.ltDeleteSel=ltDeleteSel;
}catch(e){ltWarn('expose失败',e);}}
function ltBind(){
  const el=id=>$g(id);
  el('lt-fab').addEventListener('click',ltOpen);
  el('lt-close').addEventListener('click',ltClose);
  el('lt-backdrop').addEventListener('click',ltClose);
  el('lt-theme').addEventListener('click',ltToggleTheme);
  el('lt-full').addEventListener('click',ltToggleFull);
  el('lt-new').addEventListener('click',ltNewGame);
  el('lt-ovnew').addEventListener('click',ltNewGame);
  el('lt-undo').addEventListener('click',ltUndo);
  el('lt-goShelf').addEventListener('click',()=>ltView('shelf'));
  el('lt-back').addEventListener('click',()=>{if(LT.view==='reader')ltView('shelf');else if(LT.view==='shelf')ltView('home');else if(LT.view==='log')ltView('home');});
  el('lt-import').addEventListener('click',ltOpenFile);
  el('lt-bigimport')?.addEventListener('click',ltOpenFile);
  el('lt-multi').addEventListener('click',ltToggleSel);
  el('lt-selAll').addEventListener('click',ltSelAll);
  el('lt-selCancel').addEventListener('click',ltExitSel);
  el('lt-selDel').addEventListener('click',ltDeleteSel);
  el('lt-rprev').addEventListener('click',()=>ltRnav(-1));
  el('lt-rnext').addEventListener('click',()=>ltRnav(1));
  el('lt-openLog').addEventListener('click',()=>ltView('log'));
  el('lt-logCopy').addEventListener('click',ltCopyLogs);
  el('lt-logClear').addEventListener('click',ltClearLogs);
  /* 事件委托：书架列表 + 最近阅读（避免依赖内联 onclick 全局）
     通过 data-idx / data-import 判断目标 */
  $g('lt-modal').addEventListener('click',e=>{
    const t=e.target;
    const imp=t.closest?t.closest('[data-import]'):null;
    if(imp){ltOpenFile();return;}
    const book=t.closest?t.closest('[data-idx]'):null;
    if(book){const i=parseInt(book.getAttribute('data-idx'));if(!isNaN(i)&&LT.lib[i]){
      if(LT.selMode){ltSelOne(i);}
      else{ltOpenReader(i);}
      return;}}
  });
  ltRenderLogs();
  /* 2048 键盘 + 滑动 */
  document.addEventListener('keydown',e=>{const m=$g('lt-modal');if(!m||!m.classList.contains('open'))return;const map={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right'};if(map[e.key]){e.preventDefault();ltMove(map[e.key]);}});
  const bw=$g('lt-boardWrap');let tx=0,ty=0;
  bw.addEventListener('touchstart',e=>{tx=e.touches[0].clientX;ty=e.touches[0].clientY;},{passive:true});
  bw.addEventListener('touchend',e=>{const dx=e.changedTouches[0].clientX-tx,dy=e.changedTouches[0].clientY-ty;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;ltMove(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));},{passive:true});
  let mx=0,my=0,md=false;
  bw.addEventListener('mousedown',e=>{md=true;mx=e.clientX;my=e.clientY;});
  window.addEventListener('mouseup',e=>{if(!md)return;md=false;const dx=e.clientX-mx,dy=e.clientY-my;if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;ltMove(Math.abs(dx)>Math.abs(dy)?(dx>0?'right':'left'):(dy>0?'down':'up'));});
}
function ltSetFile(){const f=$g('lt-file');if(!f)return;f.onchange=e=>{Array.from(e.target.files||[]).forEach(ltAddBook);e.target.value='';};}
function ltOpen(){$g('lt-backdrop').classList.add('show');$g('lt-modal').classList.add('open');}
function ltClose(){$g('lt-backdrop').classList.remove('show');$g('lt-modal').classList.remove('open');}
function ltApplyTheme(){$g('lt-modal').classList.toggle('night',LT.theme==='night');}
function ltToggleTheme(){LT.theme=LT.theme==='day'?'night':'day';LTLS.set('lt_theme',LT.theme);ltApplyTheme();}
function ltToggleFull(){const m=$g('lt-modal');if(m.classList.contains('full')){m.classList.remove('full');m.style.left='50%';m.style.top='50%';}else{m.classList.add('full');}}
function ltMakeDraggable(){const modal=$g('lt-modal'),bar=$g('lt-titlebar');let sx=0,sy=0,ox=0,oy=0,down=false,drag=false;
  const pick=(cx,cy)=>{down=true;drag=false;sx=cx;sy=cy;ox=parseFloat(modal.style.left)||(window.innerWidth-modal.offsetWidth)/2;oy=parseFloat(modal.style.top)||(window.innerHeight-modal.offsetHeight)/2;};
  const mv=(cx,cy)=>{if(!down||modal.classList.contains('full'))return;const dx=cx-sx,dy=cy-sy;if(!drag&&Math.hypot(dx,dy)>6)drag=true;if(drag){modal.style.left=(ox+dx)+'px';modal.style.top=(oy+dy)+'px';modal.style.transform='none';modal.style.margin='0';}};
  const up=()=>{down=false;drag=false;};
  bar.addEventListener('mousedown',e=>{e.preventDefault();pick(e.clientX,e.clientY);const wm=ev=>mv(ev.clientX,ev.clientY),wu=()=>{up();window.removeEventListener('mousemove',wm);window.removeEventListener('mouseup',wu);};window.addEventListener('mousemove',wm);window.addEventListener('mouseup',wu);});
  bar.addEventListener('touchstart',e=>{pick(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  bar.addEventListener('touchmove',e=>{mv(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  bar.addEventListener('touchend',up,{passive:true});
}
function ltBindFabDrag(){const fab=$g('lt-fab');const saved=LTLS.get('lt_fab_pos',null)||{};const fs=27;
  const place=()=>{const vw=window.innerWidth,vh=window.innerHeight;let x=saved.x!=null?saved.x:(vw-fs-14);x=Math.max(6,Math.min(vw-fs-6,x));let y=saved.y!=null?saved.y:(vh*0.5-fs/2);y=Math.max(6,Math.min(vh-fs-6,y));fab.style.left=x+'px';fab.style.top=y+'px';};
  place();let sx=0,sy=0,ox=0,oy=0,down=false,drag=false;
  const start=(cx,cy)=>{down=true;drag=false;sx=cx;sy=cy;ox=parseFloat(fab.style.left)||0;oy=parseFloat(fab.style.top)||0;};
  const move=(cx,cy)=>{if(!down)return;const dx=cx-sx,dy=cy-sy;if(!drag&&Math.hypot(dx,dy)>6)drag=true;if(drag){fab.style.left=(ox+dx)+'px';fab.style.top=(oy+dy)+'px';}};
  const end=()=>{if(down&&drag){saved.x=parseFloat(fab.style.left);saved.y=parseFloat(fab.style.top);LTLS.set('lt_fab_pos',saved);}down=false;drag=false;};
  const wm=e=>move(e.clientX,e.clientY),wu=()=>{end();window.removeEventListener('mousemove',wm);window.removeEventListener('mouseup',wu);};
  fab.addEventListener('mousedown',e=>{e.preventDefault();start(e.clientX,e.clientY);window.addEventListener('mousemove',wm);window.addEventListener('mouseup',wu);});
  fab.addEventListener('touchstart',e=>{start(e.touches[0].clientX,e.touches[0].clientY);},{passive:true});
  const fms=(e)=>move(e.touches[0].clientX,e.touches[0].clientY),fmu=()=>{end();fab.removeEventListener('touchmove',fms);fab.removeEventListener('touchend',fmu);};
  fab.addEventListener('touchmove',fms,{passive:true});fab.addEventListener('touchend',fmu,{passive:true});
}

/* ============ ST 注册入口 ============ */
jQuery(async()=>{
  let done=false;
  const fire=()=>{if(done)return;done=true;try{ltDoInit()}catch(e){ltWarn(e)}};
  const c=ltGetCtx();
  if(c.es&&typeof c.es.on==='function'&&c.et&&c.et.APP_READY)c.es.on(c.et.APP_READY,fire);
  const t0=Date.now();
  const iv=setInterval(()=>{const ctx=ltGetCtx();const ready=!!(typeof extension_settings!=='undefined')||!!(window.extension_settings);const force=(Date.now()-t0)>3500;if(ready||force){clearInterval(iv);fire();}},250);
});
