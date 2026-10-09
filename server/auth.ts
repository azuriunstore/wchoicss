import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto"
import type { Request, Response } from "express"
import { parse, serialize } from "cookie"
import { pool } from "./db.js"

export type AuthUser = { openId: string; name: string; email: string; username: string }

type UserRow = { openId: string; name: string; email: string; username: string; passwordSalt: string; passwordHash: string }

const SESSION_COOKIE = "wchoicss_session"
const SESSION_DAYS = 30
const SCRYPT_OPTIONS = { N: 32_768, r: 8, p: 1, maxmem: 128 * 1024 * 1024 }

function sessionSecret() {
  const value = process.env.MANUS_JWT_SECRET
  if (!value) throw new Error("Chave de sessão não configurada")
  return value
}

function publicOrigin(req: Request) {
  const proto = String(req.headers["x-forwarded-proto"] || req.protocol).split(",")[0]
  const host = String(req.headers["x-forwarded-host"] || req.headers.host)
  return `${proto}://${host}`
}

function cookieOptions(req: Request, maxAge: number) {
  const secure = publicOrigin(req).startsWith("https://")
  return { httpOnly: true, secure, sameSite: secure ? ("none" as const) : ("lax" as const), path: "/", maxAge }
}

function sign(value: string) {
  return createHmac("sha256", sessionSecret()).update(value).digest("base64url")
}

function encode(value: string) { return Buffer.from(value, "utf8").toString("base64url") }
function decode(value: string) { return Buffer.from(value, "base64url").toString("utf8") }

function createSession(user: AuthUser) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  const body = encode(JSON.stringify({ openId: user.openId, expiresAt }))
  return `${body}.${sign(body)}`
}

function verifySession(token: string) {
  const [body, signature] = token.split(".")
  if (!body || !signature || !timingSafeEqual(Buffer.from(signature), Buffer.from(sign(body)))) return null
  try {
    const payload = JSON.parse(decode(body)) as { openId?: string; expiresAt?: number }
    if (!payload.openId || !payload.expiresAt || payload.expiresAt < Date.now()) return null
    return payload.openId
  } catch { return null }
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 64, SCRYPT_OPTIONS)
  return { salt: salt.toString("base64url"), hash: hash.toString("base64url") }
}

function verifyPassword(password: string, saltValue: string, hashValue: string) {
  try {
    const salt = Buffer.from(saltValue, "base64url")
    const expected = Buffer.from(hashValue, "base64url")
    const actual = scryptSync(password, salt, expected.length, SCRYPT_OPTIONS)
    return expected.length === actual.length && timingSafeEqual(expected, actual)
  } catch { return false }
}

async function findUserByOpenId(openId: string) {
  const [rows] = await pool.query("SELECT open_id AS openId, name, email, username, password_salt AS passwordSalt, password_hash AS passwordHash FROM users WHERE open_id = ? LIMIT 1", [openId])
  return (rows as UserRow[])[0] || null
}

export async function loginLocal(username: string, password: string) {
  const [rows] = await pool.query("SELECT open_id AS openId, name, email, username, password_salt AS passwordSalt, password_hash AS passwordHash FROM users WHERE username = ? LIMIT 1", [username.trim().toLowerCase()])
  const row = (rows as UserRow[])[0]
  if (!row || !verifyPassword(password, row.passwordSalt, row.passwordHash)) return null
  return { openId: row.openId, name: row.name, email: row.email, username: row.username } satisfies AuthUser
}

export function setSession(res: Response, req: Request, user: AuthUser) {
  res.setHeader("Set-Cookie", serialize(SESSION_COOKIE, createSession(user), cookieOptions(req, SESSION_DAYS * 24 * 60 * 60)))
}

export async function getSessionUser(req: Request) {
  const token = parse(req.headers.cookie || "")[SESSION_COOKIE]
  if (!token) return null
  const openId = verifySession(token)
  if (!openId) return null
  const row = await findUserByOpenId(openId)
  return row ? { openId: row.openId, name: row.name, email: row.email, username: row.username } satisfies AuthUser : null
}

export async function logout(req: Request, res: Response) {
  res.setHeader("Set-Cookie", serialize(SESSION_COOKIE, "", { ...cookieOptions(req, 0), maxAge: 0 }))
  res.status(204).end()
}

export async function requireUser(req: Request, res: Response) {
  const user = await getSessionUser(req)
  if (!user) { res.status(401).json({ error: "AUTH_REQUIRED" }); return null }
  return user
}

export { SESSION_COOKIE, publicOrigin }
