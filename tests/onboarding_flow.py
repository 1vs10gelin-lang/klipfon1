"""Registration, public visibility and funded participation against a disposable database."""
import json, os, secrets, sqlite3, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
ORIGIN = 'http://127.0.0.1:3024'
def request(path, body=None, cookie='', expected=200):
    headers = {'Origin': ORIGIN, 'Content-Type': 'application/json', 'Cookie': cookie}
    req = urllib.request.Request(ORIGIN + path, data=json.dumps(body).encode() if body is not None else None, headers=headers)
    try: r = urllib.request.urlopen(req, timeout=15)
    except urllib.error.HTTPError as e: r = e
    raw = r.read(); assert r.status == expected, (path, r.status, raw[:500])
    return (json.loads(raw) if 'application/json' in r.headers.get('Content-Type', '') else raw), r.headers

def action(cookie, kind, expected=200, **values):
    return request('/api/action', dict(action=kind, requestId=str(uuid.uuid4()), **values), cookie, expected)[0]

with tempfile.TemporaryDirectory(prefix='klipfon-onboarding-') as tmp, tempfile.TemporaryFile() as log:
    env = dict(os.environ, NODE_ENV='production', DATA_DIR=tmp, APP_ORIGIN=ORIGIN, NEXT_TELEMETRY_DISABLED='1')
    process = subprocess.Popen(['node', 'node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', '3024'], cwd=ROOT, env=env, stdout=log, stderr=log)
    try:
        for _ in range(100):
            try: request('/api/health'); break
            except OSError: time.sleep(.2)
        else: raise AssertionError('Server failed to start')
        def register(name, role='clipper', visibility='public'):
            _, headers = request('/api/auth/register', dict(name=name, email=name.lower()+'@example.test', password=secrets.token_urlsafe(24), phone='05321234567', role=role, accepted=True, communityVisibility=visibility))
            cookie = headers['Set-Cookie'].split(';')[0]
            state = request('/api/state', cookie=cookie)[0]
            assert state['user']['status'] == 'active' and state['user']['verified'] == 0
            assert state['user']['social_url'] == ''
            return state['user']['id'], cookie
        uid, cookie = register('NewClipper')
        hidden, hidden_cookie = register('HiddenClipper', visibility='hidden')
        creator, creator_cookie = register('Publisher', 'creator')
        assert request('/api/community/'+uid)[0]['profile']['verified'] is False
        assert request('/api/community/'+creator)[0]['profile']['verified'] is False
        request('/api/community/'+hidden, expected=404)
        assert request('/api/state', cookie=hidden_cookie)[0]['communityProfile'] is None
        assert {p['id'] for p in request('/api/community')[0]['profiles']} == {uid, creator}
        # Immediate access includes requests between unverified members without social links.
        message = dict(action='start', requestId=str(uuid.uuid4()), recipientId=creator, body='Merhaba, ilk kampanyanızda üretmek isterim.', noticeAccepted=True)
        request('/api/messages', message, cookie)
        assert request('/api/messages', cookie=creator_cookie)[0]['threads'][0]['status'] == 'pending'
        # Fund a private local fixture; production balances are never used.
        db = sqlite3.connect(Path(tmp)/'klipfon.sqlite'); now = int(time.time())
        db.execute("INSERT INTO ledger VALUES('fixture-fund',?,100000,'deposit','fixture',?)", (creator, now))
        db.commit()
        campaign = action(creator_cookie, 'campaign_create', title='İlk yayıncı kampanyası', description='İzinli kaynaklarla hazırlanmış ilk test kampanyası.', rules='Yalnızca izin verilen kaynaklardan kısa video üret.', sourceUrl='https://youtube.com/watch?v=abcdefghijk', platform='YouTube', category='Oyun', budget='100', cap='20', rate='25', rights=True)['id']
        request('/api/campaign/'+campaign, cookie=cookie, expected=403)
        db.execute("UPDATE campaigns SET status='active' WHERE id=?", (campaign,)); db.commit()
        action(cookie, 'join', expected=400, id=campaign, accepted=True)
        assert db.execute('SELECT COUNT(*) FROM clips').fetchone()[0] == 0
        profile = dict(name='NewClipper', phone='05321234567', bio='İlk içeriklerimi hazırlıyorum.', socialUrl='https://youtube.com/@newclipper', iban='', accountName='')
        action(cookie, 'profile', **profile, communityVisibility='hidden', verified=True)
        request('/api/community/'+uid, expected=404)
        assert uid not in {p['id'] for p in request('/api/community')[0]['profiles']}
        assert request('/api/state', cookie=cookie)[0]['user']['verified'] == 0
        # Visibility and optional badge do not gate participation; funding and role checks do.
        joined = action(cookie, 'join', id=campaign, accepted=True)['id']
        assert db.execute('SELECT user_id FROM clips').fetchone()[0] == uid
        action(cookie, 'join', expected=409, id=campaign, accepted=True)
        action(creator_cookie, 'join', expected=400, id=campaign, accepted=True)
        action(cookie, 'profile', **profile, communityVisibility='public')
        request('/api/community/'+uid)
        action(cookie, 'profile', **profile, communityVisibility='invalid', expected=400)
        # Old clients preserve the user's visibility choice when omitting the field.
        action(cookie, 'profile', **profile, communityVisibility='hidden')
        action(cookie, 'profile', **profile)
        request('/api/community/'+uid, expected=404)
        assert db.execute('SELECT COUNT(*) FROM clips').fetchone()[0] == 1
        db.execute("UPDATE users SET status='suspended' WHERE id=?", (uid,)); db.commit()
        request('/api/state', cookie=cookie, expected=403)
        request('/api/community/'+uid, expected=404)
        db.close()
        print('PASS: immediate registration/panel, no social/admin gate, public unverified profiles, opt-out at signup/profile, private endpoints, instant messaging, funded campaign gating, social required only for joining, role and suspension checks, no forged badge, preserved records.')
    except Exception:
        log.seek(0); print(log.read().decode()[-5000:]); raise
    finally:
        process.terminate(); process.wait(timeout=10)
