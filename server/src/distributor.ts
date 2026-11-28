import { Router, type Request, type Response, type NextFunction } from 'express';
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import type { RowDataPacket, ResultSetHeader } from 'mysql2';
import { pool } from './db.js';
import { money2, isDateOnly } from './validation.js';

const router = Router();
// Basic per-process throttling for sensitive auth endpoints. Production deployments
// should also enforce edge/WAF limits because this map is not shared across instances.
type RateEntry = { count:number; resetAt:number };
const authRate = new Map<string,RateEntry>();
const rateLimit = (key:string, max:number, windowMs:number) => {
  const now=Date.now();
  // Bound memory growth from arbitrary client IPs and remove expired buckets.
  if(authRate.size>1000) for(const [k,v] of authRate) if(v.resetAt<=now) authRate.delete(k);
  const current=authRate.get(key);
  if(!current || current.resetAt<=now){authRate.set(key,{count:1,resetAt:now+windowMs});return false;}
  current.count++;
  return current.count>max;
};
const rateKey=(req:Request)=>String(req.ip || req.socket.remoteAddress || 'unknown');

type Identity = { id:number; role:string; distributorId:number|null; username:string };
type AuthedRequest = Request & { identity?: Identity; sessionId?: string };
const secret = process.env.AUTH_TOKEN_SECRET || '';
const AUTH_COOKIE = 'sparepart_auth';
const authCookieOptions = `HttpOnly; Path=/; SameSite=Lax; Max-Age=${12*60*60}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
const setAuthCookie = (res:Response, token:string) => res.setHeader('Set-Cookie', `${AUTH_COOKIE}=${token}; ${authCookieOptions}`);
const clearAuthCookie = (res:Response) => res.setHeader('Set-Cookie', `${AUTH_COOKIE}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`);
const readCookie = (req:Request, name:string) => String(req.headers.cookie || '').split(';').map(v=>v.trim()).find(v=>v.startsWith(`${name}=`))?.slice(name.length+1) || '';
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
const sign = (identity:Identity, sessionId:string) => {
  const payload = Buffer.from(JSON.stringify({ ...identity, sid:sessionId, exp: Date.now() + 12*60*60*1000 })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
};
export const authMiddleware = async (req:AuthedRequest,res:Response,next:NextFunction) => {
  try {
    if (!secret) return res.status(503).json({ok:false,message:'AUTH_TOKEN_SECRET belum diatur di server.'});
    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i,'') || readCookie(req, AUTH_COOKIE);
    const [payload,sig] = token.split('.');
    if (!payload || !sig) return res.status(401).json({ok:false,message:'Silakan login kembali.'});
    const expected = createHmac('sha256',secret).update(payload).digest();
    const actual = Buffer.from(sig,'base64url');
    if (actual.length !== expected.length || !timingSafeEqual(actual,expected)) return res.status(401).json({ok:false,message:'Token tidak valid.'});
    const data = JSON.parse(Buffer.from(payload,'base64url').toString());
    const userId=Number(data.id);
    if (!Number.isInteger(userId)||userId<=0||!data.exp||data.exp<Date.now()) return res.status(401).json({ok:false,message:'Sesi berakhir atau tidak valid. Silakan login kembali.'});
    const sessionId=String(data.sid||'');
    if(!/^[a-f0-9]{32}$/.test(sessionId)) return res.status(401).json({ok:false,message:'Sesi tidak valid. Silakan login kembali.'});
    const [sessions]=await pool.execute<RowDataPacket[]>(`SELECT session_id FROM auth_sessions WHERE session_id=? AND user_id=? AND revoked_at IS NULL AND expires_at>CURRENT_TIMESTAMP LIMIT 1`,[sessionId,userId]);
    if(!sessions.length) return res.status(401).json({ok:false,message:'Sesi telah berakhir atau dicabut. Silakan login kembali.'});
    // Re-check account status and role from the database so disabled or changed
    // accounts cannot keep using an old signed token until it expires.
    const [users]=await pool.execute<RowDataPacket[]>(`SELECT id,username,role,distributor_id,is_active FROM users WHERE id=? LIMIT 1`,[userId]);
    if(!users.length||Number(users[0].is_active)!==1) return res.status(401).json({ok:false,message:'Akun tidak aktif atau tidak ditemukan. Silakan login kembali.'});
    const user=users[0];
    if(String(user.role)!==String(data.role)||String(user.username)!==String(data.username)||Number(user.distributor_id||0)!==Number(data.distributorId||0)) return res.status(401).json({ok:false,message:'Data akun berubah. Silakan login kembali.'});
    if(user.role==='DISTRIBUTOR'){
      const [dist]=await pool.execute<RowDataPacket[]>(`SELECT id,is_active FROM distributors WHERE id=? LIMIT 1`,[user.distributor_id]);
      if(!dist.length||Number(dist[0].is_active)!==1) return res.status(401).json({ok:false,message:'Distributor tidak aktif. Silakan hubungi pemilik.'});
    }
    req.identity = {id:Number(user.id),role:String(user.role),distributorId:user.distributor_id == null ? null : Number(user.distributor_id),username:String(user.username)};
    req.sessionId=sessionId;
    next();
  } catch { return res.status(503).json({ok:false,message:'Validasi sesi gagal karena layanan autentikasi/database bermasalah.'}); }
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
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','JOURNAL_ENTRY',?,?)`,[userId,journalId,`Jurnal ${sourceType} untuk sumber ${sourceId}`]);
  return journalId;
}

// First owner can only be initialized once and requires a server-side setup secret.
router.post('/auth/owner-setup', async (req,res) => {
  if(process.env.OWNER_SETUP_ENABLED==='false') return res.status(403).json({ok:false,message:'Setup pemilik sudah dinonaktifkan.'});
  if(rateLimit('setup:'+rateKey(req),3,60*60*1000)) return res.status(429).json({ok:false,message:'Percobaan setup terlalu banyak. Coba lagi nanti.'});
  const {setup_key,username,email,phone,full_name,password} = req.body || {};
  const suppliedKey=Buffer.from(String(setup_key||'')),expectedKey=Buffer.from(process.env.OWNER_SETUP_KEY||'');
  if (!expectedKey.length || suppliedKey.length!==expectedKey.length || !timingSafeEqual(suppliedKey,expectedKey)) return res.status(403).json({ok:false,message:'Kunci setup tidak cocok.'});
  if (!/^[a-zA-Z0-9._-]{4,50}$/.test(username||'') || !String(full_name||'').trim() || String(full_name||'').length>150 || String(password||'').length < 10 || String(password||'').length>128 || String(email||'').length>190 || String(phone||'').length>50 || (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)))) return res.status(400).json({ok:false,message:'Username, nama, email, nomor telepon, atau password tidak valid.'});
  const conn=await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [guard]=await conn.execute<RowDataPacket[]>(`SELECT id FROM owner_setup_guard WHERE id=1 FOR UPDATE`);
    if(!guard.length) throw new Error('Tabel pengaman setup pemilik belum siap. Jalankan migration 007.');
    const [existing] = await conn.execute<RowDataPacket[]>(`SELECT id FROM users WHERE password_hash IS NOT NULL LIMIT 1`);
    if (existing.length) { await conn.rollback(); return res.status(409).json({ok:false,message:'Akun login sudah pernah dibuat. Hubungi pemilik sistem.'}); }
    const [result] = await conn.execute<ResultSetHeader>(`INSERT INTO users (username,email,phone,full_name,role,password_hash,is_active) VALUES (?,?,?,?, 'OWNER', ?,1)`,[username,email?String(email).trim().toLowerCase():null,phone?String(phone).trim():null,String(full_name).trim(),hashPassword(password)]);
    await conn.commit();
    return res.status(201).json({ok:true,message:'Akun pemilik berhasil dibuat. Silakan login.',user_id:result.insertId});
  } catch (e) { await conn.rollback(); return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal membuat akun.'}); }
  finally { conn.release(); }
});

router.post('/auth/login', async (req,res) => {
  const loginKey='login:'+rateKey(req);
  if(rateLimit(loginKey,8,15*60*1000)) return res.status(429).json({ok:false,message:'Terlalu banyak percobaan login. Tunggu 15 menit sebelum mencoba kembali.'});
  const identifier = String(req.body?.identifier ?? req.body?.username ?? '').trim();
  const password = String(req.body?.password ?? '');
  if (!identifier || !password || identifier.length>190 || password.length>128) return res.status(400).json({ok:false,message:'Identitas login atau password tidak valid.'});
  try {
    const normalizedEmail = identifier.toLowerCase();
    const [rows] = await pool.execute<RowDataPacket[]>(`SELECT id,username,full_name,role,distributor_id,password_hash,is_active FROM users WHERE username=? OR LOWER(email)=? OR phone=? LIMIT 2`,[identifier,normalizedEmail,identifier]);
    const user = rows.length===1 ? rows[0] : null;
    if (!user || !user.is_active || !user.password_hash || !verifyPassword(password,String(user.password_hash))) return res.status(401).json({ok:false,message:rows.length>1?'Identitas login tidak unik. Hubungi administrator.':'Identitas atau password salah.'});
    if (!secret) return res.status(503).json({ok:false,message:'Server belum mengatur AUTH_TOKEN_SECRET.'});
    const identity:Identity = {id:Number(user.id),username:String(user.username),role:String(user.role),distributorId:user.distributor_id==null?null:Number(user.distributor_id)};
    const sessionId=randomBytes(16).toString('hex');
    await pool.execute(`INSERT INTO auth_sessions (session_id,user_id,expires_at) VALUES (?,?,DATE_ADD(CURRENT_TIMESTAMP,INTERVAL 12 HOUR))`,[sessionId,identity.id]);
    const token = sign(identity,sessionId); setAuthCookie(res, token); authRate.delete(loginKey);
    return res.json({ok:true,user:{id:identity.id,username:identity.username,full_name:user.full_name,role:identity.role,distributor_id:identity.distributorId}});
  } catch (e) { return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Login gagal.'}); }
});
router.post('/auth/logout',authMiddleware,async(req:AuthedRequest,res)=>{ try{if(req.sessionId)await pool.execute(`UPDATE auth_sessions SET revoked_at=CURRENT_TIMESTAMP WHERE session_id=? AND revoked_at IS NULL`,[req.sessionId]);}catch{clearAuthCookie(res);return res.status(503).json({ok:false,message:'Cookie sesi dihapus, tetapi pencabutan sesi database gagal. Token yang sudah disalin tetap perlu dianggap aktif.'});} clearAuthCookie(res); return res.json({ok:true,message:'Sesi diakhiri.'}); });
router.get('/auth/me',authMiddleware,(req:AuthedRequest,res)=>res.json({ok:true,user:req.identity}));

// Owner creates distributor master, dedicated stock location and its login account.
router.post('/admin/distributors',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
  const {distributor_name,phone,email,address,username,password} = req.body || {};
  if (!String(distributor_name||'').trim() || String(distributor_name||'').length>150 || String(phone||'').length>50 || String(address||'').length>255 || (email && (String(email).length>190 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email)))) || !/^[a-zA-Z0-9._-]{4,50}$/.test(username||'') || String(password||'').length<10 || String(password||'').length>128) return res.status(400).json({ok:false,message:'Nama, kontak, username, email, atau password distributor tidak valid.'});
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const distributorCode = code('DST');
    const [d] = await conn.execute<ResultSetHeader>(`INSERT INTO distributors (distributor_code,distributor_name,phone,address,is_active) VALUES (?,?,?,?,1)`,[distributorCode,String(distributor_name).trim(),phone||null,address||null]);
    const distributorId = Number(d.insertId);
    const [l] = await conn.execute<ResultSetHeader>(`INSERT INTO stock_locations (location_code,location_name,location_type,distributor_id,is_active) VALUES (?,?, 'DISTRIBUTOR', ?,1)`,[`LOC-${distributorCode}`,`Titipan - ${String(distributor_name).trim()}`,distributorId]);
    await conn.execute(`INSERT INTO users (username,email,phone,full_name,role,distributor_id,password_hash,is_active) VALUES (?,?,?, ?, 'DISTRIBUTOR', ?, ?,1)`,[username,email?String(email).trim().toLowerCase():null,phone?String(phone).trim():null,String(distributor_name).trim(),distributorId,hashPassword(password)]);
    await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'CREATE','DISTRIBUTOR',?,?)`,[req.identity!.id,distributorId,`Distributor dibuat: ${distributorCode} - ${String(distributor_name).trim()}; username ${username}`]);
    await conn.commit();
    return res.status(201).json({ok:true,distributor:{id:distributorId,distributor_code:distributorCode,distributor_name,stock_location_id:l.insertId,username}});
  } catch(e){await conn.rollback();const duplicate=(e as {code?:string})?.code==='ER_DUP_ENTRY';return res.status(duplicate?409:500).json({ok:false,message:duplicate?'Kode distributor, username, email, atau nomor telepon sudah digunakan.':e instanceof Error?e.message:'Gagal membuat distributor.'});} finally{conn.release();}
});

router.get('/admin/distributors',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,distributor_code,distributor_name,phone,address,is_active FROM distributors ORDER BY distributor_name`);return res.json({ok:true,distributors:rows});});
router.get('/admin/distributor-stock',authMiddleware,ownerMiddleware,async(_req,res)=>{
 try{
  const [rows]=await pool.query<RowDataPacket[]>(`SELECT d.id distributor_id,d.distributor_name,sl.id location_id,p.id product_id,p.sku,p.product_name,p.unit,
   SUM(CASE WHEN sm.to_location_id=sl.id THEN sm.quantity ELSE -sm.quantity END) stock_qty,
   SUM(CASE WHEN sm.to_location_id=sl.id THEN sm.quantity*COALESCE(sm.unit_cost,0) ELSE -sm.quantity*COALESCE(sm.unit_cost,0) END) stock_value_hpp
   FROM distributors d JOIN stock_locations sl ON sl.distributor_id=d.id AND sl.location_type='DISTRIBUTOR' AND sl.is_active=1
   JOIN stock_movements sm ON sm.to_location_id=sl.id OR sm.from_location_id=sl.id
   JOIN products p ON p.id=sm.product_id
   WHERE d.is_active=1
   GROUP BY d.id,d.distributor_name,sl.id,p.id,p.sku,p.product_name,p.unit
   HAVING stock_qty>0
   ORDER BY d.distributor_name,p.product_name`);
  return res.json({ok:true,items:rows});
 }catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat rincian stok sales.'});}
});
router.get('/admin/products',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,sku,product_name,unit,distributor_price,average_cost,purchase_cost FROM products WHERE is_active=1 ORDER BY product_name`);return res.json({ok:true,products:rows});});
router.get('/admin/cash-accounts',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT id,account_code,account_name,account_type FROM cash_accounts WHERE is_active=1 ORDER BY account_name`);return res.json({ok:true,accounts:rows});});
router.get('/admin/sales-reports/:id',authMiddleware,ownerMiddleware,async(req,res)=>{const [heads]=await pool.execute<RowDataPacket[]>(`SELECT r.*,d.distributor_name FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id WHERE r.id=?`,[Number(req.params.id)]);if(!heads.length)return res.status(404).json({ok:false,message:'Laporan tidak ditemukan.'});const [items]=await pool.execute<RowDataPacket[]>(`SELECT * FROM distributor_sales_report_items WHERE report_id=?`,[Number(req.params.id)]);return res.json({ok:true,report:heads[0],items});});
// Owner sends stock on consignment. No revenue or receivable is booked at dispatch.
router.post('/admin/consignments',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
 const {distributor_id,delivery_date,notes,items}=req.body||{};
 if(!Number.isInteger(Number(distributor_id))||Number(distributor_id)<=0||!isDateOnly(delivery_date||'')||!Array.isArray(items)||!items.length||items.length>100||String(notes||'').length>1000) return res.status(400).json({ok:false,message:'Distributor, tanggal, catatan, dan rincian barang wajib valid (maksimal 100 barang).'});
 const conn=await pool.getConnection();
 try{await conn.beginTransaction();
  const [activeDistributor]=await conn.execute<RowDataPacket[]>(`SELECT id FROM distributors WHERE id=? AND is_active=1 FOR UPDATE`,[distributor_id]);if(!activeDistributor.length)throw new Error('Distributor tidak aktif atau tidak ditemukan.');
  const [locs]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' AND is_active=1 LIMIT 1 FOR UPDATE`,[distributor_id]);
  if(!locs.length) throw new Error('Lokasi stok distributor belum tersedia.');
  const [wh]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE location_type='WAREHOUSE' AND is_active=1 ORDER BY id LIMIT 1`);
  if(!wh.length) throw new Error('Gudang utama tidak ditemukan.');
  const deliveryCode=code('KNS');
  const [h]=await conn.execute<ResultSetHeader>(`INSERT INTO consignment_deliveries (delivery_code,distributor_id,delivery_date,status,notes,created_by_user_id) VALUES (?,?,?,'POSTED',?,?)`,[deliveryCode,distributor_id,delivery_date,notes||null,req.identity!.id]);
  const deliveryId=Number(h.insertId); const seen=new Set<number>();
  for(const raw of items){const pid=Number(raw.product_id),qty=Number(raw.quantity); if(!Number.isInteger(pid)||!Number.isFinite(qty)||qty<=0||qty>1000000||Math.round(qty*1000)!==qty*1000||seen.has(pid))throw new Error('Daftar barang tidak valid atau produk ganda.');seen.add(pid);
   const [ps]=await conn.execute<RowDataPacket[]>(`SELECT id,product_name,distributor_price,purchase_cost,average_cost FROM products WHERE id=? AND is_active=1 FOR UPDATE`,[pid]);if(!ps.length)throw new Error(`Produk ${pid} tidak ditemukan.`);const p=ps[0];
   const [ss]=await conn.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0) qty FROM stock_movements WHERE product_id=?`,[Number(wh[0].id),Number(wh[0].id),pid]);
   if(Number(ss[0].qty)<qty)throw new Error(`Stok gudang ${p.product_name} tidak cukup. Tersedia ${ss[0].qty}.`);
   const cost=Number(p.average_cost||p.purchase_cost||0),price=Number(p.distributor_price||0);
   if(!Number.isFinite(price)||price<=0)throw new Error(`Harga distributor ${p.product_name} belum diatur atau bernilai nol. Perbarui harga produk sebelum membuat titipan.`);
   if(!Number.isFinite(cost)||cost<0)throw new Error(`HPP ${p.product_name} tidak valid.`);
   await conn.execute(`INSERT INTO consignment_delivery_items (delivery_id,product_id,product_name_snapshot,quantity,unit_cost_snapshot,distributor_price_snapshot) VALUES (?,?,?,?,?,?)`,[deliveryId,pid,p.product_name,qty,cost,price]);
   await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,?,'CONSIGNMENT_OUT',?,?,'CONSIGNMENT',?,?,?)`,[`${deliveryCode}-${pid}`,pid,Number(wh[0].id),Number(locs[0].id),qty,cost,deliveryId,`Titipan ke distributor ${distributor_id}`,req.identity!.id]);
  }
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'POST','CONSIGNMENT_DELIVERY',?,?)`,[req.identity!.id,deliveryId,`Titipan ${deliveryCode} ke distributor ${distributor_id}; belum merupakan penjualan`]);
  await conn.commit();return res.status(201).json({ok:true,delivery:{id:deliveryId,delivery_code:deliveryCode}});
 }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal mencatat titipan.'});}finally{conn.release();}
});

router.get('/distributor/stock',authMiddleware,distributor,async(req:AuthedRequest,res)=>{
 try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT p.id product_id,p.sku,p.product_name,p.unit,p.distributor_price, SUM(CASE WHEN sm.to_location_id=sl.id THEN sm.quantity ELSE 0 END)-SUM(CASE WHEN sm.from_location_id=sl.id THEN sm.quantity ELSE 0 END) stock_qty, (SUM(CASE WHEN sm.to_location_id=sl.id THEN sm.quantity ELSE 0 END)-SUM(CASE WHEN sm.from_location_id=sl.id THEN sm.quantity ELSE 0 END))*COALESCE(p.distributor_price,0) stock_value FROM stock_locations sl JOIN stock_movements sm ON sm.to_location_id=sl.id OR sm.from_location_id=sl.id JOIN products p ON p.id=sm.product_id WHERE sl.distributor_id=? AND sl.location_type='DISTRIBUTOR' GROUP BY p.id,p.sku,p.product_name,p.unit,p.distributor_price HAVING stock_qty>0 ORDER BY p.product_name`,[req.identity!.distributorId]);return res.json({ok:true,items:rows});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat stok titipan.'});}
});

router.post('/distributor/sales-reports',authMiddleware,distributor,async(req:AuthedRequest,res)=>{
 const {report_date,notes,items}=req.body||{};if(!isDateOnly(report_date||'')||!Array.isArray(items)||!items.length||items.length>100||String(notes||'').length>1000)return res.status(400).json({ok:false,message:'Tanggal, catatan, dan rincian penjualan wajib valid (maksimal 100 barang).'});
 const conn=await pool.getConnection();try{await conn.beginTransaction();const distId=req.identity!.distributorId!;
  const [loc]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' AND is_active=1 LIMIT 1 FOR UPDATE`,[distId]);if(!loc.length)throw new Error('Lokasi distributor tidak ditemukan.');
  const reportCode=code('LAP');const [h]=await conn.execute<ResultSetHeader>(`INSERT INTO distributor_sales_reports (report_code,distributor_id,report_date,status,notes,submitted_by_user_id) VALUES (?,?,?,'SUBMITTED',?,?)`,[reportCode,distId,report_date,notes||null,req.identity!.id]);const reportId=Number(h.insertId);const seen=new Set<number>();let reportTotal=0,reportCostTotal=0;
  for(const raw of items){const pid=Number(raw.product_id),qty=Number(raw.quantity_sold);if(!Number.isInteger(pid)||!Number.isFinite(qty)||qty<=0||qty>1000000||Math.round(qty*1000)!==qty*1000||seen.has(pid))throw new Error('Rincian barang tidak valid atau produk ganda.');seen.add(pid);
   const [pRows]=await conn.execute<RowDataPacket[]>(`SELECT id,product_name,average_cost,purchase_cost FROM products WHERE id=? AND is_active=1 FOR UPDATE`,[pid]);if(!pRows.length)throw new Error('Produk tidak ditemukan.');
   const [available]=await conn.execute<RowDataPacket[]>(`SELECT
    (COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity ELSE 0 END),0))-
      COALESCE((SELECT SUM(i.quantity_sold) FROM distributor_sales_report_items i JOIN distributor_sales_reports r ON r.id=i.report_id WHERE r.distributor_id=? AND r.status='SUBMITTED' AND i.product_id=?),0) qty,
    (COALESCE(SUM(CASE WHEN to_location_id=? THEN quantity*unit_cost ELSE 0 END),0)-COALESCE(SUM(CASE WHEN from_location_id=? THEN quantity*unit_cost ELSE 0 END),0))-
      COALESCE((SELECT SUM(i.cost_total) FROM distributor_sales_report_items i JOIN distributor_sales_reports r ON r.id=i.report_id WHERE r.distributor_id=? AND r.status='SUBMITTED' AND i.product_id=?),0) stock_value
    FROM stock_movements WHERE product_id=? AND (to_location_id=? OR from_location_id=?)`,
    [Number(loc[0].id),Number(loc[0].id),distId,pid,Number(loc[0].id),Number(loc[0].id),distId,pid,pid,Number(loc[0].id),Number(loc[0].id)]);
   if(Number(available[0].qty)<qty)throw new Error(`Jumlah terjual melebihi stok titipan ${pRows[0].product_name}.`);
   const [costRows]=await conn.execute<RowDataPacket[]>(`SELECT unit_cost_snapshot,distributor_price_snapshot FROM consignment_delivery_items cdi JOIN consignment_deliveries cd ON cd.id=cdi.delivery_id WHERE cd.distributor_id=? AND cdi.product_id=? ORDER BY cd.id DESC LIMIT 1`,[distId,pid]);if(!costRows.length)throw new Error('Produk ini tidak pernah dititipkan kepada Anda.');
   const price=Number(costRows[0].distributor_price_snapshot),availableQty=Number(available[0].qty),availableValue=Number(available[0].stock_value),cost=availableQty>0?money2(availableValue/availableQty):0;
   if(!Number.isFinite(price)||price<=0)throw new Error(`Harga distributor ${pRows[0].product_name} pada data titipan masih nol/tidak valid. Hubungi pemilik untuk memperbaiki harga sebelum mengirim laporan.`);
   if(!Number.isFinite(cost)||cost<0)throw new Error(`HPP ${pRows[0].product_name} tidak valid.`);
   const line=money2(qty*price),costTotal=money2(qty*cost);reportTotal=money2(reportTotal+line);reportCostTotal=money2(reportCostTotal+costTotal);if(reportTotal>9000000000000000||reportCostTotal>9000000000000000)throw new Error('Total laporan penjualan melebihi batas nominal sistem.');
   await conn.execute(`INSERT INTO distributor_sales_report_items (report_id,product_id,product_name_snapshot,quantity_sold,unit_price_snapshot,unit_cost_snapshot,line_total,cost_total) VALUES (?,?,?,?,?,?,?,?)`,[reportId,pid,pRows[0].product_name,qty,price,cost,line,costTotal]);
  }
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'SUBMIT','DISTRIBUTOR_SALES_REPORT',?,?)`,[req.identity!.id,reportId,`Laporan penjualan ${reportCode} diajukan; total ${reportTotal}; HPP ${reportCostTotal}`]);
  await conn.commit();return res.status(201).json({ok:true,message:'Laporan dikirim dan menunggu pemeriksaan pemilik.',report:{id:reportId,report_code:reportCode,status:'SUBMITTED'}});
 }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal mengirim laporan.'});}finally{conn.release();}
});

router.get('/admin/receivables-aging',authMiddleware,ownerMiddleware,async(_req,res)=>{
 try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT r.id,r.report_code,r.invoice_code,r.report_date,r.due_date,r.distributor_id,d.distributor_name,r.sales_total,COALESCE(ret.return_total,0) return_total,COALESCE(pay.allocated_total,0) allocated_total FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id LEFT JOIN (SELECT sales_report_id,SUM(total) return_total FROM distributor_sales_returns WHERE status='POSTED' GROUP BY sales_report_id) ret ON ret.sales_report_id=r.id LEFT JOIN (SELECT a.sales_report_id,SUM(a.allocated_amount) allocated_total FROM distributor_payment_allocations a JOIN distributor_payment_submissions p ON p.id=a.payment_submission_id AND p.status='VERIFIED' GROUP BY a.sales_report_id) pay ON pay.sales_report_id=r.id WHERE r.status='APPROVED' ORDER BY r.due_date,r.report_date`);const [advances]=await pool.execute<RowDataPacket[]>(`SELECT p.distributor_id,d.distributor_name,SUM(p.unapplied_amount) unapplied_total FROM distributor_payment_submissions p JOIN distributors d ON d.id=p.distributor_id WHERE p.status='VERIFIED' AND p.unapplied_amount>0 GROUP BY p.distributor_id,d.distributor_name`);const today=new Date();today.setHours(0,0,0,0);const invoices=rows.map((r:any)=>{const due=r.due_date?new Date(`${dateOnly(r.due_date)}T00:00:00`):new Date(`${dateOnly(r.report_date)}T00:00:00`);const days=Math.max(0,Math.floor((today.getTime()-due.getTime())/86400000));const balance=Math.max(0,money2(Number(r.sales_total)-Number(r.return_total)-Number(r.allocated_total)));const bucket=days===0?'CURRENT':days<=30?'1-30':days<=60?'31-60':days<=90?'61-90':'90+';return {...r,balance,days_overdue:days,bucket}}).filter((r:any)=>r.balance>0);const summary:any={CURRENT:0,'1-30':0,'31-60':0,'61-90':0,'90+':0};for(const r of invoices)summary[r.bucket]=money2(summary[r.bucket]+r.balance);return res.json({ok:true,invoices,summary,unapplied:advances});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat aging piutang.'});}
});
router.get('/admin/sales-reports',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT r.*,d.distributor_name,COALESCE(x.sales_total,0) sales_total,COALESCE(x.cost_total,0) cost_total FROM distributor_sales_reports r JOIN distributors d ON d.id=r.distributor_id LEFT JOIN (SELECT report_id,SUM(line_total) sales_total,SUM(cost_total) cost_total FROM distributor_sales_report_items GROUP BY report_id) x ON x.report_id=r.id ORDER BY r.created_at DESC`);res.json({ok:true,reports:rows});});
router.post('/admin/sales-reports/:id/approve',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
 const dueInput=req.body?.due_date; if(dueInput!=null&&!isDateOnly(String(dueInput)))return res.status(400).json({ok:false,message:'Tanggal jatuh tempo tidak valid.'});
 const conn=await pool.getConnection();try{await conn.beginTransaction();const id=Number(req.params.id);const [rs]=await conn.execute<RowDataPacket[]>(`SELECT * FROM distributor_sales_reports WHERE id=? AND status='SUBMITTED' FOR UPDATE`,[id]);if(!rs.length)throw new Error('Laporan tidak ditemukan atau sudah diproses.');const report=rs[0];const [items]=await conn.execute<RowDataPacket[]>(`SELECT * FROM distributor_sales_report_items WHERE report_id=?`,[id]);if(!items.length)throw new Error('Laporan tidak memiliki rincian.');
  const [loc]=await conn.execute<RowDataPacket[]>(`SELECT id FROM stock_locations WHERE distributor_id=? AND location_type='DISTRIBUTOR' AND is_active=1 LIMIT 1 FOR UPDATE`,[report.distributor_id]);if(!loc.length)throw new Error('Lokasi stok distributor tidak ditemukan.');
  for(const item of items){const qty=Number(item.quantity_sold),price=Number(item.unit_price_snapshot),unitCost=Number(item.unit_cost_snapshot),line=Number(item.line_total),costLine=Number(item.cost_total);if(!Number.isFinite(qty)||qty<=0||!Number.isFinite(price)||price<=0||!Number.isFinite(line)||line<=0||Math.abs(line-money2(qty*price))>0.01)throw new Error(`Laporan tidak dapat disetujui: harga atau total penjualan ${item.product_name_snapshot} nol/tidak konsisten. Perbaiki rincian laporan terlebih dahulu.`);if(!Number.isFinite(unitCost)||unitCost<0||!Number.isFinite(costLine)||costLine<0||Math.abs(costLine-money2(qty*unitCost))>0.01)throw new Error(`Laporan tidak dapat disetujui: HPP ${item.product_name_snapshot} tidak valid atau tidak konsisten.`);}
   const sales=money2(items.reduce((s,i)=>s+Number(i.line_total),0)),cost=money2(items.reduce((s,i)=>s+Number(i.cost_total),0));if(sales<=0)throw new Error('Total penjualan laporan harus lebih besar dari nol.');const ar=await accountId(conn,'1200'),revenue=await accountId(conn,'4100'),cogs=await accountId(conn,'5100'),inventory=await accountId(conn,'1300');
  const jid=await journal(conn,dateOnly(report.report_date),'DISTRIBUTOR_SALE',id,`Penjualan distributor ${report.distributor_id} - ${report.report_code}`,[{account:ar,debit:sales,credit:0,description:'Piutang distributor'},{account:revenue,debit:0,credit:sales,description:'Penjualan distributor'},{account:cogs,debit:cost,credit:0,description:'HPP barang terjual'},{account:inventory,debit:0,credit:cost,description:'Pengurangan persediaan konsinyasi'}],req.identity!.id);
  for(const item of items)await conn.execute(`INSERT INTO stock_movements (movement_code,product_id,from_location_id,to_location_id,movement_type,quantity,unit_cost,reference_type,reference_id,note,created_by_user_id) VALUES (?,?,?,NULL,'CONSIGNMENT_SALE',?,?,'SALES_REPORT',?,?,?)`,[`${report.report_code}-${item.product_id}`,item.product_id,Number(loc[0].id),Number(item.quantity_sold),Number(item.unit_cost_snapshot),id,'Penjualan terverifikasi',req.identity!.id]);
  const defaultDue=new Date(`${dateOnly(report.report_date)}T00:00:00Z`);defaultDue.setUTCDate(defaultDue.getUTCDate()+1);const dueDate=dueInput?String(dueInput):defaultDue.toISOString().slice(0,10);const invoiceCode=`INV-${report.report_code}`;await conn.execute(`UPDATE distributor_sales_reports SET status='APPROVED',invoice_code=?,due_date=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP WHERE id=?`,[invoiceCode,dueDate,req.identity!.id,id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'APPROVE','DISTRIBUTOR_SALES_REPORT',?,?)`,[req.identity!.id,id,`Laporan disetujui; jurnal ${jid}`]);await conn.commit();return res.json({ok:true,message:'Laporan disetujui, stok titipan berkurang dan jurnal penjualan/HPP terbentuk.',journal_id:jid});
 }catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal menyetujui laporan.'});}finally{conn.release();}
});

router.post('/admin/sales-reports/:id/reject',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{
 const reason=String(req.body?.reason||'').trim();
 if(!reason)return res.status(400).json({ok:false,message:'Alasan penolakan laporan wajib diisi.'});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const id=Number(req.params.id);
  if(!Number.isInteger(id)||id<=0)throw new Error('ID laporan tidak valid.');
  const [rows]=await conn.execute<RowDataPacket[]>(`SELECT id FROM distributor_sales_reports WHERE id=? AND status='SUBMITTED' FOR UPDATE`,[id]);
  if(!rows.length)throw new Error('Laporan tidak ditemukan atau sudah diproses.');
  await conn.execute(`UPDATE distributor_sales_reports SET status='REJECTED',reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=? WHERE id=?`,[req.identity!.id,reason,id]);
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'REJECT','DISTRIBUTOR_SALES_REPORT',?,?)`,[req.identity!.id,id,`Laporan ditolak: ${reason}`]);
  await conn.commit();
  return res.json({ok:true,message:'Laporan penjualan ditolak. Stok, piutang, dan jurnal tidak berubah.'});
 }catch(e){
  await conn.rollback();
  return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal menolak laporan.'});
 }finally{conn.release();}
});

router.post('/distributor/payments',authMiddleware,distributor,async(req:AuthedRequest,res)=>{
 const {payment_date,amount,payment_method,proof_reference,notes}=req.body||{};
 const paymentAmount=Number(amount);
 const paymentMethod=String(payment_method||'TRANSFER').toUpperCase();
 if(!isDateOnly(payment_date||'')||!Number.isFinite(paymentAmount)||paymentAmount<=0||paymentAmount>1000000000000||Math.round(paymentAmount*100)!==paymentAmount*100||!['TRANSFER','CASH','BANK'].includes(paymentMethod)||String(proof_reference||'').length>500||String(notes||'').length>1000)
  return res.status(400).json({ok:false,message:'Tanggal dan nominal pembayaran wajib benar (nominal maksimal 2 angka desimal).'});
 const conn=await pool.getConnection();
 try{
  await conn.beginTransaction();
  const distributorId=req.identity!.distributorId!;
  // Serialize balance checks for this distributor to prevent concurrent submissions exceeding receivables.
  const [locked]=await conn.execute<RowDataPacket[]>(`SELECT id FROM distributors WHERE id=? AND is_active=1 FOR UPDATE`,[distributorId]);
  if(!locked.length)throw new Error('Distributor tidak aktif atau tidak ditemukan.');
  // Overpayment is allowed; verification allocates against invoices and records any remainder as unapplied customer advance.
  const paymentCode=code('BYR');
  const [r]=await conn.execute<ResultSetHeader>(`INSERT INTO distributor_payment_submissions (submission_code,distributor_id,payment_date,amount,payment_method,proof_reference,notes,status,submitted_by_user_id) VALUES (?,?,?,?,?,?,?,'PENDING',?)`,[paymentCode,distributorId,payment_date,money2(paymentAmount),paymentMethod,proof_reference||null,notes||null,req.identity!.id]);
  await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'SUBMIT','DISTRIBUTOR_PAYMENT',?,?)`,[req.identity!.id,r.insertId,`Pembayaran ${paymentCode} diajukan; nominal ${money2(paymentAmount)}; metode ${paymentMethod}`]);
  await conn.commit();
  return res.status(201).json({ok:true,message:'Bukti pembayaran terkirim dan menunggu verifikasi pemilik.',submission:{id:r.insertId,submission_code:paymentCode,status:'PENDING'}});
 }catch(e){
  await conn.rollback();
  return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal mengirim pembayaran.'});
 }finally{conn.release();}
});
router.get('/admin/payments',authMiddleware,ownerMiddleware,async(_req,res)=>{const [rows]=await pool.query<RowDataPacket[]>(`SELECT p.*,d.distributor_name FROM distributor_payment_submissions p JOIN distributors d ON d.id=p.distributor_id ORDER BY p.created_at DESC`);res.json({ok:true,payments:rows});});
router.post('/admin/payments/:id/verify',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{const conn=await pool.getConnection();try{await conn.beginTransaction();const [rows]=await conn.execute<RowDataPacket[]>(`SELECT * FROM distributor_payment_submissions WHERE id=? AND status='PENDING' FOR UPDATE`,[Number(req.params.id)]);if(!rows.length)throw new Error('Pembayaran tidak ditemukan atau sudah diproses.');const p=rows[0];
// Serialize verifications and submissions against the same distributor balance row.
const [distributorLock]=await conn.execute<RowDataPacket[]>(`SELECT id FROM distributors WHERE id=? AND is_active=1 FOR UPDATE`,[Number(p.distributor_id)]);
if(!distributorLock.length)throw new Error('Distributor tidak aktif atau tidak ditemukan.');
const paymentAmount=money2(Number(p.amount));
const [reportBalances]=await conn.execute<RowDataPacket[]>(`
 SELECT r.id,COALESCE(s.sales_total,0)-COALESCE(x.returned_total,0) sales_total,COALESCE(a.allocated_total,0) allocated_total
 FROM distributor_sales_reports r
 LEFT JOIN (SELECT report_id,SUM(line_total) sales_total FROM distributor_sales_report_items GROUP BY report_id) s ON s.report_id=r.id
 LEFT JOIN (SELECT sales_report_id,SUM(total) returned_total FROM distributor_sales_returns WHERE status='POSTED' GROUP BY sales_report_id) x ON x.sales_report_id=r.id
 LEFT JOIN (SELECT sales_report_id,SUM(allocated_amount) allocated_total FROM distributor_payment_allocations GROUP BY sales_report_id) a ON a.sales_report_id=r.id
 WHERE r.distributor_id=? AND r.status='APPROVED'
 ORDER BY r.report_date,r.id
 FOR UPDATE
`,[Number(p.distributor_id)]);
// Backfill only the subledger allocation of historical verified payments that predate allocation support.
const [legacyPayments]=await conn.execute<RowDataPacket[]>(`SELECT id,amount FROM distributor_payment_submissions WHERE distributor_id=? AND status='VERIFIED' ORDER BY payment_date,id FOR UPDATE`,[Number(p.distributor_id)]);
const [existingAllocations]=await conn.execute<RowDataPacket[]>(`SELECT a.payment_submission_id,SUM(a.allocated_amount) allocated_total FROM distributor_payment_allocations a JOIN distributor_payment_submissions ps ON ps.id=a.payment_submission_id WHERE ps.distributor_id=? AND ps.status='VERIFIED' GROUP BY a.payment_submission_id`,[Number(p.distributor_id)]);
for(const legacy of legacyPayments){
 let legacyRemaining=money2(Number(legacy.amount)-Number(existingAllocations.find((a:any)=>Number(a.payment_submission_id)===Number(legacy.id))?.allocated_total||0));
 if(legacyRemaining<=0)continue;
 for(const report of reportBalances){
  const due=money2(Number(report.sales_total)-Number(report.allocated_total));
  if(due<=0)continue;
  const allocated=money2(Math.min(due,legacyRemaining));
  if(allocated>0){
   await conn.execute(`INSERT INTO distributor_payment_allocations (payment_submission_id,sales_report_id,allocated_amount) VALUES (?,?,?)`,[Number(legacy.id),Number(report.id),allocated]);
   report.allocated_total=money2(Number(report.allocated_total)+allocated);
   legacyRemaining=money2(legacyRemaining-allocated);
  }
  if(legacyRemaining<=0)break;
 }
}
let remaining=paymentAmount;
const allocationRows:Array<{reportId:number;amount:number}>=[];
for(const report of reportBalances){
 const due=money2(Number(report.sales_total)-Number(report.allocated_total));
 if(due<=0) continue;
 const allocated=money2(Math.min(due,remaining));
 if(allocated>0){allocationRows.push({reportId:Number(report.id),amount:allocated});remaining=money2(remaining-allocated);}
 if(remaining<=0) break;
}
const unappliedAmount=money2(Math.max(0,remaining)),allocatedAmount=money2(paymentAmount-unappliedAmount);
for(const allocation of allocationRows){
 await conn.execute(`INSERT INTO distributor_payment_allocations (payment_submission_id,sales_report_id,allocated_amount) VALUES (?,?,?)`,[Number(p.id),allocation.reportId,allocation.amount]);
}
const cashAccountId=Number(req.body?.cash_account_id);const [cash]=await conn.execute<RowDataPacket[]>(`SELECT ca.id,ca.account_type,COALESCE(ca.ledger_account_id,a.id) ledger_id FROM cash_accounts ca LEFT JOIN accounts a ON a.account_code=IF(UPPER(ca.account_type)='BANK','1110','1100') AND a.is_active=1 WHERE ca.id=? AND ca.is_active=1 FOR UPDATE`,[cashAccountId]);if(!cash.length)throw new Error('Pilih akun kas/bank yang aktif.');const cashCode=String(cash[0].account_type).toUpperCase()==='BANK'?'1110':'1100';const debit=Number(cash[0].ledger_id||await accountId(conn,cashCode)),ar=await accountId(conn,'1200');const lines:any[]=[{account:debit,debit:Number(p.amount),credit:0,description:'Penerimaan pembayaran distributor'}];if(allocatedAmount>0)lines.push({account:ar,debit:0,credit:allocatedAmount,description:'Pengurangan piutang distributor'});if(unappliedAmount>0)lines.push({account:await accountId(conn,'2200'),debit:0,credit:unappliedAmount,description:'Uang muka distributor belum dialokasikan'});const jid=await journal(conn,dateOnly(p.payment_date),'DISTRIBUTOR_PAYMENT',Number(p.id),`Pembayaran distributor ${p.distributor_id} ${p.submission_code}`,lines,req.identity!.id);await conn.execute(`UPDATE distributor_payment_submissions SET status='VERIFIED',unapplied_amount=?,destination_cash_account_id=?,reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,journal_entry_id=? WHERE id=?`,[unappliedAmount,cashAccountId,req.identity!.id,jid,p.id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'VERIFY','DISTRIBUTOR_PAYMENT',?,?)`,[req.identity!.id,p.id,`Pembayaran diverifikasi; jurnal ${jid}`]);await conn.commit();return res.json({ok:true,message:'Pembayaran dikonfirmasi dan jurnal kas/piutang terbentuk.',journal_id:jid});}catch(e){await conn.rollback();return res.status(400).json({ok:false,message:e instanceof Error?e.message:'Gagal verifikasi pembayaran.'});}finally{conn.release();}});
router.post('/admin/payments/:id/reject',authMiddleware,ownerMiddleware,async(req:AuthedRequest,res)=>{const reason=String(req.body?.reason||'').trim(),id=Number(req.params.id);if(!reason||reason.length>1000||!Number.isInteger(id)||id<=0)return res.status(400).json({ok:false,message:'ID dan alasan penolakan yang valid wajib diisi.'});const conn=await pool.getConnection();try{await conn.beginTransaction();const [rows]=await conn.execute<RowDataPacket[]>(`SELECT id,submission_code,distributor_id FROM distributor_payment_submissions WHERE id=? AND status='PENDING' FOR UPDATE`,[id]);if(!rows.length){await conn.rollback();return res.status(404).json({ok:false,message:'Pembayaran tidak ditemukan atau sudah diproses.'});}await conn.execute(`UPDATE distributor_payment_submissions SET status='REJECTED',reviewed_by_user_id=?,reviewed_at=CURRENT_TIMESTAMP,rejection_reason=? WHERE id=?`,[req.identity!.id,reason,id]);await conn.execute(`INSERT INTO audit_logs (user_id,action,entity_type,entity_id,description) VALUES (?,'REJECT','DISTRIBUTOR_PAYMENT',?,?)`,[req.identity!.id,id,`Pembayaran ${rows[0].submission_code} ditolak: ${reason}`]);await conn.commit();return res.json({ok:true,message:'Pembayaran ditolak. Tidak ada jurnal yang dibuat.'});}catch(e){await conn.rollback();return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal menolak pembayaran.'});}finally{conn.release();}});

router.get('/admin/reports/profit-loss',authMiddleware,ownerMiddleware,async(req,res)=>{const from=String(req.query.from||'2000-01-01'),to=String(req.query.to||new Date().toISOString().slice(0,10));if(!isDateOnly(from)||!isDateOnly(to)||from>to)return res.status(400).json({ok:false,message:'Format tanggal harus YYYY-MM-DD.'});try{const [rows]=await pool.execute<RowDataPacket[]>(`SELECT a.account_code,a.account_name,a.account_type,SUM(jl.credit) total_credit,SUM(jl.debit) total_debit FROM journal_entries je JOIN journal_lines jl ON jl.journal_entry_id=je.id JOIN accounts a ON a.id=jl.account_id WHERE je.status='POSTED' AND je.journal_date BETWEEN ? AND ? AND (a.account_type IN ('REVENUE','INCOME','EXPENSE','COST') OR a.account_code IN ('4100','4200','5100','6100')) GROUP BY a.id,a.account_code,a.account_name,a.account_type ORDER BY a.account_code`,[from,to]);let revenue=0,expenses=0;const accounts=rows.map(r=>{const type=String(r.account_type).toUpperCase();const isRevenue=String(r.account_code)==='4100'||String(r.account_code)==='4200'||type==='REVENUE'||type==='INCOME';const value=isRevenue?Number(r.total_credit)-Number(r.total_debit):Number(r.total_debit)-Number(r.total_credit);if(isRevenue)revenue+=value;else expenses+=value;return {...r,net_amount:money2(value)};});return res.json({ok:true,period:{from,to},revenue:money2(revenue),expenses:money2(expenses),net_profit:money2(revenue-expenses),accounts});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal menghitung laba-rugi.'});}});

router.get('/distributor/summary',authMiddleware,distributor,async(req:AuthedRequest,res)=>{const id=req.identity!.distributorId;try{const [sales]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(i.line_total),0)-COALESCE((SELECT SUM(x.total) FROM distributor_sales_returns x WHERE x.distributor_id=? AND x.status='POSTED'),0) sales_total FROM distributor_sales_reports r JOIN distributor_sales_report_items i ON i.report_id=r.id WHERE r.distributor_id=? AND r.status='APPROVED'`,[id,id]);const [payments]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(a.allocated_amount),0) paid_total FROM distributor_payment_allocations a JOIN distributor_payment_submissions p ON p.id=a.payment_submission_id WHERE p.distributor_id=? AND p.status='VERIFIED'`,[id]);const [unapplied]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(unapplied_amount),0) unapplied_total FROM distributor_payment_submissions WHERE distributor_id=? AND status='VERIFIED'`,[id]);const [pending]=await pool.execute<RowDataPacket[]>(`SELECT COALESCE(SUM(amount),0) pending_total FROM distributor_payment_submissions WHERE distributor_id=? AND status='PENDING'`,[id]);return res.json({ok:true,sales_total:Number(sales[0].sales_total),paid_total:Number(payments[0].paid_total),unapplied_total:Number(unapplied[0].unapplied_total),pending_payment:Number(pending[0].pending_total),receivable:Number(sales[0].sales_total)-Number(payments[0].paid_total)});}catch(e){return res.status(500).json({ok:false,message:e instanceof Error?e.message:'Gagal memuat ringkasan.'});}});

export default router;
