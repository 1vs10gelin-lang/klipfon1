import {DatabaseSync} from 'node:sqlite';
import {mkdir,mkdtemp,readdir,readFile,writeFile,copyFile,rm,stat,rename} from 'node:fs/promises';
import {resolve,join,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {snapshotDatabase} from './runtime';
const exec=promisify(execFile);
const root=()=>resolve(process.env.DATA_DIR||'.data');
const folder=()=>join(root(),'backups');
const validName=(name:string)=>/^klipfon-\d{4}-\d{2}-\d{2}T[\d-]+Z-[a-f0-9]{8}\.tar\.gz$/.test(name);
const digest=(b:Buffer)=>createHash('sha256').update(b).digest('hex');
let running:Promise<any>|null=null;
export async function listBackups(){await mkdir(folder(),{recursive:true,mode:0o700});const files=(await readdir(folder())).filter(validName).sort().reverse();return Promise.all(files.map(async name=>{const info=await stat(join(folder(),name));let manifest:any={};try{manifest=JSON.parse(await readFile(join(folder(),name+'.json'),'utf8'))}catch{}return {name,size:info.size,createdAt:Math.floor(info.mtimeMs/1000),verified:manifest.verified===true,counts:manifest.counts||{}}}));}
function inspectDatabase(path:string){const db=new DatabaseSync(path,{readOnly:true});try{const integrity=db.prepare('PRAGMA integrity_check').get();if(Object.values(integrity||{})[0]!=='ok')throw Error('Yedek veritabanı bütünlük kontrolünü geçemedi.');if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Yedek ilişkileri doğrulanamadı.');const counts:Record<string,number>={};for(const t of ['users','ledger','clips','messages','conversations','reports'])counts[t]=Number(db.prepare('SELECT COUNT(*) AS n FROM '+t).get()?.n||0);const ledger=Number(db.prepare('SELECT COALESCE(SUM(amount),0) AS n FROM ledger').get()?.n||0);const uploads=db.prepare('SELECT key FROM uploads').all().map(x=>String(x.key));const avatars=db.prepare("SELECT id,avatar_id FROM users WHERE avatar_id<>''").all().map(x=>'avatars/'+x.id+'/'+x.avatar_id);return {counts,ledger,keys:[...uploads,...avatars]};}finally{db.close()}}
async function verifyExtracted(dir:string){const manifest=JSON.parse(await readFile(join(dir,'manifest.json'),'utf8'));for(const [relative,hash] of Object.entries(manifest.hashes)){const path=resolve(dir,relative);if(!path.startsWith(dir+sep))throw Error('Geçersiz yedek yolu.');if(digest(await readFile(path))!==hash)throw Error('Yedek dosyası doğrulanamadı: '+relative);}const checked=inspectDatabase(join(dir,'klipfon.sqlite'));if(JSON.stringify(checked.counts)!==JSON.stringify(manifest.counts)||checked.ledger!==manifest.ledger)throw Error('Geri yükleme sayıları uyuşmuyor.');return manifest;}
async function create(){
 await mkdir(folder(),{recursive:true,mode:0o700});const temp=await mkdtemp(join(tmpdir(),'klipfon-backup-'));const name='klipfon-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'+crypto.randomUUID().slice(0,8)+'.tar.gz';const destination=join(folder(),name),part=destination+'.partial';
 try{
  const stage=join(temp,'bundle');await mkdir(stage);await snapshotDatabase(join(stage,'klipfon.sqlite'));
  const inspected=inspectDatabase(join(stage,'klipfon.sqlite'));const hashes:Record<string,string>={};
  hashes['klipfon.sqlite']=digest(await readFile(join(stage,'klipfon.sqlite')));
  for(const key of inspected.keys){const source=resolve(root(),'private',key),base=resolve(root(),'private');if(!source.startsWith(base+sep))throw Error('Geçersiz dosya yolu.');const relative='private/'+key,target=join(stage,relative);await mkdir(dirname(target),{recursive:true,mode:0o700});await copyFile(source,target);hashes[relative]=digest(await readFile(target));}
  const manifest={version:1,createdAt:Date.now(),counts:inspected.counts,ledger:inspected.ledger,hashes};await writeFile(join(stage,'manifest.json'),JSON.stringify(manifest,null,2),{mode:0o600});
  await exec('tar',['-czf',part,'-C',stage,'.'],{timeout:120000});
  const restored=join(temp,'restored');await mkdir(restored);await exec('tar',['-xzf',part,'-C',restored],{timeout:120000});await verifyExtracted(restored);
  await rename(part,destination);await writeFile(destination+'.json',JSON.stringify({verified:true,counts:inspected.counts}),{mode:0o600});
  const all=await listBackups();for(const old of all.slice(7)){await rm(join(folder(),old.name),{force:true});await rm(join(folder(),old.name+'.json'),{force:true});}
  return {name,verified:true,counts:inspected.counts};
 }finally{await rm(temp,{recursive:true,force:true});await rm(part,{force:true});}
}
export function createBackup(){if(!running)running=create().finally(()=>{running=null});return running;}
export async function downloadBackup(name:string){if(!validName(name))throw Error('Yedek adı geçersiz.');return readFile(join(folder(),name));}
export async function verifyBackup(name:string){if(!validName(name))throw Error('Yedek adı geçersiz.');const temp=await mkdtemp(join(tmpdir(),'klipfon-restore-check-'));try{await exec('tar',['-xzf',join(folder(),name),'-C',temp],{timeout:120000});const m=await verifyExtracted(temp);return {verified:true,counts:m.counts};}finally{await rm(temp,{recursive:true,force:true});}}
export async function dailyBackup(){const items=await listBackups();if(items[0]&&Date.now()/1000-items[0].createdAt<86400)return;await createBackup();}
let started=false;
export function startBackups(){if(started)return;started=true;const run=()=>dailyBackup().catch(e=>console.error('Daily backup failed:',e instanceof Error?e.message:'unknown'));void run();const timer=setInterval(run,3600000);timer.unref();}
