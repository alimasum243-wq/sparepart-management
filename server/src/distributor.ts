import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from './db.js';

const router = Router();
type Identity = { id:number; role:string; distributorId:number|null; username:string };
type AuthedRequest = Request & { identity?: Identity };
const secret = process.env.AUTH_TOKEN_SECRET || '';
const money2 = (n:number) => Math.round((n + Number.EPSILON) * 100) / 100;
const dateOnly = (value:unknown):string => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return `${value.getUTCFullYear()}-${String(value.getUTCMonth()+1).padStart(2,'0')}-${String(value.getUTCDate()).padStart(2,'0')}`;
  const match = String(value ?? '').match(/^(\d{4}-\d{2}-\d{2})/);
  if (!match) throw new Error('Tanggal transaksi tidak valid; jurnal tidak dibuat.');
  return match[1];
};
const hashPassword = (password:string) => {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
};
const verifyPassword = (password:string, stored:string) => {
  const [salt, key] = stored.split(':');
  if (!salt || !key) return false;
  const actual = scryptSync(password, salt, 64);
  const expected = Buffer.from(key, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const sign = (identity:Identity) => {
  const payload = Buffer.from(JSON.stringify({ ...identity, exp: Date.now() + 12*60*60*1000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};
export const authMiddleware = (req:AuthedRequest,res:Response,next:NextFunction) => {
  try {
    if (!secret) return res.status(503).json({ok:false,message:'AUTH_TOKEN_SECRET belum diatur di server.'});
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'');
    const [payload,sig] = token.split('.');
    if (!payload || !sig) return res.status(401).json({ok:false,message:'Silakan login kembali.'});
    const expected = createHmac('sha256',secret).update(payload).digest();
    const actual = Buffer.from(sig,'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return res.status(401).json({ok:false,message:'Token tidak valid.'});
    const data = JSON.parse(Buffer.from(payload,'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return res.status(401).json({ok:false,message:'Sesi berakhir. Silakan login kembali.'});
    req.identity = {id:Number(data.id),role:String(data.role),distributorId:data.distributorId == null ? null : Number(data.distributorId),username:String(data.username)};
    next();
  } catch { return res.status(401).json({ok:false,message:'Sesi tidak valid.'}); }
};
export const ownerMiddleware = (req:AuthedRequest,res:Response,next:NextFunction) => {
  if (req.identity?.role !== 'OWNER' && req.identity?.role !== 'ADMIN') return res.status(403).json({ok:false,message:'Akses khusus pemilik.'});
  next();
};
const distributor = (req:AuthedRequest,res:Response,next:NextFunction) => {
  if (req.identity?.role !== 'DISTRIBUTOR' || !req.identity.distributorId) return res.status(403).json({ok:false,message:'Akses khusus distributor.'});
  next();
};
const code = (prefix:string) => `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g,'').slice(0,14)}-${randomBytes(3).toString('hex').toUpperCase()}`;
async function accountId(conn:any, codeValue:string):Promise<number> {
  const [rows] = await conn.execute('SELECT id FROM accounts WHERE account_code=? AND is_active=1 LIMIT 1',[codeValue]);
  if (!(rows as RowDataPacket[]).length) throw new Error(`Akun ${codeValue} belum tersedia.`);
  return Number((rows as RowDataPacket[])[0].id);
}
async function journal(conn:any, date:string, sourceType:string, sourceId:number, description:string, lines:Array<{account:number;debit:number;credit:number;description:string}>, userId:number) {
  const debit = money2(lines.reduce((s,l)=>s+l.debit,0));
  const credit = money2(lines.reduce((s,l)=>s+l.credit,0));
  if (Math.abs(debit-credit) > 0.01 || debit <= 0) throw new Error('Jurnal tidak seimbang atau bernilai nol.');
  const journalCode = code('JU');
  const [h] = await conn.execute(`INSERT INTO journal_entries (journal_code,journal_date,source_type,source_id,description,status,created_by_user_id) VALUES (?,?,?,?,?,'POSTED',?)`,[journalCode,date,sourceType,sourceId,description,userId]);
  const journalId = Number((h as ResultSetHeader).insertId);
  for (const line of lines) await conn.execute(`INSERT INTO journal_lines (journal_entry_id,account_id,debit,credit,description) VALUES (?,?,?,?,?)`,[journalId,line.account,line.debit,line.credit,line.description]);
  return journalId;
}

// First owner can only be initialized once and requires a server-side setup secret.
router.post('/auth/owner-setup', async (req,res) => {
  const {setup_key,username,full_name,password} = req.body || {};
  if (!process.env.OWNER_SETUP_KEY || setup_key !== process.env.OWNER_SETUP_KEY) return res.status(403).json({ok:false,message:'Kunci setup tidak cocok.'});
  if (!/^[a-zA-Z0-9._-]{4,50}$/.test(username||'') || !String(full_name||'').trim() || String(password||'').length < 10) return res.status(400).json({ok:false,message:'Username minimal 4 karakter dan password minimal 10 karakter.'});
  try {
    const [existing] = await pool.query<RowDataPacket[]>(`SELECT id FROM users WHERE password_hash IS NOT NULL LIMIT 1`);
    if (existing.length) return res.status(409).json({ok:false,message:'Akun login sudah pernah dibuat. Hubungi pemilik sistem.'});
    const [result] = await pool.execute<ResultSetHeader>(`INSERT INTO users (username,full_name,role,password_hash,is_active) VALUES (?,?, 'OWNER', ?,1)`,[username,String(full_name).trim(),hashPassword(password)]);
    return res.status(201).json({ok:true,message:'Akun pemilik berhasil dibuat. Silakan login.',user_id:result.insertId});
  } catch (e) { return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal membuat akun.'}); }
});

router.post('/auth/login', async (req,res) => {
  const {username,password} = req.body || {};
  if (!username || !password) return res.status(400).json({ok:false,message:'Username dan password wajib diisi.'});
  try {
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT id,username,full_name,role,distributor_id,password_hash,is_active FROM users WHERE username=? LIMIT 1`,[String(username).trim()]);
    const user = rows[0];
    if (!user || !user.is_active || !user.password_hash || !verifyPassword(String(password),String(user.password_hash))) return res.status(401).json({ok:false,message:'Username atau password salah.'});
    if (!secret) return res.status(503).json({ok:false,message:'Server belum mengatur AUTH_TOKEN_SECRET.'});
    const identity:Identity = {id:Number(user.id),username:String(user.username),role:String(user.role),distributorId:user.distributor_id==null?null:Number(user.distributor_id)};
    return res.json({ok:true,token:sign(identity),user:{id:identity.id,username:identity.username,full_name:user.full_name,role:identity.role,distributor_id:identity.distributorId}});
  } catch (e) { return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Login gagal.'}); }
});
router.get('/auth/me',authMiddleware,(req:AuthedRequest,res)=>res.json({ok:true,user:req.identity}));

// Owner creates distributor master, dedicated stock location and its login account.
router.post('/admin/distributors',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
  const {distributor_name,phone,address,username,password} = req.body || {};
  if (!String(distributor_name||'').trim() || !/^[a-zA-Z0-9._-]{4,50}$/.test(username||'') || String(password||'').length<10) return res.status(400).json({ok:false,message:'Nama distributor, username valid, dan password minimal 10 karakter wajib diisi.'});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const distributorCode = code('DST');
    const [d] = await conn.execute<ResultSetHeader>(`INSERT INTO distributors (distributor_code,distributor_name,phone,address,is_active) VALUES (?,?,?,?,1)`,[distributorCode,String(distributor_name).trim(),phone||null,address||null]);
    const distributorId = Number(d.insertId);
    const [l] = await conn.execute<ResultSetHeader>(`INSERT INTO stock_locations (location_code,location_name,location_type,distributor_id,is_active) VALUES (?,?, 'DISTRIBUTOR', ?,1)`,[`LOC-${distributorCode}`,`Titipan - ${String(distributor_name).trim()}`,distributorId]);
    await conn.execute(`INSERT INTO users (username,full_name,role,distributor_id,password_hash,is_active) VALUES (?,?, 'DISTRIBUTOR', ?, ?,1)`,[username,String(distributor_name).trim(),distributorId,hashPassword(password)]);
    await conn.commit();
    return res.status(201).json({ok:true,distributor:{id:distributorId,distributor_code:distributorCode,distributor_name,stock_location_id:l.insertId,username}});
  } catch(e){await conn.rollback();return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal membuat distributor.'});} finally{conn.release();}
});

router.get('/admin/distributors',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,distributor_code,distributor_name,phone,address,is_active FROM distributors ORDER BY distributor_name`);return res.json({ok:true,distributors:rows});});
router.get('/admin/products',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,sku,product_name,unit,distributor_price,average_cost,purchase_cost FROM products WHERE is_active=1 ORDER BY product_name`);return res.json({ok:true,products:rows});});
router.get('/admin/cash-accounts',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,account_code,account_name,account_type FROM cash_accounts WHERE is_active=1 ORDER BY account_name`);return res.json({ok:true,accounts:rows});});
router.get('/admin/sales-reports/:id',authMiddleware,ownerMiddleware,async(req,res)=>{const [heads]=await pool.execute<RowDataPacket[]>(`SELECT r.*,d.distributor_name FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id WHERE r.id=?`,[Number(req.params.id)]);if(!heads.length)return res.status(404).json({ok:false,message:'Laporan tidak ditemukan.'});const [items]=await pool.execute<RowDataPacket[]>(`SELECT * FROM distributor_sales_report_items WHERE report_id=?`,[Number(req.params.id)]);return res.json({ok:true,report:heads[0],items});});
// Owner sends stock on consignment. No revenue or receivable is booked at dispatch.
router.post('/admin/consignments',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
 const {distributor_id,delivery_date,notes,items}=req.body||{};
 if(!Number.isInteger(Number(distributor_id))||!/^\d{4}-\d{2}-\d{2}$/.test(delivery_date||'')||!Array.isArray(items)||!items.length) return res.status(400).json({ok:false,message:'Distributor, tanggal, dan minimal satu barang wajib diisi.'});
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();
  const [locs]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' AND is_active=1 LIMIT 1 FOR UPDATE`,[distributor_id]);
  if(!locs.length) throw new Error('Lokasi stok distributor belum tersedia.');
  const [wh]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE location_type='WAREHOUSE' AND is_active=1 ORDER BY id LIMIT 1`);
  if(!wh.length) throw new Error('Gudang utama tidak ditemukan.');
  const deliveryCode=code('KNS');
  const [h]=await conn.execute<ResultSetHeader>(`INSERT INTO consignment_deliveries (delivery_code,distributor_id,delivery_date,status,notes,created_by_user_id) VALUES (?,?,?,'POSTED',?,?)`,[deliveryCode,distributor_id,delivery_date,notes||null,req.identity!.id]);
  const deliveryId=Number(h.insertId); const seen=new Set<number>();
  for(const raw of items){const pid=Number(raw.product_id),qty=Number(raw.quantity); if(!Number.isInteger(pid)||qty<=0||seen.has(pid))throw new Error('Daftar barang tidak valid atau produk ganda.');seen.add(pid);
   const [ps]=await conn.execute<RowDataPacket[]>(`SELECT id,product_name,distributor_price,purchase_cost,average_cost FROM products WHERE id=? AND is_active=1 FOR UPDATE`,[pid]);if(!ps.length)throw new Error(`Produk ${pid} tidak ditemukan.`);const p=ps[0];
   const [ss]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0) qty FROM stock_movements WHERE product_id=?`,[Number(wh[0].id),Number(wh[0].id),pid]);
   if(Number(ss[0].qty)<qty)throw new Error(`Stok gudang ${p.product_name} tidak cukup. Tersedia ${ss[0].qty}.`);
   const cost=Number(p.average_cost||p.purchase_cost||0),price=Number(p.distributor_price||0);
   if(!Number.isFinite(price)||price<=0)throw new Error(`Harga distributor ${p.product_name} belum diatur atau bernilai nol. Perbarui harga produk sebelum membuat titipan.`);
   if(!Number.isFinite(cost)||cost<0)throw new Error(`HPP ${p.product_name} tidak valid.`);
   await conn.execute(`INSERT INTO consignment_delivery_items (delivery_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,distributor_price_snapshot) VALUES (?,?,?,?,?,?)`,[deliveryId,pid,p.product_name,qty,cost,price]);
   await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,?,'CONSIGNMENT_OUT',?,?,'CONSIGNMENT',?,?,?)`,[`${deliveryCode}-${pid}`,pid,Number(wh[0].id),Number(locs[0].id),qty,cost,deliveryId,`Titipan ke distributor ${distributor_id}`,req.identity!.id]);
  }
  await conn.commit();return res.status(201).json({ok:true,delivery:{id:deliveryId,delivery_code:deliveryCode}});
 }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal mencatat titipan.'});}finally{conn.release();}
});

router.get('/distributor/stock',authMiddleware,distributor,async(req:AuthedRequest,res)=>{
 try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT p.id product_id,p.sku,p.product_name,p.unit, SUM(CASE WHEN sm.to_location_id=sl.id THEN sm.quantity ELSE 0 END)-SUM(CASE WHEN sm.from_location_id=sl.id THEN sm.quantity ELSE 0 END) stock_qty FROM stock_locations sl JOIN stock_movements sm ON sm.to_location_id=sl.id OR sm.from_location_id=sl.id JOIN products p ON p.id=sm.product_id WHERE sl.distributor_id=? AND sl.location_type='DISTRIBUTOR' GROUP BY p.id,p.sku,p.product_name,p.unit HAVING stock_qty>0 ORDER BY p.product_name`,[req.identity!.distributorId]);return res.json({ok:true,items:rows});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat stok titipan.'});}
});

router.post('/distributor/sales-reports',authMiddleware,distributor,async(req:AuthedRequest,res)=>{
 const {report_date,notes,items}=req.body||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(report_date||'')||!Array.isArray(items)||!items.length)return res.status(400).json({ok:false,message:'Tanggal dan rincian penjualan wajib diisi.'});
 const conn=await pool.getConnection();try{await conn.beginTransaction();const distId=req.identity!.distributorId!;
  const [loc]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' AND is_active=1 LIMIT 1`,[distId]);if(!loc.length)throw new Error('Lokasi distributor tidak ditemukan.');
  const reportCode=code('LAP');const [h]=await conn.execute<ResultSetHeader>(`INSERT INTO distributor_sales_reports (report_code,distributor_id,report_date,status,notes,submitted_by_user_id) VALUES (?,?,?,'SUBMITTED',?,?)`,[reportCode,distId,report_date,notes||null,req.identity!.id]);const reportId=Number(h.insertId);const seen=new Set<number>();
  for(const raw of items){const pid=Number(raw.product_id),qty=Number(raw.quantity_sold);if(!Number.isInteger(pid)||qty<=0||seen.has(pid))throw new Error('Rincian barang tidak valid atau produk ganda.');seen.add(pid);
   const [pRows]=await conn.execute<RowDataPacket[]>(`SELECT id,product_name,average_cost,purchase_cost FROM products WHERE id=? AND is_active=1 FOR UPDATE`,[pid]);if(!pRows.length)throw new Error('Produk tidak ditemukan.');
   const [available]=await conn.execute<RowDataPacket[]>(`SELECT (COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0))-COALESCE((SELECT SUM(i.quantity_sold) FROM distributor_sales_report_items i JOIN distributor_sales_reports r ON r.id=i.report_id WHERE r.distributor_id=? AND r.status='SUBMITTED' AND i.product_id=?),0) qty FROM stock_movements WHERE product_id=?`,[Number(loc[0].id),Number(loc[0].id),distId,pid,pid]);if(Number(available[0].qty)<qty)throw new Error(`Jumlah terjual melebihi stok titipan ${pRows[0].product_name}.`);
   const [costRows]=await conn.execute<RowDataPacket[]>(`SELECT unit_cost_snapshot,distributor_price_snapshot FROM consignment_delivery_items cdi JOIN consignment_deliveries cd ON cd.id=cdi.delivery_id WHERE cd.distributor_id=? AND cdi.product_id=? ORDER BY cd.id DESC LIMIT 1`,[distId,pid]);if(!costRows.length)throw new Error('Produk ini tidak pernah dititipkan kepada Anda.');
   const price=Number(costRows[0].distributor_price_snapshot),cost=Number(pRows[0].average_cost||pRows[0].purchase_cost||costRows[0].unit_cost_snapshot);
   if(!Number.isFinite(price)||price<=0)throw new Error(`Harga distributor ${pRows[0].product_name} pada data titipan masih nol/tidak valid. Hubungi pemilik untuk memperbaiki harga sebelum mengirim laporan.`);
   if(!Number.isFinite(cost)||cost<0)throw new Error(`HPP ${pRows[0].product_name} tidak valid.`);
   const line=money2(qty*price),costTotal=money2(qty*cost);
   await conn.execute(`INSERT INTO distributor_sales_report_items (report_id,product_id,product_name_snapshot,quantity_sold,unit_price_snapshot,unit_cost_snapshot,line_total,cost_total) VALUES (?,?,?,?,?,?,?,?)`,[reportId,pid,pRows[0].product_name,qty,price,cost,line,costTotal]);
  }
  await conn.commit();return res.status(201).json({ok:true,message:'Laporan dikirim dan menunggu pemeriksaan pemilik.',report:{id:reportId,report_code:reportCode,status:'SUBMITTED'}});
 }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal mengirim laporan.'});}finally{conn.release();}
});

router.get('/admin/sales-reports',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT r.*,d.distributor_name,COALESCE(x.sales_total,0) sales_total,COALESCE(x.cost_total,0) cost_total FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id LEFT JOIN (SELECT report_id,SUM(line_total) sales_total,SUM(cost_total) cost_total FROM distributor_sales_report_items GROUP BY report_id) x ON x.report_id=r.id ORDER BY r.created_at DESC`);res.json({ok:true,reports:rows});});
router.post('/admin/sales-reports/:id/approve',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
 const conn=await pool.getConnection();try{await conn.beginTransaction();const id=Number(req.params.id);const [rs]=await conn.execute<RowDataPacket[]>(`SELECT * FROM distributor_sales_reports WHERE id=? AND status='SUBMITTED' FOR UPDATE`,[id]);if(!rs.length)throw new Error('Laporan tidak ditemukan atau sudah diproses.');const report=rs[0];const [items]=await conn.execute<RowDataPacket[]>(`SELECT * FROM distributor_sales_report_items WHERE report_id=?`,[id]);if(!items.length)throw new Error('Laporan tidak memiliki rincian.');
  const [loc]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' LIMIT 1`,[report.distributor_id]);if(!loc.length)throw new Error('Lokasi stok distributor tidak ditemukan.');
  for(const item of items){const qty=Number(item.quantity_sold),price=Number(item.unit_price_snapshot),unitCost=Number(item.unit_cost_snapshot),line=Number(item.line_total),costLine=Number(item.cost_total);if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(line)||line<=0||Math.abs(line-money2(qty*price))>0.01)throw new Error(`Laporan tidak dapat disetujui: harga atau total penjualan ${item.product_name_snapshot} nol/tidak konsisten. Perbaiki rincian laporan terlebih dahulu.`);if(!Number.isFinite(unitCost)||unitCost<0||!Number.isFinite(costLine)||costLine<0||Math.abs(costLine-money2(qty*unitCost))>0.01)throw new Error(`Laporan tidak dapat disetujui: HPP ${item.product_name_snapshot} tidak valid atau tidak konsisten.`);}
   const sales=money2(items.reduce((s,i)=>s+Number(i.line_total),0)),cost=money2(items.reduce((s,i)=>s+Number(i.cost_total),0));if(sales<=0)throw new Error('Total penjualan laporan harus lebih besar dari nol.');const ar=await accountId(conn,'1200'),revenue=await accountId(conn,'4100'),cogs=await accountId(conn,'5100'),inventory=await accountId(conn,'1300');
  const jid=await journal(conn,dateOnly(report.report_date),'DISTRIBUTOR_SALE',id,`Penjualan distributor ${report.distributor_id} - ${report.report_code}`,[{account:ar,debit:sales,credit:0,description:'Piutang distributor'},{account:revenue,debit:0,credit:sales,description:'Penjualan distributor'},{account:cogs,debit:cost,credit:0,description:'HPP barang terjual'},{account:inventory,debit:0,credit:cost,description:'Pengurangan persediaan konsinyasi'}],req.identity!.id);
  for(const item of items)await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,NULL,'CONSIGNMENT_SALE',?,?,'SALES_REPORT',?,?,?)`,[`${report.report_code}-${item.product_id}`,item.product_id,Number(loc[0].id),Number(item.quantity_sold),Number(item.unit_cost_snapshot),id,'Penjualan terverifikasi',req.identity!.id]);
  await conn.execute(`UPDATE distributor_sales_reports SET status='APPROVED',reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,[req.identity!.id,id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'APPROVE','DISTRIBUTOR_SALES_REPORT',?,?)`,[req.identity!.id,id,`Laporan disetujui; jurnal ${jid}`]);await conn.commit();return res.json({ok:true,message:'Laporan disetujui, stok titipan berkurang dan jurnal penjualan/HPP terbentuk.',journal_id:jid});
 }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal menyetujui laporan.'});}finally{conn.release();}
});

router.post('/distributor/payments',authMiddleware,distributor,async(req:AuthedRequest,res)=>{const {payment_date,amount,payment_method,proof_reference,notes}=req.body||{};if(!/^\d{4}-\d{2}-\d{2}$/.test(payment_date||'')||!(Number(amount)>0))return res.status(400).json({ok:false,message:'Tanggal dan nominal pembayaran wajib benar.'});try{const distributorId=req.identity!.distributorId!;const [sales]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(i.line_total),0) total FROM distributor_sales_reports r JOIN distributor_sales_report_items i ON i.report_id=r.id WHERE r.distributor_id=? AND r.status='APPROVED'`,[distributorId]);const [paid]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) total FROM distributor_payment_submissions WHERE distributor_id=? AND status IN ('VERIFIED','PENDING')`,[distributorId]);const outstanding=money2(Number(sales[0].total)-Number(paid[0].total));if(Number(amount)>outstanding) return res.status(400).json({ok:false,message:`Nominal melebihi sisa tagihan. Sisa yang dapat dilaporkan: Rp${outstanding.toLocaleString('id-ID')}.`});const paymentCode=code('BYR');const [r]=await pool.execute<ResultSetHeader>(`INSERT INTO distributor_payment_submissions (submission_code,distributor_id,payment_date,amount,payment_method,proof_reference,notes,status,submitted_by_user_id) VALUES (?,?,?,?,?,?,?,'PENDING',?)`,[paymentCode,distributorId,payment_date,money2(Number(amount)),payment_method||'TRANSFER',proof_reference||null,notes||null,req.identity!.id]);return res.status(201).json({ok:true,message:'Bukti pembayaran terkirim dan menunggu verifikasi pemilik.',submission:{id:r.insertId,submission_code:paymentCode,status:'PENDING'}});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal mengirim pembayaran.'});}});
router.get('/admin/payments',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT p.*,d.distributor_name FROM distributor_payment_submissions p JOIN distributors d ON d.id=p.distributor_id ORDER BY p.created_at DESC`);res.json({ok:true,payments:rows});});
router.post('/admin/payments/:id/verify',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{const conn=await pool.getConnection();try{await conn.beginTransaction();const [rows]=await conn.execute<RowDataPacket[]>(`SELECT * FROM distributor_payment_submissions WHERE id=? AND status='PENDING' FOR UPDATE`,[Number(req.params.id)]);if(!rows.length)throw new Error('Pembayaran tidak ditemukan atau sudah diproses.');const p=rows[0];
const paymentAmount=money2(Number(p.amount));
const [reportBalances]=await conn.execute<RowDataPacket[]>(`
 SELECT r.id,COALESCE(s.sales_total,0) sales_total,COALESCE(a.allocated_total,0) allocated_total
 FROM distributor_sales_reports r
 LEFT JOIN (SELECT report_id,SUM(line_total) sales_total FROM distributor_sales_report_items GROUP BY report_id) s ON s.report_id=r.id
 LEFT JOIN (SELECT sales_report_id,SUM(allocated_amount) allocated_total FROM distributor_payment_allocations GROUP BY sales_report_id) a ON a.sales_report_id=r.id
 WHERE r.distributor_id=? AND r.status='APPROVED'
 ORDER BY r.report_date,r.id
 FOR UPDATE
`,[Number(p.distributor_id)]);
let remaining=paymentAmount;
const allocationRows:Array<{reportId:number;amount:number}>=[];
for(const report of reportBalances){
 const due=money2(Number(report.sales_total)-Number(report.allocated_total));
 if(due<=0) continue;
 const allocated=money2(Math.min(due,remaining));
 if(allocated>0){allocationRows.push({reportId:Number(report.id),amount:allocated});remaining=money2(remaining-allocated);}
 if(remaining<=0) break;
}
if(remaining>0.009) throw new Error(`Pembayaran melebihi total piutang laporan yang belum dialokasikan. Selisih Rp${remaining.toLocaleString('id-ID')}.`);
for(const allocation of allocationRows){
 await conn.execute(`INSERT INTO distributor_payment_allocations (payment_submission_id,sales_report_id,allocated_amount) VALUES (?,?,?)`,[Number(p.id),allocation.reportId,allocation.amount]);
}
const cashAccountId=Number(req.body?.cash_account_id);const [cash]=await conn.execute<RowDataPacket[]>(`SELECT id,account_type FROM cash_accounts WHERE id=? AND is_active=1`,[cashAccountId]);if(!cash.length)throw new Error('Pilih akun kas/bank yang aktif.');const cashCode=String(cash[0].account_type).toUpperCase()==='BANK'?'1110':'1100';const debit=await accountId(conn,cashCode),ar=await accountId(conn,'1200');const jid=await journal(conn,dateOnly(p.payment_date),'DISTRIBUTOR_PAYMENT',Number(p.id),`Pembayaran distributor ${p.distributor_id} ${p.submission_code}`,[{account:debit,debit:Number(p.amount),credit:0,description:'Penerimaan pembayaran distributor'},{account:ar,debit:0,credit:Number(p.amount),description:'Pengurangan piutang distributor'}],req.identity!.id);await conn.execute(`UPDATE distributor_payment_submissions SET status='VERIFIED',destination_cash_account_id=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,journal_entry_id=? WHERE id=?`,[cashAccountId,req.identity!.id,jid,p.id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'VERIFY','DISTRIBUTOR_PAYMENT',?,?)`,[req.identity!.id,p.id,`Pembayaran diverifikasi; jurnal ${jid}`]);await conn.commit();return res.json({ok:true,message:'Pembayaran dikonfirmasi dan jurnal kas/piutang terbentuk.',journal_id:jid});}catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal verifikasi pembayaran.'});}finally{conn.release();}});
router.post('/admin/payments/:id/reject',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{const reason=String(req.body?.reason||'').trim();if(!reason)return res.status(400).json({ok:false,message:'Alasan penolakan wajib diisi.'});const [r]=await pool.execute<ResultSetHeader>(`UPDATE distributor_payment_submissions SET status='REJECTED',reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=? WHERE id=? AND status='PENDING'`,[req.identity!.id,reason,Number(req.params.id)]);if(!r.affectedRows)return res.status(404).json({ok:false,message:'Pembayaran tidak ditemukan atau sudah diproses.'});return res.json({ok:true,message:'Pembayaran ditolak. Tidak ada jurnal yang dibuat.'});});

router.get('/admin/reports/profit-loss',authMiddleware,ownerMiddleware,async(req,res)=>{const from=String(req.query.from||'2000-01-01'),to=String(req.query.to||new Date().toISOString().slice(0,10));if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return res.status(400).json({ok:false,message:'Format tanggal harus YYYY-MM-DD.'});try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT a.account_code,a.account_name,a.account_type,SUM(jl.credit) total_credit,SUM(jl.debit) total_debit FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id JOIN accounts a ON a.id=jl.account_id WHERE je.status='POSTED' AND je.journal_date BETWEEN ? AND ? AND (a.account_type IN ('REVENUE','INCOME','EXPENSE','COST') OR a.account_code IN ('4100','4200','5100','6100')) GROUP BY a.id,a.account_code,a.account_name,a.account_type ORDER BY a.account_code`,[from,to]);let revenue=0,expenses=0;const accounts=rows.map(r=>{const type=String(r.account_type).toUpperCase();const isRevenue=String(r.account_code)==='4100'||String(r.account_code)==='4200'||type==='REVENUE'||type==='INCOME';const value=isRevenue?Number(r.total_credit)-Number(r.total_debit):Number(r.total_debit)-Number(r.total_credit);if(isRevenue)revenue+=value;else expenses+=value;return {...r,net_amount:money2(value)};});return res.json({ok:true,period:{from,to},revenue:money2(revenue),expenses:money2(expenses),net_profit:money2(revenue-expenses),accounts});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal menghitung laba-rugi.'});}});

router.get('/distributor/summary',authMiddleware,distributor,async(req:AuthedRequest,res)=>{const id=req.identity!.distributorId;try{const [sales]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(i.line_total),0) sales_total FROM distributor_sales_reports r JOIN distributor_sales_report_items i ON i.report_id=r.id WHERE r.distributor_id=? AND r.status='APPROVED'`,[id]);const [payments]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) paid_total FROM distributor_payment_submissions WHERE distributor_id=? AND status='VERIFIED'`,[id]);const [pending]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) pending_total FROM distributor_payment_submissions WHERE distributor_id=? AND status='PENDING'`,[id]);return res.json({ok:true,sales_total:Number(sales[0].sales_total),paid_total:Number(payments[0].paid_total),pending_payment:Number(pending[0].pending_total),receivable:Number(sales[0].sales_total)-Number(payments[0].paid_total)});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat ringkasan.'});}});

export default router;
