-- Profiles are available immediately; members can opt out of the public directory.
ALTER TABLE users ADD community_visible INTEGER NOT NULL DEFAULT 1 CHECK(community_visible IN (0,1));
CREATE INDEX idx_users_visibility ON users(community_visible,status,role);
-- Require a publishing profile when reserving campaign funds, not when registering.
CREATE TRIGGER clip_social_profile_guard BEFORE INSERT ON clips
WHEN NOT EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND length(trim(social_url))>0)
BEGIN SELECT RAISE(ABORT,'SOCIAL_PROFILE_REQUIRED'); END;
