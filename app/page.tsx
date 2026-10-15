"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { parseXUrls } from "../lib/url-parser";

type Tab = "Dashboard" | "New Batch" | "Queue" | "History" | "Settings";
type Post = {
  id:string;xPostId:string;authorName?:string|null;authorUsername?:string|null;
  postText?:string|null;generatedReply?:string|null;status:string;approvalStatus:string;
  confidence?:number|null;qualityScore?:number|null;errorMessage?:string|null
};
type Account = { username:string;name?:string|null;avatarUrl?:string|null };

const tabs:Tab[]=["Dashboard","New Batch","Queue","History","Settings"];
const icons:Record<Tab,string>={Dashboard:"⌂","New Batch":"+","Queue":"≡","History":"◷","Settings":"⚙"};

function Button(p:{children:ReactNode;onClick?:()=>void;disabled?:boolean;secondary?:boolean;danger?:boolean}) {
  return <button onClick={p.onClick} disabled={p.disabled} className={p.danger?"btn btn-danger":p.secondary?"btn btn-secondary":"btn btn-primary"}>{p.children}</button>;
}

export default function Home(){
  const [tab,setTab]=useState<Tab>("Dashboard"),[input,setInput]=useState(""),[account,setAccount]=useState<Account|null>(null);
  const [stats,setStats]=useState({submitted:0,generated:0,approved:0,published:0,skipped:0,failed:0});
  const [queue,setQueue]=useState<Post[]>([]),[loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [storageReady,setStorageReady]=useState(false);
  const STORAGE_KEY="agentx.workspace.v1";

  const parsed=useMemo(()=>parseXUrls(input),[input]);
  const refresh=async()=>{
    try{
      const status=await fetch("/api/auth/status",{credentials:"include",cache:"no-store"}),sd=await status.json();
      if(!status.ok||!sd.connected){setAccount(null);setLoading(false);return}
      setAccount(sd.account as Account);
      // Dashboard metrics and queue are persisted locally; no database request is required.
    }catch{setAccount(null)}finally{setLoading(false)}
  };
  useEffect(()=>{
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw){
        const saved=JSON.parse(raw);
        if(typeof saved.input==="string")setInput(saved.input);
        if(saved.tab&&tabs.includes(saved.tab))setTab(saved.tab);
        if(saved.stats&&typeof saved.stats==="object")setStats(s=>({...s,...saved.stats}));
        if(Array.isArray(saved.queue))setQueue(saved.queue);
      }
    } catch { /* Ignore corrupt or unavailable browser storage. */ }
    setStorageReady(true);
    refresh();
  },[]);
  useEffect(()=>{
    if(!storageReady)return;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify({version:1,input,tab,stats,queue,savedAt:new Date().toISOString()}));}
    catch{setMessage("Device storage is full. Export or clear older workspace data to continue saving.");}
  },[storageReady,input,tab,stats,queue]);

  const connect=()=>{window.location.href="/api/auth/x/start"};
  const disconnect=async()=>{await fetch("/api/auth/x/disconnect",{method:"POST"});setAccount(null);setQueue([])};
  const saveLocalHistory=(batch:any)=>{
    try{const current=JSON.parse(localStorage.getItem("agentx.history.v1")||'{"batches":[]}');const batches=Array.isArray(current.batches)?current.batches:[];localStorage.setItem("agentx.history.v1",JSON.stringify({batches:[batch,...batches.filter((item:any)=>item.id!==batch.id)].slice(0,100)}));}catch{}
  };
  const getLocalPrefs=()=>{
    try{return JSON.parse(localStorage.getItem("agentx.settings.v1")||"{}")}catch{return {}}
  };
  const recalcStats=(items:Post[],submitted?:number)=>{
    setStats(s=>({...s,submitted:submitted??s.submitted,generated:items.filter(x=>!!x.generatedReply).length,approved:items.filter(x=>x.status==="APPROVED"||x.approvalStatus==="APPROVED").length,published:items.filter(x=>x.status==="PUBLISHED").length,skipped:items.filter(x=>x.status==="SKIPPED").length,failed:items.filter(x=>x.status==="FAILED").length}));
  };
  const processLocalPost=async(item:Post&{xPostId:string},previous:Post[])=>{
    const prefs=getLocalPrefs();
    const r=await fetch("/api/local/process",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({xPostId:item.xPostId,voice:prefs.voice||{},settings:prefs.settings||{},previousReplies:previous.map(x=>x.generatedReply).filter(Boolean)})});
    const d=await r.json();
    if(!r.ok)throw new Error(d.error||"Unable to process post.");
    return {...item,...d.post,id:item.id,xPostId:item.xPostId};
  };
  const createBatch=async()=>{
    setBusy(true);setMessage("");
    try{
      const parsedInput=parsed;
      if(!parsedInput.valid.length)throw new Error("No valid X post links were found.");
      const ids=new Set(queue.map(x=>x.xPostId));
      const fresh=parsedInput.valid.filter(x=>!ids.has(x.postId));
      if(!fresh.length)throw new Error("All valid links are already saved in your local workspace.");
      const batchId=crypto.randomUUID(),createdAt=new Date().toISOString();
      const initial=fresh.map(x=>({id:crypto.randomUUID(),xPostId:x.postId,postUrl:x.url,status:"PROCESSING",approvalStatus:"PENDING",postText:"Fetching post from X…",createdAt,updatedAt:createdAt,batchId} as Post&{xPostId:string;postUrl:string;createdAt:string;updatedAt:string;batchId:string}));
      let all=[...initial,...queue];setQueue(all);setInput("");setTab("Queue");
      saveLocalHistory({id:batchId,label:"New batch",imported:parsedInput.imported,valid:fresh.length,duplicates:parsedInput.duplicates.length+parsedInput.valid.length-fresh.length,invalid:parsedInput.invalid.length,status:"PROCESSING",createdAt});
      recalcStats(all,stats.submitted+fresh.length);
      let succeeded=0;
      for(const item of initial){
        try{const processed=await processLocalPost(item,all.filter(x=>x.generatedReply));all=all.map(x=>x.id===item.id?processed:x);succeeded++;}
        catch(e){all=all.map(x=>x.id===item.id?{...x,status:"FAILED",errorMessage:e instanceof Error?e.message:"Processing failed.",postText:"Unable to load post from X."}:x);}
        setQueue([...all]);recalcStats(all,stats.submitted+fresh.length);
      }
      saveLocalHistory({id:batchId,label:"New batch",imported:parsedInput.imported,valid:fresh.length,duplicates:parsedInput.duplicates.length+parsedInput.valid.length-fresh.length,invalid:parsedInput.invalid.length,status:"COMPLETED",createdAt});
      setMessage("Saved "+fresh.length+" post(s) on this device. "+succeeded+" processed successfully.");
    }catch(e){setMessage(e instanceof Error?e.message:"Unable to create batch.")}finally{setBusy(false)}
  };
  const review=async(id:string,action:"approve"|"skip")=>{
    const next=queue.map(x=>x.id===id?{...x,status:action==="approve"?"APPROVED":"SKIPPED",approvalStatus:action==="approve"?"APPROVED":"SKIPPED"}:x);
    setQueue(next);recalcStats(next);setMessage(action==="approve"?"Reply approved locally.":"Post skipped.");
  };
  const regenerate=async(id:string)=>{
    const item=queue.find(x=>x.id===id) as (Post&{xPostId:string})|undefined;if(!item)return;
    setBusy(true);try{const processed=await processLocalPost(item,queue.filter(x=>x.id!==id&&x.generatedReply));const next=queue.map(x=>x.id===id?processed:x);setQueue(next);recalcStats(next);setMessage(processed.generatedReply?"Reply regenerated.":"A reply could not be approved by quality checks.");}catch(e){setMessage(e instanceof Error?e.message:"Reply regeneration failed.")}finally{setBusy(false)}
  };
  const publish=async()=>{
    const approved=queue.filter(x=>x.status==="APPROVED"&&x.generatedReply);
    if(!approved.length)return;
    setBusy(true);let next=[...queue],published=0;
    for(const item of approved){
      try{const r=await fetch("/api/local/publish",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({xPostId:item.xPostId,reply:item.generatedReply})}),d=await r.json();if(!r.ok)throw new Error(d.error||"Publishing failed.");next=next.map(x=>x.id===item.id?{...x,status:"PUBLISHED",publishedAt:d.publishedAt,publishedReplyId:d.id}:x);published++;}
      catch(e){next=next.map(x=>x.id===item.id?{...x,status:"FAILED",errorMessage:e instanceof Error?e.message:"Publishing failed."}:x);}
      setQueue([...next]);
    }
    recalcStats(next);setMessage(published+" approved reply/replies published.");setBusy(false)
  };

  if(loading)return <div className="loading-screen"><div className="loading-mark">AX</div><span>Loading workspace</span></div>;

  return <main className="app-shell">
    <aside className="sidebar">
      <button className="brand" onClick={()=>setTab("Dashboard")}><span className="brand-mark">A</span><span>Agent<span>X</span></span></button>
      <div className="workspace-label">Workspace</div>
      <nav className="side-nav">
        {tabs.map(t=><button key={t} className={tab===t?"side-link active":"side-link"} onClick={()=>setTab(t)}><span className="side-icon">{icons[t]}</span><span>{t}</span>{t==="Queue"&&queue.length>0&&<em>{queue.length}</em>}</button>)}
      </nav>
      <div className="sidebar-bottom">
        <div className="trust-card"><div className="trust-dot"/><div><strong>{account?"X connected":"Not connected"}</strong><small>{account?"Ready for review":"Connect to begin"}</small></div></div>
        {account?<button className="account-mini" onClick={disconnect}><span className="avatar">{account.avatarUrl?<img src={account.avatarUrl} alt=""/>:"AX"}</span><span className="account-copy"><strong>@{account.username}</strong><small>Connected account</small></span><span className="account-menu">⋯</span></button>:<Button onClick={connect}>Connect X</Button>}
      </div>
    </aside>

    <section className="main-area">
      <header className="topbar">
        <div className="crumb"><span>AgentX</span><b>/</b><strong>{tab}</strong></div>
        <div className="top-actions">
          <div className={account?"connection-pill":"connection-pill offline"}><i/> {account?"X connected":"X not connected"}</div>
          {account&&<button className="top-avatar" onClick={disconnect}>{account.avatarUrl?<img src={account.avatarUrl} alt=""/>:"AX"}</button>}
        </div>
      </header>

      <div className="content">
        {message&&<div className="notice"><span>i</span><p>{message}</p><button onClick={()=>setMessage("")}>×</button></div>}

        {tab==="Dashboard"&&account&&<Dashboard stats={stats} queue={queue} onNew={()=>setTab("New Batch")} onQueue={()=>setTab("Queue")}/>}
        {tab==="New Batch"&&account&&<section className="page-section">
          <PageIntro eyebrow="Import & analyze" title="Start a new batch" text="Bring in X posts, analyze the real content, then review every generated reply before anything is published."/>
          <section className="premium-card import-card">
            <div className="card-heading"><div><span className="step-number">01</span><div><h2>Paste X posts</h2><p>One URL per line, whitespace-separated, or mixed with surrounding text.</p></div></div><span className="secure-label">● Secure input</span></div>
            <textarea className="textarea" value={input} onChange={e=>setInput(e.target.value)} placeholder="https://x.com/.../status/123456789…"/>
            <div className="parse-strip">{[["Imported",parsed.imported],["Valid",parsed.valid.length],["Duplicates",parsed.duplicates.length],["Invalid",parsed.invalid.length]].map(x=><div key={String(x[0])}><small>{x[0]}</small><strong>{x[1]}</strong></div>)}</div>
            <div className="card-footer"><span>AgentX validates and deduplicates URLs before processing.</span><Button disabled={!parsed.valid.length||busy} onClick={createBatch}>{busy?"Creating…":"Analyze posts →"}</Button></div>
          </section>
        </section>}

        {tab==="Queue"&&account&&<Queue queue={queue} onReview={review} onRegenerate={regenerate} onPublish={publish} busy={busy}/>}
        {tab==="History"&&account&&<History/>}
        {tab==="Settings"&&account&&<Settings/>}

        {!account&&<section className="connect-page">
          <div className="connect-glow"/>
          <div className="connect-mark">AX</div>
          <span className="eyebrow">Private engagement workspace</span>
          <h1>Build better conversations<br/><span>on X.</span></h1>
          <p>Connect your X account to import real posts, generate contextual replies, review them and publish with control.</p>
          <Button onClick={connect}>Connect X securely →</Button>
          <div className="security-row"><span>✓ Official OAuth</span><span>✓ Review before publishing</span><span>✓ No passwords stored</span></div>
        </section>}
      </div>
    </section>
    <div className="mobile-nav">{tabs.map(t=><button key={t} className={tab===t?"active":""} onClick={()=>setTab(t)}><span>{icons[t]}</span>{t}</button>)}</div>
  </main>
}

function PageIntro({eyebrow,title,text}:{eyebrow:string;title:string;text:string}){return <div className="page-intro"><div><span className="eyebrow">{eyebrow}</span><h1>{title}</h1><p>{text}</p></div></div>}

function Dashboard({stats,queue,onNew,onQueue}:{stats:any;queue:Post[];onNew:()=>void;onQueue:()=>void}){
  const approved=queue.filter(x=>x.status==="APPROVED").length;
  return <section className="page-section">
    <div className="dashboard-hero"><div><span className="eyebrow">Overview</span><h1>Engagement, <span>without the noise.</span></h1><p>One controlled workspace for sourcing, analyzing and reviewing your X engagement.</p></div><Button onClick={onNew}>+ New batch</Button></div>
    <div className="metric-grid">
      {[["Posts submitted",stats.submitted,"01"],["Replies generated",stats.generated,"02"],["Approved",stats.approved,"03"],["Published",stats.published,"04"]].map(x=><div className="metric-card" key={String(x[0])}><span>{x[2]}</span><small>{x[0]}</small><strong>{x[1]}</strong></div>)}
    </div>
    <div className="dashboard-grid">
      <section className="premium-card activity-card"><div className="section-head"><div><span className="eyebrow">Live workspace</span><h2>Review queue</h2></div><button onClick={onQueue} className="text-link">View all →</button></div>{queue.length===0?<div className="dash-empty"><span>✓</span><strong>Your queue is clear</strong><p>Create a batch to start analyzing posts.</p></div>:<div className="mini-list">{queue.slice(0,4).map(x=><div key={x.id} className="mini-row"><div className="mini-avatar">{(x.authorName||"X").slice(0,1).toUpperCase()}</div><div><strong>{x.authorName||"X user"}</strong><p>{x.postText||x.errorMessage||"Waiting for post data…"}</p></div><span className={"status-tag "+x.status.toLowerCase()}>{x.status.toLowerCase().replace("_"," ")}</span></div>)}</div>}</section>
      <section className="premium-card signal-card"><span className="eyebrow">Publishing posture</span><div className="signal-ring">✓</div><h2>Human review first</h2><p>Generated replies stay in your queue until you explicitly approve them.</p><div className="signal-line"><span>Approved waiting</span><strong>{approved}</strong></div><div className="signal-line"><span>Skipped</span><strong>{stats.skipped}</strong></div></section>
    </div>
  </section>
}

function Queue(p:{queue:Post[];onReview:(id:string,a:"approve"|"skip")=>void;onRegenerate:(id:string)=>void;onPublish:()=>void;busy:boolean}){
  const approved=p.queue.filter(x=>x.status==="APPROVED").length;
  return <section className="page-section"><div className="page-intro queue-intro"><div><span className="eyebrow">Review center</span><h1>Publishing queue</h1><p>Read, edit externally if needed, approve or skip. Nothing is published just because it was generated.</p></div><Button disabled={!approved||p.busy} onClick={p.onPublish}>Publish approved ({approved})</Button></div>
    <section className="premium-card queue-card">{!p.queue.length?<div className="dash-empty large"><span>✓</span><strong>No posts waiting</strong><p>Your active queue is empty. Start a new batch when you are ready.</p></div>:<div className="queue-list">{p.queue.map(x=><article key={x.id} className="queue-item"><div className="post-meta"><div className="mini-avatar">{(x.authorName||"X").slice(0,1).toUpperCase()}</div><div><b>{x.authorName||"X user"}</b><span>{x.authorUsername?"@"+x.authorUsername:""}</span></div><i className={"status-tag "+x.status.toLowerCase()}>{x.status.toLowerCase().replace("_"," ")}</i></div><p className="post-text">{x.postText||x.errorMessage||"Waiting for X post data…"}</p>{x.generatedReply&&<div className="reply-box"><div className="reply-label">AgentX reply</div><p>“{x.generatedReply}”</p><div className="quality-row"><span>Confidence <b>{Math.round(x.confidence||0)}</b></span><span>Quality <b>{Math.round(x.qualityScore||0)}</b></span></div></div>}{(x.status==="READY"||x.status==="FAILED")&&<div className="row-actions"><Button secondary onClick={()=>p.onReview(x.id,"skip")}>Skip</Button><Button secondary onClick={()=>p.onRegenerate(x.id)}>Regenerate</Button><Button onClick={()=>p.onReview(x.id,"approve")}>Approve reply</Button></div>}</article>)}</div>}</section>
  </section>
}

function History(){const[data,setData]=useState<any>({batches:[]});useEffect(()=>{
  try{const saved=localStorage.getItem("agentx.history.v1");if(saved)setData(JSON.parse(saved));}catch{}
},[]);return <section className="page-section"><PageIntro eyebrow="Archive" title="Batch history" text="A record of your previous imports and processing outcomes."/><div className="history-list">{!data?<div className="premium-card dash-empty">Loading history…</div>:data.batches?.length?data.batches.map((b:any)=><div className="premium-card history-row" key={b.id}><div><span className="history-dot"/><div><b>{b.label||b.id}</b><small>{b.valid} valid · {b.duplicates} duplicates · {b.invalid} invalid</small></div></div><span className="history-status">{b.status.toLowerCase()}</span></div>):<div className="premium-card dash-empty"><span>◷</span><strong>No batches yet</strong><p>Your processed batches will appear here.</p></div>}</div></section>}

function Settings(){
  const[data,setData]=useState<any>({voice:{tone:"conversational",personality:"curious, useful, concise",preferredLength:"10-30 words",emojiUsage:"rare",professional:50},settings:{qualityThreshold:80,publishingMode:"review",autoPublish:false,maxRetries:3}}),[saving,setSaving]=useState(false);
  useEffect(()=>{
    try{const saved=localStorage.getItem("agentx.settings.v1");if(saved)setData(JSON.parse(saved));}catch{}
  },[]);
  if(!data)return <section className="page-section"><div className="premium-card dash-empty">Loading settings…</div></section>;
  const voice=data.voice||{},settings=data.settings||{},setVoice=(k:string,v:any)=>setData({...data,voice:{...voice,[k]:v}}),setSettings=(k:string,v:any)=>setData({...data,settings:{...settings,[k]:v}}),save=async()=>{setSaving(true);const payload={voice,settings};try{localStorage.setItem("agentx.settings.v1",JSON.stringify(payload));}catch{}catch{}setSaving(false)};
  return <section className="page-section"><PageIntro eyebrow="Control center" title="Settings" text="Tune your voice and publishing guardrails without changing the underlying workflow."/><div className="settings-grid"><section className="premium-card settings-card"><div className="section-head"><div><span className="eyebrow">01 · Voice</span><h2>Voice profile</h2></div></div><p className="card-copy">Configure your own style. AgentX does not imitate another person.</p>{[["tone","Tone"],["personality","Personality"],["preferredLength","Preferred length"],["emojiUsage","Emoji usage"],["slang","Slang"],["avoidWords","Words to avoid"],["avoidPhrases","Phrases to avoid"],["topics","Industries / topics"]].map(x=><label key={x[0]}><small>{x[1]}</small><input className="input" value={voice[x[0]]||""} onChange={e=>setVoice(x[0],e.target.value)}/></label>)}<label><small>Professional ↔ casual ({voice.professional??50})</small><input className="range" type="range" min="0" max="100" value={voice.professional??50} onChange={e=>setVoice("professional",Number(e.target.value))}/></label></section><section className="premium-card settings-card"><div className="section-head"><div><span className="eyebrow">02 · Guardrails</span><h2>Publishing & quality</h2></div></div><p className="card-copy">Review mode is the safe default. Auto-publish remains opt-in and permission-dependent.</p><label><small>Minimum quality · {settings.qualityThreshold??80}</small><input className="range" type="range" min="50" max="100" value={settings.qualityThreshold??80} onChange={e=>setSettings("qualityThreshold",Number(e.target.value))}/></label><label className="toggle"><span><b>Auto-publish</b><small>Only when explicitly enabled</small></span><input type="checkbox" checked={!!settings.autoPublish} onChange={e=>{setSettings("autoPublish",e.target.checked);setSettings("publishingMode",e.target.checked?"auto":"review")}}/></label><label><small>Maximum retries</small><input className="input" type="number" min="1" max="8" value={settings.maxRetries??3} onChange={e=>setSettings("maxRetries",Number(e.target.value))}/></label><Button disabled={saving} onClick={save}>{saving?"Saving…":"Save changes"}</Button></section></div></section>
}