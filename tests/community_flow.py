"""Public profiles against a production server and an isolated legacy database."""
import hashlib, json, os, secrets, sqlite3, subprocess, tempfile, time, urllib.error, urllib.request, uuid
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:3018'

def request(path, body=None, cookie='', expected=200):
    headers = {'Origin': ORIGIN, 'Content-Type': 'application/json'}
    if cookie:
        headers['Cookie'] = cookie
    req = urllib.request.Request(ORIGIN + path, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as error:
        response = error
    raw = response.read().decode()
    assert response.status == expected, (path, response.status, raw[:500])
    return (json.loads(raw) if 'application/json' in response.headers.get('Content-Type', '') else raw), response.headers

with tempfile.TemporaryDirectory(prefix='klipfon-community-') as tmp:
    database_path = Path(tmp) / 'klipfon.sqlite'
    sql = sqlite3.connect(database_path)
    sql.execute('PRAGMA foreign_keys=ON')
    sql.execute('CREATE TABLE klipfon_migrations(name TEXT PRIMARY KEY, hash TEXT NOT NULL, applied_at INTEGER NOT NULL)')
    # Simulate an existing installation. New migrations must preserve these users.
    for file in sorted((ROOT / 'drizzle').glob('*.sql')):
        if file.name >= '0004':
            continue
        body = file.read_text()
        sql.executescript(body)
        sql.execute('INSERT INTO klipfon_migrations VALUES(?,?,?)', (file.name, hashlib.sha256(body.encode()).hexdigest(), int(time.time())))
    now = int(time.time())

    def user(uid, name, role='clipper', verified=1, status='active'):
        sql.execute('INSERT INTO users(id,email,phone,name,role,status,verified,social_url,iban,account_name,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)',
                    (uid, uid+'@private.test', '+905321234567', name, role, status, verified, 'https://youtube.com/@'+uid,
                     'TR330006100519786457841326', 'PRIVATE BANK NAME', now))
    user('creator', 'Yayıncı Ada', 'creator')
    user('leader', 'İpek Klipper')
    user('runner', 'Deniz Edit')
    user('tie', 'Ege Klipper')
    user('pending', 'PRIVATE PENDING', verified=0)
    user('suspended', 'PRIVATE SUSPENDED', status='suspended')
    user('admin', 'PRIVATE ADMIN', role='admin')
    sql.commit()
    env = dict(os.environ, NODE_ENV='production', DATA_DIR=tmp, APP_ORIGIN=ORIGIN, NEXT_TELEMETRY_DISABLED='1')
    with tempfile.TemporaryFile() as log:
        process = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3018'], cwd=ROOT, env=env, stdout=log, stderr=log)
        try:
            for attempt in range(100):
                try:
                    request('/api/health')
                    break
                except OSError:
                    time.sleep(.2)
            else:
                raise AssertionError('Server failed to start')
            assert sql.execute("SELECT bio FROM users WHERE id='leader'").fetchone() == ('',)
            assert sql.execute('SELECT COUNT(*) FROM klipfon_migrations').fetchone()[0] == len(list((ROOT/'drizzle').glob('*.sql')))
            initial, _ = request('/api/community')
            assert initial['total'] == 4
            assert all(p['rank'] is None and p['views'] == 0 for p in initial['profiles'])
            for uid in ['pending', 'suspended', 'admin', 'missing']:
                request('/api/community/'+uid, expected=404)
                request('/topluluk/'+uid, expected=404)
            sql.execute("UPDATE users SET bio=? WHERE id='leader'", ('Oyun, sohbet ve kısa hikâyeler. <script>alert(1)</script>',))
            sql.execute("INSERT INTO ledger VALUES('fund','creator',100000000,'deposit','seed',?)", (now,))

            def clip(cid, owner, views):
                campaign = 'campaign-'+cid
                sql.execute('INSERT INTO campaigns(id,owner_id,title,description,rules,source_url,platform,category,budget,cap,rate,fee_bps,created_at,deadline) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)',
                    (campaign, 'creator', 'Yayının en iyi anları '+cid, 'Topluluk test kampanyası açıklaması.', 'Test kuralları ve izinli içerik.', 'https://youtube.com/@creator', 'YouTube', 'Oyun', 1000000, 100000, 2500, 2000, now, now+864000))
                sql.execute("UPDATE campaigns SET status='active' WHERE id=?", (campaign,))
                sql.execute('INSERT INTO clips(id,campaign_id,user_id,cap,created_at,expires_at) VALUES(?,?,?,?,?,?)', (cid, campaign, owner, 100000, now-300, now+86400))
                sql.execute("UPDATE clips SET status='submitted',draft_url='https://example.com/private-draft' WHERE id=?", (cid,))
                sql.execute("UPDATE clips SET status='ready' WHERE id=?", (cid,))
                sql.execute("UPDATE clips SET status='published',video_url='https://youtu.be/dQw4w9WgXcQ',video_key=?,published_at=?,measurement_ends=?,review_ends=? WHERE id=?", (cid, now-100, now-100+1209600, now-100+1814400, cid))
                measure(cid, views)

            def measure(cid, views):
                sql.execute('INSERT INTO measurements VALUES(?,?,?,?,?,?,?,?,?)', (str(uuid.uuid4()), cid, views+250, views, 'PRIVATE EVIDENCE SOURCE', 'PRIVATE MODERATION NOTE', now-20, now, 'admin'))

            clip('first', 'leader', 50000)
            measure('first', 100000)
            clip('second', 'leader', 20000)
            clip('runner-clip', 'runner', 10000)
            clip('tie-clip', 'tie', 10000)
            clip('rejected-clip', 'leader', 999999)
            sql.execute("UPDATE clips SET status='rejected' WHERE id='rejected-clip'")
            sql.commit()
            listing, headers = request('/api/community')
            assert headers['Cache-Control'] == 'no-store'
            people = {p['id']: p for p in listing['profiles']}
            assert people['leader']['views'] == 120000 and people['leader']['clipCount'] == 2
            assert people['leader']['rank'] == 1
            assert people['runner']['rank'] == people['tie']['rank'] == 2
            assert people['creator']['views'] == 140000 and people['creator']['clipCount'] == 4
            detail, _ = request('/api/community/leader')
            assert len(detail['clips']) == 2 and detail['clips'][0]['views'] == 100000
            assert detail['profile']['partnerCount'] == 1
            creator, _ = request('/api/community/creator')
            assert len(creator['clips']) == 4 and creator['profile']['partnerCount'] == 3
            combined = json.dumps([listing, detail, creator])
            for forbidden in ['private.test', '+905321234567', 'TR330006100519786457841326', 'PRIVATE', 'private-draft', 'earned', 'balance', 'account_name', 'review_ends', 'password']:
                assert forbidden not in combined, forbidden
            html, _ = request('/topluluk/leader')
            assert '<script>alert(1)</script>' not in html
            assert 'İpek Klipper' in html
            assert request('/api/community?role=creator')[0]['total'] == 1
            assert request('/api/community?q=%C4%B0pek')[0]['total'] == 1
            assert request('/api/community?q=ipek')[0]['total'] == 1
            assert request('/api/community?q=%25')[0]['total'] == 0
            assert request('/api/community?q=%27%20OR%201%3D1--')[0]['total'] == 0
            assert request('/api/community?sort=not-a-column&page=-10')[0]['page'] == 1
            measure('first', 1000)
            sql.commit()
            assert request('/api/community/leader')[0]['profile']['views'] == 21000
            sql.execute("UPDATE users SET verified=0 WHERE id='leader'")
            sql.commit()
            request('/api/community/leader', expected=404)
            assert request('/api/community')[0]['total'] == 3
            assert all(c['clipperId'] != 'leader' for c in request('/api/community/creator')[0]['clips'])
            sql.execute("UPDATE users SET verified=1 WHERE id='leader'")
            measure('first', 100000)
            for i in range(26):
                user('new-'+str(i), 'Yeni Klipper '+str(i))
            sql.commit()
            first=request('/api/community?role=clipper')[0]
            second=request('/api/community?role=clipper&page=2')[0]
            assert first['total'] == 29 and len(first['profiles']) == 24 and len(second['profiles']) == 5
            assert not ({p['id'] for p in first['profiles']} & {p['id'] for p in second['profiles']})
            assert request('/api/community?page=999')[0]['page'] == 2
            # A normal user can edit their biography, but cannot submit counters or approval.
            _, hdr = request('/api/auth/register', dict(email='editable@example.test', password=secrets.token_urlsafe(24), name='Editable User', role='clipper', phone='05321234567', accepted=True))
            cookie=hdr['Set-Cookie'].split(';')[0]
            profile=dict(action='profile',requestId=str(uuid.uuid4()),name='Editable User',bio='Yeni biyografim',phone='05321234567',socialUrl='https://youtube.com/@editable',iban='',accountName='',views=999999999,verified=True,rank=1)
            request('/api/action',profile,cookie)
            state=request('/api/state',cookie=cookie)[0]
            assert state['user']['bio'] == 'Yeni biyografim' and state['user']['verified'] == 0 and state['communityProfile'] is None
            profile['requestId']=str(uuid.uuid4());profile['bio']='a'*301
            request('/api/action',profile,cookie,expected=400)
            sql.execute('UPDATE users SET verified=1 WHERE id=?',(state['user']['id'],));sql.commit()
            state=request('/api/state',cookie=cookie)[0]
            assert state['communityProfile']['views']==0 and state['communityProfile']['rank'] is None
            profile['requestId']=str(uuid.uuid4());profile['bio']='Biyografi';profile['socialUrl']='https://youtube.com/@changed'
            request('/api/action',profile,cookie)
            request('/api/community/'+state['user']['id'],expected=404)
            request('/topluluk')
            # Optional local-only fixture copy for visual checks; never used in production.
            if os.environ.get('COMMUNITY_QA_DIR'):
                target=Path(os.environ['COMMUNITY_QA_DIR']);target.mkdir(parents=True,exist_ok=True)
                backup=sqlite3.connect(target/'klipfon.sqlite');sql.backup(backup);backup.close()
            print('PASS: legacy migration, approved-only visibility, private-field exclusion, latest measurement totals, rejection, downward correction, per-role tied ranks, Turkish search, injection, pagination, profile editing, counter forgery, revoked approval, public pages.')
        except Exception:
            log.seek(0);print(log.read().decode()[-5000:]);raise
        finally:
            process.terminate();process.wait(timeout=10);sql.close()
