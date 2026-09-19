import {DatabaseSync,backup} from 'node:sqlite';
import {mkdirSync,readFileSync,readdirSync} from 'node:fs';
import {mkdir,readFile,writeFile,unlink} from 'node:fs/promises';
import {resolve,dirname,sep} from 'node:path';
import {createHash} from 'node:crypto';
const root=()=>resolve(process.env.DATA_DIR||'.data');
let sql:DatabaseSync|undefined;
function connection(){
 if(sql)return sql;
 const dir=root();mkdirSync(dir,{recursive:true,mode:0o700});
 const candidate=new DatabaseSync(resolve(dir,'klipfon.sqlite'));
 try{
 candidate.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
 candidate.exec('CREATE TABLE IF NOT EXISTS klipfon_migrations(name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)');
 const folder=resolve(process.cwd(),'drizzle');
 for(const name of readdirSync(folder).filter(x=>/^\d+.*\.sql$/.test(x)).sort()){
   const body=readFileSync(resolve(folder,name),'utf8'),hash=createHash('sha256').update(body).digest('hex');
   candidate.exec('BEGIN IMMEDIATE');
   try{
     const applied=candidate.prepare('SELECT hash FROM klipfon_migrations WHERE name=?').get(name);
     if(applied&&applied.hash!==hash)throw Error('Applied migration changed: '+name);
     if(!applied){candidate.exec(body);candidate.prepare('INSERT INTO klipfon_migrations VALUES(?,?,unixepoch())').run(name,hash);}
     candidate.exec('COMMIT');
   }catch(e){candidate.exec('ROLLBACK');throw e;}
 }
 sql=candidate;return sql;
 }catch(e){candidate.close();throw e;}
}
class Statement{
 constructor(readonly query:string,readonly args:any[]=[]){ }
 bind(...args:any[]){return new Statement(this.query,args);}
 async first<T=any>():Promise<T|null>{return (connection().prepare(this.query).get(...this.args)??null) as T|null;}
 async all(){return {results:connection().prepare(this.query).all(...this.args)};}
 async run(){return connection().prepare(this.query).run(...this.args);}
}
export const database={prepare:(query:string)=>new Statement(query),async batch(items:Statement[]){const c=connection();c.exec('BEGIN IMMEDIATE');try{const results=items.map(s=>c.prepare(s.query).run(...s.args));c.exec('COMMIT');return results;}catch(e){c.exec('ROLLBACK');throw e;}}};
function filePath(key:string){const base=resolve(root(),'private');const path=resolve(base,key);if(!path.startsWith(base+sep))throw Error('Invalid file key');return path;}
export const bucket={async put(key:string,bytes:Uint8Array,_options?:unknown){const path=filePath(key);await mkdir(dirname(path),{recursive:true,mode:0o700});await writeFile(path,bytes,{mode:0o600,flag:'wx'});},async get(key:string){try{return {body:new Uint8Array(await readFile(filePath(key)))};}catch(e){if((e as NodeJS.ErrnoException).code==='ENOENT')return null;throw e;}},async delete(key:string){try{await unlink(filePath(key));}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}};
export function allowedOrigin(req:Request){const configured=process.env.APP_ORIGIN||(process.env.RAILWAY_PUBLIC_DOMAIN?'https://'+process.env.RAILWAY_PUBLIC_DOMAIN:'');if(process.env.NODE_ENV==='production'&&!configured)throw Error('APP_ORIGIN is required.');const wanted=configured||new URL(req.url).origin;return req.headers.get('origin')===wanted;}

export async function snapshotDatabase(destination:string){await backup(connection(),destination);}
