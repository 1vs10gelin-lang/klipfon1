'use client';
import {useEffect,useState,useSyncExternalStore} from 'react';
import Link from 'next/link';
import {ArrowLeft,ArrowUpRight,CheckCircle2,Clapperboard,Eye,RefreshCw,Scissors,Search,ShieldCheck,Sparkles,Trophy,Users} from 'lucide-react';
import {StartMessage} from './message-center';
import {ReportButton} from './reports';
import {Header,Footer,InfoEmpty,CopyButton} from './shared';
import {count,levelFor,levels,type CommunityProfile} from '@/lib/community-types';
import type {getCommunityDetail,listCommunity} from '@/lib/community';
const subscribeOrigin=()=>()=>{};
const browserOrigin=()=>window.location.origin;
const serverOrigin=()=>'';
type Directory=Awaited<ReturnType<typeof listCommunity>>;
type Detail=NonNullable<Awaited<ReturnType<typeof getCommunityDetail>>>;

function Avatar({profile,large=false}:{profile:CommunityProfile;large?:boolean}){
  return <div aria-hidden="true" className={'community-avatar '+(large?'large ':'')+levelFor(profile.views).tone}>{profile.avatarUrl?<img src={profile.avatarUrl} alt=""/>:profile.name.trim().split(/\s+/).slice(0,2).map(n=>n[0]).join('').toLocaleUpperCase('tr-TR')}</div>;
}
export function CommunityProfileCard({profile:p}:{profile:CommunityProfile}){
  const level=levelFor(p.views),creator=p.role==='creator';
  return <a className={'community-card '+(creator?'creator':level.tone)} href={'/topluluk/'+encodeURIComponent(p.id)}>
    <div className="community-card-top"><span className="community-role">{creator?<Clapperboard size={14}/>:<Scissors size={14}/>} {creator?'YAYINCI':'KLİPPER'}</span>{p.rank&&<span className="community-rank"><Trophy size={14}/> #{count(p.rank)}</span>}</div>
    <Avatar profile={p}/><div className="community-name"><h3>{p.name}</h3>{p.verified&&<CheckCircle2 size={18} aria-label="Sosyal hesabı doğrulanmış"/>}</div>
    {!p.verified&&<span className="pill pill-amber">{p.socialUrl?'Doğrulama bekliyor':'Sosyal hesap eklenmedi'}</span>}<span className={'pill '+(creator?'pill-green':'')}>{creator?'Yayıncı · ':''}{creator&&level.min===0?'Başlangıç':level.name}</span>
    <p className="community-bio">{p.bio||(creator?'İçeriğini klipperlarla birlikte büyütüyor.':'İzinli içeriklerden yeni hikâyeler üretiyor.')}</p>
    <div className="community-card-stats"><div><strong>{count(p.views)}</strong><small>Doğrulanmış görüntülenme</small></div><div><strong>{count(creator?p.campaignCount:p.clipCount)}</strong><small>{creator?'Kampanya':'Yayınlanan klip'}</small></div></div>
    <div className="community-card-bottom"><span>Profili keşfet</span><ArrowUpRight size={18}/></div>
  </a>;
}
function Pager({page,pages,onChange}:{page:number;pages:number;onChange:(page:number)=>void}){
  if(pages<=1)return null;
  return <nav className="community-pagination" aria-label="Sayfalama"><button className="btn btn-secondary btn-small" disabled={page===1} onClick={()=>onChange(page-1)}>Önceki</button><span>{page} / {pages}</span><button className="btn btn-secondary btn-small" disabled={page===pages} onClick={()=>onChange(page+1)}>Sonraki</button></nav>;
}
export function Community(){
  const [data,setData]=useState<Directory|null>(null),[role,setRole]=useState('all'),[q,setQ]=useState(''),[search,setSearch]=useState(''),[sort,setSort]=useState('views'),[page,setPage]=useState(1),[error,setError]=useState(''),[loadedKey,setLoadedKey]=useState(''),[refresh,setRefresh]=useState(0);
  const requestKey=JSON.stringify([role,search,sort,page,refresh]),loading=loadedKey!==requestKey;
  useEffect(()=>{const timer=setTimeout(()=>{setSearch(q);setPage(1)},250);return()=>clearTimeout(timer)},[q]);
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/community?'+new URLSearchParams({role,q:search,sort,page:String(page)}),{signal:controller.signal,cache:'no-store'})
      .then(async r=>{const result=await r.json();if(!r.ok)throw Error(result.error);setData(result);setError('')})
      .catch(e=>{if(e.name!=='AbortError')setError('Topluluk yüklenemedi. Tekrar deneyebilirsin.')})
      .finally(()=>{if(!controller.signal.aborted)setLoadedKey(requestKey)});
    return()=>controller.abort();
  },[role,search,sort,page,refresh,requestKey]);
  useEffect(()=>{const update=()=>{if(!document.hidden)setRefresh(n=>n+1)};const timer=setInterval(update,60_000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update)}},[]);
  return <><Header/><main className="wrap community-main"><section className="community-hero"><div><div className="eyebrow"><Users size={15}/> KLİPFON TOPLULUĞU</div><h1>Birlikte üret.<br/><span className="accent-text">Kliplerin iz bıraksın.</span></h1><p>Klipperları ve yayıncıları tanı. Klipleri keşfet, doğrulanmış sonuçları gör, birlikte büyü.</p><div className="action-row"><a href="/panel?bolum=profile" className="btn">Topluluktaki yerini al <ArrowUpRight size={16}/></a><a href="#uyeler" className="btn btn-secondary">Üyeleri keşfet</a></div></div><div className="community-summary"><ShieldCheck size={30}/><strong>Üreten bir topluluk.</strong><p>Doğrulanan sosyal hesaplar rozetlidir.<br/>Başarılar gerçek ölçüm kayıtlarına bağlıdır.</p><div><span><b>{data?count(data.summary?.clippers||0):'—'}</b> Klipper</span><span><b>{data?count(data.summary?.creators||0):'—'}</b> Yayıncı</span></div></div></section>
    <section id="uyeler" className="community-directory"><div className="section-head"><div><div className="eyebrow">KEŞFET & TANIŞ</div><h2>Topluluğun yüzleri.</h2></div><button className="btn btn-small btn-secondary" disabled={loading} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={15}/> Yenile</button></div>
    <div className="community-controls"><div className="community-tabs" role="group" aria-label="Hesap türü">{[['all','Herkes'],['clipper','Klipperlar'],['creator','Yayıncılar']].map(([value,label])=><button key={value} aria-pressed={role===value} onClick={()=>{setRole(value);setPage(1)}}>{label}</button>)}</div><label className="community-search"><Search size={18}/><input aria-label="İsimle üye ara" placeholder="İsimle ara…" value={q} maxLength={100} onChange={e=>setQ(e.target.value)}/></label><select className="field-input community-sort" aria-label="Üyeleri sırala" value={sort} onChange={e=>{setSort(e.target.value);setPage(1)}}><option value="views">En çok görüntülenme</option><option value="clips">En çok klip</option><option value="newest">Yeni katılanlar</option></select></div>
    <p className="hint">Görüntülenmeler yönetici kontrolünden geçmiş uygun izlenmelerdir. Sıralama her hesap türü için ayrıdır; eşit görüntülenmeler aynı sırayı paylaşır.</p>
    <div aria-live="polite" className="community-results-label">{loading?'Üyeler yükleniyor…':`${count(data?.total||0)} profil`}</div>
    {error?<div className="error" role="alert">{error}</div>:loading?<div className="community-grid" aria-label="Yükleniyor">{[1,2,3].map(n=><div className="community-placeholder" key={n}/>)}</div>:data?.profiles.length?<div className="community-grid">{data.profiles.map(p=><CommunityProfileCard key={p.id} profile={p}/>)}</div>:<InfoEmpty title={search?'Aradığın isim bulunamadı.':'Topluluk ilk üyelerini bekliyor.'} description={search?'Başka bir isim veya hesap türüyle tekrar ara.':'Profilini tamamla; aktif hesabınla burada kendi profilinle yer al.'}>{!search&&<a className="btn btn-secondary" href="/panel?bolum=profile">Profilimi tamamla</a>}</InfoEmpty>}
    {!loading&&!error&&data&&<Pager page={data.page} pages={data.pages} onChange={setPage}/>}</section>
    <section className="community-level-guide"><div><div className="eyebrow"><Sparkles size={14}/> ÜRETTİKÇE YÜKSEL</div><h2>Başarın profiline yansısın.</h2><p>Klipper seviyesi, yayınlanan kliplerin toplam doğrulanmış görüntülenmesine göre otomatik güncellenir.</p></div><div className="community-levels">{levels.map(l=><div key={l.tone} className={l.tone}><span>{l.name}</span><strong>{count(l.min)}{l.min?'+':''}</strong><small>görüntülenme</small></div>)}</div></section>
  </main><Footer/></>;
}
export function CommunityDetail({initial}:{initial:Detail}){
  const [data,setData]=useState(initial),[page,setPage]=useState(1),[error,setError]=useState(''),[gone,setGone]=useState(false),[refresh,setRefresh]=useState(0),[loadedKey,setLoadedKey]=useState('1:0');
  const origin=useSyncExternalStore(subscribeOrigin,browserOrigin,serverOrigin);
  const share=origin?origin+'/topluluk/'+encodeURIComponent(initial.profile.id):'';
  const requestKey=page+':'+refresh,busy=loadedKey!==requestKey;
  useEffect(()=>{
    const controller=new AbortController();
    fetch('/api/community/'+encodeURIComponent(initial.profile.id)+'?page='+page,{cache:'no-store',signal:controller.signal})
      .then(async r=>{if(r.status===404){setGone(true);return;}const result=await r.json();if(!r.ok)throw Error(result.error);setData(result);setGone(false);setError('')})
      .catch(e=>{if(e.name!=='AbortError')setError('Profil yenilenemedi. Son yüklenen bilgiler gösteriliyor.')})
      .finally(()=>{if(!controller.signal.aborted)setLoadedKey(requestKey)});
    return()=>controller.abort();
  },[initial.profile.id,page,refresh,requestKey]);
  useEffect(()=>{const update=()=>{if(!document.hidden)setRefresh(n=>n+1)};const timer=setInterval(update,60_000);window.addEventListener('focus',update);return()=>{clearInterval(timer);window.removeEventListener('focus',update)}},[]);
  const p=data.profile,creator=p.role==='creator',level=levelFor(p.views);
  return <><Header/><main className="wrap community-main"><Link className="community-back" href="/topluluk"><ArrowLeft size={16}/> Topluluğa dön</Link>{gone?<InfoEmpty title="Bu profil şu anda görünür değil." description="Profil onayı veya hesap durumu değişmiş olabilir."/>:<>
    <section className={'community-profile-hero '+(creator?'creator':level.tone)}><div className="community-profile-cover"><span className="community-role">{creator?<Clapperboard size={16}/>:<Scissors size={16}/>} {creator?'YAYINCI PROFİLİ':'KLİPPER PROFİLİ'}</span>{p.rank&&<span className="community-rank"><Trophy size={16}/> {creator?'Yayıncı':'Klipper'} sıralaması #{count(p.rank)}</span>}</div><div className="community-profile-body"><Avatar profile={p} large/><div className="community-profile-heading"><div><div className="community-name"><h1>{p.name}</h1>{p.verified&&<CheckCircle2 size={24} aria-label="Sosyal hesabı doğrulanmış"/>}</div><div className="action-row">{p.verified?<span className="pill pill-green"><ShieldCheck size={14}/> Sosyal hesabı doğrulanmış</span>:<span className="pill pill-amber">{p.socialUrl?'Doğrulama bekliyor':'Sosyal hesap eklenmedi'}</span>}<span className="pill">{creator&&level.min===0?'Başlangıç':level.name}</span><span className="hint">{new Date(p.joinedAt*1000).toLocaleDateString('tr-TR',{month:'long',year:'numeric',timeZone:'UTC'})} tarihinde katıldı</span></div></div><div className="action-row">{p.socialUrl&&<a href={p.socialUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-small">Sosyal hesabı <ArrowUpRight size={15}/></a>}{share&&<CopyButton value={share}/>}</div></div><p className="community-profile-bio">{p.bio||(creator?'İçeriğini toplulukla birlikte büyütüyor.':'İzinli içeriklerden kısa videolar üretiyor.')}</p><StartMessage recipientId={p.id}/><ReportButton targetType="profile" targetId={p.id}/></div></section>
    <div className="community-profile-stats">{[[count(p.views),'Doğrulanmış görüntülenme'],[count(p.clipCount),'Yayınlanan klip'],[count(p.campaignCount),creator?'Onaylı kampanya':'Katıldığı kampanya'],[count(p.partnerCount),creator?'Birlikte ürettiği klipper':'Çalıştığı yayıncı']].map(([value,label])=><div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div>
    {!creator&&<section className={'community-progress panel '+level.tone}><div className="row"><div><span className="eyebrow"><Sparkles size={14}/> {level.name}</span><h2>{level.next?`Sıradaki seviye: ${level.next.name}`:'Zirvedesin.'}</h2><p>{level.next?`${count(Math.max(0,level.next.min-p.views))} doğrulanmış görüntülenme daha.`:'En yüksek klipper seviyesine ulaştın.'}</p></div><strong>{count(p.views)} / {level.next?count(level.next.min):count(level.min)+'+'}</strong></div><div className="community-progress-track" role="progressbar" aria-label="Sonraki seviyeye ilerleme" aria-valuenow={Math.round(level.progress)} aria-valuemin={0} aria-valuemax={100}><span style={{width:level.progress+'%'}}/></div><p className="hint">Seviye ve profil çerçeven doğrulanmış görüntülenmelerinle birlikte değişir.</p></section>}
    <div className="community-measure-note"><span>{p.lastMeasuredAt?'Son görüntülenme kontrolü: '+new Date(p.lastMeasuredAt*1000).toLocaleString('tr-TR',{timeZone:'Europe/Istanbul'}):'Henüz doğrulanmış görüntülenme kaydı yok.'} Sayılar son onaylı ölçüme dayanır.</span><button className="btn btn-small btn-secondary" disabled={busy} onClick={()=>setRefresh(n=>n+1)}><RefreshCw size={14}/> Yenile</button></div>{error&&<p className="error" role="alert">{error}</p>}
    {!!data.campaigns.length&&<section className="community-portfolio"><div className="section-head"><h2>Katılabileceğin kampanyalar.</h2></div><div className="community-grid">{data.campaigns.map(c=><a key={c.id} href={'/kampanya/'+c.id} className="panel"><span className="pill pill-green">Katılıma açık</span><h3 className="mt-4">{c.title}</h3><span className="subtle">{c.platform}</span><span className="community-card-bottom">Kampanyayı incele <ArrowUpRight size={16}/></span></a>)}</div></section>}
    <section className="community-portfolio"><div className="section-head"><div><div className="eyebrow">ÜRETİM VİTRİNİ</div><h2>{creator?'İçeriğinden doğan klipler.':'Klipleri ve sonuçları.'}</h2></div><span className="hint">{count(data.total)} klip</span></div>{data.clips.length?<><div className="community-grid">{data.clips.map(clip=><article className="community-clip panel" key={clip.id}><div className="row"><span className="pill">{clip.platform}</span><span className="hint">{clip.lastMeasuredAt?'Ölçüm doğrulandı':'Ölçüm bekliyor'}</span></div><h3>{clip.title}</h3>{creator&&<a className="muted-link" href={'/topluluk/'+clip.clipperId}>{clip.clipperName}</a>}<div className="community-clip-views"><Eye size={20}/><strong>{count(clip.views)}</strong></div><p className="hint">Doğrulanmış görüntülenme</p><div className="action-row"><a className="btn btn-small" href={clip.videoUrl} target="_blank" rel="noopener noreferrer">Klibi izle <ArrowUpRight size={14}/></a><a className="muted-link" href={'/kampanya/'+clip.campaignId}>Kampanya</a></div><ReportButton targetType="clip" targetId={clip.id}/></article>)}</div><Pager page={data.page} pages={data.pages} onChange={setPage}/></>:<InfoEmpty title="İlk klipler yolda." description="Yayın onayı alıp paylaşılan klipler ve doğrulanan görüntülenmeleri burada yer alacak."/>}</section>
  </>}</main><Footer/></>;
}
