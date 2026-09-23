ALTER TABLE users ADD avatar_id text NOT NULL DEFAULT '';
DROP TRIGGER clip_join_guard;
CREATE TRIGGER clip_join_guard BEFORE INSERT ON clips
BEGIN
SELECT CASE WHEN NEW.status<>'draft' OR NOT EXISTS(SELECT 1 FROM campaigns WHERE id=NEW.campaign_id AND status='active' AND deadline>unixepoch() AND cap=NEW.cap) THEN RAISE(ABORT,'INVALID_TRANSITION') END;
SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND role='clipper' AND status='active') THEN RAISE(ABORT,'INVALID_TRANSITION') END;
SELECT CASE WHEN (SELECT budget FROM campaigns WHERE id=NEW.campaign_id)-COALESCE((SELECT SUM(CASE WHEN status='settled' THEN earned WHEN status IN ('draft','submitted','ready','published') THEN cap ELSE 0 END) FROM clips WHERE campaign_id=NEW.campaign_id),0)<NEW.cap THEN RAISE(ABORT,'CAPACITY_FULL') END;
END;
--> statement-breakpoint
