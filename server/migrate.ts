import { closeDatabase, pool } from "./db.js"

const statements = [
  `CREATE TABLE IF NOT EXISTS users (
    open_id VARCHAR(191) NOT NULL PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    name VARCHAR(255) NOT NULL,
    username VARCHAR(64) NULL,
    password_salt VARCHAR(128) NULL,
    password_hash VARCHAR(256) NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS notes (
    id CHAR(36) NOT NULL PRIMARY KEY,
    open_id VARCHAR(191) NOT NULL,
    title VARCHAR(255) NULL,
    body MEDIUMTEXT NULL,
    category VARCHAR(120) NULL,
    color VARCHAR(32) NULL,
    pinned BOOLEAN NOT NULL DEFAULT FALSE,
    attachments JSON NULL,
    parent_id CHAR(36) NULL,
    is_folder BOOLEAN NOT NULL DEFAULT FALSE,
    position_x BIGINT NULL,
    position_y BIGINT NULL,
    created_at BIGINT NOT NULL,
    updated_at BIGINT NOT NULL,
    deleted_at BIGINT NULL,
    INDEX notes_owner_updated (open_id, updated_at),
    CONSTRAINT notes_user_fk FOREIGN KEY (open_id) REFERENCES users(open_id) ON DELETE CASCADE
  )`,
]

async function addColumn(statement: string) {
  try { await pool.query(statement) } catch (error) {
    if ((error as { code?: string }).code !== "ER_DUP_FIELDNAME") throw error
  }
}

try {
  for (const statement of statements) await pool.query(statement)
  await addColumn("ALTER TABLE users ADD COLUMN username VARCHAR(64) NULL")
  await addColumn("ALTER TABLE users ADD COLUMN password_salt VARCHAR(128) NULL")
  await addColumn("ALTER TABLE users ADD COLUMN password_hash VARCHAR(256) NULL")
  try { await pool.query("ALTER TABLE users DROP COLUMN vault_verifier") } catch { /* schema novo */ }
  try { await pool.query("ALTER TABLE users DROP COLUMN vault_salt") } catch { /* schema novo */ }
  await addColumn("ALTER TABLE notes ADD COLUMN title VARCHAR(255) NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN body MEDIUMTEXT NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN category VARCHAR(120) NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN color VARCHAR(32) NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN pinned BOOLEAN NOT NULL DEFAULT FALSE")
  await addColumn("ALTER TABLE notes ADD COLUMN marker VARCHAR(80) NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN attachments JSON NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN parent_id CHAR(36) NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN is_folder BOOLEAN NOT NULL DEFAULT FALSE")
  await addColumn("ALTER TABLE notes ADD COLUMN position_x BIGINT NULL")
  await addColumn("ALTER TABLE notes ADD COLUMN position_y BIGINT NULL")
  await pool.query("ALTER TABLE notes MODIFY COLUMN position_x BIGINT NULL")
  await pool.query("ALTER TABLE notes MODIFY COLUMN position_y BIGINT NULL")
  try { await pool.query("ALTER TABLE notes DROP COLUMN cipher_text") } catch { /* tabela nova */ }
  try { await pool.query("ALTER TABLE notes DROP COLUMN iv") } catch { /* tabela nova */ }
  try { await pool.query("ALTER TABLE users ADD UNIQUE KEY users_username_unique (username)") } catch (error) {
    if ((error as { code?: string }).code !== "ER_DUP_KEYNAME") throw error
  }
  console.log("Database schema ready")
} finally {
  await closeDatabase()
}
