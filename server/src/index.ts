
import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import { z } from "zod";
import { randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RowDataPacket, ResultSetHeader } from "mysql2";
import { pool } from "./db.js";
import distributorRouter, { authMiddleware, ownerMiddleware } from "./distributor.js";

const app = express();
const port = Number(process.env.PORT || 4000);
const allowedOrigins = (process.env.CLIENT_ORIGIN || "http://localhost:5173").split(",").map(value => value.trim()).filter(Boolean);
const WAREHOUSE_ID = 1;

app.use(helmet());
if (process.env.NODE_ENV !== "production" || process.env.CLIENT_ORIGIN) {
  app.use(cors({
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
  purchase_cost: z.number().nonnegative().max(1000000000).default(0),
  distributor_price: z.number().nonnegative().max(1000000000).default(0),
  retail_price: z.number().nonnegative().max(1000000000).default(0)
});

app.post("/api/products", async (req, res) => {
  const parsed = productSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: "Nama produk wajib diisi dan data harga harus benar." });
  const data = parsed.data;
  const sku = data.sku || `SKU-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
  try {
    const [result] = await pool.execute<ResultSetHeader>(
      `INSERT INTO products (sku, product_name, unit, purchase_cost, last_purchase_cost, average_cost, distributor_price, retail_price, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
      [sku, data.product_name, data.unit, data.purchase_cost, data.purchase_cost, data.purchase_cost, data.distributor_price, data.retail_price]
    );
    res.status(201).json({ ok: true, message: "Produk berhasil ditambahkan.", product_id: result.insertId });
  } catch (error) {
    const duplicate = (error as { code?: string })?.code === "ER_DUP_ENTRY";
    res.status(duplicate ? 409 : 500).json({ ok: false, message: duplicate ? "SKU sudah digunakan. Coba simpan lagi agar SKU dibuat otomatis." : "Gagal menyimpan produk." });
  }
});

app.put("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);
  const parsed = productSchema.safeParse(req.body);
  if (!Number.isInteger(id) || id < 1 || !parsed.success) return res.status(400).json({ ok: false, message: "Data produk tidak valid." });
  const d = parsed.data;
  try {
    const sku = d.sku || `SKU-${Date.now()}-${randomUUID().slice(0, 4).toUpperCase()}`;
    await pool.execute(
      `UPDATE products SET sku=?, product_name=?, unit=?, purchase_cost=?, distributor_price=?, retail_price=? WHERE id=? AND is_active=1`,
      [sku, d.product_name, d.unit, d.purchase_cost, d.distributor_price, d.retail_price, id]
    );
    res.json({ ok: true, message: "Produk berhasil diperbarui." });
  } catch (error) {
    console.error("Gagal memperbarui produk:", error);
    res.status(500).json({ ok: false, message: "Gagal memperbarui produk." });
  }
});

app.patch("/api/products/:id/status", async (req, res) => {
  const id = Number(req.params.id);
  const active = req.body?.is_active;
  if (!Number.isInteger(id) || id < 1 || typeof active !== "boolean") return res.status(400).json({ ok: false, message: "Status produk tidak valid." });
  try {
    await pool.execute("UPDATE products SET is_active=? WHERE id=?", [active ? 1 : 0, id]);
    res.json({ ok: true, message: active ? "Produk diaktifkan." : "Produk dinonaktifkan." });
  } catch (error) {
    console.error("Gagal mengubah status produk:", error);
    res.status(500).json({ ok: false, message: "Gagal mengubah status produk." });
  }
});

// Data untuk formulir pembelian.
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
      locations
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

    return res.status(500).json({
      ok: false,
      message:
        error instanceof Error
          ? error.message
          : "Terjadi kesalahan saat menambahkan pemasok."
    });
  } finally {
    connection.release();
  }
});

const purchaseSchema = z.object({
  supplier_id: z.number().int().positive(),
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  supplier_invoice_no: z.string().trim().max(100).optional(),
  notes: z.string().trim().max(1000).optional(),
  payment_method: z.enum(["CASH", "CREDIT"]).default("CREDIT"),
  items: z.array(
    z.object({
      product_id: z.number().int().positive(),
      quantity: z.number().positive().max(1000000),
      unit_cost: z.number().nonnegative().max(1000000000)
    })
  ).min(1)
});

// Impor satu kali belanja KAK ALI dari lembar Excel: dua pemasok, barang diterima, pembayaran tunai.
const batchImportSchema = z.object({
  purchase_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  suppliers: z.array(z.object({
    supplier_name: z.string().trim().min(1).max(150),
    invoice_no: z.string().trim().min(1).max(100),
    items: z.array(z.object({ product_name: z.string().trim().min(1).max(150), quantity: z.number().positive(), unit_cost: z.number().nonnegative() })).min(1)
  })).min(1)
});

app.post("/api/purchases/import-batch", async (req, res) => {
  const parsed = batchImportSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ ok: false, message: "Data impor pembelian tidak valid." });
  const data = parsed.data;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [inventory] = await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='1300' AND is_active=1 LIMIT 1`);
    const [cash] = await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='1100' AND is_active=1 LIMIT 1`);
    if (!inventory.length || !cash.length) throw new Error("Akun persediaan atau kas utama belum tersedia.");
    const imported: Array<{supplier_name:string;purchase_code:string;total:number;items:number}> = [];
    for (const supplierData of data.suppliers) {
      const [duplicate] = await conn.execute<RowDataPacket[]>(`SELECT id FROM purchases WHERE supplier_invoice_no=? LIMIT 1`, [supplierData.invoice_no]);
      if (duplicate.length) throw new Error(`Faktur ${supplierData.invoice_no} sudah pernah dicatat. Impor dibatalkan agar tidak menggandakan stok.`);
      let [supplierRows] = await conn.execute<RowDataPacket[]>(`SELECT id,supplier_name FROM suppliers WHERE LOWER(TRIM(supplier_name))=LOWER(TRIM(?)) AND is_active=1 LIMIT 1 FOR UPDATE`, [supplierData.supplier_name]);
      let supplierId:number;
      if (supplierRows.length) supplierId=Number(supplierRows[0].id);
      else {
        const code=`SUP-${randomUUID().slice(0,8).toUpperCase()}`;
        const [created]=await conn.execute<ResultSetHeader>(`INSERT INTO suppliers (supplier_code,supplier_name,is_active) VALUES (?,?,1)`,[code,supplierData.supplier_name]);
        supplierId=created.insertId;
      }
      const subtotal=Math.round(supplierData.items.reduce((sum,item)=>sum+item.quantity*item.unit_cost,0)*100)/100;
      const purchaseCode=`PB-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
      const [purchase]=await conn.execute<ResultSetHeader>(`INSERT INTO purchases (purchase_code,supplier_invoice_no,supplier_id,purchase_date,subtotal,discount,shipping_cost,grand_total,notes,status) VALUES (?,?,?,?,?,0,0,?,?,'POSTED')`,[purchaseCode,supplierData.invoice_no,supplierId,data.purchase_date,subtotal,subtotal,`Impor Excel KAK ALI-2; barang diterima dan dibayar tunai.`]);
      for (let i=0;i<supplierData.items.length;i++) {
        const item=supplierData.items[i];
        let [products]=await conn.execute<RowDataPacket[]>(`SELECT id,product_name,is_active FROM products WHERE LOWER(TRIM(product_name))=LOWER(TRIM(?)) LIMIT 1 FOR UPDATE`,[item.product_name]);
        let productId:number;
        if(products.length) { productId=Number(products[0].id); if(Number(products[0].is_active)!==1) await conn.execute(`UPDATE products SET is_active=1 WHERE id=?`,[productId]); }
        else {
          const sku=`SKU-${randomUUID().slice(0,10).toUpperCase()}`;
          const [created]=await conn.execute<ResultSetHeader>(`INSERT INTO products (sku,product_name,unit,purchase_cost,last_purchase_cost,average_cost,distributor_price,retail_price,is_active) VALUES (?,?, 'pcs', ?, ?, ?, 0, 0, 1)`,[sku,item.product_name,item.unit_cost,item.unit_cost,item.unit_cost]);
          productId=created.insertId;
        }
        const [stock]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity ELSE 0 END),0) current_qty, COALESCE(SUM(CASE WHEN to_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id IS NOT NULL THEN quantity*unit_cost ELSE 0 END),0) current_value FROM stock_movements WHERE product_id=?`,[productId]);
        const oldQty=Number(stock[0].current_qty||0), oldValue=Number(stock[0].current_value||0), newQty=oldQty+item.quantity;
        const avg=newQty>0?(oldValue+item.quantity*item.unit_cost)/newQty:item.unit_cost;
        const lineTotal=Math.round(item.quantity*item.unit_cost*100)/100;
        const [productNameRows]=await conn.execute<RowDataPacket[]>(`SELECT product_name FROM products WHERE id=?`,[productId]);
        await conn.execute(`INSERT INTO purchase_items (purchase_id,product_id,product_name_snapshot,quantity,unit_cost,line_total) VALUES (?,?,?,?,?,?)`,[purchase.insertId,productId,productNameRows[0].product_name,item.quantity,item.unit_cost,lineTotal]);
        await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note) VALUES (?, ?, NULL, ?, 'PURCHASE_IN', ?, ?, 'PURCHASE', ?, ?)`,[`${purchaseCode}-${i+1}`,productId,WAREHOUSE_ID,item.quantity,item.unit_cost,purchase.insertId,`Penerimaan impor KAK ALI ${purchaseCode}`]);
        await conn.execute(`UPDATE products SET purchase_cost=?,last_purchase_cost=?,average_cost=? WHERE id=?`,[item.unit_cost,item.unit_cost,Math.round(avg*100)/100,productId]);
      }
      const journalCode=`JU-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
      const [journal]=await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status) VALUES (?,?, 'PURCHASE', ?, ?, 'POSTED')`,[journalCode,data.purchase_date,purchase.insertId,`Pembelian ${purchaseCode} - lunas tunai (impor KAK ALI-2)`]);
      await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?), (?,?,0,?,?)`,[journal.insertId,inventory[0].id,subtotal,'Penambahan persediaan',journal.insertId,cash[0].id,subtotal,'Pembayaran tunai']);
      const paymentCode=`BAY-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
      const [payment]=await conn.execute<ResultSetHeader>(`INSERT INTO supplier_payments (payment_code,supplier_id,payment_date,payment_method,amount,notes,posted_at) VALUES (?,?,?,'CASH',?,?,CURRENT_TIMESTAMP)`,[paymentCode,supplierId,data.purchase_date,subtotal,`Pelunasan faktur ${supplierData.invoice_no}`]);
      await conn.execute(`INSERT INTO supplier_payment_allocations (supplier_payment_id,purchase_id,allocated_amount) VALUES (?,?,?)`,[payment.insertId,purchase.insertId,subtotal]);
      imported.push({supplier_name:supplierData.supplier_name,purchase_code:purchaseCode,total:subtotal,items:supplierData.items.length});
    }
    await conn.commit();
    return res.status(201).json({ok:true,message:"Belanja KAK ALI berhasil diimpor. Stok bertambah dan pembayaran tunai tercatat lunas.",total:imported.reduce((a,b)=>a+b.total,0),purchases:imported});
  } catch(error) {
    await conn.rollback();
    console.error("Gagal impor belanja KAK ALI:",error);
    return res.status(400).json({ok:false,message:error instanceof Error?error.message:"Gagal mengimpor pembelian."});
  } finally { conn.release(); }
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

    // Pastikan gudang penerimaan tersedia.
    const [warehouseRows] = await connection.execute<RowDataPacket[]>(
      `SELECT id
       FROM stock_locations
       WHERE id = ?
         AND location_type = 'WAREHOUSE'
         AND is_active = 1
       FOR UPDATE`,
      [WAREHOUSE_ID]
    );

    if (warehouseRows.length === 0) {
      await connection.rollback();
      return res.status(400).json({
        ok: false,
        message: "Gudang Sukoanyar tidak ditemukan atau tidak aktif."
      });
    }

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

    const [purchaseResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO purchases
       (purchase_code, supplier_invoice_no, supplier_id,
        purchase_date, subtotal, discount,
        shipping_cost, grand_total, notes, status)
       VALUES (?, ?, ?, ?, ?, 0, 0, ?, ?, 'POSTED')`,
      [
        purchaseCode,
        data.supplier_invoice_no || null,
        data.supplier_id,
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
          unit_cost, reference_type, reference_id, note)
         VALUES (?, ?, NULL, ?, 'PURCHASE_IN', ?, ?, 'PURCHASE', ?, ?)`,
        [
          `${purchaseCode}-${i + 1}`,
          item.product_id,
          WAREHOUSE_ID,
          item.quantity,
          item.unit_cost,
          purchaseId,
          `Penerimaan dari pembelian ${purchaseCode}`
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
    }

    // Pembelian tunai langsung mengurangi kas; pembelian kredit membentuk utang.
    const [inventoryAccounts] = await connection.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code='1300' AND is_active=1 LIMIT 1`);
    const contraCode = data.payment_method === "CASH" ? "1100" : "2100";
    const [contraAccounts] = await connection.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code=? AND is_active=1 LIMIT 1`, [contraCode]);
    if (!inventoryAccounts.length || !contraAccounts.length) throw new Error("Akun persediaan atau akun kas/utang belum tersedia.");
    const journalCode = `JU-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const description = data.payment_method === "CASH" ? `Pembelian ${purchaseCode} - dibayar tunai` : `Pembelian ${purchaseCode} - utang pemasok`;
    const [journalResult] = await connection.execute<ResultSetHeader>(
      `INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status) VALUES (?,?, 'PURCHASE', ?, ?, 'POSTED')`,
      [journalCode,data.purchase_date,purchaseId,description]
    );
    await connection.execute(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?), (?,?,0,?,?)`,
      [journalResult.insertId,inventoryAccounts[0].id,subtotal,'Penambahan persediaan',journalResult.insertId,contraAccounts[0].id,subtotal,data.payment_method === "CASH" ? "Pembayaran tunai dari kas" : "Utang pemasok"]
    );

    if (data.payment_method === "CASH") {
      const paymentCode = `BAY-${new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
      const [paymentResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO supplier_payments (payment_code,supplier_id,payment_date,payment_method,amount,notes,posted_at) VALUES (?,?,?,'CASH',?,?,CURRENT_TIMESTAMP)`,
        [paymentCode,data.supplier_id,data.purchase_date,subtotal,`Pelunasan pembelian ${purchaseCode}`]
      );
      await connection.execute(
        `INSERT INTO supplier_payment_allocations (supplier_payment_id,purchase_id,allocated_amount) VALUES (?,?,?)`,
        [paymentResult.insertId,purchaseId,subtotal]
      );
    }

    await connection.commit();

    return res.status(201).json({
      ok: true,
      message: data.payment_method === "CASH" ? "Pembelian lunas tunai berhasil dicatat; stok bertambah dan kas berkurang." : "Pembelian kredit berhasil dicatat; stok bertambah dan utang pemasok terbentuk.",
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
  expense_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  category: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).optional(),
  amount: z.number().positive().max(100000000000),
  payment_method: z.enum(['CASH','BANK']).default('CASH')
});
// Kasir retail: harga jual dimasukkan manual pada setiap transaksi.
app.get("/api/retail/options", async (_req, res) => {
  try {
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
      [WAREHOUSE_ID,WAREHOUSE_ID,WAREHOUSE_ID,WAREHOUSE_ID]
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
  if(!/^\d{4}-\d{2}-\d{2}$/.test(saleDate)||!Number.isInteger(cashAccountId)||cashAccountId<1||!Array.isArray(rawItems)||rawItems.length<1||rawItems.length>100){
    return res.status(400).json({ok:false,message:"Tanggal, akun kas/bank, dan rincian barang wajib diisi dengan benar."});
  }
  const items=rawItems.map((x:any)=>({productId:Number(x.product_id),quantity:Number(x.quantity),unitPrice:Number(x.unit_price)}));
  if(items.some((x:any)=>!Number.isInteger(x.productId)||x.productId<1||!Number.isFinite(x.quantity)||x.quantity<=0||!Number.isFinite(x.unitPrice)||x.unitPrice<=0)){
    return res.status(400).json({ok:false,message:"Setiap barang wajib memiliki produk, jumlah positif, dan harga jual manual lebih dari nol."});
  }
  const totalQty=new Map<number,number>();
  for(const item of items) totalQty.set(item.productId,(totalQty.get(item.productId)||0)+item.quantity);
  const conn=await pool.getConnection();
  try{
    await conn.beginTransaction();
    const [cash]=await conn.execute<RowDataPacket[]>(
      `SELECT id,account_type FROM cash_accounts WHERE id=? AND is_active=1 FOR UPDATE`,[cashAccountId]
    );
    if(!cash.length) throw new Error("Akun kas/bank tidak aktif atau tidak ditemukan.");
    const cashCode=String(cash[0].account_type).toUpperCase()==="BANK"?"1110":"1100";
    const accountCodes=[cashCode,"4100","5100","1300"];
    const [accounts]=await conn.query<RowDataPacket[]>(
      `SELECT id,account_code FROM accounts WHERE account_code IN (?,?,?,?) AND is_active=1`,accountCodes
    );
    const accountId=(code:string)=>Number(accounts.find((a:any)=>String(a.account_code)===code)?.id||0);
    const cashAccount=accountId(cashCode),revenueAccount=accountId("4100"),cogsAccount=accountId("5100"),inventoryAccount=accountId("1300");
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
        [WAREHOUSE_ID,WAREHOUSE_ID,item.productId,WAREHOUSE_ID,WAREHOUSE_ID]
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
        `INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note)
         VALUES (?, ?, ?, NULL, 'RETAIL_SALE_OUT', ?, ?, 'RETAIL_SALE', ?, ?)`,
        [`${saleCode}-${n+1}`,item.productId,WAREHOUSE_ID,item.quantity,item.unitCost,sale.insertId,`Penjualan retail ${saleCode}`]
      );
    }
    const journalCode=`JRN-${Date.now()}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [journal]=await conn.execute<ResultSetHeader>(
      `INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status)
       VALUES (?,?, 'RETAIL_SALE', ?, ?, 'POSTED')`,
      [journalCode,saleDate,sale.insertId,`Penjualan retail ${saleCode}`]
    );
    await conn.execute(
      `INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description)
       VALUES (?,?,?,0,'Penerimaan kas/bank retail'),(?,?,0,?,'Penjualan retail'),(?,?,?,0,'HPP penjualan retail'),(?,?,0,?,'Pengurangan persediaan retail')`,
      [journal.insertId,cashAccount,subtotal,journal.insertId,revenueAccount,subtotal,journal.insertId,cogsAccount,costTotal,journal.insertId,inventoryAccount,costTotal]
    );
    await conn.execute(`UPDATE retail_sales SET journal_entry_id=? WHERE id=?`,[journal.insertId,sale.insertId]);
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
    const cashCode = data.payment_method === 'BANK' ? '1110' : '1100';
    const [cashAccount] = await conn.execute<RowDataPacket[]>(`SELECT id FROM accounts WHERE account_code=? AND is_active=1 LIMIT 1`,[cashCode]);
    if (!expenseAccount.length || !cashAccount.length) throw new Error('Akun beban atau kas/bank belum tersedia.');
    const expenseCode = `BEB-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [result] = await conn.execute<ResultSetHeader>(`INSERT INTO expenses (expense_code,expense_date,category,description,amount,payment_method,posted_at) VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP)`,[expenseCode,data.expense_date,data.category,data.description||null,data.amount,data.payment_method]);
    const journalCode = `JU-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomUUID().slice(0,6).toUpperCase()}`;
    const [j] = await conn.execute<ResultSetHeader>(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status) VALUES (?,?, 'EXPENSE', ?, ?, 'POSTED')`,[journalCode,data.expense_date,result.insertId,`Pengeluaran ${data.category}`]);
    await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,0,?), (?,?,0,?,?)`,[j.insertId,expenseAccount[0].id,data.amount,data.category,j.insertId,cashAccount[0].id,data.amount,'Pengeluaran kas/bank']);
    await conn.commit(); return res.status(201).json({ok:true,message:'Pengeluaran dan jurnal berhasil dicatat.',expense_code:expenseCode});
  } catch(error) { await conn.rollback(); return res.status(400).json({ok:false,message:error instanceof Error?error.message:'Gagal mencatat pengeluaran.'}); }
  finally { conn.release(); }
});

const dateSchema = z.string().regex(
  /^\d{4}-\d{2}-\d{2}$/,
  "Tanggal harus YYYY-MM-DD"
);

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
