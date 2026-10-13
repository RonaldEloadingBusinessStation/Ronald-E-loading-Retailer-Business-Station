const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];let adminKey='';let adminOpened=false;
function esc(v){return String(v??'').replace(/[&<>\"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c]))}function money(c){return '₱'+(Number(c||0)/100).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}function msg(el,text,type=''){el.textContent=text;el.className='msg '+type}
async function api(url,options={}){const r=await fetch(url,{credentials:'same-origin',...options});let d={};try{d=await r.json()}catch{}if(!r.ok)throw new Error(d.error||'Something went wrong.');return d}
function formObj(form){return Object.fromEntries(new FormData(form).entries())}
$$('[data-auth]').forEach(b=>b.onclick=()=>{const reg=b.dataset.auth==='register';$$('[data-auth]').forEach(x=>x.classList.toggle('active',x===b));$('#loginForm').hidden=reg;$('#registerForm').hidden=!reg;msg($('#authMsg'),'')});
$('#loginForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const b=f.querySelector('button');b.disabled=true;try{await api('/api/retailer/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formObj(f))});f.reset();await loadApp()}catch(x){msg($('#authMsg'),x.message,'error')}finally{b.disabled=false}};
$('#registerForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget;const b=f.querySelector('button');b.disabled=true;try{await api('/api/retailer/register',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formObj(f))});f.reset();await loadApp()}catch(x){msg($('#authMsg'),x.message,'error')}finally{b.disabled=false}};
$('#logout').onclick=async()=>{await api('/api/retailer/logout',{method:'POST'}).catch(()=>{});$('#app').hidden=true;$('#auth').hidden=false;adminKey='';adminOpened=false};
$$('[data-view]').forEach(b=>b.onclick=()=>{ $$('.navtab').forEach(x=>x.classList.toggle('active',x===b));$$('.panel').forEach(p=>p.hidden=p.id!=='view-'+b.dataset.view);if(b.dataset.view==='history')loadApp();if(b.dataset.view==='admin'&&adminOpened)loadAdmin()});
async function loadApp(){try{const d=await api('/api/retailer/me');$('#auth').hidden=true;$('#app').hidden=false;$('#displayName').textContent=d.user.display_name;$('#wallet').textContent=money(d.user.wallet_cents);renderTable('#ordersList',['Order','Customer / Mobile','Network / Promo','Amount','Status','Date'],d.orders.map(o=>[esc(o.order_number),`${esc(o.customer_name)}<br>${esc(o.mobile)}`,`${esc(o.network)}<br>${esc(o.promo)}`,money(o.amount_cents),badge(o.status),esc(new Date(o.created_at).toLocaleString())]));renderTable('#topupsList',['Request','Amount','Method / Ref','Status','Date'],d.topups.map(t=>['#'+t.id,money(t.amount_cents),`${t.method}<br>${t.reference||'—'}`,badge(t.status),new Date(t.created_at).toLocaleString()]));renderTable('#ledgerList',['Type','Amount','Reference','Description','Date'],d.ledger.map(l=>[l.kind,`<span class="${Number(l.amount_cents)<0?'negative':'positive'}">${money(l.amount_cents)}</span>`,l.reference,l.description,new Date(l.created_at).toLocaleString()]));}catch(e){if(!$('#auth').hidden){msg($('#authMsg'),e.message,'error')}else{alert(e.message)}}}
function badge(s){const v=String(s||'').toUpperCase();return `<span class="badge ${v.toLowerCase()}">${v}</span>`}function renderTable(sel,heads,rows){const el=$(sel);if(!rows.length){el.innerHTML='<div class="empty">No records yet.</div>';return}el.innerHTML='<div class="tablewrap"><table><thead><tr>'+heads.map(h=>`<th>${h}</th>`).join('')+'</tr></thead><tbody>'+rows.map(row=>'<tr>'+row.map(v=>`<td>${v??'—'}</td>`).join('')+'</tr>').join('')+'</tbody></table></div>'}
$('#orderForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;msg($('#orderMsg'),'Submitting order…');try{const d=await api('/api/retailer/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formObj(f))});f.reset();msg($('#orderMsg'),`${d.message} Order number: ${d.order.order_number}`,'success');await loadApp()}catch(x){msg($('#orderMsg'),x.message,'error')}finally{b.disabled=false}};
$('#topupForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;msg($('#topupMsg'),'Sending request…');try{const d=await api('/api/retailer/topups',{method:'POST',body:new FormData(f)});f.reset();msg($('#topupMsg'),d.message,'success');await loadApp()}catch(x){msg($('#topupMsg'),x.message,'error')}finally{b.disabled=false}};
$('#adminLogin').onsubmit=async e=>{e.preventDefault();adminKey=$('#adminKey').value;adminOpened=true;await loadAdmin()};
async function adminApi(url,opts={}){return api(url,{...opts,headers:{'x-admin-key':adminKey,...(opts.headers||{})}})}
async function loadAdmin(){try{const d=await adminApi('/api/retailer/admin/overview');$('#adminMsg').textContent='Admin access verified.';$('#adminData').hidden=false;$('#adminData').innerHTML='<h3>Retailers</h3><div id="adminUsers"></div><h3 class="subhead">Pending top-ups</h3><div id="adminTopups"></div><h3 class="subhead">Processing orders</h3><div id="adminOrders"></div><h3 class="subhead">Manual wallet adjustment</h3><form id="adjustForm" class="inlineform"><input name="userId" type="number" placeholder="Retailer ID" required><input name="amount" type="number" step="0.01" placeholder="+500 or -50" required><input name="reason" placeholder="Reason" required><button class="btn">Apply adjustment</button></form><div id="adjustMsg" class="msg"></div>';
renderTable('#adminUsers',['ID','Retailer','Wallet','Status','Created'],d.users.map(u=>[u.id,`${esc(u.display_name)}<br>@${esc(u.username)}`,money(u.wallet_cents),u.active?'Active':'Disabled',esc(new Date(u.created_at).toLocaleDateString())]));
renderAdminActions('#adminTopups',['ID','Retailer','Amount','Payment','Reference','Receipt','Status','Actions'],d.topups.filter(t=>t.status==='PENDING').map(t=>[t.id,`${esc(t.display_name)}<br>@${esc(t.username)}`,money(t.amount_cents),esc(t.method),esc(t.reference||'—'),t.receipt_path?'Uploaded':'—',badge(t.status),`<div class="admin-actions"><button class="mini" data-action="approve-topup" data-id="${t.id}">Approve</button><button class="mini danger" data-action="reject-topup" data-id="${t.id}">Reject</button></div>`]));
renderAdminActions('#adminOrders',['ID / Order','Retailer','Customer / Mobile','Network / Promo','Amount','Status','Actions'],d.orders.filter(o=>o.status==='PROCESSING').map(o=>[`${o.id}<br>${esc(o.order_number)}`,`${esc(o.display_name)}<br>@${esc(o.username)}`,`${esc(o.customer_name)}<br>${esc(o.mobile)}`,`${esc(o.network)}<br>${esc(o.promo)}`,money(o.amount_cents),badge(o.status),`<div class="admin-actions"><button class="mini" data-action="complete-order" data-id="${o.id}">Mark completed</button><button class="mini danger" data-action="reject-order" data-id="${o.id}">Reject</button></div>`]));
$('#adminData').querySelectorAll('[data-action]').forEach(b=>b.onclick=async()=>{const a=b.dataset.action,id=b.dataset.id;const paths={'approve-topup':`/api/retailer/admin/topups/${id}/approve`,'reject-topup':`/api/retailer/admin/topups/${id}/reject`,'complete-order':`/api/retailer/admin/orders/${id}/complete`,'reject-order':`/api/retailer/admin/orders/${id}/reject`};let confirmation=a==='complete-order'?'Confirm that the load was successful? The retailer wallet will be deducted now.':a==='approve-topup'?'Confirm you verified the payment receipt and want to add this amount to the wallet?':'Confirm this action?';if(!confirm(confirmation))return;try{await adminApi(paths[a],{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});msg($('#adminMsg'),'Action completed.','success');await loadAdmin();await loadApp()}catch(x){msg($('#adminMsg'),x.message,'error')}});
$('#adjustForm').onsubmit=async ev=>{ev.preventDefault();try{await adminApi('/api/retailer/admin/wallet-adjust',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(formObj(ev.currentTarget))});ev.currentTarget.reset();msg($('#adjustMsg'),'Wallet adjustment saved.','success');await loadAdmin();await loadApp()}catch(x){msg($('#adjustMsg'),x.message,'error')}};
}catch(e){$('#adminData').hidden=true;msg($('#adminMsg'),e.message,'error')}}
function renderAdminActions(sel,heads,rows){if(!rows.length){$(sel).innerHTML='<div class="empty">No pending records.</div>';return}renderTable(sel,heads,rows)}

let retailerCatalog=null;
const networkLogo={
  'GLOBE':'globe.png','TM':'tm.png','DITO':'dito.png','SMART':'smart.png','TNT':'tnt.png','GOMO':'gomo.png',
  'GFIBER':'gfiber.png','GLOBE AT HOME':'globeathome.png','PLDT':'pldt.png','CIGNAL':'cignal.png',
  'GTM RETAILER BALANCE':'gtmretbal.png','SMART LOAD WALLET RETAILER BALANCE':'smartretbal.png'
};
function selectedPromoRow(){
  const network=$('#retailerNetwork').value;
  const idx=Number($('#retailerPromo').value);
  return retailerCatalog?.promos?.[network]?.[idx]||null;
}
function updatePromoDetails(){
  const row=selectedPromoRow();
  const details=$('#promoDetails');
  if(!row){$('#retailerAmount').value='';details.innerHTML='<p class="muted">Select a promo to see its description and price.</p>';return}
  $('#retailerAmount').value=Number(row[2]).toFixed(2);
  const network=$('#retailerNetwork').value;
  const logo=networkLogo[network];
  const img=logo?`<img class="promo-network-logo" src="assets/networks/${logo}" alt="">`:'';
  details.innerHTML=`<div class="promo-details-head">${img}<div><strong>${esc(row[0])}</strong><div class="promo-network">${esc(network)}</div></div><strong class="promo-price">${money(Math.round(Number(row[2])*100))}</strong></div><p>${esc(row[1])}</p>${row[3]?'<span class="promo-tag">FEATURED PROMO</span>':''}`;
}
async function loadCatalog(){
  const networkSelect=$('#retailerNetwork'),promoSelect=$('#retailerPromo');
  try{
    retailerCatalog=await api('/api/retailer/catalog');
    networkSelect.innerHTML='<option value="">Choose network</option>'+retailerCatalog.NETWORKS.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    networkSelect.onchange=()=>{
      const list=retailerCatalog.promos[networkSelect.value]||[];
      promoSelect.innerHTML='<option value="">Choose promo</option>'+list.map((row,i)=>`<option value="${i}">${esc(row[0])} — ₱${Number(row[2]).toLocaleString('en-PH',{minimumFractionDigits:2,maximumFractionDigits:2})}</option>`).join('');
      promoSelect.disabled=!list.length;
      updatePromoDetails();
    };
    promoSelect.onchange=updatePromoDetails;
  }catch(e){
    networkSelect.innerHTML='<option value="">Catalog unavailable</option>';
    promoSelect.innerHTML='<option value="">Please refresh or contact admin</option>';
    msg($('#orderMsg'),'Could not load the live promo catalog. Please refresh the page.','error');
  }
}

$('#orderForm').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button');b.disabled=true;msg($('#orderMsg'),'Submitting order…');try{const row=selectedPromoRow();if(!row)throw new Error('Please select a valid network and promo.');const payload=formObj(f);payload.promo=row[0];payload.amount=Number(row[2]);const d=await api('/api/retailer/orders',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});f.reset();$('#retailerNetwork').value='';$('#retailerPromo').innerHTML='<option value="">Choose network first</option>';$('#retailerPromo').disabled=true;updatePromoDetails();msg($('#orderMsg'),`${d.message} Order number: ${d.order.order_number}`,'success');await loadApp()}catch(x){msg($('#orderMsg'),x.message,'error')}finally{b.disabled=false}};
loadCatalog();
loadApp();
