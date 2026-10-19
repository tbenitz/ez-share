import {SHA256,hashFile} from './hash.js';
const $=id=>document.getElementById(id);
const rooms=new Map(), alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let peer=null, pending=new Map(), online=false;
const settings=JSON.parse(localStorage.getItem('ezshare-peer-settings')||'{}');
const $status=(id,msg)=>{$(id).textContent=msg;};
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const fmt=n=>n<1024?n+' B':(n/1024**Math.floor(Math.log(n)/Math.log(1024))).toFixed(1)+' '+['B','KB','MB','GB','TB'][Math.floor(Math.log(n)/Math.log(1024))];
const codeClean=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9-]/g,'');
const nice=s=>String(s).replace(/[\\/\x00-\x1f\x7f]/g,'_').slice(0,180)||'download';
const rand=n=>{const a=crypto.getRandomValues(new Uint8Array(n));return Array.from(a,x=>alphabet[x%alphabet.length]).join('');};
const shaHex=a=>Array.from(a,x=>x.toString(16).padStart(2,'0')).join('');
const encode=new TextEncoder();
async function proof(pass,salt){const m=await crypto.subtle.importKey('raw',encode.encode(pass),'PBKDF2',false,['deriveBits']);return shaHex(new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:encode.encode(salt),iterations:150000,hash:'SHA-256'},m,256)));}
function say(s){const t=$('toast');t.textContent=s;t.classList.add('show');setTimeout(()=>t.classList.remove('show'),4500);}
function url(code){const u=new URL(location.href);u.search='';u.hash='';u.searchParams.set('code',code);return u.href;}
function updateCount(){$('count').textContent=[...rooms.values()].filter(x=>!x.dead).length+' active';}
function status(room,message,percent){if(room.el){room.el.querySelector('.state').textContent=message;if(percent!==undefined)room.el.querySelector('.fill').style.width=Math.max(0,Math.min(100,percent))+'%';}}
function makeButton(label,action,cls='subtle'){const b=document.createElement('button');b.type='button';b.className=cls;b.textContent=label;b.onclick=action;return b;}
function card(room){
 const el=document.createElement('article');el.className='session';
 const head=document.createElement('div');head.className='session-head';
 const info=document.createElement('div');const title=document.createElement('strong');title.textContent=room.file?.name||room.name;const desc=document.createElement('small');desc.textContent=room.code+' · '+fmt(room.size||room.file?.size||0);info.append(title,desc);
 const actions=document.createElement('div');actions.className='actions';head.append(info,actions);
 const state=document.createElement('p');state.className='state';state.textContent='Connecting…';
 const track=document.createElement('div');track.className='track';const fill=document.createElement('div');fill.className='fill';track.append(fill);
 el.append(head,state,track);$('sessions').querySelector('.empty-session')?.remove();$('sessions').prepend(el);room.el=el;room.actions=actions;
 actions.append(makeButton('Copy code',()=>navigator.clipboard.writeText(room.code).then(()=>say('Code copied')).catch(()=>say(room.code))));
 actions.append(makeButton('Copy link',()=>navigator.clipboard.writeText(url(room.code)).then(()=>say('Link copied')).catch(()=>say(url(room.code)))));
 actions.append(makeButton('Stop',()=>stopRoom(room),'danger'));
 updateCount();
}
function stopRoom(room){if(room.dead)return;room.dead=true;clearInterval(room.timer);for(const c of room.conns||[])try{c.close()}catch{};try{room.host?.destroy()}catch{};rooms.delete(room.code);room.el?.remove();if(!$('sessions').children.length)$('sessions').innerHTML='<div class="empty-session">No live sessions. Choose a file to start.</div>';updateCount();}
function options(id){const p={debug:0,config:{iceServers:[{urls:'stun:stun.l.google.com:19302'},{urls:'stun:stun.cloudflare.com:3478'}]}};if(settings.host){p.host=settings.host;p.port=Number(settings.port)||443;p.path=settings.path||'/';p.secure=true;}if(settings.turnUrl){p.config.iceServers.push({urls:settings.turnUrl,username:settings.turnUser||'',credential:settings.turnPass||''});}return p;}
function newPeer(id){return new window.Peer(id,options(id));}
function readyPeer(p,timeout=15000){return new Promise((resolve,reject)=>{let timer=setTimeout(()=>{off();reject(Error('PeerJS connection timeout'));},timeout);function off(){clearTimeout(timer);p.off('open',on);p.off('error',err);}function on(v){off();resolve(v)}function err(e){off();reject(e)}p.on('open',on);p.on('error',err);});}
async function init(){
 if(!window.Peer){$status('network','PeerJS script blocked or unavailable');return;}
 try{peer=newPeer(undefined);await readyPeer(peer);online=true;$('dot').classList.add('ok');$status('network','PeerJS connected');}catch(e){$status('network','PeerJS unavailable: '+e.message);}
}
function connOpen(c){return new Promise((resolve,reject)=>{if(c.open)return resolve();const t=setTimeout(()=>{c.off('open',ok);c.off('error',bad);reject(Error('Connection timed out'));},17000);function ok(){clearTimeout(t);c.off('error',bad);resolve()}function bad(e){clearTimeout(t);c.off('open',ok);reject(e)}c.on('open',ok);c.on('error',bad);});}
function waitPacket(c,pred,timeout=20000){return new Promise((resolve,reject)=>{const t=setTimeout(()=>{clean();reject(Error('Peer response timed out'));},timeout);function handle(v){if(pred(v)){clean();resolve(v);}}function closed(){clean();reject(Error('Peer disconnected'));}function clean(){clearTimeout(t);c.off('data',handle);c.off('close',closed);}c.on('data',handle);c.on('close',closed);});}
async function makeHost(room,fromRecovery=false){
 if(room.dead||Date.now()>=room.expiry)return;
 const host=newPeer('ezs-'+room.code.toLowerCase());room.host=host;room.conns ||=new Set();
 host.on('connection',c=>{room.conns.add(c);c.on('close',()=>room.conns.delete(c));handleHost(room,c).catch(e=>{status(room,'Transfer issue: '+e.message);try{c.close()}catch{}});});
 host.on('error',e=>{if(e.type==='unavailable-id'&&fromRecovery){status(room,'Another file holder is hosting · standby');setTimeout(()=>recover(room),3500);}else if(!room.dead)status(room,'Peer error: '+e.message);});
 try{await readyPeer(host,13000);status(room,'Live · '+room.code+' · '+room.completed+' completed downloads',100);room.timer=setInterval(()=>{if(Date.now()>=room.expiry||(room.limit&&room.completed>=room.limit))stopRoom(room)},3000);}
 catch(e){try{host.destroy()}catch{};if(fromRecovery&&e.type==='unavailable-id')recover(room);else throw e;}
}
async function handleHost(room,c){
 await connOpen(c);if(room.dead)return c.close();
 c.send({t:'hello',locked:!!room.passwordHash});
 let req=await waitPacket(c,x=>x?.t==='request',18000);
 if(req.pass && room.passwordHash && await proof(req.pass,room.code)!==room.passwordHash){c.send({t:'error',message:'Incorrect password'});return;}
 if(room.passwordHash&&!req.pass){c.send({t:'error',message:'Password required'});return;}
 if(room.expiry<Date.now()){c.send({t:'error',message:'Share expired'});return;}
 if(room.limit && room.completed+room.inflight>=room.limit){c.send({t:'error',message:'Download limit reached'});return;}
 room.inflight++;
 try{
 c.send({t:'meta',name:room.file.name,size:room.file.size,mime:room.file.type||'application/octet-stream',sha:room.sha,expiry:room.expiry,limit:room.limit,reseed:room.reseed,completed:room.completed,passwordHash:room.passwordHash,code:room.code});
 const start=await waitPacket(c,x=>x?.t==='start',50000);
 if(start.t!=='start')return;
 const size=room.file.size;let sent=0;const chunk=48*1024;
 for(let off=0;off<size;off+=chunk){
  if(!c.open||room.dead)throw Error('Connection interrupted');
  while((c.dataChannel?.bufferedAmount||0)>4*1024*1024){await delay(35);if(!c.open)throw Error('Connection closed');}
  const piece=await room.file.slice(off,off+chunk).arrayBuffer();c.send(piece);sent+=piece.byteLength;
  if(off%(chunk*64)===0||sent===size)status(room,'Sending · '+fmt(sent)+' / '+fmt(size),size?sent/size*100:100);
 }
 c.send({t:'end'});
 const done=await waitPacket(c,x=>x?.t==='verified'||x?.t==='error',120000);
 if(done.t!=='verified')throw Error('Receiver failed verification');
 room.completed++;status(room,'Live · '+room.completed+' verified download(s)',100);
 c.send({t:'accepted',completed:room.completed});
 if(room.limit&&room.completed>=room.limit)stopRoom(room);
 }finally{room.inflight--;setTimeout(()=>{try{c.close()}catch{}},1500);}
}
async function recover(room){if(room.dead||!room.file||!room.reseed||Date.now()>room.expiry||(room.limit&&room.completed>=room.limit))return;
 if(room.host&&!room.host.destroyed&&!room.host.disconnected)return;
 await delay(1500+Math.random()*4000);
 if(room.dead||room.host&&!room.host.destroyed&&!room.host.disconnected)return;
 try{await makeHost(room,true);}catch(e){status(room,'Waiting for room host · '+e.message);room.timer=setTimeout(()=>recover(room),6000);}
}
async function sendCreate(){
 const file=$('file').files[0];if(!file){$status('createStatus','Select a file first.');return;}
 if(!online){$status('createStatus','PeerJS is not connected. Check your connection.');return;}
 const code=codeClean($('code').value)||rand(14);
 if(!/^[A-Z0-9-]{8,32}$/.test(code)){$status('createStatus','Code must have 8–32 letters, digits or hyphens.');return;}
 if(rooms.has(code)){$status('createStatus','This code is already active in this tab.');return;}
 const pass=$('password').value;if(pass&&pass.length<10){$status('createStatus','Password must contain at least 10 characters.');return;}
 $('create').disabled=true;$status('createStatus','Hashing file for integrity verification…');
 const room={code,file,name:file.name,size:file.size,sha:'',expiry:Date.now()+Number($('expiry').value)*1000,limit:Number($('limit').value),completed:0,inflight:0,reseed:$('reseed').checked&&$('limit').value!=='1',passwordHash:pass?await proof(pass,code):null,dead:false};
 try{room.sha=await hashFile(file,p=>$status('createStatus','Checking file integrity · '+Math.round(p*100)+'%'));rooms.set(code,room);card(room);await makeHost(room);$status('createStatus','Share is live · '+code);$('code').value='';$('password').value='';}
 catch(e){stopRoom(room);$status('createStatus','Could not create share: '+e.message);}finally{$('create').disabled=false;}
}
async function findRoom(code){if(!online)throw Error('PeerJS is offline');
 const c=peer.connect('ezs-'+code.toLowerCase(),{reliable:true,serialization:'binary'});await connOpen(c);return c;}
async function lookup(code){
 code=codeClean(code);if(!/^[A-Z0-9-]{8,32}$/.test(code))return say('Enter a valid share code (8–32 characters)');
 const out=$('result');out.replaceChildren();const msg=document.createElement('p');msg.textContent='Looking for an active file holder…';out.append(msg);
 try{const c=await findRoom(code);const hello=await waitPacket(c,x=>x?.t==='hello',12000);
 const pass=hello.locked?prompt('This share is password protected. Enter the password:'):null;
 if(hello.locked&&pass===null){c.close();msg.textContent='Password required to continue';return;}
 c.send({t:'request',pass:pass||''});
 const m=await waitPacket(c,x=>x?.t==='meta'||x?.t==='error',17000);if(m.t==='error')throw Error(m.message);
 out.replaceChildren();const strong=document.createElement('strong');strong.textContent=nice(m.name);const small=document.createElement('p');small.textContent=fmt(m.size)+' · SHA-256 verified · expires '+new Date(m.expiry).toLocaleString();const b=makeButton('Download file ↓',()=>receive(c,m,b),'primary');out.append(strong,small,b);
 }catch(e){msg.textContent='Offline or unavailable: '+e.message+' · Ask a complete file holder to keep the tab open.';}
}
async function receive(c,m,b){
 b.disabled=true;b.textContent='Preparing download…';const disk=!!window.showSaveFilePicker;
 let handle,writer,chunks=[],received=0;const hasher=new SHA256();
 try{if(disk){try{handle=await window.showSaveFilePicker({suggestedName:nice(m.name)});writer=await handle.createWritable();}catch(e){if(e.name==='AbortError'){b.disabled=false;b.textContent='Download file ↓';return;}throw e;}}
 const room={code:m.code,name:m.name,size:m.size,dead:false,expiry:m.expiry,limit:m.limit,reseed:m.reseed,passwordHash:m.passwordHash,completed:m.completed,conns:new Set([c])};card(room);status(room,'Receiving · 0%',0);c.send({t:'start'});
 await new Promise((resolve,reject)=>{
  let chain=Promise.resolve(),ended=false;
  const timeout=setTimeout(()=>reject(Error('Transfer timed out')),1800000);
  const handleData=x=>{chain=chain.then(async()=>{
   if(x instanceof ArrayBuffer||ArrayBuffer.isView(x)){
    const bytes=x instanceof ArrayBuffer?new Uint8Array(x):new Uint8Array(x.buffer,x.byteOffset,x.byteLength);
    if(received+bytes.byteLength>m.size)throw Error('Received more than expected');
    hasher.update(bytes);if(writer)await writer.write(bytes);else chunks.push(new Uint8Array(bytes));received+=bytes.byteLength;
    if(chunks.length>100000)throw Error('File too large for in-memory download: use Chrome/Edge Save As');
    status(room,'Receiving · '+fmt(received)+' / '+fmt(m.size),m.size?received/m.size*100:100);return;
   }
   if(x?.t==='end'){
    if(received!==m.size)throw Error('Incomplete file');
    if(hasher.digestHex()!==m.sha)throw Error('SHA-256 verification failed');
    if(writer){await writer.close();writer=null;room.file=await handle.getFile();}
    else{room.file=new Blob(chunks,{type:m.mime});chunks=[];const link=document.createElement('a');const object=URL.createObjectURL(room.file);link.href=object;link.download=nice(m.name);document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(object),60000);}
    ended=true;c.send({t:'verified'});status(room,'Verified · download complete',100);
   }else if(x?.t==='accepted'&&ended){room.completed=x.completed;clearTimeout(timeout);c.off('data',handleData);c.off('close',closed);resolve();}
   else if(x?.t==='error')throw Error(x.message);
  }).catch(e=>{clearTimeout(timeout);reject(e);});};
  const closed=()=>{if(!ended){clearTimeout(timeout);reject(Error('Host disconnected during transfer'));}};
  c.on('data',handleData);c.on('close',closed);
 });
 b.textContent='Downloaded ✓';
 if(room.reseed&&(!room.limit||room.completed<room.limit)){
  status(room,'Verified · becoming a backup host…',100);c.close();await recover(room);
 }else{room.dead=true;room.actions?.append(makeButton('Remove',()=>stopRoom(room)));}
 }catch(e){if(writer)await writer.abort().catch(()=>{});b.disabled=false;b.textContent='Retry download';say('Download failed: '+e.message);const room=rooms.get(m.code);if(room)stopRoom(room);}
}
$('file').onchange=()=>{$('fileLabel').textContent=$('file').files[0]?.name||'Drop a file or browse'};
$('drop').ondragover=e=>{e.preventDefault();$('drop').classList.add('hover')};
$('drop').ondragleave=()=>$('drop').classList.remove('hover');
$('drop').ondrop=e=>{e.preventDefault();$('drop').classList.remove('hover');if(e.dataTransfer.files.length){$('file').files=e.dataTransfer.files;$('file').dispatchEvent(new Event('change'));}};
$('create').onclick=sendCreate;
$('findForm').onsubmit=e=>{e.preventDefault();lookup($('findCode').value)};
$('limit').onchange=()=>{if($('limit').value==='1'){$('reseed').checked=false;$('reseed').disabled=true}else $('reseed').disabled=false};
$('settingsButton').onclick=()=>{$('peerHost').value=settings.host||'';$('peerPort').value=settings.port||'';$('peerPath').value=settings.path||'/';$('turnUrl').value=settings.turnUrl||'';$('turnUser').value=settings.turnUser||'';$('turnPass').value=settings.turnPass||'';$('settings').showModal()};
$('saveSettings').onclick=()=>{const newSettings={host:$('peerHost').value.trim(),port:$('peerPort').value,path:$('peerPath').value||'/',turnUrl:$('turnUrl').value.trim(),turnUser:$('turnUser').value,turnPass:$('turnPass').value};localStorage.setItem('ezshare-peer-settings',JSON.stringify(newSettings));say('Connection settings saved. Reload to apply changes.');};
const q=new URLSearchParams(location.search).get('code');if(q)$('findCode').value=codeClean(q);
window.addEventListener('beforeunload',()=>{for(const room of rooms.values())try{room.host?.destroy()}catch{};});
init().then(()=>{if(q&&online)lookup(q);});