import path from "node:path"
import { randomUUID } from "node:crypto"
import { fileURLToPath } from "node:url"
import express from "express"
import { closeDatabase, pool } from "./db.js"
import { getSessionUser, loginLocal, logout, publicOrigin, requireUser, setSession } from "./auth.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, "../..")
const isProduction = process.env.NODE_ENV === "production"
const app = express()

type Attachment = { id: string; name: string; mime: string; size: number; url: string; key: string }
type NoteBody = { title: string; body: string; category: string; color: string; pinned: boolean; marker?: string | null; createdAt: number; updatedAt: number; positionX?: number | null; positionY?: number | null; parentId?: string | null; isFolder?: boolean; attachments?: Attachment[]; deleted?: boolean }

app.disable("x-powered-by")
app.use(express.json({ limit: "2mb" }))
app.use("/api", (req, res, next) => {
  if (!["POST", "PUT", "DELETE", "PATCH"].includes(req.method)) return next()
  const origin = req.headers.origin
  if (origin && origin !== publicOrigin(req)) return res.status(403).json({ error: "CROSS_ORIGIN_BLOCKED" })
  if (!origin && req.headers.referer && !req.headers.referer.startsWith(publicOrigin(req))) return res.status(403).json({ error: "CROSS_ORIGIN_BLOCKED" })
  return next()
})

app.get("/api/health", (_req, res) => res.status(200).json({ ok: true }))
app.post("/api/files", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const chunks: Buffer[] = []
  let total = 0
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    total += buffer.length
    if (total > 50 * 1024 * 1024) return res.status(413).json({ error: "FILE_TOO_LARGE" })
    chunks.push(buffer)
  }
  if (!total) return res.status(400).json({ error: "EMPTY_FILE" })
  const originalName = decodeURIComponent(String(req.headers["x-file-name"] || "arquivo"))
  const safeName = originalName.replace(/[^\x20-\x7E]/g, "_").replace(/[\\/]+/g, "_").slice(0, 180) || "arquivo"
  const key = `notes/${encodeURIComponent(user.openId)}/${randomUUID()}-${encodeURIComponent(safeName)}`
  const baseUrl = process.env.MANUS_API_URL
  const apiKey = process.env.MANUS_API_KEY
  if (!baseUrl || !apiKey) return res.status(503).json({ error: "STORAGE_UNAVAILABLE" })
  const presign = await fetch(`${baseUrl}/v1/storage/presign/put?path=${encodeURIComponent(key)}`, { headers: { Authorization: `Bearer ${apiKey}` } })
  if (!presign.ok) return res.status(502).json({ error: "STORAGE_PRESIGN_FAILED" })
  const payload = await presign.json() as { url?: string }
  if (!payload.url) return res.status(502).json({ error: "STORAGE_PRESIGN_FAILED" })
  const uploaded = await fetch(payload.url, { method: "PUT", headers: { "content-type": String(req.headers["content-type"] || "application/octet-stream") }, body: Buffer.concat(chunks) })
  if (!uploaded.ok) return res.status(502).json({ error: "STORAGE_UPLOAD_FAILED" })
  return res.status(201).json({ attachment: { id: randomUUID(), name: originalName, mime: String(req.headers["content-type"] || "application/octet-stream"), size: total, key, url: `/manus-storage/${key}` } satisfies Attachment })
})
app.post("/api/auth/login", async (req, res) => {
  const username = typeof req.body?.username === "string" ? req.body.username : ""
  const password = typeof req.body?.password === "string" ? req.body.password : ""
  if (!username || !password || username.length > 64 || password.length > 256) return res.status(401).json({ error: "INVALID_CREDENTIALS" })
  const user = await loginLocal(username, password)
  if (!user) return res.status(401).json({ error: "INVALID_CREDENTIALS" })
  setSession(res, req, user)
  return res.json({ user })
})
app.post("/api/auth/logout", async (req, res) => logout(req, res))

app.get("/api/auth/me", async (req, res) => {
  const user = await getSessionUser(req)
  if (!user) return res.status(401).json({ error: "AUTH_REQUIRED" })
  return res.json({ user })
})

app.get("/api/notes", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const includeDeleted = req.query.includeDeleted === "true"
  const [rows] = await pool.query(
    `SELECT id, title, body, category, color, pinned, marker, attachments, parent_id AS parentId, is_folder AS isFolder, position_x AS positionX, position_y AS positionY, created_at AS createdAt, updated_at AS updatedAt, deleted_at AS deletedAt
     FROM notes WHERE open_id = ? AND title IS NOT NULL ${includeDeleted ? "" : "AND deleted_at IS NULL"} ORDER BY updated_at DESC`,
    [user.openId],
  )
  const notes = (rows as Array<Record<string, unknown>>).map((row) => ({ ...row, attachments: typeof row.attachments === "string" ? JSON.parse(row.attachments || "[]") : row.attachments || [], pinned: Boolean(row.pinned), parentId: row.parentId || null, isFolder: Boolean(row.isFolder), positionX: row.positionX === null ? null : Number(row.positionX), positionY: row.positionY === null ? null : Number(row.positionY), deleted: row.deletedAt !== null }))
  return res.json({ notes })
})

function validId(value: string) { return /^[0-9a-f-]{20,80}$/i.test(value) }
function validNote(body: unknown): body is NoteBody {
  if (!body || typeof body !== "object") return false
  const note = body as Record<string, unknown>
  const validPosition = (value: unknown) => value === undefined || value === null || (typeof value === "number" && Number.isSafeInteger(value))
  const validAttachments = note.attachments === undefined || (Array.isArray(note.attachments) && note.attachments.length <= 50 && note.attachments.every((item) => item && typeof item === "object" && typeof (item as Attachment).id === "string" && typeof (item as Attachment).name === "string" && typeof (item as Attachment).mime === "string" && Number.isSafeInteger((item as Attachment).size) && typeof (item as Attachment).url === "string" && typeof (item as Attachment).key === "string"))
  return typeof note.title === "string" && note.title.trim().length > 0 && note.title.length <= 255 && typeof note.body === "string" && note.body.length <= 2_000_000 && typeof note.category === "string" && note.category.length <= 120 && typeof note.color === "string" && /^#[0-9a-f]{6}$/i.test(note.color) && typeof note.pinned === "boolean" && (note.marker === undefined || note.marker === null || (typeof note.marker === "string" && note.marker.length <= 80)) && (note.parentId === undefined || note.parentId === null || (typeof note.parentId === "string" && validId(note.parentId))) && (note.isFolder === undefined || typeof note.isFolder === "boolean") && Number.isSafeInteger(note.createdAt) && Number.isSafeInteger(note.updatedAt) && validPosition(note.positionX) && validPosition(note.positionY) && validAttachments
}

app.put("/api/notes/:id", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  const id = req.params.id
  if (!validId(id) || !validNote(req.body)) return res.status(400).json({ error: "INVALID_NOTE" })
  const note = req.body
  const [existing] = await pool.query("SELECT open_id AS openId FROM notes WHERE id = ? LIMIT 1", [id])
  const owner = (existing as Array<{ openId: string }>)[0]
  if (owner && owner.openId !== user.openId) return res.status(403).json({ error: "FORBIDDEN" })
  await pool.query(
    `INSERT INTO notes (id, open_id, title, body, category, color, pinned, marker, attachments, parent_id, is_folder, position_x, position_y, created_at, updated_at, deleted_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON DUPLICATE KEY UPDATE title = VALUES(title), body = VALUES(body), category = VALUES(category), color = VALUES(color), pinned = VALUES(pinned), marker = VALUES(marker), attachments = VALUES(attachments), parent_id = VALUES(parent_id), is_folder = VALUES(is_folder), position_x = VALUES(position_x), position_y = VALUES(position_y), updated_at = VALUES(updated_at), deleted_at = NULL`,
    [id, user.openId, note.title, note.body, note.category, note.color, note.pinned ? 1 : 0, note.marker?.trim() || null, JSON.stringify(note.attachments || []), note.parentId ?? null, note.isFolder ? 1 : 0, note.positionX ?? null, note.positionY ?? null, note.createdAt, note.updatedAt],
  )
  return res.status(204).end()
})

app.delete("/api/notes/:id", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  if (!validId(req.params.id)) return res.status(400).json({ error: "INVALID_NOTE" })
  await pool.query("UPDATE notes SET deleted_at = ? WHERE id = ? AND open_id = ?", [Date.now(), req.params.id, user.openId])
  return res.status(204).end()
})

app.post("/api/notes/:id/restore", async (req, res) => {
  const user = await requireUser(req, res)
  if (!user) return
  if (!validId(req.params.id)) return res.status(400).json({ error: "INVALID_NOTE" })
  await pool.query("UPDATE notes SET deleted_at = NULL, updated_at = ? WHERE id = ? AND open_id = ?", [Date.now(), req.params.id, user.openId])
  return res.status(204).end()
})

async function start() {
  if (!isProduction) {
    const { createServer } = await import("vite")
    const vite = await createServer({ server: { middlewareMode: true }, appType: "spa" })
    app.use(vite.middlewares)
  } else {
    app.use(express.static(path.join(root, "dist/public")))
    app.use((_req, res) => res.sendFile(path.join(root, "dist/public/index.html")))
  }
  const port = Number(process.env.PORT || 3000)
  const server = app.listen(port, "0.0.0.0", () => console.log(`Wchoicss Notes listening on ${port}`))
  const shutdown = async () => { server.close(); await closeDatabase(); process.exit(0) }
  process.on("SIGTERM", shutdown)
  process.on("SIGINT", shutdown)
}

start().catch((error) => { console.error(error); process.exit(1) })
