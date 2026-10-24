/* Early theme application prevents a white flash; only preferences are stored here. */
(function(root){
 'use strict';
 const orders=Object.create(null);
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const direction=key=>orders[key]||'newest';
 function sorted(items,key='date',order='newest'){
  return [...items].map((item,index)=>({item,index,date:Date.parse(item[key]||'')})).sort((a,b)=>{
   const av=Number.isFinite(a.date),bv=Number.isFinite(b.date);
   if(av!==bv)return av?-1:1;
   return (av&&a.date!==b.date?(order==='oldest'?a.date-b.date:b.date-a.date):a.index-b.index);
  }).map(x=>x.item);
 }
 function control(key,label='Date order'){
  return '<label class="date-order">'+esc(label)+' <select data-date-order="'+esc(key)+'" aria-label="'+esc(label)+'"><option value="newest" '+(direction(key)==='newest'?'selected':'')+'>Newest first</option><option value="oldest" '+(direction(key)==='oldest'?'selected':'')+'>Oldest first</option></select></label>';
 }
 let theme='dark';try{if(localStorage.getItem('hllv-theme')==='light')theme='light';}catch(_){}
 function apply(value){theme=value==='light'?'light':'dark';document.documentElement.dataset.theme=theme;document.documentElement.style.colorScheme=theme;const b=document.getElementById('themeToggle');if(b){b.textContent=theme==='dark'?'Light mode':'Dark mode';b.setAttribute('aria-label','Switch to '+(theme==='dark'?'light':'dark')+' mode');b.setAttribute('aria-pressed',String(theme==='dark'));}}
 apply(theme);
 document.addEventListener('DOMContentLoaded',()=>{apply(theme);document.getElementById('themeToggle')?.addEventListener('click',()=>{apply(theme==='dark'?'light':'dark');try{localStorage.setItem('hllv-theme',theme);}catch(_){}});});
 document.addEventListener('change',e=>{const key=e.target.dataset.dateOrder;if(!key)return;orders[key]=e.target.value==='oldest'?'oldest':'newest';document.dispatchEvent(new CustomEvent('hllv-date-order',{detail:key}));});
 root.HLLVDates=Object.freeze({sorted,direction,control});
})(globalThis);
