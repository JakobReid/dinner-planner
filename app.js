const WEEK_START=5; // 0=Sun … 5=Fri: the week runs Friday to Thursday
const DAYS=["Fri","Sat","Sun","Mon","Tue","Wed","Thu"];
const DAY_FULL=["Friday","Saturday","Sunday","Monday","Tuesday","Wednesday","Thursday"];
const KEY="dinner-planner-v1";
const ing=(n,o)=>({name:n,optional:!!o});
const maybeLast=list=>list.sort((a,b)=>a.optional-b.optional);
const DEFAULTS={
  meals:[
    {id:"m1",name:"Rice cooker chicken",ingredients:[ing("Chicken thigh"),ing("Rice"),ing("Spring onion"),ing("Soy sauce")],notes:"Chuck it all in the rice cooker."},
    {id:"m2",name:"Beef mince and sweet potato bowl",ingredients:[ing("Beef mince"),ing("Sweet potato"),ing("Cottage cheese"),ing("Honey"),ing("Veg",1)],notes:""},
    {id:"m3",name:"Red Thai chicken curry",ingredients:[ing("Red curry paste"),ing("Coconut milk"),ing("Chicken thigh"),ing("Zucchini"),ing("Carrot"),ing("Capsicum"),ing("Lime"),ing("Coriander"),ing("Rice")],notes:""},
    {id:"m4",name:"Gyozas",ingredients:[ing("Pork mince"),ing("Gyoza wrappers")],notes:"Rando seasoning."},
    {id:"m5",name:"Chicken gyros",ingredients:[ing("Chicken thigh"),ing("Greek yoghurt"),ing("Flatbread ingredients"),ing("Tomato"),ing("Cucumber"),ing("Hummus",1),ing("Tzatziki",1)],notes:"Homemade flatbread. Tzatziki can be homemade from the yoghurt and cucumber."},
    {id:"m6",name:"Teriyaki chicken rice bowl",ingredients:[ing("Chicken thigh"),ing("Rice"),ing("Teriyaki sauce")],notes:""},
    {id:"m7",name:"Beef mince tacos",ingredients:[ing("Beef mince"),ing("Tortillas"),ing("Taco seasoning"),ing("Onion"),ing("Garlic"),ing("Lettuce"),ing("Tomato"),ing("Cheese")],notes:""},
    {id:"m8",name:"Spaghetti bolognese",ingredients:[ing("Beef mince"),ing("Spaghetti"),ing("Tinned tomatoes"),ing("Onion"),ing("Garlic")],notes:""}
  ],
  weeks:{}
};

/* ---------- aisles (table lives in aisles.js) ---------- */
const aisleOf=key=>AISLE_LABEL[state.aisles[key]]?state.aisles[key]:guessAisle(key);

/* ---------- dates (local time) ---------- */
const ymd=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
const parse=s=>{const [y,m,d]=s.split("-").map(Number);return new Date(y,m-1,d)};
const addDays=(s,n)=>{const d=parse(s);d.setDate(d.getDate()+n);return ymd(d)};
function weekStartOf(d){const x=new Date(d.getFullYear(),d.getMonth(),d.getDate());x.setDate(x.getDate()-(x.getDay()+7-WEEK_START)%7);return ymd(x)}
const dayName=s=>DAYS[(parse(s).getDay()+7-WEEK_START)%7];
const todayStr=()=>ymd(new Date());
const fmt=s=>parse(s).toLocaleDateString("en-AU",{day:"numeric",month:"short"});

let state=normalise(loadLocal()||DEFAULTS);
let viewWeek=weekStartOf(new Date());
let ref=null,saving=false,dirty=false,gotRemote=false;

function normalise(s){
  s=JSON.parse(JSON.stringify(s||{}));
  s.meals=Array.isArray(s.meals)?s.meals:[];
  s.meals.forEach(m=>{m.ingredients=Array.isArray(m.ingredients)?maybeLast(m.ingredients.map(i=>typeof i==="string"?ing(i.trim().toLowerCase()):ing(String(i.name||"").trim().toLowerCase(),i.optional)).filter(i=>i.name)):[];m.notes=m.notes||"";});
  s.weeks=s.weeks&&typeof s.weeks==="object"?s.weeks:{};
  s.aisles=s.aisles&&typeof s.aisles==="object"?s.aisles:{};
  for(const k in s.aisles)if(!AISLE_LABEL[s.aisles[k]])delete s.aisles[k];
  // migrate the old single-week shape
  if(s.week&&typeof s.week==="object"){
    let ws=typeof s.weekStart==="string"?s.weekStart:weekStartOf(new Date());
    if(parse(ws).getDay()===0)ws=addDays(ws,1);
    ws=weekStartOf(parse(ws));
    if(!s.weeks[ws])s.weeks[ws]={plan:s.week,checked:s.checked||{},extras:s.extras||[]};
  }
  delete s.week;delete s.checked;delete s.extras;delete s.weekStart;
  for(const k in s.weeks){const w=s.weeks[k]||{};w.plan=w.plan&&typeof w.plan==="object"?w.plan:{};w.checked=w.checked&&typeof w.checked==="object"?w.checked:{};w.extras=Array.isArray(w.extras)?w.extras:[];s.weeks[k]=w}
  // weeks keyed by a different start day (Monday, before the Friday week): re-home each night, ticks and extras follow the first day
  const blank=()=>({plan:{},checked:{},extras:[]});
  for(const k of Object.keys(s.weeks)){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(k)){delete s.weeks[k];continue}
    if(k===weekStartOf(parse(k)))continue;
    const w=s.weeks[k];delete s.weeks[k];
    for(let i=0;i<7;i++){const date=addDays(k,i),d=dayName(date),v=w.plan[d];if(!v)continue;const nk=weekStartOf(parse(date));const nw=s.weeks[nk]||(s.weeks[nk]=blank());if(!nw.plan[d])nw.plan[d]=v}
    const nk=weekStartOf(parse(k));const nw=s.weeks[nk]||(s.weeks[nk]=blank());Object.assign(nw.checked,w.checked);nw.extras.push(...w.extras);
  }
  return s;
}
function loadLocal(){try{const v=localStorage.getItem(KEY);return v?JSON.parse(v):null}catch(e){return null}}
const uid=()=>Math.random().toString(36).slice(2,9);
const keyOf=n=>n.trim().toLowerCase();
const mealById=id=>state.meals.find(m=>m.id===id);
function wk(create,key){key=key||viewWeek;let w=state.weeks[key];if(!w){w={plan:{},checked:{},extras:[]};if(create)state.weeks[key]=w}return w}

function save(){
  for(const k in state.weeks){const w=state.weeks[k];if(!Object.keys(w.plan).length&&!w.extras.length&&!Object.keys(w.checked).length)delete state.weeks[k]}
  try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
  if(ref){dirty=true;flush()}
}
async function flush(){
  if(saving||!dirty)return;
  saving=true;dirty=false;
  try{await ref.set(JSON.parse(JSON.stringify(state)))}
  catch(e){toast("Couldn’t save to the shared plan. Changes are kept on this device.")}
  saving=false;
  if(dirty)flush();
}

/* ---------- render ---------- */
const $=id=>document.getElementById(id);
function el(tag,attrs,...kids){const e=document.createElement(tag);for(const k in attrs||{}){if(k==="class")e.className=attrs[k];else if(k.startsWith("on"))e.addEventListener(k.slice(2),attrs[k]);else e.setAttribute(k,attrs[k])}kids.flat().forEach(c=>{if(c!=null&&c!==false)e.append(c.nodeType?c:document.createTextNode(c))});return e}

function render(){renderNav();renderWeek();renderMeals();renderShop()}
function weekDiff(){return Math.round((parse(viewWeek)-parse(weekStartOf(new Date())))/(7*864e5))}
function renderNav(){
  const diff=weekDiff();
  $("wkLabel").textContent=diff===0?"This week":diff===1?"Next week":diff===-1?"Last week":diff>0?`In ${diff} weeks`:`${-diff} weeks ago`;
  const sub=$("sub");sub.replaceChildren(`${fmt(viewWeek)} to ${fmt(addDays(viewWeek,6))}`);
  if(diff!==0){sub.append(" ",el("button",{onclick:()=>goWeek(weekStartOf(new Date()))},"Back to this week"))}
  $("clearWk").textContent=diff===0?"Clear this week":"Clear this week’s plan";
}
function goWeek(k){viewWeek=k;render()}
$("prevWk").onclick=()=>goWeek(addDays(viewWeek,-7));
$("nextWk").onclick=()=>goWeek(addDays(viewWeek,7));

function renderWeek(flashIdx){
  const box=$("days");box.replaceChildren();
  const plan=wk().plan,today=todayStr();
  DAYS.forEach((d,i)=>{
    const date=addDays(viewWeek,i);
    const v=plan[d];const m=v&&v!=="out"?mealById(v):null;
    let main;
    if(v==="out")main=el("span",{class:"m out"},outIcon(),"Eating out / leftovers");
    else if(m)main=el("span",{class:"m"},m.name,el("span",{class:"i"},m.ingredients.filter(x=>!x.optional).map(x=>x.name).join(", ")));
    else main=el("span",{class:"m empty"},date<today?"Nothing recorded":"Pick a dinner");
    box.append(el("button",{class:"day"+(date===today?" today":"")+(date<today?" past":"")+(flashIdx&&flashIdx.includes(i)?" flash":""),onclick:()=>openPicker(d),"aria-label":`${DAY_FULL[i]} ${fmt(date)}: ${m?m.name:v==="out"?"eating out":"nothing picked"}`},
      el("span",{class:"d"},d,el("small",{},parse(date).getDate())),main));
  });
}
function lastHad(){
  const today=todayStr(),out={};
  for(const k in state.weeks){const p=state.weeks[k].plan;DAYS.forEach((d,i)=>{const id=p[d];if(!id||id==="out")return;const date=addDays(k,i);if(date<=today&&(!out[id]||date>out[id]))out[id]=date})}
  return out;
}
function renderMeals(){
  const box=$("mealList");box.replaceChildren();
  if(!state.meals.length){box.append(el("div",{class:"empty-state"},"No meals yet. Add the dinners you make most often."));return}
  const counts={};Object.values(wk().plan).forEach(id=>counts[id]=(counts[id]||0)+1);
  const last=lastHad(),today=todayStr();
  [...state.meals].sort((a,b)=>a.name.localeCompare(b.name)).forEach(m=>{
    const bits=[];
    if(counts[m.id])bits.push(counts[m.id]===1?"In the week you’re viewing":`In the week you’re viewing ×${counts[m.id]}`);
    if(last[m.id])bits.push(last[m.id]===today?"Having it tonight":`Last had ${fmt(last[m.id])}`);
    box.append(el("button",{class:"meal",onclick:()=>openMeal(m.id)},
      el("h3",{},m.name),
      el("div",{class:"chips"},m.ingredients.map(x=>el("span",{class:"chip"+(x.optional?" opt":"")},x.optional?`maybe ${x.name}`:x.name))),
      bits.length?el("div",{class:"uses"},bits.join(". ")):null));
  });
}
function shoppingItems(){
  const map=new Map(),plan=wk().plan;
  DAYS.forEach(d=>{const m=mealById(plan[d]);if(!m)return;
    m.ingredients.forEach(x=>{const k=keyOf(x.name);const it=map.get(k)||{key:k,name:x.name,meals:[],optional:true};
      it.meals.push(m.name);if(!x.optional)it.optional=false;map.set(k,it)})});
  return [...map.values()];
}
function aislePicker(key,name){
  // a native select styled as a chip: tapping it sets the aisle for this ingredient across every meal
  const sel=el("select",{class:"aisle","aria-label":`Aisle for ${name}`,onchange:e=>{state.aisles[key]=e.target.value;save();renderShop()}});
  const cur=aisleOf(key);
  AISLES.forEach(([id,label])=>sel.append(el("option",{value:id,...(id===cur?{selected:""}:{})},label)));
  return sel;
}
function renderShop(){
  const box=$("shopList");box.replaceChildren();
  const w=wk(),items=shoppingItems();
  const left=items.filter(i=>!i.optional&&!w.checked[i.key]).length+w.extras.filter(e=>!e.done).length;
  const c=$("shopCount");c.hidden=!left;c.textContent=left;
  if(!items.length&&!w.extras.length){box.append(el("div",{class:"empty-state"},"Nothing to buy for this week yet. Pick some dinners on the Week tab and the ingredients land here."));return}
  const row=(it)=>{
    const id="c-"+it.key.replace(/\W+/g,"-");const done=!!w.checked[it.key];
    const uniq=[...new Set(it.meals)];
    return el("div",{class:"item"+(done?" done":"")+(it.optional?" maybe":"")},
      el("input",{type:"checkbox",id,...(done?{checked:""}:{}),onchange:e=>{const ww=wk(true);if(e.target.checked)ww.checked[it.key]=true;else delete ww.checked[it.key];save();renderShop()}}),
      el("label",{for:id},it.optional?el("span",{class:"tag"},"maybe "):null,it.name,it.meals.length>1?el("span",{class:"qty"},"×"+it.meals.length):null,el("span",{class:"from"},uniq.join(", "))),
      aislePicker(it.key,it.name));
  };
  const extraRow=(x)=>{
    const id="e-"+x.id,key=keyOf(x.name);
    return el("div",{class:"item"+(x.done?" done":"")},
      el("input",{type:"checkbox",id,...(x.done?{checked:""}:{}),onchange:e=>{x.done=e.target.checked;save();renderShop()}}),
      el("label",{for:id},x.name),
      aislePicker(key,x.name),
      el("button",{class:"x","aria-label":`Remove ${x.name}`,onclick:()=>{w.extras=w.extras.filter(y=>y!==x);save();renderShop()}},"×"));
  };
  // one block per aisle in walk-the-shop order; required before maybe, then alphabetical
  const sorted=[...items].sort((a,b)=>(a.optional-b.optional)||a.name.localeCompare(b.name));
  AISLES.forEach(([id,label])=>{
    const rows=[...sorted.filter(i=>aisleOf(i.key)===id).map(row),...w.extras.filter(x=>aisleOf(keyOf(x.name))===id).map(extraRow)];
    if(rows.length)box.append(el("div",{class:"group"},el("h2",{},label),rows));
  });
}

/* ---------- tabs ---------- */
function showTab(t){
  document.querySelectorAll("nav button").forEach(b=>b.setAttribute("aria-selected",b.dataset.tab===t));
  ["week","meals","shop"].forEach(s=>$(s).hidden=s!==t);
  try{history.replaceState(null,"","#"+t)}catch(e){location.hash=t}
}
document.querySelectorAll("nav button").forEach(b=>b.onclick=()=>showTab(b.dataset.tab));
window.addEventListener("hashchange",()=>{const h=location.hash.slice(1);if(["week","meals","shop"].includes(h))showTab(h)});

/* ---------- picker ---------- */
function icon(svg){const s=document.createElement("span");s.className="ico";s.setAttribute("aria-hidden","true");s.innerHTML=svg;return s}
const outIcon=()=>icon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10h16l-1.6 10H5.6z"/><path d="M6.5 10 8.5 4h7l2 6"/><path d="M10 4l1 6M14 4l-1 6"/></svg>');
const clearIcon=()=>icon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>');
const plusIcon=()=>icon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>');
const editIcon=()=>icon('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17z"/><path d="M13.5 6.5l3 3"/></svg>');
let pickDay=null;
function openPicker(d){
  pickDay=d;const i=DAYS.indexOf(d);$("pickTitle").textContent=`${DAY_FULL[i]} ${fmt(addDays(viewWeek,i))}`;
  $("pickQ").value="";renderPick();
  lockScroll();$("pickDlg").showModal();
  if(matchMedia("(pointer:fine)").matches)$("pickQ").focus();else $("pickQ").blur();
}
function renderPick(){
  const d=pickDay,box=$("pickList");box.replaceChildren();
  const plan=wk().plan,cur=plan[d];
  const used=new Set(Object.entries(plan).filter(([k])=>k!==d).map(([,v])=>v));
  const raw=$("pickQ").value.trim(),q=raw.toLowerCase();
  const list=[...state.meals].sort((a,b)=>a.name.localeCompare(b.name)).map(m=>{
    if(!q)return{m};
    if(m.name.toLowerCase().includes(q))return{m};
    const hit=m.ingredients.filter(x=>x.name.toLowerCase().includes(q)).map(x=>x.name.toLowerCase());
    return hit.length?{m,hit}:null;
  }).filter(Boolean);
  list.forEach(({m,hit})=>{
    const notes=[];if(hit)notes.push("Has "+hit.join(", "));if(used.has(m.id))notes.push("Already on another night");
    box.append(el("div",{class:"pr"},
      el("button",{class:m.id===cur?"cur":"","data-meal":m.id,onclick:()=>setDay(d,m.id)},m.name,notes.length?el("small",{},notes.join(". ")):null),
      el("button",{class:"edit","aria-label":`Edit ${m.name}`,onclick:()=>openMeal(m.id)},editIcon())));
  });
  if(q&&!list.length)box.append(el("p",{class:"nores"},`No meals match “${raw}”.`));
  // actions sit under the list and stay visible however long it gets
  const acts=$("pickActs");acts.replaceChildren();
  acts.append(el("button",{class:"alt",onclick:()=>openMeal(null,q&&!list.length?raw:"")},plusIcon(),q&&!list.length?`Add “${raw}” as a new meal`:"Add a new meal"));
  acts.append(el("button",{class:"alt"+(cur==="out"?" cur":""),onclick:()=>setDay(d,"out")},outIcon(),"Eating out / leftovers"));
  if(cur)acts.append(el("button",{class:"alt clear",onclick:()=>setDay(d,null)},clearIcon(),"Clear this night"));
}
$("pickQ").addEventListener("input",renderPick);
$("pickQ").addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();const b=$("pickList").querySelector("button[data-meal]");if(b&&$("pickQ").value.trim())b.click()}});
function setDay(d,v){
  const w=wk(true);
  if(v)w.plan[d]=v;else delete w.plan[d];
  save();$("pickDlg").close();renderWeek([DAYS.indexOf(d)]);renderMeals();renderShop();
}

/* ---------- fill / clear ---------- */
$("fill").onclick=()=>{
  const w=wk(true),today=todayStr();
  const empty=DAYS.filter((d,i)=>!w.plan[d]&&addDays(viewWeek,i)>=today);
  if(!empty.length){toast("Every night’s sorted already.");return}
  if(!state.meals.length){toast("Add some meals first.");return}
  const used=new Set([...Object.values(w.plan),...Object.values(wk(false,addDays(viewWeek,-7)).plan)]);
  let pool=state.meals.map(m=>m.id).filter(id=>!used.has(id));
  const filled=[];
  empty.forEach(d=>{
    if(!pool.length)pool=state.meals.map(m=>m.id).filter(id=>!Object.values(w.plan).includes(id));
    if(!pool.length)pool=state.meals.map(m=>m.id);
    const id=pool.splice(Math.floor(Math.random()*pool.length),1)[0];
    w.plan[d]=id;filled.push(DAYS.indexOf(d));
  });
  save();renderWeek(filled);renderMeals();renderShop();
};
$("toShop").onclick=()=>showTab("shop");
$("clearWk").onclick=()=>{
  if(!confirm(`Clear the dinners and shopping list for ${fmt(viewWeek)} to ${fmt(addDays(viewWeek,6))}?`))return;
  delete state.weeks[viewWeek];
  save();render();
};

/* ---------- meal editor ---------- */
let editing=null;
function openMeal(id,prefill){
  editing=id;const m=id?mealById(id):null;
  $("mealTitle").textContent=m?"Edit meal":"Add a meal";
  $("mName").value=m?m.name:(prefill||"");
  $("mIng").value=m?m.ingredients.map(x=>(x.optional?"maybe ":"")+x.name).join("\n"):"";
  $("mNotes").value=m?m.notes:"";
  $("mDel").hidden=!m;
  lockScroll();$("mealDlg").showModal();$("mName").focus();
}
$("addMeal").onclick=()=>openMeal(null);
$("mealForm").addEventListener("submit",e=>{
  e.preventDefault();
  const name=$("mName").value.trim();if(!name)return;
  const ingredients=maybeLast($("mIng").value.split("\n").map(l=>l.trim()).filter(Boolean).map(l=>{
    const opt=/^maybe\b/i.test(l);let n=l.replace(/^maybe\b\s*(some\s+)?/i,"").trim();
    return ing(n.toLowerCase(),opt)}).filter(x=>x.name));
  const notes=$("mNotes").value.trim();
  const id=editing||uid();
  if(editing){Object.assign(mealById(editing),{name,ingredients,notes})}
  else state.meals.push({id,name,ingredients,notes});
  save();$("mealDlg").close();render();
  if($("pickDlg").open){if(editing)renderPick();else setDay(pickDay,id)}
});
$("mDel").onclick=()=>{
  const m=mealById(editing);if(!m||!confirm(`Delete ${m.name}? It also comes off any planned nights.`))return;
  state.meals=state.meals.filter(x=>x.id!==editing);
  for(const k in state.weeks)for(const d of DAYS)if(state.weeks[k].plan[d]===editing)delete state.weeks[k].plan[d];
  save();$("mealDlg").close();render();
  if($("pickDlg").open)renderPick();
};
document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>b.closest("dialog").close());

/* ---------- extras ---------- */
function addExtra(){const v=$("extraIn").value.trim();if(!v)return;wk(true).extras.push({id:uid(),name:v,done:false});$("extraIn").value="";save();renderShop()}
$("extraAdd").onclick=addExtra;
$("extraIn").addEventListener("keydown",e=>{if(e.key==="Enter")addExtra()});
$("untick").onclick=()=>{const w=wk(true);w.checked={};w.extras.forEach(x=>x.done=false);save();renderShop()};

/* ---------- scroll lock (page stays put under an open dialog, iOS included) ---------- */
let lockY=0;
function lockScroll(){if(document.body.style.position==="fixed")return;lockY=scrollY;Object.assign(document.body.style,{position:"fixed",top:-lockY+"px",left:"0",right:"0"})}
function unlockScroll(){if(document.querySelector("dialog[open]"))return;Object.assign(document.body.style,{position:"",top:"",left:"",right:""});scrollTo(0,lockY)}
document.querySelectorAll("dialog").forEach(d=>d.addEventListener("close",unlockScroll));

/* ---------- toast ---------- */
let tt;function toast(msg){let t=document.querySelector(".toast");if(!t){t=el("div",{class:"toast",role:"status"});document.body.append(t)}t.textContent=msg;clearTimeout(tt);tt=setTimeout(()=>t.remove(),2800)}

/* ---------- boot ---------- */
render();
{const h=location.hash.slice(1);if(["week","meals","shop"].includes(h))showTab(h)}

/* ---------- sync (Firebase) ---------- */

function randomCode(){const a=new Uint8Array(16);crypto.getRandomValues(a);return [...a].map(b=>b.toString(36).padStart(2,"0")).join("").slice(0,24)}
function householdCode(){
  const u=new URL(location.href);let h=u.searchParams.get("h");
  if(!h){try{h=localStorage.getItem("household")}catch(e){}}
  if(!h)h=randomCode();
  try{localStorage.setItem("household",h)}catch(e){}
  if(u.searchParams.get("h")!==h){u.searchParams.set("h",h);history.replaceState(null,"",u.pathname+u.search+location.hash)}
  return h;
}
$("shareBtn").onclick=async()=>{
  const u=new URL(location.href);u.hash="";const link=u.toString();
  try{if(navigator.share){await navigator.share({title:"I feel like dinner tonight",url:link});return}}catch(e){if(e&&e.name==="AbortError")return}
  try{await navigator.clipboard.writeText(link);toast("Link copied. Send it to whoever you plan dinners with.")}
  catch(e){prompt("Copy this link:",link)}
};

(async()=>{
  const FIREBASE_CONFIG=window.FIREBASE_CONFIG||{};
  if(!FIREBASE_CONFIG.apiKey||!window.firebase){$("sync").textContent="Saved on this device only.";return}
  const fail=()=>{$("sync").textContent="Couldn’t reach the shared plan. Saving on this device for now."};
  try{firebase.initializeApp(FIREBASE_CONFIG);await firebase.auth().signInAnonymously()}catch(e){fail();return}
  const h=householdCode();
  const docRef=firebase.firestore().collection("households").doc(h);
  ref={set:data=>docRef.set(data)};
  $("shareBtn").hidden=false;
  docRef.onSnapshot(snap=>{
    gotRemote=true;
    $("sync").textContent="Synced. Anyone with your link sees the same plan.";
    if(saving||dirty)return;
    if(!snap.exists){dirty=true;flush();return}
    const open=document.querySelector("dialog[open]");
    state=normalise(snap.data());
    try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){}
    if(!open)render();else{renderNav();renderShop()}
  },fail);
})();
