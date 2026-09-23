"""Live API checks against an isolated database; never uses production accounts."""
import json,os,secrets,sqlite3,subprocess,tempfile,time,urllib.request,urllib.error,uuid,tarfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='http://127.0.0.1:3022'
def req(path,body=None,cookie='',expected=200,method=None,origin=ORIGIN):
    headers={'Origin':origin,'Content-Type':'application/json'}
    if cookie: headers['Cookie']=cookie
    request=urllib.request.Request(ORIGIN+path,data=json.dumps(body).encode() if body is not None else None,headers=headers,method=method)
    try:r=urllib.request.urlopen(request,timeout=30)
    except urllib.error.HTTPError as e:r=e
    raw=r.read();assert r.status==expected,(path,r.status,raw[:600])
    return (json.loads(raw) if 'application/json' in r.headers.get('Content-Type','') else raw),r.headers

def action(cookie,kind,**kwargs):
    expected=kwargs.pop('expected',200)
    return req('/api/messages',dict(action=kind,requestId=str(uuid.uuid4()),**kwargs),cookie,expected)[0]

with tempfile.TemporaryDirectory(prefix='klipfon-operations-') as tmp, tempfile.TemporaryFile() as log:
    env=dict(os.environ,NODE_ENV='production',DATA_DIR=tmp,APP_ORIGIN=ORIGIN,NEXT_TELEMETRY_DISABLED='1')
    def start():
        p=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3022'],cwd=ROOT,env=env,stdout=log,stderr=log)
        for _ in range(100):
            try:req('/api/health');return p
            except OSError:time.sleep(.2)
        p.terminate();p.wait(timeout=10);log.seek(0);print(log.read().decode()[-6000:]);raise AssertionError('Server not ready')
    p=start();db=sqlite3.connect(Path(tmp)/'klipfon.sqlite',timeout=10);db.execute('PRAGMA foreign_keys=ON')
    try:
        def register(name,role):
            _,h=req('/api/auth/register',dict(email=name.replace(' ','').lower()+'@example.test',password=secrets.token_urlsafe(24),name=name,phone='05321234567',accepted=True,role=role))
            cookie=h['Set-Cookie'].split(';')[0]
            uid=req('/api/state',cookie=cookie)[0]['user']['id']
            return uid,cookie
        a,ac=register('Clipper A','clipper');b,bc=register('Clipper B','clipper');c,cc=register('Creator C','creator');d,dc=register('Creator D','creator');e,ec=register('Outsider','clipper');ad,adc=register('Admin','clipper')
        db.execute("UPDATE users SET role='admin' WHERE id=?",(ad,));db.execute('INSERT INTO admin_owner VALUES(1,?,?)',(ad,int(time.time())));db.commit()
        # Default request flow across same and different roles.
        ab=action(ac,'start',recipientId=b,body='Merhaba, birlikte çalışalım.',noticeAccepted=True)['id']
        assert req('/api/messages?id='+ab,cookie=bc)[0]['conversation']['status']=='pending'
        action(ac,'send',id=ab,body='Cannot flood before acceptance',expected=409)
        action(ac,'accept',id=ab,expected=403)
        req('/api/messages?id='+ab,cookie=ec,expected=404)
        action(ec,'send',id=ab,body='Unauthorized',expected=404)
        req('/api/admin/chat',cookie=ac,expected=403)
        action(bc,'accept',id=ab)
        send=dict(action='send',requestId=str(uuid.uuid4()),id=ab,body='Kabul ettim. <script>alert(1)</script>')
        req('/api/messages',send,bc);req('/api/messages',send,bc)
        assert len(req('/api/messages?id='+ab,cookie=ac)[0]['messages'])==2
        action(bc,'block',id=ab);action(ac,'send',id=ab,body='Blocked',expected=409)
        assert len(req('/api/messages?id='+ab,cookie=bc)[0]['messages'])==2
        action(bc,'unblock',id=ab);action(ac,'send',id=ab,body='Engel kaldırıldı.')
        action(cc,'preferences',policy='open');ca=action(ac,'start',recipientId=c,body='Yayın için konuşalım.',noticeAccepted=True)['id']
        assert req('/api/messages?id='+ca,cookie=cc)[0]['conversation']['status']=='accepted'
        cd=action(cc,'start',recipientId=d,body='Yayıncı iş birliği.',noticeAccepted=True)['id'];action(dc,'decline',id=cd)
        action(cc,'send',id=cd,body='After decline',expected=409)
        action(dc,'accept',id=cd);action(cc,'send',id=cd,body='Kabul sonrası mesaj.')
        action(dc,'preferences',policy='closed');action(ec,'start',recipientId=d,body='Closed requests',noticeAccepted=True,expected=409)
        action(ec,'start',recipientId=a,body='No notice',noticeAccepted=False,expected=400)
        req('/api/messages',dict(action='preferences',policy='open',requestId=str(uuid.uuid4())),ac,403,origin='https://untrusted.test')
        db.execute("UPDATE users SET status='suspended' WHERE id=?",(b,));db.commit()
        action(ac,'send',id=ab,body='Suspended recipient',expected=409)
        req('/api/messages',cookie=bc,expected=403)
        db.execute("UPDATE users SET status='active' WHERE id=?",(b,));db.commit()
        # Immutable persisted history; pagination and admin audit.
        for query in ['DELETE FROM messages','UPDATE messages SET body=\'rewrite\'']:
            try:db.execute(query);raise AssertionError('message mutation succeeded')
            except sqlite3.IntegrityError as ex:assert 'MESSAGES_IMMUTABLE' in str(ex);db.rollback()
        now=int(time.time())
        for i in range(55):db.execute('INSERT INTO messages(id,conversation_id,sender_id,body,created_at) VALUES(?,?,?,?,?)',(str(uuid.uuid4()),ab,a,'History '+str(i),now))
        db.commit()
        last=req('/api/messages?id='+ab,cookie=bc)[0];assert len(last['messages'])==50 and last['hasOlder']
        earlier=req('/api/messages?id='+ab+'&before='+str(last['messages'][0]['seq']),cookie=bc)[0];assert len(earlier['messages'])==8
        admin_thread=req('/api/admin/chat?id='+ab,cookie=adc)[0];assert len(admin_thread['messages'])==50
        assert db.execute("SELECT COUNT(*) FROM audit WHERE action='chat_log_view' AND actor=? AND target=?",(ad,ab)).fetchone()[0]==1
        assert req('/api/admin/chat?q=History',cookie=adc)[0]['total']==1
        for path in ['/api/admin/reports','/api/admin/backups','/api/admin/launch']:req(path,cookie=ac,expected=403)
        # Notifications cannot be marked read by another member.
        n=req('/api/notifications',cookie=bc)[0];assert n['unread']>=56
        nid=n['items'][0]['id'];req('/api/notifications',dict(id=nid),ec)
        assert db.execute('SELECT read_at FROM notifications WHERE id=?',(nid,)).fetchone()[0] is None
        req('/api/notifications',dict(all=True),bc);assert req('/api/notifications',cookie=bc)[0]['unread']==0
        # Reports of private messages are limited to their participants.
        mid=last['messages'][0]['id']
        report=dict(requestId=str(uuid.uuid4()),targetType='message',targetId=mid,category='spam',reason='Bu mesajlar için inceleme istiyorum.')
        req('/api/reports',report,ec,404);req('/api/reports',report,bc)
        rep=req('/api/admin/reports',cookie=adc)[0]['items'][0]
        req('/api/admin/reports',dict(id=rep['id'],requestId=str(uuid.uuid4()),status='resolved',note='Konuşma kontrol edildi; inceleme tamamlandı.'),adc)
        assert req('/api/reports',cookie=bc)[0]['items'][0]['status']=='resolved'
        assert not req('/api/reports',cookie=ec)[0]['items']
        # Campaign drafts don't touch funded budgets or public campaigns.
        draft=dict(requestId=str(uuid.uuid4()),payload={'title':'Gerçek yayın hazırlığı','sourceUrl':'https://example.test/source','budget':'2000'})
        req('/api/campaign-drafts',draft,ac,403);req('/api/campaign-drafts',draft,cc)
        assert len(req('/api/campaign-drafts',cookie=cc)[0]['items'])==1
        assert not req('/api/campaign-drafts',cookie=dc)[0]['items']
        assert db.execute('SELECT COUNT(*) FROM campaigns').fetchone()[0]==0
        assert req('/api/earnings',cookie=ac)[0]['available']==0
        # Earnings fixtures now require a publishing profile before joining.
        db.execute("UPDATE users SET social_url='https://youtube.com/@clippera' WHERE id=?",(a,))
        # Earnings distinguish measured estimates, pending review and settled balances.
        db.execute("INSERT INTO ledger VALUES('test-fund',?,10000000,'deposit','test',?)",(c,now))
        for phase,age in [('measuring',1),('review',15),('awaiting',22),('settled',23)]:
            cid='earn-'+phase;pub=now-age*86400
            db.execute('INSERT INTO campaigns(id,owner_id,title,description,rules,source_url,platform,category,budget,cap,rate,fee_bps,created_at,deadline) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',(cid,c,'Kazanç test kampanyası','Test açıklaması ve izinli içerik','Yalnızca test kuralları','https://example.test/source','YouTube','Oyun',100000,50000,1000,2000,now,now+864000))
            db.execute("UPDATE campaigns SET status='active' WHERE id=?",(cid,))
            db.execute('INSERT INTO clips(id,campaign_id,user_id,cap,created_at,expires_at) VALUES(?,?,?,?,?,?)',(cid,cid,a,50000,pub-100,now+3600))
            db.execute("UPDATE clips SET status='submitted' WHERE id=?",(cid,));db.execute("UPDATE clips SET status='ready' WHERE id=?",(cid,))
            db.execute("UPDATE clips SET status='published',video_url='https://example.test/video',video_key=?,published_at=?,measurement_ends=?,review_ends=? WHERE id=?",(cid,pub,pub+1209600,pub+1814400,cid))
            db.execute('INSERT INTO measurements VALUES(?,?,?,?,?,?,?,?,?)',(str(uuid.uuid4()),cid,2500,2000,'Test measurement','Test moderation',pub+100,now,ad))
            if phase=='settled':db.execute("UPDATE clips SET status='settled',earned=2000,settled_at=? WHERE id=?",(now,cid))
        db.commit()
        earnings=req('/api/earnings',cookie=ac)[0];phases={x['id']:x for x in earnings['items']}
        assert phases['earn-measuring']['phase']=='measuring' and phases['earn-measuring']['estimate']==2000
        assert phases['earn-review']['phase']=='review' and not phases['earn-review']['awaitingAdmin']
        assert phases['earn-awaiting']['awaitingAdmin'] is True
        assert phases['earn-settled']['phase']=='settled' and earnings['available']==2000
        assert not req('/api/earnings',cookie=ec)[0]['items']
        # Round-trip backup with real message history and ledger rows.
        backup=req('/api/admin/backups',{'action':'create'},adc)[0];assert backup['verified']
        archive=req('/api/admin/backups?download='+backup['name'],cookie=adc)[0]
        archive_path=Path(tmp)/'download.tar.gz';archive_path.write_bytes(archive)
        restore=Path(tmp)/'recovered';restore.mkdir()
        with tarfile.open(archive_path) as tf:tf.extractall(restore,filter='data')
        recovered=sqlite3.connect(restore/'klipfon.sqlite')
        assert recovered.execute('SELECT COUNT(*) FROM messages').fetchone()==db.execute('SELECT COUNT(*) FROM messages').fetchone()
        assert recovered.execute('SELECT COUNT(*) FROM conversations').fetchone()==db.execute('SELECT COUNT(*) FROM conversations').fetchone()
        assert recovered.execute('PRAGMA integrity_check').fetchone()[0]=='ok';recovered.close()
        assert req('/api/admin/backups',{'action':'verify','name':backup['name']},adc)[0]['verified']
        req('/api/admin/backups?download=../../klipfon.sqlite',cookie=adc,expected=400)
        assert req('/api/admin/backups',cookie=adc)[0]['items']
        # Restart persistence of conversations, messages and preferences.
        p.terminate();p.wait(timeout=10);p=start()
        assert len(req('/api/messages?id='+ab,cookie=bc)[0]['messages'])==50
        assert req('/api/messages',cookie=dc)[0]['policy']=='closed'
        if os.environ.get('OPS_QA_DIR'):
            target=Path(os.environ['OPS_QA_DIR']);target.mkdir(parents=True,exist_ok=True)
            copy=sqlite3.connect(target/'klipfon.sqlite');db.backup(copy);copy.close()
            (target/'qa-sessions.json').write_text(json.dumps({'clipper':ac,'admin':adc,'chat':ab,'user':a}))
        print('PASS: all member role pairs, request acceptance/rejection, preferences, block/unblock, consent, CSRF, IDOR, suspended users, send idempotency, immutable messages, history pagination, admin-only chat/audit, notification ownership, report review, private drafts, backup extraction/hash/integrity/counts, restart persistence.')
    except Exception:
        log.seek(0);print(log.read().decode()[-7000:]);raise
    finally:p.terminate();p.wait(timeout=10);db.close()
