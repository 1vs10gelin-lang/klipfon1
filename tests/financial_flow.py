"""Exercise actual migrations and financial triggers in an isolated SQLite database."""
from pathlib import Path
import sqlite3, tempfile, concurrent.futures

ROOT=Path(__file__).resolve().parents[1]
clock=[1800000000]
def migrate(db):
    for p in sorted((ROOT/'drizzle').glob('*.sql')):db.executescript(p.read_text())
    db.create_function('unixepoch',0,lambda:clock[0])
def user(db,id,role='clipper',verified=1):
    db.execute('INSERT INTO users(id,email,name,role,verified,created_at,social_url) VALUES(?,?,?,?,?,?,?)',(id,id+'@example.test',id,role,verified,clock[0],'https://youtube.com/@'+id))
def balance(db,id):return db.execute('SELECT COALESCE(SUM(amount),0) FROM ledger WHERE user_id=?',(id,)).fetchone()[0]
def deposit(db,id,uid,amount,ref):
    db.execute("INSERT INTO deposits(id,user_id,amount,sender,transfer_date,reference,bank_snapshot,created_at) VALUES(?,?,?,'TEST','2026-09-18',?,'{}',?)",(id,uid,amount,id,clock[0]))
    db.execute("UPDATE deposits SET status='approved',bank_ref=?,reviewed_at=? WHERE id=?",(ref,clock[0],id))
def campaign(db,id,budget=100000,cap=50000):
    db.execute("INSERT INTO campaigns(id,owner_id,title,description,rules,source_url,platform,category,budget,cap,rate,fee_bps,created_at,deadline) VALUES(?,'creator','Test','Test description','Authorized source','https://example.test/video','YouTube','Oyun',?,?,1000,2000,?,?)",(id,budget,cap,clock[0],clock[0]+864000))
    db.execute("UPDATE campaigns SET status='active' WHERE id=?",(id,))
def join(db,id,uid,cid='campaign',cap=50000):db.execute('INSERT INTO clips(id,campaign_id,user_id,cap,created_at,expires_at) VALUES(?,?,?,?,?,?)',(id,cid,uid,cap,clock[0],clock[0]+172800))
def fail(fn,contains):
    try:fn()
    except sqlite3.IntegrityError as e:assert contains in str(e),(contains,str(e))
    else:raise AssertionError('Expected '+contains)
def publish(db,id,key):
    db.execute("UPDATE clips SET status='submitted',draft_url='https://example.test/draft' WHERE id=?",(id,))
    db.execute("UPDATE clips SET status='ready' WHERE id=?",(id,))
    db.execute("UPDATE clips SET status='published',video_key=?,video_url='https://youtube.com/shorts/abcdefghijk',published_at=?,measurement_ends=?,review_ends=? WHERE id=?",(key,clock[0],clock[0]+1209600,clock[0]+1814400,id))

db=sqlite3.connect(':memory:',isolation_level=None);db.execute('PRAGMA foreign_keys=ON');migrate(db)
user(db,'creator','creator');user(db,'clipper');user(db,'second');user(db,'third');user(db,'unverified',verified=0)
deposit(db,'deposit','creator',200000,'BANK-0001')
assert balance(db,'creator')==200000
fail(lambda:db.execute("UPDATE deposits SET status='approved' WHERE id='deposit'"),'INVALID_TRANSITION')
campaign(db,'campaign');assert balance(db,'creator')==80000
fail(lambda:campaign(db,'overspend',budget=100000),'BALANCE_LOW')
assert db.execute("SELECT COUNT(*) FROM campaigns WHERE id='overspend'").fetchone()[0]==0
db.execute("UPDATE users SET social_url='' WHERE id='unverified'")
fail(lambda:join(db,'missing-profile','unverified'),'SOCIAL_PROFILE_REQUIRED')
db.execute("UPDATE users SET social_url='https://youtube.com/@unverified' WHERE id='unverified'")
join(db,'unverified-join','unverified')
db.execute("UPDATE clips SET status='cancelled' WHERE id='unverified-join'")
join(db,'clip','clipper');join(db,'clip2','second')
fail(lambda:join(db,'overcapacity','third'),'CAPACITY_FULL')
fail(lambda:db.execute("UPDATE campaigns SET status='closed' WHERE id='campaign'"),'CAMPAIGN_HAS_ACTIVE_CLIPS')
publish(db,'clip','youtube:abcdefghijk')
fail(lambda:publish(db,'clip2','youtube:abcdefghijk'),'UNIQUE constraint')
assert db.execute("SELECT status FROM clips WHERE id='clip2'").fetchone()[0]=='ready'
db.execute("UPDATE clips SET status='cancelled' WHERE id='clip2'")
db.execute("INSERT INTO measurements(id,clip_id,total_views,eligible_views,source,note,observed_at,created_at,actor) VALUES('measure','clip',35000,30000,'Authorized analytics','Confirmed eligible views',?,?, 'admin')",(clock[0],clock[0]))
fail(lambda:db.execute("UPDATE clips SET status='settled',earned=30000,settled_at=? WHERE id='clip'",(clock[0],)),'MEASUREMENT_PENDING')
clock[0]+=1814401
db.execute("UPDATE clips SET status='settled',earned=30000,settled_at=? WHERE id='clip'",(clock[0],))
assert balance(db,'clipper')==30000
fail(lambda:db.execute("UPDATE clips SET status='settled' WHERE id='clip'"),'INVALID_TRANSITION')
db.execute("UPDATE campaigns SET status='closed' WHERE id='campaign'")
assert balance(db,'creator')==164000  # 2000 TL initial - 300 TL earnings - 60 TL commission
db.execute("INSERT INTO withdrawals(id,user_id,amount,iban,account_name,created_at) VALUES('withdraw','clipper',25000,'TEST-ONLY','Test',?)",(clock[0],))
assert balance(db,'clipper')==5000
fail(lambda:db.execute("INSERT INTO withdrawals(id,user_id,amount,iban,account_name,created_at) VALUES('overdraw','clipper',6000,'TEST-ONLY','Test',?)",(clock[0],)),'BALANCE_LOW')
db.execute("UPDATE withdrawals SET status='rejected',reviewed_at=? WHERE id='withdraw'",(clock[0],));assert balance(db,'clipper')==30000
fail(lambda:db.execute("UPDATE withdrawals SET status='rejected' WHERE id='withdraw'"),'INVALID_TRANSITION')
fail(lambda:db.execute("UPDATE ledger SET amount=999999 WHERE user_id='clipper'"),'IMMUTABLE_LEDGER')
fail(lambda:db.execute("DELETE FROM ledger WHERE user_id='clipper'"),'IMMUTABLE_LEDGER')
fail(lambda:db.execute("UPDATE measurements SET eligible_views=999999 WHERE id='measure'"),'IMMUTABLE_LEDGER')
assert db.execute('SELECT MIN(balance) FROM (SELECT SUM(amount) balance FROM ledger GROUP BY user_id)').fetchone()[0]>=0
print('PASS: deposit once, immutable ledger, budget reserve, overspend rollback, verification, clip cap, duplicate video, timing, payout, commission refund, withdrawal reserve/refund')

with tempfile.TemporaryDirectory() as d:
    path=Path(d)/'concurrent.sqlite';c=sqlite3.connect(path,isolation_level=None);migrate(c)
    user(c,'creator','creator');user(c,'a');user(c,'b');deposit(c,'d','creator',120000,'BANK-0002');campaign(c,'campaign',100000,100000);c.close()
    def attempt(uid):
        cx=sqlite3.connect(path,isolation_level=None,timeout=10);cx.create_function('unixepoch',0,lambda:clock[0])
        try:join(cx,'r-'+uid,uid,cap=100000);return True
        except sqlite3.IntegrityError as e:assert 'CAPACITY_FULL' in str(e);return False
        finally:cx.close()
    results=list(concurrent.futures.ThreadPoolExecutor(max_workers=2).map(attempt,['a','b']))
    assert sorted(results)==[False,True]
    print('PASS: concurrent joins cannot reserve the same remaining budget')
