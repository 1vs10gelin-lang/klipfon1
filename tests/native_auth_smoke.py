"""Production HTTP checks with an isolated temporary SQLite database."""
import json, os, secrets, subprocess, tempfile, time, urllib.request, urllib.error, uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
ORIGIN='http://127.0.0.1:3017'
class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,*args): return None
opener=urllib.request.build_opener(NoRedirect)
def call(path,body=None,cookie='',origin=ORIGIN):
    headers={'Origin':origin,'Content-Type':'application/json'}
    if cookie: headers['Cookie']=cookie
    req=urllib.request.Request(ORIGIN+path,data=None if body is None else json.dumps(body).encode(),headers=headers)
    try: res=opener.open(req,timeout=10)
    except urllib.error.HTTPError as e: res=e
    raw=res.read()
    try: data=json.loads(raw)
    except ValueError: data={}
    return res.status,data,res.headers

def check(path,body=None,cookie='',status=200,origin=ORIGIN):
    result=call(path,body,cookie,origin)
    assert result[0]==status,(path,result[0],result[1])
    return result

def action(name,cookie,**kw):
    return check('/api/action',dict(action=name,requestId=str(uuid.uuid4()),**kw),cookie)
with tempfile.TemporaryDirectory(prefix='klipfon-test-') as tmp:
    secret=secrets.token_urlsafe(48)
    env=dict(os.environ,NODE_ENV='production',APP_ORIGIN=ORIGIN,DATA_DIR=tmp,KLIPFON_SETUP_SECRET=secret,NEXT_TELEMETRY_DISABLED='1')
    with tempfile.TemporaryFile() as log:
        proc=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3017'],cwd=ROOT,env=env,stdout=log,stderr=log)
        try:
            for attempt in range(60):
                try:
                    if call('/api/health')[0]==200: break
                except OSError: pass
                time.sleep(.25)
            else: raise AssertionError('Server did not become healthy')
            for page in ['/','/giris','/kayit','/kurtarma','/yardim']: check(page)
            check('/api/admin',status=401)
            password=secrets.token_urlsafe(24)
            base=dict(email='creator@example.test',name='Test Creator',password=password,role='creator',accepted=True)
            check('/api/auth/register',dict(base,phone=''),status=400)
            check('/api/auth/register',dict(base,phone='05321234567'),status=403,origin='https://evil.test')
            _,registered,headers=check('/api/auth/register',dict(base,phone='05321234567'))
            cookie=headers['Set-Cookie'].split(';')[0]
            assert 'HttpOnly' in headers['Set-Cookie'] and 'Secure' in headers['Set-Cookie']
            recovery=registered['recoveryCode']
            _,state,_=check('/api/state',cookie=cookie)
            assert state['user']['phone']=='+905321234567'
            check('/api/admin',cookie=cookie,status=403)
            check('/api/action',dict(action='deposit',requestId=str(uuid.uuid4()),amount='100',sender='Test Creator',transferDate='2026-09-18'),cookie,status=400)
            # Separate administrator is promoted only with the one-time setup secret.
            _,_,headers=check('/api/auth/register',dict(base,email='owner@example.test',phone='05321234568'))
            owner=headers['Set-Cookie'].split(';')[0]
            action('setup',owner,secret=secret)
            check('/api/admin',cookie=owner)
            check('/api/action',dict(action='setup',requestId=str(uuid.uuid4()),secret=secret),cookie,status=400)
            action('settings',owner,iban='TR330006100519786457841326',beneficiary='Test Company',bank='Test Bank',companyName='Test Company',companyAddress='Test Address',taxInfo='Test Tax',contactEmail='support@example.test',termsText='Test terms. '*20,privacyText='Test privacy. '*20,feeBps=2000,depositsEnabled=True)
            deposit=str(uuid.uuid4())
            check('/api/action',dict(action='deposit',requestId=deposit,amount='100',sender='Test Creator',transferDate='2026-09-18'),cookie)
            review=dict(action='deposit_review',requestId=str(uuid.uuid4()),id=deposit,status='approved',confirmed=True,bankRef='TEST-REF-001')
            check('/api/action',review,owner)
            check('/api/action',review,owner)
            assert check('/api/state',cookie=cookie)[1]['balance']==10000
            newpassword=secrets.token_urlsafe(24)
            check('/api/auth/recover',dict(email=base['email'],password=newpassword,recoveryCode='invalid'),status=401)
            check('/api/auth/recover',dict(email=base['email'],password=newpassword,recoveryCode=recovery))
            check('/api/state',cookie=cookie,status=401)
            check('/api/auth/recover',dict(email=base['email'],password=newpassword,recoveryCode=recovery),status=401)
            check('/api/auth/login',dict(email=base['email'],password=password),status=401)
            _,_,headers=check('/api/auth/login',dict(email=base['email'],password=newpassword))
            cookie=headers['Set-Cookie'].split(';')[0]
            proc.terminate();proc.wait(timeout=10)
            proc=subprocess.Popen(['node','node_modules/next/dist/bin/next','start','-H','127.0.0.1','-p','3017'],cwd=ROOT,env=env,stdout=log,stderr=log)
            for attempt in range(60):
                try:
                    if call('/api/health')[0]==200: break
                except OSError: pass
                time.sleep(.25)
            else: raise AssertionError('Restart failed')
            assert check('/api/state',cookie=cookie)[1]['balance']==10000
            check('/api/auth/logout',{},cookie,status=303)
            check('/api/state',cookie=cookie,status=401)
            print('PASS: production pages, mandatory phone, CSRF, secure cookies, role isolation, single admin, disabled deposits, deposit idempotency, recovery rotation, session revocation, restart persistence, logout')
        finally:
            proc.terminate();proc.wait(timeout=10)
