CREATE TRIGGER ledger_no_negative BEFORE INSERT ON ledger
WHEN COALESCE((SELECT SUM(amount) FROM ledger WHERE user_id=NEW.user_id),0)+NEW.amount<0
BEGIN SELECT RAISE(ABORT,'BALANCE_LOW'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_update BEFORE UPDATE ON ledger BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER ledger_no_delete BEFORE DELETE ON ledger BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_update BEFORE UPDATE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER audit_no_delete BEFORE DELETE ON audit BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER deposit_guard BEFORE UPDATE ON deposits
WHEN OLD.status<>'pending' OR NEW.status NOT IN ('approved','rejected') OR NEW.amount<>OLD.amount OR NEW.user_id<>OLD.user_id OR (NEW.status='approved' AND (NEW.bank_ref IS NULL OR LENGTH(NEW.bank_ref)<5))
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER deposit_credit AFTER UPDATE OF status ON deposits WHEN NEW.status='approved'
BEGIN INSERT INTO ledger(id,user_id,amount,kind,reference,created_at) VALUES('dep:'||NEW.id,NEW.user_id,NEW.amount,'deposit',NEW.id,NEW.reviewed_at); END;
--> statement-breakpoint
CREATE TRIGGER campaign_insert_guard BEFORE INSERT ON campaigns
WHEN NEW.status<>'pending' OR (SELECT role FROM users WHERE id=NEW.owner_id)<>'creator'
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_reserve AFTER INSERT ON campaigns
BEGIN INSERT INTO ledger(id,user_id,amount,kind,reference,created_at) VALUES('camp:'||NEW.id,NEW.owner_id,-NEW.budget-CAST((NEW.budget*NEW.fee_bps+9999)/10000 AS INTEGER),'campaign_reserve',NEW.id,NEW.created_at); END;
--> statement-breakpoint
CREATE TRIGGER campaign_immutable BEFORE UPDATE ON campaigns
WHEN NEW.owner_id<>OLD.owner_id OR NEW.budget<>OLD.budget OR NEW.cap<>OLD.cap OR NEW.rate<>OLD.rate OR NEW.fee_bps<>OLD.fee_bps OR NEW.rules<>OLD.rules OR NEW.source_url<>OLD.source_url OR NEW.platform<>OLD.platform OR NEW.title<>OLD.title OR NEW.description<>OLD.description
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_transition BEFORE UPDATE OF status ON campaigns
WHEN NOT ((OLD.status='pending' AND NEW.status IN ('active','rejected')) OR (OLD.status='active' AND NEW.status IN ('paused','closed')) OR (OLD.status='paused' AND NEW.status IN ('active','closed')))
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_close_guard BEFORE UPDATE OF status ON campaigns
WHEN NEW.status IN ('closed','rejected') AND EXISTS(SELECT 1 FROM clips WHERE campaign_id=NEW.id AND status IN ('draft','submitted','ready','published'))
BEGIN SELECT RAISE(ABORT,'CAMPAIGN_HAS_ACTIVE_CLIPS'); END;
--> statement-breakpoint
CREATE TRIGGER campaign_refund AFTER UPDATE OF status ON campaigns WHEN NEW.status IN ('closed','rejected')
BEGIN INSERT INTO ledger(id,user_id,amount,kind,reference,created_at)
SELECT 'refund:'||NEW.id,NEW.owner_id,NEW.budget-COALESCE(SUM(earned),0)+CAST((NEW.budget*NEW.fee_bps+9999)/10000 AS INTEGER)-CAST((COALESCE(SUM(earned),0)*NEW.fee_bps+9999)/10000 AS INTEGER),'campaign_refund',NEW.id,unixepoch() FROM clips WHERE campaign_id=NEW.id AND status='settled'; END;
--> statement-breakpoint
CREATE TRIGGER clip_join_guard BEFORE INSERT ON clips
BEGIN
SELECT CASE WHEN NEW.status<>'draft' OR NOT EXISTS(SELECT 1 FROM campaigns WHERE id=NEW.campaign_id AND status='active' AND deadline>unixepoch() AND cap=NEW.cap) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='clipper' AND verified=1 AND status='active') THEN RAISE(ABORT,'NOT_VERIFIED') END;
SELECT CASE WHEN (SELECT budget FROM campaigns WHERE id=NEW.campaign_id)-COALESCE((SELECT SUM(CASE WHEN status='settled' THEN earned WHEN status IN ('draft','submitted','ready','published') THEN cap ELSE 0 END) FROM clips WHERE campaign_id=NEW.campaign_id),0)<NEW.cap THEN RAISE(ABORT,'CAPACITY_FULL') END;
END;
--> statement-breakpoint
CREATE TRIGGER clip_immutable BEFORE UPDATE ON clips
WHEN NEW.user_id<>OLD.user_id OR NEW.campaign_id<>OLD.campaign_id OR NEW.cap<>OLD.cap OR OLD.status IN ('settled','rejected','expired','cancelled') OR (OLD.video_key IS NOT NULL AND (NEW.video_key IS NOT OLD.video_key OR NEW.video_url IS NOT OLD.video_url OR NEW.published_at IS NOT OLD.published_at OR NEW.measurement_ends IS NOT OLD.measurement_ends OR NEW.review_ends IS NOT OLD.review_ends))
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER clip_transition BEFORE UPDATE OF status ON clips WHEN OLD.status<>NEW.status AND NOT (
(OLD.status='draft' AND NEW.status IN ('submitted','expired','cancelled')) OR
(OLD.status='submitted' AND NEW.status IN ('ready','rejected')) OR
(OLD.status='ready' AND NEW.status IN ('published','expired','cancelled')) OR
(OLD.status='published' AND NEW.status IN ('settled','rejected')))
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER clip_publish_guard BEFORE UPDATE OF status ON clips WHEN NEW.status='published' AND (NEW.video_key IS NULL OR NEW.published_at IS NULL OR NEW.measurement_ends<>NEW.published_at+1209600 OR NEW.review_ends<>NEW.measurement_ends+604800 OR OLD.expires_at<unixepoch())
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER clip_settle_guard BEFORE UPDATE OF status ON clips WHEN NEW.status='settled'
BEGIN
SELECT CASE WHEN OLD.review_ends>unixepoch() OR NOT EXISTS(SELECT 1 FROM measurements WHERE clip_id=OLD.id) THEN RAISE(ABORT,'MEASUREMENT_PENDING') END;
SELECT CASE WHEN NEW.earned<>MIN(NEW.cap,CAST((NEW.eligible_views*(SELECT rate FROM campaigns WHERE id=NEW.campaign_id))/1000 AS INTEGER)) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
END;
--> statement-breakpoint
CREATE TRIGGER clip_credit AFTER UPDATE OF status ON clips WHEN NEW.status='settled' AND NEW.earned>0
BEGIN INSERT INTO ledger(id,user_id,amount,kind,reference,created_at) VALUES('clip:'||NEW.id,NEW.user_id,NEW.earned,'clip_earning',NEW.id,NEW.settled_at); END;
--> statement-breakpoint
CREATE TRIGGER measurement_guard BEFORE INSERT ON measurements
WHEN NOT EXISTS(SELECT 1 FROM clips WHERE id=NEW.clip_id AND status='published' AND NEW.observed_at>=published_at AND NEW.observed_at<=measurement_ends) OR NEW.eligible_views<0 OR NEW.total_views<NEW.eligible_views
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER measurement_apply AFTER INSERT ON measurements
BEGIN UPDATE clips SET total_views=NEW.total_views,eligible_views=NEW.eligible_views,last_measured_at=NEW.created_at WHERE id=NEW.clip_id; END;
--> statement-breakpoint
CREATE TRIGGER measurement_no_update BEFORE UPDATE ON measurements BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER measurement_no_delete BEFORE DELETE ON measurements BEGIN SELECT RAISE(ABORT,'IMMUTABLE_LEDGER'); END;
--> statement-breakpoint
CREATE TRIGGER withdrawal_insert_guard BEFORE INSERT ON withdrawals WHEN NEW.status<>'pending'
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER withdrawal_reserve AFTER INSERT ON withdrawals
BEGIN INSERT INTO ledger(id,user_id,amount,kind,reference,created_at) VALUES('wd:'||NEW.id,NEW.user_id,-NEW.amount,'withdrawal_reserve',NEW.id,NEW.created_at); END;
--> statement-breakpoint
CREATE TRIGGER withdrawal_guard BEFORE UPDATE ON withdrawals
WHEN NEW.amount<>OLD.amount OR NEW.iban<>OLD.iban OR NEW.account_name<>OLD.account_name OR NEW.user_id<>OLD.user_id OR NOT ((OLD.status='pending' AND NEW.status IN ('processing','rejected')) OR (OLD.status='processing' AND NEW.status IN ('paid','rejected'))) OR (NEW.status='paid' AND (NEW.bank_ref IS NULL OR LENGTH(NEW.bank_ref)<5))
BEGIN SELECT RAISE(ABORT,'INVALID_TRANSITION'); END;
--> statement-breakpoint
CREATE TRIGGER withdrawal_refund AFTER UPDATE OF status ON withdrawals WHEN NEW.status='rejected'
BEGIN INSERT INTO ledger(id,user_id,amount,kind,reference,created_at) VALUES('wdr:'||NEW.id,NEW.user_id,NEW.amount,'withdrawal_return',NEW.id,NEW.reviewed_at); END;
