ALTER TABLE users ADD message_policy TEXT NOT NULL DEFAULT 'requests' CHECK(message_policy IN ('requests','open','closed'));
CREATE TABLE conversations (
 id TEXT PRIMARY KEY, user_low TEXT NOT NULL REFERENCES users(id), user_high TEXT NOT NULL REFERENCES users(id),
 requester_id TEXT NOT NULL REFERENCES users(id), recipient_id TEXT NOT NULL REFERENCES users(id),
 status TEXT NOT NULL CHECK(status IN ('pending','accepted','declined')), created_at INTEGER NOT NULL,last_message_at INTEGER NOT NULL,
 CHECK(user_low<user_high), CHECK(requester_id<>recipient_id),
 CHECK((requester_id=user_low AND recipient_id=user_high) OR (requester_id=user_high AND recipient_id=user_low)), UNIQUE(user_low,user_high)
);
CREATE INDEX conversations_low ON conversations(user_low,last_message_at);
CREATE INDEX conversations_high ON conversations(user_high,last_message_at);
CREATE TABLE message_blocks(user_id TEXT NOT NULL REFERENCES users(id),blocked_id TEXT NOT NULL REFERENCES users(id),created_at INTEGER NOT NULL,PRIMARY KEY(user_id,blocked_id),CHECK(user_id<>blocked_id));
CREATE TABLE messages(seq INTEGER PRIMARY KEY AUTOINCREMENT,id TEXT NOT NULL UNIQUE,conversation_id TEXT NOT NULL REFERENCES conversations(id),sender_id TEXT NOT NULL REFERENCES users(id),body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 4000),created_at INTEGER NOT NULL);
CREATE INDEX messages_thread ON messages(conversation_id,seq);
CREATE TABLE message_reads(user_id TEXT NOT NULL REFERENCES users(id),conversation_id TEXT NOT NULL REFERENCES conversations(id),last_seq INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(user_id,conversation_id));
CREATE TRIGGER conversation_guard BEFORE INSERT ON conversations BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.requester_id AND status='active' AND role IN ('clipper','creator')) OR NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.recipient_id AND status='active' AND role IN ('clipper','creator') AND message_policy<>'closed') THEN RAISE(ABORT,'CHAT_UNAVAILABLE') END;
 SELECT CASE WHEN EXISTS(SELECT 1 FROM message_blocks WHERE (user_id=NEW.requester_id AND blocked_id=NEW.recipient_id) OR (user_id=NEW.recipient_id AND blocked_id=NEW.requester_id)) THEN RAISE(ABORT,'CHAT_UNAVAILABLE') END;
END;
CREATE TRIGGER message_guard BEFORE INSERT ON messages BEGIN
 SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM conversations c JOIN users a ON a.id=c.user_low JOIN users b ON b.id=c.user_high WHERE c.id=NEW.conversation_id AND NEW.sender_id IN(c.user_low,c.user_high) AND a.status='active' AND b.status='active' AND (c.status='accepted' OR (c.status='pending' AND c.requester_id=NEW.sender_id AND NOT EXISTS(SELECT 1 FROM messages WHERE conversation_id=c.id))) AND NOT EXISTS(SELECT 1 FROM message_blocks WHERE (user_id=c.user_low AND blocked_id=c.user_high) OR(user_id=c.user_high AND blocked_id=c.user_low))) THEN RAISE(ABORT,'CHAT_UNAVAILABLE') END;
END;
CREATE TRIGGER messages_no_update BEFORE UPDATE ON messages BEGIN SELECT RAISE(ABORT,'MESSAGES_IMMUTABLE'); END;
CREATE TRIGGER messages_no_delete BEFORE DELETE ON messages BEGIN SELECT RAISE(ABORT,'MESSAGES_IMMUTABLE'); END;
CREATE TRIGGER conversations_no_delete BEFORE DELETE ON conversations BEGIN SELECT RAISE(ABORT,'MESSAGES_IMMUTABLE'); END;
CREATE TABLE notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),title TEXT NOT NULL,body TEXT NOT NULL DEFAULT '',href TEXT NOT NULL,created_at INTEGER NOT NULL,read_at INTEGER);
CREATE INDEX notifications_user ON notifications(user_id,created_at);
CREATE TRIGGER message_notification AFTER INSERT ON messages BEGIN
 UPDATE conversations SET last_message_at=NEW.created_at WHERE id=NEW.conversation_id;
 INSERT INTO notifications(id,user_id,title,body,href,created_at) SELECT 'message:'||NEW.id,CASE WHEN user_low=NEW.sender_id THEN user_high ELSE user_low END,CASE WHEN status='pending' THEN 'Yeni mesaj isteği' ELSE 'Yeni mesaj' END,(SELECT name FROM users WHERE id=NEW.sender_id),'/panel?bolum=messages&chat='||id,NEW.created_at FROM conversations WHERE id=NEW.conversation_id;
END;
CREATE TRIGGER chat_accepted_notification AFTER UPDATE OF status ON conversations WHEN NEW.status='accepted' AND OLD.status<>NEW.status BEGIN
 INSERT INTO notifications VALUES('chat-accepted:'||NEW.id,NEW.requester_id,'Mesaj isteğin kabul edildi','','/panel?bolum=messages&chat='||NEW.id,unixepoch(),NULL) ON CONFLICT(id) DO NOTHING;
END;
CREATE TRIGGER clip_notification AFTER UPDATE OF status ON clips WHEN NEW.status<>OLD.status BEGIN
 INSERT INTO notifications VALUES('clip:'||NEW.id||':'||NEW.status,NEW.user_id,CASE NEW.status WHEN 'ready' THEN 'Klibin onaylandı: 48 saat içinde paylaş' WHEN 'rejected' THEN 'Klibin uygun bulunmadı' WHEN 'settled' THEN 'Klip kazancın kesinleşti' WHEN 'expired' THEN 'Klip teslim süren doldu' ELSE 'Klip durumun güncellendi' END,NEW.note,'/kampanya/'||NEW.campaign_id,unixepoch(),NULL) ON CONFLICT(id) DO NOTHING;
 INSERT INTO notifications SELECT 'draft:'||NEW.id,c.owner_id,'Yeni klip taslağı inceleme bekliyor','','/panel?bolum=clips',unixepoch(),NULL FROM campaigns c WHERE c.id=NEW.campaign_id AND NEW.status='submitted' ON CONFLICT(id) DO NOTHING;
END;
CREATE TRIGGER withdrawal_notification AFTER UPDATE OF status ON withdrawals WHEN NEW.status<>OLD.status BEGIN
 INSERT INTO notifications VALUES('withdrawal:'||NEW.id||':'||NEW.status,NEW.user_id,CASE NEW.status WHEN 'processing' THEN 'Çekimin işleme alındı' WHEN 'paid' THEN 'Çekimin ödendi' WHEN 'rejected' THEN 'Çekim talebin reddedildi' ELSE 'Çekim durumu güncellendi' END,NEW.note,'/panel?bolum=wallet',unixepoch(),NULL) ON CONFLICT(id) DO NOTHING;
END;
CREATE TRIGGER deposit_notification AFTER UPDATE OF status ON deposits WHEN NEW.status<>OLD.status BEGIN
 INSERT INTO notifications VALUES('deposit:'||NEW.id||':'||NEW.status,NEW.user_id,CASE NEW.status WHEN 'approved' THEN 'Havalen onaylandı' ELSE 'Havale bildirimin reddedildi' END,NEW.note,'/panel?bolum=wallet',unixepoch(),NULL) ON CONFLICT(id) DO NOTHING;
END;
CREATE TRIGGER campaign_notification AFTER UPDATE OF status ON campaigns WHEN NEW.status<>OLD.status BEGIN
 INSERT INTO notifications VALUES('campaign:'||NEW.id||':'||NEW.status||':'||lower(hex(randomblob(8))),NEW.owner_id,'Kampanyanın durumu güncellendi',NEW.note,'/kampanya/'||NEW.id,unixepoch(),NULL);
END;
CREATE TRIGGER ticket_notification AFTER UPDATE OF response ON tickets WHEN NEW.response<>OLD.response BEGIN
 INSERT INTO notifications VALUES('ticket:'||NEW.id||':'||lower(hex(randomblob(8))),NEW.user_id,'Destek talebin yanıtlandı','','/panel?bolum=support',unixepoch(),NULL);
END;
CREATE TABLE reports(id TEXT PRIMARY KEY,reporter_id TEXT NOT NULL REFERENCES users(id),target_type TEXT NOT NULL CHECK(target_type IN ('profile','clip','message')),target_id TEXT NOT NULL,category TEXT NOT NULL,reason TEXT NOT NULL,evidence TEXT NOT NULL,status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','dismissed')),admin_note TEXT NOT NULL DEFAULT '',created_at INTEGER NOT NULL,reviewed_at INTEGER,reviewed_by TEXT REFERENCES users(id));
CREATE INDEX reports_status ON reports(status,created_at);
CREATE TABLE campaign_drafts(id TEXT PRIMARY KEY,owner_id TEXT NOT NULL REFERENCES users(id),payload TEXT NOT NULL,created_at INTEGER NOT NULL,updated_at INTEGER NOT NULL);
CREATE INDEX campaign_drafts_owner ON campaign_drafts(owner_id,updated_at);
