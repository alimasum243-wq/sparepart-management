import mysql from "mysql2/promise";

const required = ["DB_HOST", "DB_USER", "DB_PASSWORD", "DB_NAME"] as const;
for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Environment variable ${key} belum diisi.`);
  }
}

const isProduction = process.env.NODE_ENV === "production";
const sslEnabled = process.env.DB_SSL === "true";
if (isProduction && !sslEnabled) {
  throw new Error("DB_SSL=true wajib pada environment production untuk koneksi TiDB.");
}
if (isProduction && !process.env.AUTH_TOKEN_SECRET) {
  throw new Error("AUTH_TOKEN_SECRET wajib pada environment production.");
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 4000),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "sparepart_db",
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  enableKeepAlive: true,
  ssl: sslEnabled ? (process.env.DB_SSL_CA ? { ca: process.env.DB_SSL_CA } : {}) : undefined,
  decimalNumbers: false
});
