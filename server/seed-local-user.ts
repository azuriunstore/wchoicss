import { closeDatabase, pool } from "./db.js"
import { hashPassword } from "./auth.js"

const username = (process.env.WCHOICSS_USERNAME || "wchoicss").trim().toLowerCase()
const password = process.env.WCHOICSS_PASSWORD

if (!password) throw new Error("WCHOICSS_PASSWORD é necessária para provisionar o usuário local")
if (!username || username.length > 64) throw new Error("WCHOICSS_USERNAME inválido")

const { salt, hash } = hashPassword(password)
const openId = `local:${username}`

try {
  await pool.query(
    `INSERT INTO users (open_id, email, name, username, password_salt, password_hash)
     VALUES (?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE email = VALUES(email), name = VALUES(name), username = VALUES(username), password_salt = VALUES(password_salt), password_hash = VALUES(password_hash)`,
    [openId, `${username}@local`, username, username, salt, hash],
  )
  console.log(`Local user ${username} provisioned with a one-way password hash`)
} finally {
  await closeDatabase()
}
