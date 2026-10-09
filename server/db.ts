import mysql from "mysql2/promise"

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL não configurada")
}

export const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 8,
  queueLimit: 0,
})

export async function closeDatabase() {
  await pool.end()
}
