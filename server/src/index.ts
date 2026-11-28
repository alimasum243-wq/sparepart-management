
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import type { PoolConnection } from "mysql2/promise";
import { pool } from "./db.js";
import distributorRouter, { authMiddleware, ownerMiddleware } from "./distributor.js";
import { money2, isDateOnly, hasAtMost2Decimals } from "./validation.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map(value => value.trim()).filter(Boolean);


const getWarehouseLocationId = async (conn:PoolConnection):Promise<number> => {
  const [rows]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE location_type='WAREHOUSE' AND is_active=1 ORDER BY id FOR UPDATE`);
  if(rows.length!==1) throw new Error('Harus ada tepat satu gudang aktif; dukungan multi-gudang belum tersedia.');
  return Number(rows[0].id);
};
const assertCashBalance = async (conn:PoolConnection, ledgerAccountId:number, amount:number, label:string):Promise<void> => {
  const [ledger]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE id=? AND is_active=1 FOR UPDATE`,[ledgerAccountId]);
  if(!ledger.length)throw new Error(`Akun ledger kas/bank untuk ${label} tidak tersedia.`);
  const [rows]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(debit-credit),0) balance FROM journal_lines WHERE account_id=?`,[ledgerAccountId]);
  const balance=Number(rows[0]?.balance||0);
  if(!Number.isFinite(balance)||balance+0.009<amount) throw new Error(`Saldo ${label} tidak mencukupi. Saldo tersedia Rp${Math.max(0,balance).toLocaleString('id-ID')}.`);
};
app.use(helmet());
if (process.env.NODE_ENV !== "production" || process.env.CLIENT_ORIGIN) {
  app.use(cors({
    credentials: true,
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
      return callback(new Error("Origin tidak diizinkan oleh CLIENT_ORIGIN."));
    }
  }));
}
app.use(express.json({ limit: "1mb" }));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "sparepart-management-api",
    version: "0.2.0"
  });
});

app.get("/api/health/db", async (_req, res) => {
  try {
    await pool.query("SELECT 1 AS connected");
    res.json({ ok: true, database: "connected" });
  } catch {
    res.status(503).json({
      ok: false,
      database: "unavailable",
      message: "Koneksi database gagal. Periksa konfigurasi server."
    });
  }
});

// Memeriksa tabel database tanpa mengubah data.
app.get("/api/setup/tables", authMiddleware, ownerMiddleware, async (_req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT TABLE_NAME AS tableName
       FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = ?
       ORDER BY TABLE_NAME`,
      [process.env.DB_NAME || "sparepart_db"]
    );

    res.json({ ok: true, tables: rows });
  } catch {
    res.status(503).json({
      ok: false,
      message: "Tidak dapat membaca metadata database."
    });
  }
});

// Modul autentikasi dan distributor. Route login diproses sebelum middleware admin.
app.use("/api", distributorRouter);
// Semua endpoint lama yang mengubah/membaca data operasional hanya untuk pemilik.
app.use("/api", authMiddleware, ownerMiddleware);

// Master produk dan ringkasan stok.
app.get("/api/products", async (_req, res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(
      `SELECT p.id, p.sku, p.product_name, p.unit, p.purchase_cost,
              p.distributor_price, p.retail_price, p.is_active,
              COALESCE(st.stock_qty, 0) AS stock_qty
       FROM products p
       LEFT JOIN (
         SELECT sm.product_id,
           SUM(CASE WHEN sm.to_location_id = sl.id THEN sm.quantity ELSE 0 END) -
           SUM(CASE WHEN sm.from_location_id = sl.id THEN sm.quantity ELSE 0 END) AS stock_qty
         FROM stock_movements sm
         JOIN stock_locations sl ON sl.id = sm.to_location_id OR sl.id = sm.from_location_id
         WHERE sl.location_type = 'WAREHOUSE' AND sl.is_active = 1
         GROUP BY sm.product_id
       ) st ON st.product_id = p.id
       ORDER BY p.product_name`
    );
    res.json({ ok: true, products: rows });
  } catch (error) {
    console.error("Gagal mengambil produk:", error);
    res.status(500).json({ ok: false, message: "Gagal mengambil daftar produk." });
  }
});

const productSchema = z.object({
  sku: z.string().trim().max(50).optional(),
  product_name: z.string().trim().min(1).max(150),
  unit: z.string().trim().min(1).max(30).default("pcs"),
  purchase_cost: z.number().nonnegative().max(1000000000).refine(v=>hasAtMost2Decimals(v)).default(0),
  distributor_price: z.number().nonnegative().max(1000000000).refine(v=>Math.round(v*100)===v*100).default(0),
  retail_price: z.number().nonnegative().max(1000000000).refine(v=>Math.round(v*100)===v*100).default(0)
});

app.get("/api/products/:id/price-history",async(req,res)=>{
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<1)return res.status(400).json({ok:false,message:'ID produk tidak valid.'});
  try{
    const [product]=await pool.execute<RowDataPacket[]>(`SELECT id,sku,product_name FROM products WHERE id=?`,[id]);
    if(!product.length)return res.status(404).json({ok:false,message:'Produk tidak ditemukan.'});
    const [rows]=await pool.execute<RowDataPacket[]>(`SELECT id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source,changed_by_user_id,created_at FROM product_price_history WHERE product_id=? ORDER BY effective_date DESC,id DESC LIMIT 200`,[id]);
    return res.json({ok:true,product:product[0],history:rows});
  }catch{return res.status(500).json({ok:false,message:'Histori harga tidak dapat dimuat. Pastikan migration 010 sudah dijalankan.'});}
});
app.get('/api/products/:id/price-history',async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({ok:false,message:'ID produk tidak valid.'});try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT * FROM product_price_history WHERE product_id=? ORDER BY effective_date DESC,id DESC LIMIT 200`,[id]);return res.json({ok:true,items:rows});}catch{return res.status(500).json({ok:false,message:'Gagal memuat histori harga.'});}});

app.post("/api/products", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: "Nama produk wajib diisi dan data harga harus benar." });
  const data = parsed.data;
  const sku = data.sku || `SKU-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result] = await conn.execute<ResultSetHeader>(
      `INSERT INTO products (sku, product_name, unit, purchase_cost, last_purchase_cost, average_cost, distributor_price, retail_price, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [sku, data.product_name, data.unit, data.purchase_cost, data.purchase_cost, data.purchase_cost, data.distributor_price, data.retail_price]
    );
    await conn.execute(`INSERT INTO product_price_history (product_id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source,changed_by_user_id) VALUES (?,CURRENT_DATE,?,?, ?,?,?, 'MANUAL',?)`,[result.insertId,data.purchase_cost,data.purchase_cost,data.purchase_cost,data.distributor_price,data.retail_price,(req as any).identity?.id||null]);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,"CREATE","PRODUCT",?,?)`,[(req as any).identity?.id||null,result.insertId,`Produk dibuat: ${sku} - ${data.product_name}`]);
    await conn.commit();
    res.status(201).json({ ok: true, message: "Produk berhasil ditambahkan.", product_id: result.insertId });
  } catch (error) {
    await conn.rollback();
    const duplicate = (error as { code?: string })?.code === "ER_DUP_ENTRY";
    res.status(duplicate ? 409 : 500).json({ ok: false, message: duplicate ? "SKU sudah digunakan. Coba simpan lagi agar SKU dibuat otomatis." : "Gagal menyimpan produk." });
  } finally { conn.release(); }
});

app.put("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = productSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ ok: false, message: "Data produk tidak valid." });
  const d = parsed.data;
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const sku = d.sku || `SKU-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    const [result]=await conn.execute<ResultSetHeader>(
      `UPDATE products SET sku=?, product_name=?, unit=?, purchase_cost=?, distributor_price=?, retail_price=? WHERE id=? AND is_active=1`,
      [sku, d.product_name, d.unit, d.purchase_cost, d.distributor_price, d.retail_price, id]
    );
    if(!result.affectedRows){await conn.rollback();return res.status(404).json({ok:false,message:"Produk tidak ditemukan atau nonaktif."});}
    const [current]=await conn.execute<RowDataPacket[]>(`SELECT purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price FROM products WHERE id=?`,[id]);
    await conn.execute(`INSERT INTO product_price_history (product_id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source,changed_by_user_id) VALUES (?,CURRENT_DATE,?,?,?,?,?,'MANUAL',?)`,[id,current[0].purchase_cost,current[0].last_purchase_cost,current[0].average_cost,current[0].distributor_price,current[0].retail_price,(req as any).identity?.id||null]);

    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,"UPDATE","PRODUCT",?,?)`,[(req as any).identity?.id||null,id,`Produk diperbarui: ${sku} - ${d.product_name}`]);
    await conn.commit();
    res.json({ ok: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    await conn.rollback();
    const duplicate = (error as { code?: string })?.code === "ER_DUP_ENTRY";
    res.status(duplicate ? 409 : 500).json({ ok: false, message: duplicate ? "SKU sudah digunakan." : "Gagal memperbarui produk." });
  } finally { conn.release(); }
});

app.patch("/api/products/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.is_active;
  if (!Number.isInteger(id) || id < 1 || typeof active !== "boolean") return res.status(400).json({ ok: false, message: "Status produk tidak valid." });
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [result]=await conn.execute<ResultSetHeader>("UPDATE products SET is_active=? WHERE id=?", [active ? 1 : 0, id]);
    if(!result.affectedRows){await conn.rollback();return res.status(404).json({ok:false,message:"Produk tidak ditemukan."});}
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,"STATUS","PRODUCT",?,?)`,[(req as any).identity?.id||null,id,active?"Produk diaktifkan":"Produk dinonaktifkan"]);
    await conn.commit();
    res.json({ ok: true, message: active ? "Produk diaktifkan." : "Produk dinonaktifkan." });
  } catch (error) {
    await conn.rollback();
    res.status(500).json({ ok: false, message: "Gagal mengubah status produk." });
  } finally { conn.release(); }
});
app.get("/api/purchases/options", async (_req, res) => {
  try {
    const [suppliers] = await pool.query<RowDataPacket[]>(
      `SELECT id, supplier_code, supplier_name
       FROM suppliers
       WHERE is_active = 1
       ORDER BY supplier_name`
    );

    const [products] = await pool.query<RowDataPacket[]>(
      `SELECT id, sku, product_name, unit,
              purchase_cost, distributor_price, retail_price
       FROM products
       WHERE is_active = 1
       ORDER BY product_name`
    );

    const [cashAccounts] = await pool.query<RowDataPacket[]>(`SELECT id,account_name,account_type FROM cash_accounts WHERE is_active=1 ORDER BY account_type,account_name`);
    const [locations] = await pool.query<RowDataPacket[]>(
      `SELECT id, location_code, location_name, location_type
       FROM stock_locations
       WHERE is_active = 1
       ORDER BY location_name`
    );

    res.json({
      ok: true,
      suppliers,
      products,
      locations,
      cash_accounts: cashAccounts
    });
  } catch (error) {
    console.error("Gagal mengambil opsi pembelian:", error);
    res.status(500).json({
      ok: false,
      message: "Gagal mengambil data supplier, produk, atau lokasi."
    });
  }
});

const supplierSchema = z.object({
  supplier_name: z.string().trim().min(1).max(150),
  supplier_code: z.string().trim().max(50).optional()
});

app.post("/api/suppliers", async (req, res) => {
  const parsed = supplierSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Nama pemasok wajib diisi dan format data tidak valid.",
      errors: parsed.error.issues
    });
  }

  const data = parsed.data;
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const [existing] = await connection.execute<RowDataPacket[]>(
      `SELECT id, supplier_code, supplier_name
       FROM suppliers
       WHERE LOWER(TRIM(supplier_name)) = LOWER(TRIM(?))
         AND is_active = 1
       LIMIT 1
       FOR UPDATE`,
      [data.supplier_name]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({
        ok: false,
        message: "Pemasok dengan nama tersebut sudah terdaftar.",
        supplier: existing[0]
      });
    }

    const supplierCode =
      data.supplier_code ||
      "SUP-" +
      new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) +
      "-" +
      randomUUID().slice(0, 6).toUpperCase();

    const [result] = await connection.execute<ResultSetHeader>(
      `INSERT INTO suppliers (supplier_code, supplier_name, is_active)
       VALUES (?, ?, 1)`,
      [supplierCode, data.supplier_name]
    );

    await connection.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'CREATE','SUPPLIER',?,?)`,[(req as any).identity?.id||null,result.insertId,`Pemasok dibuat: ${supplierCode} - ${data.supplier_name}`]);
    await connection.commit();

    return res.status(201).json({
      ok: true,
      message: "Pemasok berhasil ditambahkan.",
      supplier: {
        id: result.insertId,
        supplier_code: supplierCode,
        supplier_name: data.supplier_name
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error("Gagal menambahkan pemasok:", error);
    const duplicate=(error as {code?:string})?.code==='ER_DUP_ENTRY';
    return res.status(duplicate?409:500).json({
      ok: false,
      message:duplicate?"Kode pemasok sudah digunakan.":error instanceof Error?error.message:"Terjadi kesalahan saat menambahkan pemasok."
    });
  } finally {
    connection.release();
  }
});

const purchaseSchema = z.object({
  supplier_id: z.number().int().positive(),
  purchase_date: z.string().refine(isDateOnly),
  supplier_invoice_no: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  payment_method: z.enum(["CASH", "BANK", "CREDIT"]).default("CREDIT"),
  cash_account_id: z.number().int().positive().optional(),
  items: z.array(
    z.object({
      product_id: z.number().int().positive(),
      quantity: z.number().positive().max(1000000).refine(v=>Math.round(v*1000)===v*1000),
      unit_cost: z.number().nonnegative().max(1000000000).refine(v=>Math.round(v*100)===v*100)
    })
  ).min(1).max(100)
});

// Mencatat pembelian dan menerima barang ke gudang.
app.post("/api/purchases", async (req, res) => {
  const parsed = purchaseSchema.safeParse(req.body);

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: "Data pembelian tidak valid.",
      errors: parsed.error.issues
    });
  }

  const data = parsed.data;
  const invoiceNo=data.supplier_invoice_no?.trim()||null;

  // Satu produk hanya boleh muncul sekali dalam satu faktur.
  const productIds = data.items.map(item => item.product_id);
  if (new Set(productIds).size !== productIds.length) {
    return res.status(400).json({
      ok: false,
      message: "Produk yang sama tidak boleh dimasukkan dua kali. Gabungkan jumlahnya."
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Pastikan supplier tersedia.
    const [supplierRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM suppliers
       WHERE id = ? AND is_active = 1
       FOR UPDATE`,
      [data.supplier_id]
    );

    if (supplierRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        message: "Supplier tidak ditemukan atau tidak aktif."
      });
    }

    const warehouseId=await getWarehouseLocationId(connection);
    let cashAccountId:number|null=null,cashLedgerId:number|null=null;if(data.payment_method==='CASH'||data.payment_method==='BANK'){const [cashRows]=await connection.execute<RowDataPacket[]>(`SELECT ca.id,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_id FROM cash_accounts ca LEFT JOIN accounts a ON a.account_code=IF(UPPER(ca.account_type)='BANK','1110','1100') AND a.is_active=1 WHERE ca.id=COALESCE(?,(SELECT id FROM cash_accounts WHERE account_type=? AND is_active=1 ORDER BY id LIMIT 1)) AND ca.is_active=1 FOR UPDATE`,[data.cash_account_id||null,data.payment_method]);if(!cashRows.length||!cashRows[0].ledger_id||String(cashRows[0].account_type).toUpperCase()!==data.payment_method)throw new Error('Akun kas/bank tidak aktif, belum terhubung ke ledger, atau metode tidak sesuai.');cashAccountId=Number(cashRows[0].id);cashLedgerId=Number(cashRows[0].ledger_id);}

    const purchaseCode =
      "PB-" +
      new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14) +
      "-" +
      randomUUID().slice(0, 6).toUpperCase();

    let subtotal = 0;

    for (const item of data.items) {
      subtotal += item.quantity * item.unit_cost;
    }

    subtotal = Math.round(subtotal * 100) / 100;
    if(!Number.isFinite(subtotal)||subtotal>9000000000000000)throw new Error('Total pembelian melebihi batas nominal sistem.');
    if(cashLedgerId&&subtotal>0)await assertCashBalance(connection,cashLedgerId,subtotal,'kas/bank untuk pembelian');

    const [purchaseResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO purchases
       (purchase_code, supplier_invoice_no, supplier_id,cash_account_id,
        purchase_date, subtotal, discount,
        shipping_cost, grand_total, notes, status)
       VALUES (?, ?, ?, ?, ?, ?, 0, 0, ?, ?, 'POSTED')`,
      [
        purchaseCode,
        invoiceNo,
        data.supplier_id,
        cashAccountId,
        data.purchase_date,
        subtotal,
        subtotal,
        data.notes || null
      ]
    );

    const purchaseId = purchaseResult.insertId;

    for (let i = 0; i < data.items.length; i++) {
      const item = data.items[i];

      // Kunci data produk agar perhitungan stok tidak bertabrakan.
      const [productRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id, product_name
         FROM products
         WHERE id = ? AND is_active = 1
         FOR UPDATE`,
        [item.product_id]
      );

      if (productRows.length === 0) {
        throw new Error(
          `Produk dengan ID ${item.product_id} tidak ditemukan atau tidak aktif.`
        );
      }

      const productName = productRows[0].product_name;

      // Hitung jumlah dan nilai persediaan milik usaha di semua lokasi internal, termasuk stok konsinyasi.
      const [stockRows] = await connection.execute<RowDataPacket[]>(
        `SELECT
           COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END), 0) AS current_qty,
           COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity * unit_cost ELSE 0 END), 0) -
           COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity * unit_cost ELSE 0 END), 0) AS current_value
         FROM stock_movements
         WHERE product_id = ?`,
        [item.product_id]
      );

      const oldQty = Number(stockRows[0].current_qty || 0);
      const oldValue = Number(stockRows[0].current_value || 0);

      const newQty = oldQty + item.quantity;

      const newAverageCost =
        newQty > 0
          ? (oldValue + item.quantity * item.unit_cost) / newQty
          : item.unit_cost;

      const lineTotal =
        Math.round(item.quantity * item.unit_cost * 100) / 100;

      // Simpan rincian faktur.
      await connection.execute(
        `INSERT INTO purchase_items
         (purchase_id, product_id, product_name_snapshot,
          quantity, unit_cost, line_total)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          purchaseId,
          item.product_id,
          productName,
          item.quantity,
          item.unit_cost,
          lineTotal
        ]
      );

      // Barang masuk ke gudang.
      // unit_cost menyimpan harga beli aktual, bukan rata-rata baru.
      await connection.execute(
        `INSERT INTO stock_movements
         (movement_code, product_id, from_location_id,
          to_location_id, movement_type, quantity,
          unit_cost, reference_type, reference_id, note, created_by_user_id)
         VALUES (?, ?, NULL, ?, 'PURCHASE_IN', ?, ?, 'PURCHASE', ?, ?, ?)`,
        [
          `${purchaseCode}-${i + 1}`,
          item.product_id,
          warehouseId,
          item.quantity,
          item.unit_cost,
          purchaseId,
          `Penerimaan dari pembelian ${purchaseCode}`,
          (req as any).identity?.id || null
        ]
      );

      // Simpan harga beli terakhir dan HPP rata-rata secara terpisah.
      await connection.execute(
        `UPDATE products
         SET last_purchase_cost = ?,
             average_cost = ?
         WHERE id = ?`,
        [
          item.unit_cost,
          Math.round(newAverageCost * 100) / 100,
          item.product_id
        ]
      );
      await connection.execute(`INSERT INTO product_price_history (product_id,effective_date,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,source,changed_by_user_id) SELECT id,CURRENT_DATE,purchase_cost,?, ?,distributor_price,retail_price,'PURCHASE',? FROM products WHERE id=?`,[item.unit_cost,Math.round(newAverageCost*100)/100,(req as any).identity?.id||null,item.product_id]);
    }

    // Pembelian tunai langsung mengurangi kas; pembelian kredit membentuk utang.
    const [inventoryAccounts] = await connection.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='1300' AND is_active=1 LIMIT 1`);
    const contraCode = data.payment_method === "CREDIT" ? "2100" : null;
    const contraAccounts:RowDataPacket[]=contraCode?await connection.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code=? AND is_active=1 LIMIT 1`, [contraCode]).then(([rows])=>rows):[{id:cashLedgerId} as RowDataPacket];
    if (!inventoryAccounts.length || !contraAccounts.length || !contraAccounts[0].id) throw new Error("Akun persediaan atau akun kas/utang belum tersedia.");
    const journalCode = `JU-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const description = data.payment_method === "CREDIT" ? `Pembelian ${purchaseCode} - utang pemasok` : `Pembelian ${purchaseCode} - dibayar ${data.payment_method.toLowerCase()}`;
    const [journalResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?, 'PURCHASE', ?, ?, 'POSTED', ?)`,
      [journalCode,data.purchase_date,purchaseId,description,(req as any).identity?.id || null]
    );
    await connection.execute(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?), (?,?,0,?,?)`,
      [journalResult.insertId,inventoryAccounts[0].id,subtotal,'Penambahan persediaan',journalResult.insertId,contraAccounts[0].id,subtotal,data.payment_method === "CREDIT" ? "Utang pemasok" : `Pembayaran dari ${data.payment_method.toLowerCase()}`]
    );

    if (data.payment_method === "CASH" || data.payment_method === "BANK") {
      const paymentCode = `BAY-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
      const [paymentResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO supplier_payments (payment_code,supplier_id,payment_date,payment_method,cash_account_id,amount,notes,posted_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
        [paymentCode,data.supplier_id,data.purchase_date,data.payment_method,cashAccountId,subtotal,`Pelunasan pembelian ${purchaseCode}`]
      );
      await connection.execute(
        `INSERT INTO supplier_payment_allocations (supplier_payment_id,purchase_id,allocated_amount) VALUES (?,?,?)`,
        [paymentResult.insertId,purchaseId,subtotal]
      );
    }

    await connection.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','PURCHASE',?,?)`,[(req as any).identity?.id||null,purchaseId,`Pembelian ${purchaseCode}; total ${subtotal}; metode ${data.payment_method}`]);
  await connection.commit();

    return res.status(201).json({
      ok: true,
      message: data.payment_method !== "CREDIT" ? `Pembelian lunas ${data.payment_method.toLowerCase()} berhasil dicatat; stok bertambah dan kas/bank berkurang.` : "Pembelian kredit berhasil dicatat; stok bertambah dan utang pemasok terbentuk.",
      purchase: {
        id: purchaseId,
        purchase_code: purchaseCode,
        supplier_id: data.supplier_id,
        purchase_date: data.purchase_date,
        subtotal,
        grand_total: subtotal,
        item_count: data.items.length
      }
    });
  } catch (error) {
    await connection.rollback();

    console.error("Gagal menyimpan pembelian:", error);

    return res.status(500).json({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menyimpan pembelian."
    });
  } finally {
    connection.release();
  }
});

// Pengeluaran usaha: jurnal beban terhadap kas/bank dalam transaksi atomik.
const expenseSchema = z.object({
  expense_date: z.string().refine(isDateOnly),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  amount: z.number().positive().max(100000000000).refine(v=>Math.round(v*100)===v*100),
  payment_method: z.enum(['CASH','BANK']).default('CASH'),
  cash_account_id: z.number().int().positive().optional()
});
// Kasir retail: harga jual dimasukkan manual pada setiap transaksi.
app.get("/api/retail/options", async (_req, res) => {
  try {
    const [warehouseRows]=await pool.query<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE location_type='WAREHOUSE' AND is_active=1 ORDER BY id`);
    if(warehouseRows.length!==1)throw new Error('Harus ada tepat satu gudang aktif; dukungan multi-gudang belum tersedia.');
    const warehouseId=Number(warehouseRows[0].id);
    const [products] = await pool.query<RowDataPacket[]>(
      `SELECT p.id,p.sku,p.product_name,p.unit,p.average_cost,p.purchase_cost,
        COALESCE(st.stock_qty,0) AS stock_qty
       FROM products p
       LEFT JOIN (
         SELECT product_id,
           SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END) -
           SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END) AS stock_qty
         FROM stock_movements
         WHERE to_location_id=? OR from_location_id=?
         GROUP BY product_id
       ) st ON st.product_id=p.id
       WHERE p.is_active=1 ORDER BY p.product_name`,
      [warehouseId,warehouseId,warehouseId,warehouseId]
    );
    const [accounts] = await pool.query<RowDataPacket[]>(
      `SELECT id,account_name,account_type FROM cash_accounts WHERE is_active=1 ORDER BY account_name`
    );
    res.json({ok:true,products,accounts});
  } catch (error) {
    console.error("Gagal memuat opsi kasir retail:",error);
    res.status(500).json({ok:false,message:"Gagal memuat produk dan akun kas/bank."});
  }
});

app.post("/api/retail/sales", async (req,res) => {
  const saleDate=String(req.body?.sale_date||"");
  const cashAccountId=Number(req.body?.cash_account_id);
  const rawItems=req.body?.items;
  if(!isDateOnly(saleDate)||!Number.isInteger(cashAccountId)||cashAccountId<1||!Array.isArray(rawItems)||rawItems.length<1||rawItems.length>100){
    return res.status(400).json({ok:false,message:"Tanggal, akun kas/bank, dan rincian barang wajib diisi dengan benar."});
  }
  const items=rawItems.map((x:any)=>({productId:Number(x.product_id),quantity:Number(x.quantity),unitPrice:Number(x.unit_price)}));
  if(items.length>100)return res.status(400).json({ok:false,message:'Maksimal 100 baris barang per transaksi.'});
  if(items.some((x:any)=>!Number.isInteger(x.productId)||x.productId<1||!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>1000000||Math.round(x.quantity*1000)!==x.quantity*1000||!Number.isFinite(x.unitPrice)||x.unitPrice<=0||x.unitPrice>1000000000||Math.round(x.unitPrice*100)!==x.unitPrice*100)){
    return res.status(400).json({ok:false,message:"Setiap barang wajib memiliki produk, jumlah positif, dan harga jual manual lebih dari nol."});
  }
  if(new Set(items.map((x:any)=>x.productId)).size!==items.length) return res.status(400).json({ok:false,message:'Produk yang sama tidak boleh dicantumkan dua kali; gabungkan jumlah dan harga.'});
  const totalQty=new Map<number,number>();
  for(const item of items) totalQty.set(item.productId,(totalQty.get(item.productId)||0)+item.quantity);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [cash]=await conn.execute<RowDataPacket[]>(
      `SELECT ca.id,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_id FROM cash_accounts ca LEFT JOIN accounts a ON a.account_code=IF(UPPER(ca.account_type)='BANK','1110','1100') AND a.is_active=1 WHERE ca.id=? AND ca.is_active=1 FOR UPDATE`,[cashAccountId]
    );
    if(!cash.length) throw new Error("Akun kas/bank tidak aktif atau tidak ditemukan.");
    const warehouseId=await getWarehouseLocationId(conn);
    const cashCode=String(cash[0].account_type).toUpperCase()==="BANK"?"1110":"1100";
    const accountCodes=["4100","5100","1300"];
    const [accounts]=await conn.query<RowDataPacket[]>(
      `SELECT id,account_code FROM accounts WHERE account_code IN (?,?,?,?) AND is_active=1`,accountCodes
    );
    const accountId=(code:string)=>Number(accounts.find((a:any)=>String(a.account_code)===code)?.id||0);
    const cashAccount=Number(cash[0].ledger_id||accountId(cashCode)),revenueAccount=accountId("4100"),cogsAccount=accountId("5100"),inventoryAccount=accountId("1300");
    if(!cashAccount||!revenueAccount||!cogsAccount||!inventoryAccount) throw new Error("Akun akuntansi kas, penjualan, HPP, atau persediaan belum lengkap.");
    const prepared:any[]=[];
    let subtotal=0,costTotal=0;
    for(const item of items){
      const [products]=await conn.execute<RowDataPacket[]>(
        `SELECT id,product_name,unit,average_cost,purchase_cost,is_active FROM products WHERE id=? FOR UPDATE`,[item.productId]
      );
      if(!products.length||Number(products[0].is_active)!==1) throw new Error("Produk tidak ditemukan atau sudah nonaktif.");
      const [stocks]=await conn.execute<RowDataPacket[]>(
        `SELECT COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-
          COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0) AS stock_qty
         FROM stock_movements WHERE product_id=? AND (to_location_id=? OR from_location_id=?)`,
        [warehouseId,warehouseId,item.productId,warehouseId,warehouseId]
      );
      const available=Number(stocks[0]?.stock_qty||0);
      if((totalQty.get(item.productId)||0)>available) throw new Error(`Stok gudang ${products[0].product_name} tidak cukup. Tersedia ${available} ${products[0].unit||"pcs"}.`);
      const averageCost=Number(products[0].average_cost||0),purchaseCost=Number(products[0].purchase_cost||0);const unitCost=averageCost>0?averageCost:purchaseCost;
      if(!Number.isFinite(unitCost)||unitCost<0) throw new Error(`HPP ${products[0].product_name} tidak valid.`);
      const lineTotal=Math.round(item.quantity*item.unitPrice*100)/100;
      const lineCost=Math.round(item.quantity*unitCost*100)/100;
      prepared.push({...item,productName:products[0].product_name,unitCost,lineTotal,lineCost});
      subtotal=Math.round((subtotal+lineTotal)*100)/100;
      costTotal=Math.round((costTotal+lineCost)*100)/100;
    }
    if(!Number.isFinite(subtotal)||subtotal>9000000000000000||!Number.isFinite(costTotal)||costTotal>9000000000000000)throw new Error('Total penjualan atau HPP melebihi batas nominal sistem.');
    const saleCode=`RTL-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [sale]=await conn.execute<ResultSetHeader>(
      `INSERT INTO retail_sales (sale_code,sale_date,cash_account_id,subtotal,total,status,created_by_user_id)
       VALUES (?,?,?,?,?,'POSTED',?)`,
      [saleCode,saleDate,cashAccountId,subtotal,subtotal,(req as any).identity?.id||null]
    );
    for(let n=0;n<prepared.length;n++){
      const item=prepared[n];
      await conn.execute(
        `INSERT INTO retail_sale_items (sale_id,product_id,product_name_snapshot,quantity,unit_price,unit_cost,line_total,cost_total)
         VALUES (?,?,?,?,?,?,?,?)`,
        [sale.insertId,item.productId,item.productName,item.quantity,item.unitPrice,item.unitCost,item.lineTotal,item.lineCost]
      );
      await conn.execute(
        `INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id)
         VALUES (?, ?, ?, NULL, 'RETAIL_SALE_OUT', ?, ?, 'RETAIL_SALE', ?, ?, ?)`,
        [`${saleCode}-${n+1}`,item.productId,warehouseId,item.quantity,item.unitCost,sale.insertId,`Penjualan retail ${saleCode}`,(req as any).identity?.id || null]
      );
    }
    const journalCode=`JRN-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [journal]=await conn.execute<ResultSetHeader>(
      `INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id)
       VALUES (?,?, 'RETAIL_SALE', ?, ?, 'POSTED', ?)`,
      [journalCode,saleDate,sale.insertId,`Penjualan retail ${saleCode}`,(req as any).identity?.id || null]
    );
    await conn.execute(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description)
       VALUES (?,?,?,0,'Penerimaan kas/bank retail'),(?,?,0,?,'Penjualan retail'),(?,?,?,0,'HPP penjualan retail'),(?,?,0,?,'Pengurangan persediaan retail')`,
      [journal.insertId,cashAccount,subtotal,journal.insertId,revenueAccount,subtotal,journal.insertId,cogsAccount,costTotal,journal.insertId,inventoryAccount,costTotal]
    );
    await conn.execute(`UPDATE retail_sales SET journal_entry_id=? WHERE id=?`,[journal.insertId,sale.insertId]);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','RETAIL_SALE',?,?)`,[(req as any).identity?.id||null,sale.insertId,`Penjualan retail ${saleCode}; total ${subtotal}; HPP ${costTotal}`]);
  await conn.commit();
    return res.status(201).json({ok:true,message:"Penjualan retail tersimpan; stok gudang dan jurnal sudah diperbarui.",sale:{id:sale.insertId,sale_code:saleCode,total:subtotal,cost_total:costTotal,gross_profit:Math.round((subtotal-costTotal)*100)/100}});
  }catch(error){
    await conn.rollback();
    return res.status(400).json({ok:false,message:error instanceof Error?error.message:"Penjualan retail gagal disimpan."});
  }finally{conn.release();}
});

app.post('/api/expenses', async (req,res) => {
  const parsed = expenseSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ok:false,message:'Data pengeluaran tidak valid.'});
  const data = parsed.data; const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [expenseAccount] = await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='6100' AND is_active=1 LIMIT 1`);
    const [cashAccount] = await conn.execute<RowDataPacket[]>(`SELECT ca.id,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_id FROM cash_accounts ca LEFT JOIN accounts a ON a.account_code=IF(UPPER(ca.account_type)='BANK','1110','1100') AND a.is_active=1 WHERE ca.id=COALESCE(?,(SELECT id FROM cash_accounts WHERE account_type=? AND is_active=1 ORDER BY id LIMIT 1)) AND ca.is_active=1 FOR UPDATE`,[data.cash_account_id||null,data.payment_method]);
    if (!expenseAccount.length || !cashAccount.length || String(cashAccount[0].account_type).toUpperCase()!==data.payment_method) throw new Error('Akun beban atau kas/bank belum tersedia.');
    await assertCashBalance(conn,Number(cashAccount[0].ledger_id),data.amount,'kas/bank untuk pengeluaran');
    const expenseCode = `BEB-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [result] = await conn.execute<ResultSetHeader>(`INSERT INTO expenses (expense_code,expense_date,category,description,amount,payment_method,cash_account_id,posted_at) VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,[expenseCode,data.expense_date,data.category,data.description||null,data.amount,data.payment_method,cashAccount[0].id]);
    const journalCode = `JU-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [j] = await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?, 'EXPENSE', ?, ?, 'POSTED', ?)`,[journalCode,data.expense_date,result.insertId,`Pengeluaran ${data.category}`,(req as any).identity?.id || null]);
    await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?), (?,?,0,?,?)`,[j.insertId,expenseAccount[0].id,data.amount,data.category,j.insertId,cashAccount[0].ledger_id,data.amount,'Pengeluaran kas/bank']);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','EXPENSE',?,?)`,[(req as any).identity?.id||null,result.insertId,`Pengeluaran ${expenseCode}; kategori ${data.category}; jumlah ${data.amount}`]);
  await conn.commit(); return res.status(201).json({ok:true,message:'Pengeluaran dan jurnal berhasil dicatat.',expense_code:expenseCode});
  } catch(error) { await conn.rollback(); return res.status(400).json({ok:false,message:error instanceof Error?error.message:'Gagal mencatat pengeluaran.'}); }
  finally { conn.release(); }
});


// Pembayaran utang pemasok: dapat dicicil dan dialokasikan ke beberapa faktur.
app.get("/api/supplier-payments/outstanding", async (_req,res) => {
  try {
    const [rows] = await pool.query<RowDataPacket[]>(`
      SELECT p.id AS purchase_id,p.purchase_code,p.supplier_invoice_no,p.purchase_date,
        p.supplier_id,s.supplier_name,p.grand_total,
        COALESCE(a.allocated_total,0) AS paid_total,COALESCE(pr.returned_total,0) AS returned_total,
        GREATEST(p.grand_total-COALESCE(a.allocated_total,0)-COALESCE(pr.returned_total,0),0) AS outstanding
      FROM purchases p
      JOIN suppliers s ON s.id=p.supplier_id
      LEFT JOIN (
        SELECT spa.purchase_id,SUM(spa.allocated_amount) AS allocated_total
        FROM supplier_payment_allocations spa
        JOIN supplier_payments sp ON sp.id=spa.supplier_payment_id
        WHERE sp.posted_at IS NOT NULL
        GROUP BY spa.purchase_id
      ) a ON a.purchase_id=p.id
      LEFT JOIN (SELECT p2.id purchase_id,SUM(pr.total) returned_total FROM purchase_returns pr JOIN purchases p2 ON p2.id=pr.purchase_id WHERE pr.status='POSTED' GROUP BY p2.id) pr ON pr.purchase_id=p.id
      WHERE p.status='POSTED'
        AND p.grand_total>COALESCE(a.allocated_total,0)+COALESCE(pr.returned_total,0)
      ORDER BY p.purchase_date,p.id
    `);
    res.json({ok:true,purchases:rows});
  } catch(error) {
    console.error("Gagal memuat utang pemasok:",error);
    res.status(500).json({ok:false,message:"Gagal memuat daftar utang pemasok."});
  }
});

app.post("/api/supplier-payments", async (req,res) => {
  const date=String(req.body?.payment_date||"");
  const supplierId=Number(req.body?.supplier_id);
  const cashAccountId=Number(req.body?.cash_account_id);
  const method=String(req.body?.payment_method||"CASH").toUpperCase();
  const allocations=req.body?.allocations;
  if(!isDateOnly(date) ||
     !Number.isInteger(supplierId)||supplierId<1 ||
     !Number.isInteger(cashAccountId)||cashAccountId<1 ||
     !["CASH","BANK"].includes(method) ||
     !Array.isArray(allocations)||allocations.length<1||allocations.length>100) {
    return res.status(400).json({ok:false,message:"Tanggal, pemasok, akun kas/bank, dan alokasi faktur wajib diisi dengan benar."});
  }
  const normalized=allocations.map((x:any)=>({purchaseId:Number(x.purchase_id),amount:Number(x.amount)}));
  if(normalized.some((x:any)=>!Number.isInteger(x.purchaseId)||x.purchaseId<1||!Number.isFinite(x.amount)||x.amount<=0||x.amount>1000000000000||Math.round(x.amount*100)!==x.amount*100) ||
     new Set(normalized.map((x:any)=>x.purchaseId)).size!==normalized.length) {
    return res.status(400).json({ok:false,message:"Rincian alokasi tidak valid atau faktur tercantum lebih dari sekali."});
  }
  const total=Math.round(normalized.reduce((sum:number,x:any)=>sum+x.amount,0)*100)/100;
  if(total>9999999999999.99)return res.status(400).json({ok:false,message:'Total pembayaran melebihi batas nominal sistem.'});
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [supplier]=await conn.execute<RowDataPacket[]>(
      `SELECT id FROM suppliers WHERE id=? AND is_active=1 FOR UPDATE`,[supplierId]
    );
    if(!supplier.length) throw new Error("Pemasok tidak ditemukan atau tidak aktif.");
    const [cash]=await conn.execute<RowDataPacket[]>(
      `SELECT ca.id,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_id FROM cash_accounts ca LEFT JOIN accounts a ON a.account_code=IF(UPPER(ca.account_type)='BANK','1110','1100') AND a.is_active=1 WHERE ca.id=? AND ca.is_active=1 FOR UPDATE`,[cashAccountId]
    );
    if(!cash.length) throw new Error("Akun kas/bank tidak aktif atau tidak ditemukan.");
    const accountCode=String(cash[0].account_type).toUpperCase()==="BANK"?"1110":"1100";
    if(method!==(accountCode==="1110"?"BANK":"CASH")) throw new Error("Metode pembayaran tidak sesuai dengan akun kas/bank yang dipilih.");
    const [payable]=await conn.execute<RowDataPacket[]>(
      `SELECT id FROM accounts WHERE account_code='2100' AND is_active=1 LIMIT 1`
    );
    const cashLedger=[{id:Number(cash[0].ledger_id)}];
    if(!payable.length||!cashLedger.length) throw new Error("Akun utang pemasok atau kas/bank belum tersedia.");
    await assertCashBalance(conn,Number(cashLedger[0].id),total,'kas/bank untuk pembayaran utang');
    let lockedTotal=0;
    for(const item of normalized) {
      const [purchase]=await conn.execute<RowDataPacket[]>(
        `SELECT p.id,p.supplier_id,p.grand_total,p.purchase_code,
          COALESCE((SELECT SUM(a.allocated_amount) FROM supplier_payment_allocations a
            JOIN supplier_payments sp ON sp.id=a.supplier_payment_id WHERE a.purchase_id=p.id AND sp.posted_at IS NOT NULL),0) AS paid_total,
          COALESCE((SELECT SUM(pr.total) FROM purchase_returns pr WHERE pr.purchase_id=p.id AND pr.status='POSTED'),0) AS returned_total
         FROM purchases p WHERE p.id=? AND p.status='POSTED' FOR UPDATE`,[item.purchaseId]
      );
      if(!purchase.length) throw new Error(`Faktur pembelian ID ${item.purchaseId} tidak ditemukan atau belum diposting.`);
      const bill=purchase[0];
      if(Number(bill.supplier_id)!==supplierId) throw new Error("Alokasi hanya boleh untuk faktur pemasok yang dipilih.");
      const outstanding=Math.round((Number(bill.grand_total)-Number(bill.paid_total)-Number(bill.returned_total))*100)/100;
      if(item.amount>outstanding+0.009) throw new Error(`Alokasi faktur ${bill.purchase_code} melebihi sisa utang Rp${outstanding.toLocaleString("id-ID")}.`);
      lockedTotal+=item.amount;
    }
    if(Math.abs(Math.round(lockedTotal*100)/100-total)>0.009) throw new Error("Total alokasi tidak cocok.");
    const paymentCode=`BAY-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [payment]=await conn.execute<ResultSetHeader>(
      `INSERT INTO supplier_payments (payment_code,supplier_id,payment_date,payment_method,cash_account_id,amount,notes,posted_at)
       VALUES (?,?,?,?,?,?,?,CURRENT_TIMESTAMP)`,
      [paymentCode,supplierId,date,method,cashAccountId,total,String(req.body?.notes||"").slice(0,1000)||null]
    );
    for(const item of normalized) {
      await conn.execute(
        `INSERT INTO supplier_payment_allocations (supplier_payment_id,purchase_id,allocated_amount) VALUES (?,?,?)`,
        [payment.insertId,item.purchaseId,item.amount]
      );
    }
    const journalCode=`JU-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [journal]=await conn.execute<ResultSetHeader>(
      `INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id)
       VALUES (?,?,'SUPPLIER_PAYMENT',?,?,'POSTED',?)`,
      [journalCode,date,payment.insertId,`Pembayaran utang pemasok ${paymentCode}`,(req as any).identity?.id || null]
    );
    await conn.execute(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description)
       VALUES (?,?,?,0,'Pelunasan utang pemasok'),(?,?,0,?,'Pembayaran melalui kas/bank')`,
      [journal.insertId,payable[0].id,total,journal.insertId,cashLedger[0].id,total]
    );
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','SUPPLIER_PAYMENT',?,?)`,[(req as any).identity?.id||null,payment.insertId,`Pembayaran utang ${paymentCode}; jumlah ${total}`]);
  await conn.commit();
    return res.status(201).json({ok:true,message:"Pembayaran utang pemasok berhasil dicatat dan dialokasikan ke faktur.",payment:{id:payment.insertId,payment_code:paymentCode,amount:total,journal_id:journal.insertId}});
  } catch(error) {
    await conn.rollback();
    return res.status(400).json({ok:false,message:error instanceof Error?error.message:"Gagal mencatat pembayaran utang pemasok."});
  } finally { conn.release(); }
});

// Ringkasan dashboard berbasis transaksi yang sudah diposting.
// COA, trial balance as-of date, and posted journal register.
app.get("/api/accounting/overview",async(req,res)=>{
  const from=String(req.query.from||'2000-01-01'),to=String(req.query.to||new Date().toISOString().slice(0,10));
  if(!isDateOnly(from)||!isDateOnly(to)||from>to)return res.status(400).json({ok:false,message:'Periode tanggal tidak valid.'});
  try{
    const [accounts]=await pool.execute<RowDataPacket[]>(`SELECT id,account_code,account_name,account_type,is_active FROM accounts ORDER BY account_code`);
    const [balances]=await pool.execute<RowDataPacket[]>(`SELECT a.id,a.account_code,a.account_name,a.account_type,COALESCE(SUM(jl.debit),0) debit_total,COALESCE(SUM(jl.credit),0) credit_total,COALESCE(SUM(jl.debit-jl.credit),0) net_debit FROM accounts a LEFT JOIN journal_lines jl ON jl.account_id=a.id LEFT JOIN journal_entries je ON je.id=jl.journal_entry_id AND je.status='POSTED' AND je.journal_date<=? WHERE a.is_active=1 GROUP BY a.id,a.account_code,a.account_name,a.account_type ORDER BY a.account_code`,[to]);
    const [headers]=await pool.execute<RowDataPacket[]>(`SELECT id,journal_code,journal_date,source_type,source_id,description,status,created_by_user_id FROM journal_entries WHERE status='POSTED' AND journal_date BETWEEN ? AND ? ORDER BY journal_date DESC,id DESC LIMIT 100`,[from,to]);
    const journalIds=headers.map(x=>Number(x.id));let lines:RowDataPacket[]=[];
    if(journalIds.length){const placeholders=journalIds.map(()=>'?').join(',');const [rows]=await pool.execute<RowDataPacket[]>(`SELECT jl.journal_entry_id,jl.account_id,a.account_code,a.account_name,jl.debit,jl.credit,jl.description FROM journal_lines jl JOIN accounts a ON a.id=jl.account_id WHERE jl.journal_entry_id IN (${placeholders}) ORDER BY jl.journal_entry_id,jl.id`,journalIds);lines=rows;}
    const journals=headers.map(h=>({...h,lines:lines.filter(l=>Number(l.journal_entry_id)===Number(h.id))}));
    const [periods]=await pool.execute<RowDataPacket[]>(`SELECT period_start,period_end,status,closed_at,note FROM accounting_periods ORDER BY period_start DESC`);
    return res.json({ok:true,accounts,balances,journals,periods,period:{from,to},journal_limit:100});
  }catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat COA/jurnal. Pastikan migration 010 sudah dijalankan.'});}
});
app.post("/api/manual-journals",async(req,res)=>{
  const date=String(req.body?.journal_date||''),description=String(req.body?.description||'').trim(),raw=req.body?.lines;
  if(!isDateOnly(date)||!description||description.length>1000||!Array.isArray(raw)||raw.length<2||raw.length>50)return res.status(400).json({ok:false,message:'Tanggal, keterangan, dan minimal dua baris jurnal wajib diisi.'});
  const lines=raw.map((x:any)=>({accountId:Number(x.account_id),debit:Number(x.debit||0),credit:Number(x.credit||0),description:String(x.description||description).trim()}));
  if(lines.some(x=>!Number.isInteger(x.accountId)||x.accountId<=0||!Number.isFinite(x.debit)||!Number.isFinite(x.credit)||x.debit<0||x.credit<0||x.debit>1000000000000||x.credit>1000000000000||!hasAtMost2Decimals(x.debit)||!hasAtMost2Decimals(x.credit)||((x.debit>0)===(x.credit>0))||x.description.length>500))return res.status(400).json({ok:false,message:'Baris jurnal tidak valid; setiap baris hanya boleh debit atau kredit, maksimal dua desimal.'});
  const debit=money2(lines.reduce((s,x)=>s+x.debit,0)),credit=money2(lines.reduce((s,x)=>s+x.credit,0));
  if(debit<=0||Math.abs(debit-credit)>0.009)return res.status(400).json({ok:false,message:'Jurnal harus seimbang dan memiliki nilai debit/kredit.'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [period]=await conn.execute<RowDataPacket[]>(`SELECT status FROM accounting_periods WHERE period_start<=? AND period_end>=? FOR UPDATE`,[date,date]);
    if(period.some(x=>x.status==='CLOSED'))throw new Error('Periode akuntansi tanggal tersebut sudah ditutup.');
    const ids=[...new Set(lines.map(x=>x.accountId))].sort((a,b)=>a-b),ph=ids.map(()=>'?').join(',');
    const [accounts]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE id IN (${ph}) AND is_active=1 ORDER BY id FOR UPDATE`,ids);
    if(accounts.length!==ids.length)throw new Error('Akun jurnal tidak aktif atau tidak ditemukan.');
    const code=`JRN-MAN-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [header]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?, 'MANUAL', 0, ?, 'POSTED', ?)`,[code,date,description,(req as any).identity?.id||null]);
    for(const line of lines)await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)`,[header.insertId,line.accountId,line.debit,line.credit,line.description]);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','MANUAL_JOURNAL',?,?)`,[(req as any).identity?.id||null,header.insertId,`Jurnal manual ${code}; debit ${debit}; kredit ${credit}`]);
    await conn.commit();return res.status(201).json({ok:true,message:'Jurnal manual berhasil diposting.',journal_code:code,journal_id:header.insertId,debit,credit});
  }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal memposting jurnal manual.'});}finally{conn.release();}
});
app.post("/api/accounting-periods/close",async(req,res)=>{
  const start=String(req.body?.period_start||''),end=String(req.body?.period_end||''),note=String(req.body?.note||'').trim();
  if(!isDateOnly(start)||!isDateOnly(end)||start>end||note.length>1000)return res.status(400).json({ok:false,message:'Rentang periode atau catatan penutupan tidak valid.'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [overlap]=await conn.execute<RowDataPacket[]>(`SELECT id,period_start,period_end,status FROM accounting_periods WHERE period_start<=? AND period_end>=? FOR UPDATE`,[end,start]);
    if(overlap.length)throw new Error('Rentang bertabrakan dengan periode yang sudah ada; periode tidak diubah.');
    const [result]=await conn.execute<ResultSetHeader>(`INSERT INTO accounting_periods (period_start,period_end,status,closed_by_user_id,closed_at,note) VALUES (?,?,'CLOSED',?,CURRENT_TIMESTAMP,?)`,[start,end,(req as any).identity?.id||null,note||null]);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'CLOSE','ACCOUNTING_PERIOD',?,?)`,[(req as any).identity?.id||null,result.insertId,`Periode ${start} s.d. ${end} ditutup`]);
    await conn.commit();return res.status(201).json({ok:true,message:'Periode dikunci dari posting transaksi baru.',period_id:result.insertId});
  }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal menutup periode.'});}finally{conn.release();}
});
app.get("/api/dashboard/summary", async (_req,res) => {
  try {
    const [retail]=await pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(total),0) total FROM retail_sales WHERE status='POSTED' AND sale_date=CURRENT_DATE()`);
    const [purchases]=await pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(grand_total),0) total FROM purchases WHERE status='POSTED' AND DATE_FORMAT(purchase_date,'%Y-%m')=DATE_FORMAT(CURRENT_DATE(),'%Y-%m')`);
    const [supplierDebt]=await pool.query<RowDataPacket[]>(`
      SELECT COALESCE(SUM(GREATEST(p.grand_total-COALESCE(a.paid,0)-COALESCE(r.returned,0),0)),0) total
      FROM purchases p LEFT JOIN (
        SELECT spa.purchase_id,SUM(spa.allocated_amount) paid FROM supplier_payment_allocations spa JOIN supplier_payments sp ON sp.id=spa.supplier_payment_id WHERE sp.posted_at IS NOT NULL GROUP BY spa.purchase_id
      ) a ON a.purchase_id=p.id LEFT JOIN (
        SELECT purchase_id,SUM(total) returned FROM purchase_returns WHERE status='POSTED' GROUP BY purchase_id
      ) r ON r.purchase_id=p.id WHERE p.status='POSTED'`);
    const [receivable]=await pool.query<RowDataPacket[]>(`
      SELECT GREATEST(COALESCE((SELECT SUM(i.line_total) FROM distributor_sales_reports r JOIN distributor_sales_report_items i ON i.report_id=r.id WHERE r.status='APPROVED'),0)-
      COALESCE((SELECT SUM(total) FROM distributor_sales_returns WHERE status='POSTED'),0)-
      COALESCE((SELECT SUM(amount) FROM distributor_payment_submissions WHERE status='VERIFIED'),0),0) total`);
    const [expenses]=await pool.query<RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) total FROM expenses WHERE DATE_FORMAT(expense_date,'%Y-%m')=DATE_FORMAT(CURRENT_DATE(),'%Y-%m')`);
    const [inventory]=await pool.query<RowDataPacket[]>(`
      SELECT sl.location_type,
        COALESCE(SUM(stock.qty*COALESCE(NULLIF(p.average_cost,0),p.purchase_cost,0)),0) inventory_value
      FROM (
        SELECT sm.product_id,loc.id location_id,loc.location_type,
          SUM(CASE WHEN sm.to_location_id=loc.id THEN sm.quantity ELSE 0 END)-
          SUM(CASE WHEN sm.from_location_id=loc.id THEN sm.quantity ELSE 0 END) qty
        FROM stock_locations loc
        JOIN stock_movements sm ON sm.to_location_id=loc.id OR sm.from_location_id=loc.id
        WHERE loc.is_active=1 AND loc.location_type IN ('WAREHOUSE','DISTRIBUTOR')
        GROUP BY sm.product_id,loc.id,loc.location_type
      ) stock
      JOIN stock_locations sl ON sl.id=stock.location_id
      JOIN products p ON p.id=stock.product_id
      GROUP BY sl.location_type`);
    const warehouseInventory=Number(inventory.find((x:any)=>x.location_type==='WAREHOUSE')?.inventory_value||0);
    const consignmentInventory=Number(inventory.find((x:any)=>x.location_type==='DISTRIBUTOR')?.inventory_value||0);
    const inventoryValue=warehouseInventory+consignmentInventory;
    const [profit]=await pool.query<RowDataPacket[]>(`
      SELECT COALESCE(SUM(CASE WHEN a.account_type='REVENUE' THEN jl.credit-jl.debit
        WHEN a.account_type='EXPENSE' THEN jl.debit-jl.credit ELSE 0 END),0) net_profit
      FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id
      JOIN accounts a ON a.id=jl.account_id
      WHERE je.status='POSTED' AND je.journal_date>=DATE_FORMAT(CURRENT_DATE(),'%Y-%m-01')
        AND je.journal_date<DATE_ADD(DATE_FORMAT(CURRENT_DATE(),'%Y-%m-01'),INTERVAL 1 MONTH)`);

    res.json({ok:true,as_of:new Date().toISOString().slice(0,10),retail_sales_today:Number(retail[0].total),purchases_month:Number(purchases[0].total),supplier_payables:Number(supplierDebt[0].total),distributor_receivables:Number(receivable[0].total),expenses_month:Number(expenses[0].total),net_profit_month:Number(profit[0]?.net_profit||0),warehouse_inventory_value:warehouseInventory,consignment_inventory_value:consignmentInventory,inventory_value:inventoryValue});
  } catch(error) {
    console.error("Gagal memuat ringkasan dashboard:",error);
    res.status(500).json({ok:false,message:"Gagal memuat ringkasan dashboard."});
  }
});


/* RETUR PEMBELIAN DAN RETAIL: seluruh perubahan stok dan jurnal atomik. */
app.get("/api/returns/options",async (_req,res)=>{
 try{
  const [purchases]=await pool.query<RowDataPacket[]>(`
   SELECT p.id,p.purchase_code,p.purchase_date,p.supplier_id,s.supplier_name,
     pi.id purchase_item_id,pi.product_id,pi.product_name_snapshot,pi.quantity,pi.unit_cost,
     GREATEST(pi.quantity-COALESCE(r.returned_qty,0),0) remaining_qty
   FROM purchases p JOIN suppliers s ON s.id=p.supplier_id JOIN purchase_items pi ON pi.purchase_id=p.id
   LEFT JOIN (SELECT purchase_item_id,SUM(quantity) returned_qty FROM purchase_return_items GROUP BY purchase_item_id) r ON r.purchase_item_id=pi.id
   WHERE p.status='POSTED' AND pi.quantity>COALESCE(r.returned_qty,0)
   ORDER BY p.purchase_date DESC,p.id DESC
  `);
  const [sales]=await pool.query<RowDataPacket[]>(`
   SELECT s.id sale_id,s.sale_code,s.sale_date,si.id sale_item_id,si.product_id,si.product_name_snapshot,
     si.quantity,si.unit_price,si.unit_cost,
     GREATEST(si.quantity-COALESCE(r.returned_qty,0),0) remaining_qty
   FROM retail_sales s JOIN retail_sale_items si ON si.sale_id=s.id
   LEFT JOIN (SELECT retail_sale_item_id,SUM(quantity) returned_qty FROM retail_sale_return_items GROUP BY retail_sale_item_id) r ON r.retail_sale_item_id=si.id
   WHERE s.status='POSTED' AND si.quantity>COALESCE(r.returned_qty,0)
   ORDER BY s.sale_date DESC,s.id DESC
  `);
  const [distributorSales]=await pool.query<RowDataPacket[]>(`
   SELECT r.id report_id,r.report_code,r.report_date,r.distributor_id,d.distributor_name,
     i.id report_item_id,i.product_id,i.product_name_snapshot,i.quantity_sold quantity,
     i.unit_price_snapshot unit_price,i.unit_cost_snapshot unit_cost,
     GREATEST(i.quantity_sold-COALESCE(x.returned_qty,0),0) remaining_qty
   FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id
   JOIN distributor_sales_report_items i ON i.report_id=r.id
   LEFT JOIN (SELECT sales_report_item_id,SUM(quantity) returned_qty FROM distributor_sales_return_items GROUP BY sales_report_item_id) x ON x.sales_report_item_id=i.id
   WHERE r.status='APPROVED' AND i.quantity_sold>COALESCE(x.returned_qty,0)
   ORDER BY r.report_date DESC,r.id DESC
  `);
  res.json({ok:true,purchase_items:purchases,sale_items:sales,distributor_sale_items:distributorSales});
 }catch(error){console.error("Gagal memuat opsi retur:",error);res.status(500).json({ok:false,message:"Gagal memuat data faktur dan penjualan untuk retur. Pastikan migrasi 006 sudah dijalankan."});}
});

app.post("/api/returns/purchase",async(req,res)=>{
 const purchaseId=Number(req.body?.purchase_id),date=String(req.body?.return_date||""),items=req.body?.items;
 if(!Number.isInteger(purchaseId)||purchaseId<1||!isDateOnly(date)||!Array.isArray(items)||!items.length||items.length>100)
  return res.status(400).json({ok:false,message:"Faktur, tanggal retur, dan rincian barang wajib diisi."});
 const normalized=items.map((x:any)=>({purchaseItemId:Number(x.purchase_item_id),quantity:Number(x.quantity)}));
 if(normalized.some((x:any)=>!Number.isInteger(x.purchaseItemId)||x.purchaseItemId<1||!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>1000000||Math.round(x.quantity*1000)!==x.quantity*1000)||new Set(normalized.map((x:any)=>x.purchaseItemId)).size!==normalized.length)
  return res.status(400).json({ok:false,message:"Rincian retur tidak valid atau barang tercantum ganda."});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const warehouseId=await getWarehouseLocationId(conn);
  const [purchases]=await conn.execute<RowDataPacket[]>(`SELECT id,purchase_code,supplier_id FROM purchases WHERE id=? AND status='POSTED' FOR UPDATE`,[purchaseId]);
  if(!purchases.length)throw new Error("Faktur pembelian tidak ditemukan atau belum diposting.");
  const [inventory]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='1300' AND is_active=1 LIMIT 1`);
  const [payable]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='2100' AND is_active=1 LIMIT 1`);
  if(!inventory.length||!payable.length)throw new Error("Akun persediaan atau utang pemasok belum tersedia.");
  let total=0;const prepared:any[]=[];
  for(const item of normalized){
   const [rows]=await conn.execute<RowDataPacket[]>(`
    SELECT pi.id,pi.product_id,pi.product_name_snapshot,pi.quantity,pi.unit_cost,
      COALESCE((SELECT SUM(ri.quantity) FROM purchase_return_items ri WHERE ri.purchase_item_id=pi.id),0) returned_qty
    FROM purchase_items pi WHERE pi.id=? AND pi.purchase_id=? FOR UPDATE`,[item.purchaseItemId,purchaseId]);
   if(!rows.length)throw new Error("Barang bukan bagian dari faktur pembelian yang dipilih.");
   const line=rows[0],remaining=Number(line.quantity)-Number(line.returned_qty);
   const [productLock]=await conn.execute<RowDataPacket[]>(`SELECT id FROM products WHERE id=? FOR UPDATE`,[line.product_id]);
   if(!productLock.length)throw new Error('Produk retur tidak ditemukan.');
   if(item.quantity>remaining+0.000001)throw new Error(`Jumlah retur ${line.product_name_snapshot} melebihi sisa yang dapat diretur (${remaining}).`);
   const [stock]=await conn.execute<RowDataPacket[]>(`
    SELECT COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0) stock_qty
    FROM stock_movements WHERE product_id=? AND (to_location_id=? OR from_location_id=?)`,[warehouseId,warehouseId,line.product_id,warehouseId,warehouseId]);
   if(item.quantity>Number(stock[0]?.stock_qty||0)+0.000001)throw new Error(`Stok gudang ${line.product_name_snapshot} tidak cukup untuk retur ke pemasok.`);
   const amount=Math.round(item.quantity*Number(line.unit_cost)*100)/100;
   total=Math.round((total+amount)*100)/100;prepared.push({...item,line,amount});
  }
  if(!Number.isFinite(total)||total>9000000000000000)throw new Error('Total retur pembelian melebihi batas nominal sistem.');
  // Returns reduce supplier payable. Do not post a credit to payable beyond its open balance.
  const [payableBalance]=await conn.execute<RowDataPacket[]>(`
   SELECT p.grand_total-COALESCE(a.paid_total,0)-COALESCE(r.returned_total,0) outstanding
   FROM purchases p
   LEFT JOIN (SELECT spa.purchase_id,SUM(spa.allocated_amount) paid_total FROM supplier_payment_allocations spa JOIN supplier_payments sp ON sp.id=spa.supplier_payment_id WHERE sp.posted_at IS NOT NULL GROUP BY spa.purchase_id) a ON a.purchase_id=p.id
   LEFT JOIN (SELECT purchase_id,SUM(total) returned_total FROM purchase_returns WHERE status='POSTED' GROUP BY purchase_id) r ON r.purchase_id=p.id
   WHERE p.id=? FOR UPDATE`,[purchaseId]);
  const openPayable=Math.round(Number(payableBalance[0]?.outstanding||0)*100)/100;
  if(total>openPayable+0.009) throw new Error(`Retur melebihi sisa utang pemasok (Rp${Math.max(0,openPayable).toLocaleString('id-ID')}). Retur pembelian yang sudah lunas belum dapat diposting karena alur pengembalian dana pemasok belum tersedia.`);
  const code=`RB-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const [ret]=await conn.execute<ResultSetHeader>(`INSERT INTO purchase_returns (return_code,purchase_id,return_date,total,status,notes) VALUES (?,?,?,?,'POSTED',?)`,[code,purchaseId,date,total,String(req.body?.notes||"").slice(0,500)||null]);
  for(let i=0;i<prepared.length;i++){
   const x=prepared[i];
   await conn.execute(`INSERT INTO purchase_return_items (purchase_return_id,purchase_item_id,product_id,product_name_snapshot,quantity,unit_cost,line_total) VALUES (?,?,?,?,?,?,?)`,[ret.insertId,x.purchaseItemId,x.line.product_id,x.line.product_name_snapshot,x.quantity,x.line.unit_cost,x.amount]);
   await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,NULL,'PURCHASE_RETURN_OUT',?,?,'PURCHASE_RETURN',?,?,?)`,[`${code}-${i+1}`,x.line.product_id,warehouseId,x.quantity,x.line.unit_cost,ret.insertId,`Retur pembelian ${code}`,(req as any).identity?.id || null]);
  }
  for(const productId of new Set(prepared.map((x:any)=>Number(x.line.product_id)))){
   const [balance]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END),0) qty,COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0) value FROM stock_movements WHERE product_id=?`,[productId]);
   const qty=Number(balance[0].qty||0),value=Number(balance[0].value||0);
   await conn.execute(`UPDATE products SET average_cost=? WHERE id=?`,[qty>0?Math.round(value/qty*100)/100:0,productId]);
  }
  const journalCode=`JU-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const [j]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?, 'PURCHASE_RETURN', ?, ?, 'POSTED', ?)`,[journalCode,date,ret.insertId,`Retur pembelian ${purchases[0].purchase_code}`,(req as any).identity?.id || null]);
  await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,'Pengurangan utang pemasok karena retur'),(?,?,0,?,'Pengurangan persediaan karena retur')`,[j.insertId,payable[0].id,total,j.insertId,inventory[0].id,total]);
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','PURCHASE_RETURN',?,?)`,[(req as any).identity?.id||null,ret.insertId,`Retur pembelian ${code}; total ${total}`]);
  await conn.commit();res.status(201).json({ok:true,message:"Retur pembelian berhasil dicatat. Stok gudang dan saldo utang pemasok telah disesuaikan.",return:{id:ret.insertId,return_code:code,total}});
 }catch(error){await conn.rollback();res.status(400).json({ok:false,message:error instanceof Error?error.message:"Retur pembelian gagal."});}finally{conn.release();}
});

app.post("/api/returns/retail-sale",async(req,res)=>{
 const saleId=Number(req.body?.sale_id),date=String(req.body?.return_date||""),items=req.body?.items;
 if(!Number.isInteger(saleId)||saleId<1||!isDateOnly(date)||!Array.isArray(items)||!items.length||items.length>100)
  return res.status(400).json({ok:false,message:"Transaksi penjualan, tanggal retur, dan rincian barang wajib diisi."});
 const normalized=items.map((x:any)=>({saleItemId:Number(x.retail_sale_item_id),quantity:Number(x.quantity)}));
 if(normalized.some((x:any)=>!Number.isInteger(x.saleItemId)||x.saleItemId<1||!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>1000000||Math.round(x.quantity*1000)!==x.quantity*1000)||new Set(normalized.map((x:any)=>x.saleItemId)).size!==normalized.length)
  return res.status(400).json({ok:false,message:"Rincian retur penjualan tidak valid atau barang tercantum ganda."});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [sales]=await conn.execute<RowDataPacket[]>(`SELECT id,sale_code,cash_account_id FROM retail_sales WHERE id=? AND status='POSTED' FOR UPDATE`,[saleId]);
  if(!sales.length)throw new Error("Transaksi penjualan retail tidak ditemukan.");
  const [cash]=await conn.execute<RowDataPacket[]>(`SELECT ca.id,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_id FROM cash_accounts ca LEFT JOIN accounts a ON a.account_code=IF(UPPER(ca.account_type)='BANK','1110','1100') AND a.is_active=1 WHERE ca.id=? AND ca.is_active=1 FOR UPDATE`,[sales[0].cash_account_id]);
  const [accounts]=await conn.query<RowDataPacket[]>(`SELECT id,account_code FROM accounts WHERE account_code IN ('4200','1300','5100') AND is_active=1`);
  const accountId=(code:string)=>Number(accounts.find((a:any)=>a.account_code===code)?.id||0);
  const returnsAccount=accountId("4200"),inventory=accountId("1300"),cogs=accountId("5100");
  if(!cash.length||!returnsAccount||!inventory||!cogs)throw new Error("Akun kas/bank, retur penjualan (4200), persediaan, atau HPP belum tersedia. Jalankan migrasi 006.");
  const warehouseId=await getWarehouseLocationId(conn);
  let refund=0,cost=0;const prepared:any[]=[];
  for(const item of normalized){
   const [rows]=await conn.execute<RowDataPacket[]>(`
    SELECT si.id,si.product_id,si.product_name_snapshot,si.quantity,si.unit_price,si.unit_cost,
      COALESCE((SELECT SUM(ri.quantity) FROM retail_sale_return_items ri WHERE ri.retail_sale_item_id=si.id),0) returned_qty
    FROM retail_sale_items si WHERE si.id=? AND si.sale_id=? FOR UPDATE`,[item.saleItemId,saleId]);
   if(!rows.length)throw new Error("Barang bukan bagian dari transaksi penjualan yang dipilih.");
   const line=rows[0],remaining=Number(line.quantity)-Number(line.returned_qty);
   const [productLock]=await conn.execute<RowDataPacket[]>(`SELECT id FROM products WHERE id=? FOR UPDATE`,[line.product_id]);
   if(!productLock.length)throw new Error('Produk retur tidak ditemukan.');
   if(item.quantity>remaining+0.000001)throw new Error(`Jumlah retur ${line.product_name_snapshot} melebihi sisa yang dapat diretur (${remaining}).`);
   const refundLine=Math.round(item.quantity*Number(line.unit_price)*100)/100;
   const costLine=Math.round(item.quantity*Number(line.unit_cost)*100)/100;
   refund=Math.round((refund+refundLine)*100)/100;cost=Math.round((cost+costLine)*100)/100;prepared.push({...item,line,refundLine,costLine});
  }
  if(!Number.isFinite(refund)||refund>9000000000000000||!Number.isFinite(cost)||cost>9000000000000000)throw new Error('Total retur penjualan melebihi batas nominal sistem.');
  await assertCashBalance(conn,Number(cash[0].ledger_id),refund,'kas/bank untuk refund retur retail');
  const code=`RJ-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const [ret]=await conn.execute<ResultSetHeader>(`INSERT INTO retail_sale_returns (return_code,retail_sale_id,return_date,refund_total,cost_total,status,notes) VALUES (?,?,?, ?,?,'POSTED',?)`,[code,saleId,date,refund,cost,String(req.body?.notes||"").slice(0,500)||null]);
  for(let i=0;i<prepared.length;i++){
   const x=prepared[i];
   await conn.execute(`INSERT INTO retail_sale_return_items (retail_sale_return_id,retail_sale_item_id,product_id,product_name_snapshot,quantity,unit_price,unit_cost,refund_total,cost_total) VALUES (?,?,?,?,?,?,?,?,?)`,[ret.insertId,x.saleItemId,x.line.product_id,x.line.product_name_snapshot,x.quantity,x.line.unit_price,x.line.unit_cost,x.refundLine,x.costLine]);
   await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,NULL,?,'RETAIL_SALE_RETURN_IN',?,?,'RETAIL_SALE_RETURN',?,?,?)`,[`${code}-${i+1}`,x.line.product_id,warehouseId,x.quantity,x.line.unit_cost,ret.insertId,`Retur penjualan retail ${code}`,(req as any).identity?.id || null]);
  }
  for(const productId of new Set(prepared.map((x:any)=>Number(x.line.product_id)))){
   const [balance]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END),0) qty,COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0) value FROM stock_movements WHERE product_id=?`,[productId]);
   const qty=Number(balance[0].qty||0),value=Number(balance[0].value||0);
   await conn.execute(`UPDATE products SET average_cost=? WHERE id=?`,[qty>0?Math.round(value/qty*100)/100:0,productId]);
  }
  const journalCode=`JU-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const [j]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?, 'RETAIL_SALE_RETURN', ?, ?, 'POSTED', ?)`,[journalCode,date,ret.insertId,`Retur penjualan ${sales[0].sale_code}`,(req as any).identity?.id || null]);
  await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,'Pengembalian uang penjualan'),(?,?,0,?,'Pengurangan kas/bank untuk refund'),(?,?,?,0,'Persediaan dari barang retur'),(?,?,0,?,'Pembalikan HPP barang retur')`,[j.insertId,returnsAccount,refund,j.insertId,cash[0].ledger_id,refund,j.insertId,inventory,cost,j.insertId,cogs,cost]);
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','RETAIL_SALE_RETURN',?,?)`,[(req as any).identity?.id||null,ret.insertId,`Retur penjualan retail ${code}; refund ${refund}; HPP ${cost}`]);
  await conn.commit();res.status(201).json({ok:true,message:"Retur penjualan berhasil dicatat. Refund, stok, dan jurnal sudah diperbarui.",return:{id:ret.insertId,return_code:code,refund_total:refund,cost_total:cost}});
 }catch(error){await conn.rollback();res.status(400).json({ok:false,message:error instanceof Error?error.message:"Retur penjualan gagal."});}finally{conn.release();}
});

app.post("/api/returns/distributor-sale",async(req,res)=>{
 const reportId=Number(req.body?.sales_report_id),date=String(req.body?.return_date||""),items=req.body?.items;
 if(!Number.isInteger(reportId)||reportId<1||!isDateOnly(date)||!Array.isArray(items)||!items.length||items.length>100)
  return res.status(400).json({ok:false,message:"Laporan distributor, tanggal retur, dan rincian barang wajib diisi."});
 const normalized=items.map((x:any)=>({reportItemId:Number(x.sales_report_item_id),quantity:Number(x.quantity)}));
 if(normalized.some((x:any)=>!Number.isInteger(x.reportItemId)||x.reportItemId<1||!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>1000000||Math.round(x.quantity*1000)!==x.quantity*1000)||new Set(normalized.map((x:any)=>x.reportItemId)).size!==normalized.length)
  return res.status(400).json({ok:false,message:"Rincian retur distributor tidak valid atau barang tercantum ganda."});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const [reports]=await conn.execute<RowDataPacket[]>(`SELECT id,report_code,distributor_id FROM distributor_sales_reports WHERE id=? AND status='APPROVED' FOR UPDATE`,[reportId]);
  if(!reports.length)throw new Error("Laporan distributor tidak ditemukan atau belum disetujui.");
  const [location]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' AND is_active=1 LIMIT 1 FOR UPDATE`,[reports[0].distributor_id]);
  if(!location.length)throw new Error("Lokasi stok distributor tidak ditemukan atau tidak aktif.");
  const [accounts]=await conn.query<RowDataPacket[]>(`SELECT id,account_code FROM accounts WHERE account_code IN ('4200','1200','1300','5100') AND is_active=1`);
  const accountId=(code:string)=>Number(accounts.find((a:any)=>String(a.account_code)===code)?.id||0);
  const returnsAccount=accountId("4200"),receivable=accountId("1200"),inventory=accountId("1300"),cogs=accountId("5100");
  if(!returnsAccount||!receivable||!inventory||!cogs)throw new Error("Akun retur penjualan, piutang, persediaan, atau HPP belum tersedia.");
  let refund=0,cost=0;const prepared:any[]=[];
  for(const item of normalized){
   const [rows]=await conn.execute<RowDataPacket[]>(`
    SELECT i.id,i.product_id,i.product_name_snapshot,i.quantity_sold,i.unit_price_snapshot,i.unit_cost_snapshot,
      COALESCE((SELECT SUM(x.quantity) FROM distributor_sales_return_items x WHERE x.sales_report_item_id=i.id),0) returned_qty
    FROM distributor_sales_report_items i WHERE i.id=? AND i.report_id=? FOR UPDATE`,[item.reportItemId,reportId]);
   if(!rows.length)throw new Error("Barang bukan bagian dari laporan distributor yang dipilih.");
   const line=rows[0],remaining=Number(line.quantity_sold)-Number(line.returned_qty);
   const [productLock]=await conn.execute<RowDataPacket[]>(`SELECT id FROM products WHERE id=? FOR UPDATE`,[line.product_id]);
   if(!productLock.length)throw new Error('Produk retur tidak ditemukan.');
   if(item.quantity>remaining+0.000001)throw new Error(`Jumlah retur ${line.product_name_snapshot} melebihi sisa yang dapat diretur (${remaining}).`);
   const refundLine=Math.round(item.quantity*Number(line.unit_price_snapshot)*100)/100,costLine=Math.round(item.quantity*Number(line.unit_cost_snapshot)*100)/100;
   refund=Math.round((refund+refundLine)*100)/100;cost=Math.round((cost+costLine)*100)/100;prepared.push({...item,line,refundLine,costLine});
  }
  if(!Number.isFinite(refund)||refund>9000000000000000||!Number.isFinite(cost)||cost>9000000000000000)throw new Error('Total retur distributor melebihi batas nominal sistem.');
  // Returns reduce receivables. Until a cash-refund workflow exists, block returns beyond open AR.
  const [receivableBalance]=await conn.execute<RowDataPacket[]>(`
   SELECT COALESCE(s.sales_total,0)-COALESCE(a.paid_total,0)-COALESCE(r.returned_total,0) outstanding
   FROM distributor_sales_reports sr
   LEFT JOIN (SELECT report_id,SUM(line_total) sales_total FROM distributor_sales_report_items GROUP BY report_id) s ON s.report_id=sr.id
   LEFT JOIN (SELECT sales_report_id,SUM(allocated_amount) paid_total FROM distributor_payment_allocations GROUP BY sales_report_id) a ON a.sales_report_id=sr.id
   LEFT JOIN (SELECT sales_report_id,SUM(total) returned_total FROM distributor_sales_returns WHERE status='POSTED' GROUP BY sales_report_id) r ON r.sales_report_id=sr.id
   WHERE sr.id=? FOR UPDATE`,[reportId]);
  const openReceivable=Math.round(Number(receivableBalance[0]?.outstanding||0)*100)/100;
  if(refund>openReceivable+0.009) throw new Error(`Retur melebihi sisa piutang distributor (Rp${Math.max(0,openReceivable).toLocaleString('id-ID')}). Retur setelah tagihan lunas belum dapat diposting karena alur pengembalian dana distributor belum tersedia.`);
  const code=`RJD-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const [ret]=await conn.execute<ResultSetHeader>(`INSERT INTO distributor_sales_returns (return_code,sales_report_id,distributor_id,return_date,total,cost_total,status,notes) VALUES (?,?,?,?,?,?,'POSTED',?)`,[code,reportId,reports[0].distributor_id,date,refund,cost,String(req.body?.notes||"").slice(0,500)||null]);
  for(let i=0;i<prepared.length;i++){
   const x=prepared[i];
   await conn.execute(`INSERT INTO distributor_sales_return_items (distributor_sales_return_id,sales_report_id,sales_report_item_id,product_id,product_name_snapshot,quantity,unit_price,unit_cost,refund_total,cost_total) VALUES (?,?,?,?,?,?,?,?,?,?)`,[ret.insertId,reportId,x.reportItemId,x.line.product_id,x.line.product_name_snapshot,x.quantity,x.line.unit_price_snapshot,x.line.unit_cost_snapshot,x.refundLine,x.costLine]);
   await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?, ?, NULL, ?,'DISTRIBUTOR_SALE_RETURN_IN', ?, ?, 'DISTRIBUTOR_SALE_RETURN', ?, ?, ?)`,[`${code}-${i+1}`,x.line.product_id,Number(location[0].id),x.quantity,x.line.unit_cost_snapshot,ret.insertId,`Retur penjualan distributor ${code}`,(req as any).identity?.id||null]);
  }
  for(const productId of new Set(prepared.map((x:any)=>Number(x.line.product_id)))){
   const [balance]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END),0) qty,COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0) value FROM stock_movements WHERE product_id=?`,[productId]);
   const qty=Number(balance[0].qty||0),value=Number(balance[0].value||0);
   await conn.execute(`UPDATE products SET average_cost=? WHERE id=?`,[qty>0?Math.round(value/qty*100)/100:0,productId]);
  }
  const journalCode=`JU-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
  const [j]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?, 'DISTRIBUTOR_SALE_RETURN', ?, ?, 'POSTED', ?)`,[journalCode,date,ret.insertId,`Retur penjualan distributor ${reports[0].report_code}`,(req as any).identity?.id || null]);
  await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,'Retur penjualan distributor'),(?,?,0,?,'Pengurangan piutang distributor'),(?,?,?,0,'Persediaan barang retur distributor'),(?,?,0,?,'Pembalikan HPP barang retur distributor')`,[j.insertId,returnsAccount,refund,j.insertId,receivable,refund,j.insertId,inventory,cost,j.insertId,cogs,cost]);
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','DISTRIBUTOR_SALE_RETURN',?,?)`,[(req as any).identity?.id||null,ret.insertId,`Retur penjualan distributor ${code}; refund ${refund}; HPP ${cost}`]);
  await conn.commit();res.status(201).json({ok:true,message:"Retur penjualan distributor berhasil dicatat. Stok titipan, piutang, dan jurnal telah disesuaikan.",return:{id:ret.insertId,return_code:code,refund_total:refund,cost_total:cost}});
 }catch(error){await conn.rollback();res.status(400).json({ok:false,message:error instanceof Error?error.message:"Retur distributor gagal dicatat."});}finally{conn.release();}
});

// Histori gabungan transaksi operasional.
app.get("/api/transactions/history",async(req,res)=>{
 const from=String(req.query.from||"2000-01-01"),to=String(req.query.to||"2099-12-31");
 if(!isDateOnly(from)||!isDateOnly(to)||from>to)return res.status(400).json({ok:false,message:"Rentang tanggal tidak valid."});
 try{
  const [rows]=await pool.query<RowDataPacket[]>(`
   SELECT transaction_date,transaction_code,transaction_type,party_name,amount,status,description FROM (
    SELECT p.purchase_date transaction_date,p.purchase_code transaction_code,'PEMBELIAN' transaction_type,s.supplier_name party_name,p.grand_total amount,p.status,p.notes description FROM purchases p JOIN suppliers s ON s.id=p.supplier_id
    UNION ALL SELECT rs.sale_date,rs.sale_code,'PENJUALAN RETAIL','Pelanggan',rs.total,rs.status,NULL FROM retail_sales rs
    UNION ALL SELECT pr.return_date,pr.return_code,'RETUR PEMBELIAN',s.supplier_name,pr.total,pr.status,pr.notes FROM purchase_returns pr JOIN purchases p ON p.id=pr.purchase_id JOIN suppliers s ON s.id=p.supplier_id
    UNION ALL SELECT rr.return_date,rr.return_code,'RETUR PENJUALAN','Pelanggan',rr.refund_total,rr.status,rr.notes FROM retail_sale_returns rr
    UNION ALL SELECT sp.payment_date,sp.payment_code,'PEMBAYARAN PEMASOK',s.supplier_name,sp.amount,'POSTED',sp.notes FROM supplier_payments sp JOIN suppliers s ON s.id=sp.supplier_id
    UNION ALL SELECT e.expense_date,e.expense_code,'PENGELUARAN',e.category,e.amount,'POSTED',e.description FROM expenses e
    UNION ALL SELECT r.report_date,r.report_code,'PENJUALAN DISTRIBUTOR',d.distributor_name,SUM(i.line_total),r.status,r.notes FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id JOIN distributor_sales_report_items i ON i.report_id=r.id GROUP BY r.id,r.report_date,r.report_code,d.distributor_name,r.status,r.notes
    UNION ALL SELECT ps.payment_date,ps.submission_code,'PEMBAYARAN DISTRIBUTOR',d.distributor_name,ps.amount,ps.status,ps.proof_reference FROM distributor_payment_submissions ps JOIN distributors d ON d.id=ps.distributor_id
    UNION ALL SELECT dr.return_date,dr.return_code,'RETUR PENJUALAN DISTRIBUTOR',d.distributor_name,dr.total,dr.status,dr.notes FROM distributor_sales_returns dr JOIN distributors d ON d.id=dr.distributor_id
   ) history WHERE transaction_date BETWEEN ? AND ? ORDER BY transaction_date DESC,transaction_code DESC LIMIT 1000
  `,[from,to]);
  res.json({ok:true,transactions:rows});
 }catch(error){console.error("Gagal memuat histori transaksi:",error);res.status(500).json({ok:false,message:"Gagal memuat histori transaksi."});}
});

app.get("/api/reports/operational",async(req,res)=>{
 const from=String(req.query.from||"2000-01-01"),to=String(req.query.to||"2099-12-31");
 if(!isDateOnly(from)||!isDateOnly(to)||from>to)return res.status(400).json({ok:false,message:"Rentang tanggal laporan tidak valid."});
 try{
  const [rows]=await pool.query<RowDataPacket[]>(`
   SELECT transaction_type,COUNT(*) transaction_count,COALESCE(SUM(amount),0) total_amount FROM (
    SELECT 'PEMBELIAN' transaction_type,grand_total amount,purchase_date transaction_date FROM purchases WHERE status='POSTED'
    UNION ALL SELECT 'PENJUALAN RETAIL',total,sale_date FROM retail_sales WHERE status='POSTED'
    UNION ALL SELECT 'RETUR PEMBELIAN',-total,return_date FROM purchase_returns WHERE status='POSTED'
    UNION ALL SELECT 'RETUR PENJUALAN',-refund_total,return_date FROM retail_sale_returns WHERE status='POSTED'
    UNION ALL SELECT 'PEMBAYARAN PEMASOK',amount,payment_date FROM supplier_payments
    UNION ALL SELECT 'PENGELUARAN',amount,expense_date FROM expenses
    UNION ALL SELECT 'PENJUALAN DISTRIBUTOR',SUM(i.line_total),r.report_date FROM distributor_sales_reports r JOIN distributor_sales_report_items i ON i.report_id=r.id WHERE r.status='APPROVED' GROUP BY r.id,r.report_date
    UNION ALL SELECT 'PEMBAYARAN DISTRIBUTOR',amount,payment_date FROM distributor_payment_submissions WHERE status='VERIFIED'
    UNION ALL SELECT 'RETUR PENJUALAN DISTRIBUTOR',-total,return_date FROM distributor_sales_returns WHERE status='POSTED'
   ) tx WHERE transaction_date BETWEEN ? AND ? GROUP BY transaction_type ORDER BY transaction_type
  `,[from,to]);
  const [journal]=await pool.query<RowDataPacket[]>(`
   SELECT a.account_code,a.account_name,
    SUM(jl.debit) debit_total,SUM(jl.credit) credit_total,
    SUM(jl.debit-jl.credit) net_debit
   FROM journal_lines jl JOIN journal_entries je ON je.id=jl.journal_entry_id JOIN accounts a ON a.id=jl.account_id
   WHERE je.status='POSTED' AND je.journal_date BETWEEN ? AND ?
   GROUP BY a.account_code,a.account_name ORDER BY a.account_code
  `,[from,to]);
  res.json({ok:true,from,to,transactions:rows,ledger:journal});
 }catch(error){console.error("Gagal membuat laporan operasional:",error);res.status(500).json({ok:false,message:"Gagal membuat laporan operasional."});}
});

const dateSchema = z.string().refine(isDateOnly, "Tanggal harus tanggal kalender yang valid (YYYY-MM-DD)");

app.get("/api/setup/validate-date", (req, res) => {
  const parsed = dateSchema.safeParse(req.query.date);

  if (!parsed.success) {
    return res.status(400).json({
      ok: false,
      message: parsed.error.issues[0]?.message
    });
  }

  return res.json({
    ok: true,
    date: parsed.data
  });
});

// Production: serve the Vite build from the same origin as the API.
const currentDir = dirname(fileURLToPath(import.meta.url));
// Inventory adjustment / stock opname / damaged and lost stock workflow (owner only; global API auth middleware).
const inventoryStockQty = async (conn:PoolConnection,productId:number,locationId:number):Promise<number> => {
  const [rows]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0) qty FROM stock_movements WHERE product_id=? AND (to_location_id=? OR from_location_id=?)`,[locationId,locationId,productId,locationId,locationId]);
  return Number(rows[0]?.qty||0);
};

app.get("/api/inventory-adjustments/options",async(_req,res)=>{
  try{const [locations]=await pool.execute<RowDataPacket[]>(`SELECT id,location_code,location_name,location_type,distributor_id FROM stock_locations WHERE is_active=1 ORDER BY location_type,location_name`);const [products]=await pool.execute<RowDataPacket[]>(`SELECT id,sku,product_name,unit,average_cost,purchase_cost,is_active FROM products WHERE is_active=1 ORDER BY product_name`);const [stock]=await pool.execute<RowDataPacket[]>(`SELECT product_id,from_location_id location_id, SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END) stock_out FROM stock_movements WHERE from_location_id IS NOT NULL GROUP BY product_id,from_location_id`);const [stockIn]=await pool.execute<RowDataPacket[]>(`SELECT product_id,to_location_id location_id,SUM(quantity) stock_in FROM stock_movements WHERE to_location_id IS NOT NULL GROUP BY product_id,to_location_id`);return res.json({ok:true,locations,products,stock:stockIn.map((x:any)=>({...x,stock_qty:Number(x.stock_in||0)-Number(stock.find((y:any)=>Number(y.product_id)===Number(x.product_id)&&Number(y.location_id)===Number(x.location_id))?.stock_out||0)}))});}catch{return res.status(500).json({ok:false,message:'Gagal memuat opsi penyesuaian stok.'});}
});

app.get("/api/inventory-adjustments",async(_req,res)=>{
  try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT a.*,l.location_name FROM inventory_adjustments a JOIN stock_locations l ON l.id=a.location_id ORDER BY a.created_at DESC LIMIT 200`);return res.json({ok:true,items:rows});}catch{return res.status(500).json({ok:false,message:'Gagal memuat histori penyesuaian stok.'});}
});

app.post("/api/inventory-adjustments",async(req,res)=>{
  const {adjustment_type,adjustment_date,location_id,reason,items}=req.body||{};const type=String(adjustment_type||'').toUpperCase(),locationId=Number(location_id);
  if(!['OPNAME','OPENING','LOSS','DAMAGE','WRITE_OFF'].includes(type)||!isDateOnly(adjustment_date)||!Number.isInteger(locationId)||locationId<=0||!String(reason||'').trim()||String(reason||'').length>1000||!Array.isArray(items)||!items.length||items.length>100)return res.status(400).json({ok:false,message:'Jenis, tanggal, lokasi, alasan, dan rincian valid (maksimal 100 barang) wajib diisi.'});
  const seen=new Set<number>();const normalized=items.map((x:any)=>({productId:Number(x.product_id),quantity:Number(x.quantity),countedQty:x.counted_qty==null?null:Number(x.counted_qty)}));
  if(normalized.some((x:any)=>!Number.isInteger(x.productId)||x.productId<=0||seen.has(x.productId)||(type==='OPNAME'&&(!Number.isFinite(x.countedQty)||x.countedQty<0||x.countedQty>1000000||Math.round(x.countedQty*1000)!==x.countedQty*1000))||(type!=='OPNAME'&&(!Number.isFinite(x.quantity)||x.quantity<=0||x.quantity>1000000||Math.round(x.quantity*1000)!==x.quantity*1000))))return res.status(400).json({ok:false,message:'Jumlah atau produk penyesuaian tidak valid; kuantitas maksimal 3 desimal.'});
  for(const x of normalized)seen.add(x.productId);
  const conn=await pool.getConnection();try{await conn.beginTransaction();const [loc]=await conn.execute<RowDataPacket[]>(`SELECT id,location_type FROM stock_locations WHERE id=? AND is_active=1 FOR UPDATE`,[locationId]);if(!loc.length)throw new Error('Lokasi stok tidak aktif atau tidak ditemukan.');if(type==='DAMAGE'&&loc[0].location_type==='DAMAGED')throw new Error('Barang rusak harus dipindahkan dari lokasi stok layak jual.');if(type==='OPENING'&&loc[0].location_type!=='WAREHOUSE')throw new Error('Opening stock hanya boleh dicatat pada gudang utama.');if(type==='WRITE_OFF'&&loc[0].location_type!=='DAMAGED')throw new Error('Write-off harus dilakukan dari lokasi barang rusak.');
    const [damaged]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE location_type='DAMAGED' AND is_active=1 ORDER BY id LIMIT 1 FOR UPDATE`);if(type==='DAMAGE'&&!damaged.length)throw new Error('Lokasi barang rusak belum tersedia; jalankan migration 008.');
    const code=`ADJ-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;const [head]=await conn.execute<ResultSetHeader>(`INSERT INTO inventory_adjustments (adjustment_code,adjustment_type,adjustment_date,location_id,damaged_location_id,reason,status,created_by_user_id) VALUES (?,?,?,?,?,?,'DRAFT',?)`,[code,type,adjustment_date,locationId,type==='DAMAGE'?Number(damaged[0].id):null,String(reason).trim(),(req as any).identity?.id||null]);
    for(const x of normalized){const [p]=await conn.execute<RowDataPacket[]>(`SELECT id,average_cost,purchase_cost FROM products WHERE id=? AND is_active=1`,[x.productId]);if(!p.length)throw new Error('Produk tidak aktif atau tidak ditemukan.');const systemQty=await inventoryStockQty(conn,x.productId,locationId);const cost=Number(p[0].average_cost||p[0].purchase_cost||0);const qty=type==='OPNAME'?Math.abs(Number(x.countedQty)-systemQty):Number(x.quantity);const total=money2(qty*cost);await conn.execute(`INSERT INTO inventory_adjustment_items (adjustment_id,product_id,system_qty,counted_qty,quantity,unit_cost,line_total) VALUES (?,?,?,?,?,?,?)`,[head.insertId,x.productId,systemQty,x.countedQty,qty,cost,total]);}
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'CREATE','INVENTORY_ADJUSTMENT',?,?)`,[(req as any).identity?.id||null,head.insertId,`Draft ${type} ${code}; ${String(reason).trim()}`]);await conn.commit();return res.status(201).json({ok:true,message:'Draft penyesuaian stok dibuat; saldo belum berubah.',adjustment:{id:head.insertId,adjustment_code:code,status:'DRAFT'}});
  }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal membuat draft penyesuaian.'});}finally{conn.release();}
});

app.patch("/api/inventory-adjustments/:id/cancel",async(req,res)=>{const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({ok:false,message:'ID penyesuaian tidak valid.'});const conn=await pool.getConnection();try{await conn.beginTransaction();const [rows]=await conn.execute<RowDataPacket[]>(`SELECT adjustment_code,status FROM inventory_adjustments WHERE id=? FOR UPDATE`,[id]);if(!rows.length||rows[0].status!=='DRAFT'){await conn.rollback();return res.status(409).json({ok:false,message:'Draft tidak ditemukan atau sudah diproses.'});}await conn.execute(`UPDATE inventory_adjustments SET status='CANCELLED' WHERE id=?`,[id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'CANCEL','INVENTORY_ADJUSTMENT',?,?)`,[(req as any).identity?.id||null,id,`Draft ${rows[0].adjustment_code} dibatalkan`]);await conn.commit();return res.json({ok:true,message:'Draft penyesuaian dibatalkan.'});}catch(e){await conn.rollback();return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal membatalkan draft.'});}finally{conn.release();}});

app.post("/api/inventory-adjustments/:id/post",async(req,res)=>{
  const id=Number(req.params.id);if(!Number.isInteger(id)||id<=0)return res.status(400).json({ok:false,message:'ID penyesuaian tidak valid.'});const conn=await pool.getConnection();
  try{await conn.beginTransaction();const [heads]=await conn.execute<RowDataPacket[]>(`SELECT * FROM inventory_adjustments WHERE id=? AND status='DRAFT' FOR UPDATE`,[id]);if(!heads.length)throw new Error('Draft tidak ditemukan atau sudah diproses.');const head=heads[0];const [loc]=await conn.execute<RowDataPacket[]>(`SELECT id,location_type FROM stock_locations WHERE id=? AND is_active=1 FOR UPDATE`,[head.location_id]);if(!loc.length)throw new Error('Lokasi sumber tidak aktif.');const [items]=await conn.execute<RowDataPacket[]>(`SELECT i.*,p.average_cost,p.purchase_cost,p.product_name FROM inventory_adjustment_items i JOIN products p ON p.id=i.product_id WHERE i.adjustment_id=? ORDER BY i.product_id FOR UPDATE`,[id]);if(!items.length)throw new Error('Draft tidak memiliki rincian barang.');
    const [damageLoc]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE id=? AND location_type='DAMAGED' AND is_active=1 FOR UPDATE`,[head.damaged_location_id||0]);if(head.adjustment_type==='DAMAGE'&&!damageLoc.length)throw new Error('Lokasi barang rusak tidak tersedia.');
    let totalLoss=0,totalGain=0;for(const item of items){const productId=Number(item.product_id),current=await inventoryStockQty(conn,productId,Number(head.location_id)),cost=Number(item.average_cost||item.purchase_cost||0);let delta=0,fromId:number|null=null,toId:number|null=null;
      if(head.adjustment_type==='OPNAME'||head.adjustment_type==='OPENING'){const counted=Number(item.counted_qty);if(head.adjustment_type==='OPENING'&&Math.abs(current)>0.0005)throw new Error(`Opening stock hanya boleh pada lokasi/produk dengan saldo nol: ${item.product_name}.`);delta=Math.round((counted-current)*1000)/1000;if(delta<0)fromId=Number(head.location_id);else if(delta>0)toId=Number(head.location_id);}
      else{const qty=Number(item.quantity);if(qty>current+0.0005)throw new Error(`Qty ${item.product_name} melebihi stok tersedia ${current}.`);delta=-qty;fromId=Number(head.location_id);if(head.adjustment_type==='DAMAGE')toId=Number(head.damaged_location_id);}
      const qty=Math.abs(delta),value=money2(qty*cost);if(delta<0&&head.adjustment_type!=='DAMAGE')totalLoss=money2(totalLoss+value);if(delta>0)totalGain=money2(totalGain+value);
      await conn.execute(`UPDATE inventory_adjustment_items SET system_qty=?,quantity=?,unit_cost=?,line_total=? WHERE id=?`,[current,qty,cost,value,item.id]);if(qty>0){const movementCode=`${head.adjustment_code}-${productId}`;const movementType=head.adjustment_type==='DAMAGE'?'DAMAGE':head.adjustment_type==='WRITE_OFF'?'WRITE_OFF':head.adjustment_type==='LOSS'?'LOSS':'OPNAME';await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,movement_type,quantity,from_location_id,to_location_id,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?,?,?)`,[movementCode,productId,movementType,qty,fromId,toId,cost,'INVENTORY_ADJUSTMENT',id,String(head.reason),(req as any).identity?.id||null]);}}
    let journalId:number|null=null;if(totalLoss>0||totalGain>0){const [accounts]=await conn.execute<RowDataPacket[]>(`SELECT id,account_code FROM accounts WHERE account_code IN ('1300','3100','4900','6500') AND is_active=1`);const map=new Map(accounts.map((a:any)=>[String(a.account_code),Number(a.id)]));if(!map.get('1300')||(totalLoss>0&&!map.get('6500'))||(totalGain>0&&head.adjustment_type==='OPENING'&&!map.get('3100'))||(totalGain>0&&head.adjustment_type!=='OPENING'&&!map.get('4900')))throw new Error('Akun persediaan, modal, gain/loss belum tersedia; jalankan migration 008.');const code=`JRN-ADJ-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;const [j]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?,?,?,?,'POSTED',?)`,[code,head.adjustment_date,'INVENTORY_ADJUSTMENT',id,`Penyesuaian ${head.adjustment_code}: ${head.reason}`,(req as any).identity?.id||null]);journalId=Number(j.insertId);const lines:any[]=[];if(totalLoss>0)lines.push([map.get('6500'),totalLoss,0,'Loss/stock write-off']);if(totalGain>0)lines.push([map.get('1300'),totalGain,0,'Inventory adjustment gain debit']);if(totalLoss>0)lines.push([map.get('1300'),0,totalLoss,'Inventory reduction']);if(totalGain>0)lines.push([map.get(head.adjustment_type==='OPENING'?'3100':'4900'),0,totalGain,head.adjustment_type==='OPENING'?'Modal awal persediaan':'Inventory adjustment gain']);for(const l of lines)await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)`,[journalId,l[0],l[1],l[2],l[3]]);}
    await conn.execute(`UPDATE inventory_adjustments SET status='POSTED',approved_by_user_id=?,posted_at=CURRENT_TIMESTAMP WHERE id=?`,[(req as any).identity?.id||null,id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','INVENTORY_ADJUSTMENT',?,?)`,[(req as any).identity?.id||null,id,`Penyesuaian ${head.adjustment_code} posted; loss ${totalLoss}; gain ${totalGain}; journal ${journalId||'none'}`]);await conn.commit();return res.json({ok:true,message:'Penyesuaian stok berhasil diposting.',journal_entry_id:journalId,loss_value:totalLoss,gain_value:totalGain});
  }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal memposting penyesuaian stok.'});}finally{conn.release();}
});
// Cash management: accounts, owner capital/prive and internal transfers.
app.get("/api/cash-management",async(_req,res)=>{try{const [accounts]=await pool.execute<RowDataPacket[]>(`SELECT ca.id,ca.account_code,ca.account_name,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_account_id,COALESCE(a.account_code,IF(UPPER(ca.account_type)='BANK','1110','1100')) ledger_code,COALESCE(a.account_name,IF(UPPER(ca.account_type)='BANK','Bank','Kas')) ledger_name,COALESCE(b.balance,0) balance FROM cash_accounts ca LEFT JOIN accounts a ON a.id=ca.ledger_account_id LEFT JOIN (SELECT account_id,SUM(debit-credit) balance FROM journal_lines GROUP BY account_id) b ON b.account_id=COALESCE(ca.ledger_account_id,a.id) WHERE ca.is_active=1 ORDER BY ca.account_type,ca.account_name`);const [history]=await pool.execute<RowDataPacket[]>(`SELECT t.*,f.account_name from_account_name,ta.account_name to_account_name FROM cash_transactions t LEFT JOIN cash_accounts f ON f.id=t.from_cash_account_id LEFT JOIN cash_accounts ta ON ta.id=t.to_cash_account_id ORDER BY t.transaction_date DESC,t.id DESC LIMIT 200`);return res.json({ok:true,accounts,history});}catch{return res.status(500).json({ok:false,message:'Gagal memuat kas/bank dan histori.'});}});

app.post("/api/cash-accounts",async(req,res)=>{
  const name=String(req.body?.account_name||'').trim(),type=String(req.body?.account_type||'').toUpperCase();
  if(!name||name.length>100||!['CASH','BANK'].includes(type))return res.status(400).json({ok:false,message:'Nama akun dan jenis kas/bank valid wajib diisi.'});
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const prefix=type==='BANK'?'111':'110',base=type==='BANK'?1110:1100;
    const [codes]=await conn.execute<RowDataPacket[]>(`SELECT account_code FROM accounts WHERE account_code LIKE ? AND account_code REGEXP '^[0-9]+$' ORDER BY account_code FOR UPDATE`,[`${prefix}%`]);
    let code=base;for(const r of codes){const n=Number(r.account_code);if(n>=code)code=n+1;}
    if(code>9999)throw new Error('Kode akun kas/bank telah penuh.');
    const accountName=`${type==='BANK'?'Bank':'Kas'} - ${name}`;
    await conn.execute(`INSERT INTO accounts (account_code,account_name,account_type,is_active) VALUES (?,?, 'ASSET',1)`,[String(code),accountName]);
    const [a]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code=?`,[String(code)]);
    const [ca]=await conn.execute<ResultSetHeader>(`INSERT INTO cash_accounts (account_code,account_name,account_type,is_active,ledger_account_id) VALUES (?,?,?,1,?)`,[String(code),name,type,a[0].id]);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'CREATE','CASH_ACCOUNT',?,?)`,[(req as any).identity?.id||null,ca.insertId,`Akun ${type} ${name} dibuat; ledger ${code}`]);
    await conn.commit();return res.status(201).json({ok:true,message:'Akun kas/bank dibuat.',id:ca.insertId,account_code:String(code)});
  }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal membuat akun kas/bank.'});}finally{conn.release();}
});

app.post("/api/cash-management",async(req,res)=>{const {transaction_type,transaction_date,amount,from_cash_account_id,to_cash_account_id,reason}=req.body||{};const type=String(transaction_type||'').toUpperCase(),amt=Number(amount),fromId=Number(from_cash_account_id||0),toId=Number(to_cash_account_id||0);if(!['CAPITAL','DRAW','TRANSFER'].includes(type)||!isDateOnly(transaction_date)||!Number.isFinite(amt)||amt<=0||amt>1000000000000||!hasAtMost2Decimals(amt)||!String(reason||'').trim()||String(reason||'').length>1000)return res.status(400).json({ok:false,message:'Jenis, tanggal, nominal, dan keterangan valid wajib diisi.'});if((type==='CAPITAL'&&!toId)||(type==='DRAW'&&!fromId)||(type==='TRANSFER'&&(!fromId||!toId||fromId===toId)))return res.status(400).json({ok:false,message:'Pilih akun kas/bank yang valid.'});const ids=[...new Set([fromId,toId].filter(x=>x>0))].sort((a,b)=>a-b);const conn=await pool.getConnection();try{await conn.beginTransaction();const placeholders=ids.map(()=>'?').join(',');const [cash]=await conn.execute<RowDataPacket[]>(`SELECT id,account_type,ledger_account_id FROM cash_accounts WHERE id IN (${placeholders}) AND is_active=1 ORDER BY id FOR UPDATE`,ids);if(cash.length!==ids.length)throw new Error('Akun kas/bank tidak aktif atau tidak ditemukan.');const accountLedger=async(id:number)=>{const row=cash.find((x:any)=>Number(x.id)===id);if(row?.ledger_account_id)return Number(row.ledger_account_id);const code=String(row?.account_type).toUpperCase()==='BANK'?'1110':'1100';const [a]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code=? AND is_active=1`,[code]);if(!a.length)throw new Error(`Akun ledger ${code} tidak tersedia.`);return Number(a[0].id);};const fromLedger=fromId?await accountLedger(fromId):null,toLedger=toId?await accountLedger(toId):null;if(type==='TRANSFER'&&fromLedger===toLedger)throw new Error('Transfer antar akun dengan ledger sama belum dapat dicatat; buat akun kas/bank terpisah.');if(type==='DRAW'||type==='TRANSFER'){const sourceLedger=Number(fromLedger);const [ledgerLock]=await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE id=? AND is_active=1 FOR UPDATE`,[sourceLedger]);if(!ledgerLock.length)throw new Error('Akun ledger sumber kas/bank tidak tersedia.');const [bal]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(debit-credit),0) balance FROM journal_lines WHERE account_id=?`,[sourceLedger]);if(Number(bal[0]?.balance||0)<amt)throw new Error('Saldo kas/bank tidak mencukupi.');}const [accounts]=await conn.execute<RowDataPacket[]>(`SELECT id,account_code FROM accounts WHERE account_code IN ('3100','3200') AND is_active=1`);const capital=Number(accounts.find((a:any)=>a.account_code==='3100')?.id||0),draw=Number(accounts.find((a:any)=>a.account_code==='3200')?.id||0);if(type==='CAPITAL'&&!capital||type==='DRAW'&&!draw)throw new Error('Akun modal/prive belum tersedia.');const code=`CASH-${type}-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;const journalCode=`JRN-${code}`;const [j]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?,?,?,?,'POSTED',?)`,[journalCode,transaction_date,'CASH_MANAGEMENT',0,`${type}: ${reason}`,(req as any).identity?.id||null]);const journalId=Number(j.insertId);if(type==='CAPITAL')await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?),(?,?,0,?,?)`,[journalId,toLedger,amt,`Setoran modal ke ${toId}`,journalId,capital,amt,`Modal pemilik: ${reason}`]);else if(type==='DRAW')await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?),(?,?,0,?,?)`,[journalId,draw,amt,`Prive pemilik: ${reason}`,journalId,fromLedger,amt,`Prive dari akun ${fromId}`]);else await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?),(?,?,0,?,?)`,[journalId,toLedger,amt,`Transfer masuk ke ${toId}`,journalId,fromLedger,amt,`Transfer keluar dari ${fromId}`]);const [tx]=await conn.execute<ResultSetHeader>(`INSERT INTO cash_transactions (transaction_code,transaction_type,transaction_date,from_cash_account_id,to_cash_account_id,amount,reason,journal_entry_id,status,created_by_user_id,posted_at) VALUES (?,?,?,?,?,?,?,?,'POSTED',?,CURRENT_TIMESTAMP)`,[code,type,transaction_date,fromId||null,toId||null,amt,String(reason).trim(),journalId,(req as any).identity?.id||null]);await conn.execute(`UPDATE journal_entries SET source_id=? WHERE id=?`,[tx.insertId,journalId]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','CASH_TRANSACTION',?,?)`,[(req as any).identity?.id||null,tx.insertId,`${code} ${type} ${amt}`]);await conn.commit();return res.status(201).json({ok:true,message:'Transaksi kas/bank berhasil dicatat dan dijurnal.',transaction_code:code,journal_entry_id:journalId});}catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal mencatat transaksi kas/bank.'});}finally{conn.release();}});
const clientDist = resolve(currentDir, "../../client/dist");
app.use(express.static(clientDist));
app.use((req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  res.sendFile(resolve(clientDist, "index.html"), (error) => {
    if (error) next(error);
  });
});

app.use((_req, res) => {
  res.status(404).json({
    ok: false,
    message: "Endpoint tidak ditemukan."
  });
});

app.listen(port, () => {
  console.log(`Sparepart API berjalan pada port ${port}`);
});
