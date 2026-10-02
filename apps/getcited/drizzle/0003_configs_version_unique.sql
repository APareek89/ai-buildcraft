-- FMEA #3: a unique (user_id, version) index so two concurrent config saves cannot
-- create duplicate versions — the losing insert fails with 23505 and is retried.
CREATE UNIQUE INDEX IF NOT EXISTS "configs_user_version_unique"
  ON "configs" USING btree ("user_id", "version");
