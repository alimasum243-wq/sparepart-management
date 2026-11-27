import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  LayoutDashboard, Package, ShoppingCart, Truck, ReceiptText, Wallet,
  Users, BarChart3, Menu, X, ShieldCheck, Database, ChevronRight,
  Plus, Trash2, RefreshCw, Save, AlertCircle, CheckCircle2, LogOut, Pencil, Power, RotateCcw, History, Download
} from 'lucide-react'

const API = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? `${window.location.protocol}//${window.location.hostname}:4000` : "")
type User = { id:number; username:string; full_name?:string; role:string; distributor_id?:number|null }
type Supplier = { id:number; supplier_code?:string; supplier_name:string }
type Product = { id:number; sku:string; product_name:string; purchase_cost:string|number; distributor_price?:string|number; retail_price?:string|number; unit?:string; stock_qty?:string|number; is_active?:number }
type Location = { id:number; location_code:string; location_name:string; location_type:string }
type Item = { product_id:string; quantity:string; unit_cost:string }
type Options = { suppliers:Supplier[]; products:Product[]; locations:Location[] }
const nav = [
  {label:'Dashboard',icon:LayoutDashboard},{label:'Produk & Persediaan',icon:Package},{label:'Pembelian',icon:ShoppingCart},
  {label:'Titipan Distributor',icon:Truck},{label:'Kasir Retail',icon:ReceiptText},{label:'Penjualan',icon:ReceiptText},{label:'Utang & Piutang',icon:Users},
  {label:'Kas & Pengeluaran',icon:Wallet},{label:'Retur Barang',icon:RotateCcw},{label:'Histori Transaksi',icon:History},{label:'Laporan',icon:BarChart3}
]
const money = (n:number) => new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(Number(n)||0)
const today = () => new Date().toLocaleDateString('en-CA')
async function request(path:string, token:string, init:RequestInit={}) {
  const response = await fetch(`${API}${path}`,{...init,headers:{...(init.headers||{}),Authorization:`Bearer ${token}`,'Content-Type':'application/json'}})
  const data = await response.json().catch(()=>({ok:false,message:'Respons server tidak valid.'}))
  if(!response.ok || data.ok===false) throw new Error(data.message||'Permintaan gagal.')
  return data
}

export default function App() {
  const [token,setToken]=useState(localStorage.getItem('sparepart_token')||'')
  const [user,setUser]=useState<User|null>(null)
  const [active,setActive]=useState('Dashboard')
  const [menuOpen,setMenuOpen]=useState(false)
  const [apiStatus,setApiStatus]=useState<'checking'|'ok'|'error'>('checking')
  const [authLoading,setAuthLoading]=useState(Boolean(token))
  const [authError,setAuthError]=useState('')
  useEffect(()=>{fetch(`${API}/api/health`).then(r=>{if(!r.ok)throw new Error();return r.json()}).then(()=>setApiStatus('ok')).catch(()=>setApiStatus('error'))},[])
  useEffect(()=>{if(!token){setAuthLoading(false);return} request('/api/auth/me',token).then(d=>setUser(d.user)).catch(()=>{localStorage.removeItem('sparepart_token');setToken('');setUser(null)}).finally(()=>setAuthLoading(false))},[token])
  async function login(username:string,password:string){setAuthError('');try{const r=await fetch(`${API}/api/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username,password})});const d=await r.json();if(!r.ok||!d.ok)throw new Error(d.message||'Login gagal.');localStorage.setItem('sparepart_token',d.token);setToken(d.token);setUser(d.user)}catch(e){setAuthError(e instanceof Error?e.message:'Login gagal.')}}
  function logout(){localStorage.removeItem('sparepart_token');setToken('');setUser(null);setActive('Dashboard')}
  if(authLoading)return <div className="panel loading-panel">Memeriksa sesi masuk...</div>
  if(!token||!user)return <Login onLogin={login} error={authError} apiStatus={apiStatus}/>
  if(user.role==='DISTRIBUTOR')return <DistributorPortal token={token} user={user} onLogout={logout}/>
  return <div className="shell">
    <aside className={`sidebar ${menuOpen?'open':''}`}><div className="brand"><div className="brand-mark">HU</div><div><strong>Sparepart</strong><small>Manajemen Hj. Umiyati</small></div><button className="mobile-close" onClick={()=>setMenuOpen(false)} aria-label="Tutup menu"><X size={20}/></button></div>
      <div className="nav-caption">MENU UTAMA</div><nav>{nav.map(item=>{const Icon=item.icon;return <button key={item.label} className={`nav-item ${active===item.label?'selected':''}`} onClick={()=>{setActive(item.label);setMenuOpen(false)}}><Icon size={18}/><span>{item.label}</span>{active===item.label&&<ChevronRight size={16} className="nav-arrow"/>}</button>})}</nav>
      <div className="sidebar-bottom"><ShieldCheck size={16}/><span>Masuk sebagai pemilik</span></div></aside>
    {menuOpen&&<button className="scrim" onClick={()=>setMenuOpen(false)} aria-label="Tutup navigasi"/>}
    <main className="main"><header className="topbar"><button className="menu-toggle" onClick={()=>setMenuOpen(true)} aria-label="Buka menu"><Menu/></button><div><span className="eyebrow">SISTEM MANAJEMEN USAHA</span><h1>{active==='Dashboard'?'Panel Operasional':active}</h1></div><div className="connection"><span className={`dot ${apiStatus==='ok'?'ok':apiStatus==='error'?'error':''}`}/><span>{apiStatus==='ok'?'API terhubung':apiStatus==='error'?'API belum terhubung':'Memeriksa API'}</span></div><button className="secondary-button" onClick={logout}><LogOut size={15}/> Keluar</button></header>
      {active==='Dashboard'?<Dashboard apiStatus={apiStatus} user={user}/>:
       active==='Produk & Persediaan'?<Products token={token}/>:
       active==='Pembelian'?<Purchases token={token}/>:
       active==='Titipan Distributor'?<AdminConsignments token={token}/>:
        active==='Kasir Retail'?<RetailSales token={token}/>:
       active==='Kas & Pengeluaran'?<Expenses token={token}/>:
       active==='Retur Barang'?<Returns token={token}/>:
       active==='Histori Transaksi'?<TransactionHistory token={token}/>:
       active==='Laporan'?<ProfitLoss token={token}/>:
       active==='Penjualan'?<ReviewCenter token={token}/>:
       active==='Utang & Piutang'?<SupplierPayments token={token}/>:
       <section className="panel coming"><div className="panel-icon"><Package size={24}/></div><h2>{active}</h2><p>Modul ini masih dalam tahap implementasi. Data transaksi tidak diubah dari halaman ini.</p><span className="tag">Dalam pembangunan</span></section>}
      <footer>Sparepart Management System <span>•</span> MVP 0.3.0</footer></main></div>
}

function Login({onLogin,error,apiStatus}:{onLogin:(u:string,p:string)=>void;error:string;apiStatus:string}){
 const [username,setUsername]=useState('');const [password,setPassword]=useState('')
 return <div className="login-screen"><form className="panel login-card" onSubmit={e=>{e.preventDefault();onLogin(username,password)}}><div className="brand-mark">HU</div><span className="eyebrow">SISTEM MANAJEMEN USAHA</span><h1>Masuk ke Sparepart</h1><p>Gunakan akun pemilik atau distributor yang sudah dibuat.</p>{error&&<div className="form-alert error-alert"><AlertCircle size={17}/>{error}</div>}<label className="field">Username<input autoComplete="username" value={username} onChange={e=>setUsername(e.target.value)} required/></label><label className="field">Password<input type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button className="primary-button" type="submit">Masuk</button><small>Status server: {apiStatus==='ok'?'terhubung':apiStatus==='error'?'belum terhubung':'memeriksa'}</small></form></div>
}
function Dashboard({apiStatus,user}:{apiStatus:string;user:User}){
 const [summary,setSummary]=useState<any|null>(null);const [error,setError]=useState('');
 async function load(){try{const d=await request('/api/dashboard/summary',localStorage.getItem('sparepart_token')||'');setSummary(d);setError('')}catch(e){setError(e instanceof Error?e.message:'Ringkasan belum dapat dimuat')}}
 useEffect(()=>{load()},[]);
 const cards=[['Penjualan retail hari ini',summary?.retail_sales_today],['Pembelian bulan ini',summary?.purchases_month],['Utang pemasok tersisa',summary?.supplier_payables],['Piutang distributor tersisa',summary?.distributor_receivables],['Pengeluaran bulan ini',summary?.expenses_month]];
 return <><section className="welcome"><div><span className="eyebrow light">RINGKASAN USAHA</span><h2>Selamat datang, {user.full_name||user.username}</h2><p>Pantau persediaan, transaksi, dan pencatatan keuangan usaha.</p></div><div className="welcome-icon"><LayoutDashboard size={34}/></div></section>
 <div className="notice"><ShieldCheck size={19}/><div><strong>Kontrol transaksi aktif</strong><p>Penjualan distributor baru dibukukan setelah disetujui. Pembayaran baru masuk kas setelah diverifikasi.</p></div></div>
 <section className="section-head"><div><h2>Ringkasan keuangan</h2><p>{summary?.as_of?`Data per ${summary.as_of}`:'Mengambil data transaksi'}</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></section>
 {error&&<div className="form-alert error-alert">{error}</div>}
 <div className="status-grid">{cards.map(([label,value])=><article className="status-card" key={String(label)}><div className="status-icon blue"><Wallet/></div><div><span>{label}</span><strong>{value===undefined?'Memuat…':money(Number(value))}</strong></div></article>)}</div>
 <section className="panel next-panel"><div><span className="eyebrow">STATUS SISTEM</span><h2>Backend {apiStatus==='ok'?'terhubung':'perlu diperiksa'}</h2><p>Angka ringkasan berasal dari transaksi yang sudah tercatat. Cocokkan dengan laporan sebelum tutup buku.</p></div><div className="step-number">{apiStatus==='ok'?'✓':'!'}</div></section></>
}

function AdminConsignments({token}:{token:string}){
 const [distributors,setDistributors]=useState<any[]>([]);const [products,setProducts]=useState<Product[]>([]);const [items,setItems]=useState([{product_id:'',quantity:'1'}]);const [distributorId,setDistributorId]=useState('');const [date,setDate]=useState(today());const [notes,setNotes]=useState('');const [name,setName]=useState('');const [phone,setPhone]=useState('');const [address,setAddress]=useState('');const [username,setUsername]=useState('');const [password,setPassword]=useState('');const [message,setMessage]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false)
 async function load(){try{const [d,p]=await Promise.all([request('/api/admin/distributors',token),request('/api/admin/products',token)]);setDistributors(d.distributors||[]);setProducts(p.products||[])}catch(e){setError(e instanceof Error?e.message:'Gagal memuat data')}}
 useEffect(()=>{load()},[])
 async function create(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await request('/api/admin/distributors',token,{method:'POST',body:JSON.stringify({distributor_name:name,phone,address,username,password})});setMessage(`Akun distributor ${d.distributor.distributor_name} berhasil dibuat.`);setName('');setPhone('');setAddress('');setUsername('');setPassword('');await load()}catch(e){setError(e instanceof Error?e.message:'Gagal membuat akun')}finally{setBusy(false)}}
 async function dispatch(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await request('/api/admin/consignments',token,{method:'POST',body:JSON.stringify({distributor_id:Number(distributorId),delivery_date:date,notes,items:items.map(i=>({product_id:Number(i.product_id),quantity:Number(i.quantity)}))})});setMessage(`Titipan ${d.delivery.delivery_code} berhasil dicatat. Ini perpindahan stok, bukan penjualan.`);setItems([{product_id:'',quantity:'1'}]);setNotes('')}catch(e){setError(e instanceof Error?e.message:'Gagal mencatat titipan')}finally{setBusy(false)}}
 return <section className="purchase-page"><div className="purchase-intro"><div><span className="eyebrow">KELOLA MITRA</span><h2>Akun dan barang titipan distributor</h2><p>Buat akun distributor, lalu catat perpindahan stok dari gudang ke lokasi titipan.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></div>{error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert"><CheckCircle2 size={17}/>{message}</div>}
 <form className="panel purchase-panel" onSubmit={create}><div className="form-section-title"><span>01</span><div><h3>Buat akun distributor</h3><p>Username harus unik dan password minimal 10 karakter</p></div></div><div className="form-grid"><label className="field">Nama distributor *<input value={name} onChange={e=>setName(e.target.value)} required/></label><label className="field">Nomor telepon<input value={phone} onChange={e=>setPhone(e.target.value)}/></label><label className="field">Alamat<input value={address} onChange={e=>setAddress(e.target.value)}/></label><label className="field">Username *<input value={username} onChange={e=>setUsername(e.target.value)} required minLength={4}/></label><label className="field">Password sementara *<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required minLength={10}/></label></div><button className="primary-button" disabled={busy}>Buat akun distributor</button></form>
 <form className="panel purchase-panel" onSubmit={dispatch}><div className="form-section-title"><span>02</span><div><h3>Kirim barang titipan</h3><p>Stok tetap menjadi milik usaha sampai terjual</p></div></div><div className="form-grid"><label className="field">Distributor *<select value={distributorId} onChange={e=>setDistributorId(e.target.value)} required><option value="">Pilih distributor</option>{distributors.map(d=><option key={d.id} value={d.id}>{d.distributor_name}</option>)}</select></label><label className="field">Tanggal pengiriman *<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label className="field full-field">Catatan<input value={notes} onChange={e=>setNotes(e.target.value)}/></label></div>{items.map((it,i)=><div className="item-fields" key={i}><label className="field">Produk<select value={it.product_id} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,product_id:e.target.value}:x))} required><option value="">Pilih produk</option>{products.map(p=><option key={p.id} value={p.id}>{p.product_name} ({p.sku})</option>)}</select></label><label className="field">Jumlah<input type="number" min="1" step="1" value={it.quantity} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))} required/></label><button type="button" className="remove-button" onClick={()=>setItems(a=>a.length===1?a:a.filter((_,j)=>j!==i))}>Hapus</button></div>)}<button type="button" className="add-item-button" onClick={()=>setItems(a=>[...a,{product_id:'',quantity:'1'}])}><Plus size={15}/> Tambah produk</button><button className="primary-button" disabled={busy||!distributorId||!products.length}>Catat pengiriman titipan</button></form>
 <ReviewCenter token={token}/></section>
}

function SupplierPayments({token}:{token:string}){
 const [bills,setBills]=useState<any[]>([]);const [accounts,setAccounts]=useState<any[]>([]);
 const [supplierId,setSupplierId]=useState('');const [cashId,setCashId]=useState('');
 const [date,setDate]=useState(today());const [method,setMethod]=useState('CASH');
 const [amounts,setAmounts]=useState<Record<number,string>>({});
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){setError('');try{const [b,c]=await Promise.all([request('/api/supplier-payments/outstanding',token),request('/api/admin/cash-accounts',token)]);setBills(b.purchases||[]);setAccounts(c.accounts||[]);if(!cashId&&c.accounts?.length)setCashId(String(c.accounts[0].id));}catch(e){setError(e instanceof Error?e.message:'Gagal memuat utang pemasok.');}}
 useEffect(()=>{load()},[]);
 const suppliers=Array.from(new Map(bills.map(b=>[Number(b.supplier_id),{id:Number(b.supplier_id),name:b.supplier_name}])).values());
 const visible=bills.filter(b=>String(b.supplier_id)===supplierId);
 const total=visible.reduce((sum,b)=>sum+Math.max(0,Number(amounts[b.purchase_id])||0),0);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const allocations=visible.filter(b=>(Number(amounts[b.purchase_id])||0)>0).map(b=>({purchase_id:Number(b.purchase_id),amount:Number(amounts[b.purchase_id])}));if(!allocations.length)throw new Error('Isi nominal pembayaran pada minimal satu faktur.');const d=await request('/api/supplier-payments',token,{method:'POST',body:JSON.stringify({payment_date:date,supplier_id:Number(supplierId),cash_account_id:Number(cashId),payment_method:method,allocations})});setMessage(d.message||'Pembayaran berhasil dicatat.');setAmounts({});await load();}catch(e){setError(e instanceof Error?e.message:'Gagal mencatat pembayaran.')}finally{setBusy(false)}}
 return <section className="purchase-page"><div className="purchase-intro"><div><span className="eyebrow">UTANG PEMASOK</span><h2>Pembayaran utang & cicilan faktur</h2><p>Bayar satu atau beberapa faktur sekaligus. Sisa utang dihitung otomatis dari alokasi pembayaran.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></div>
 {error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert"><CheckCircle2 size={17}/>{message}</div>}
 <form className="panel purchase-panel" onSubmit={submit}><div className="form-grid">
 <label className="field">Pemasok *<select value={supplierId} onChange={e=>{setSupplierId(e.target.value);setAmounts({})}} required><option value="">Pilih pemasok</option>{suppliers.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
 <label className="field">Tanggal pembayaran *<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>
 <label className="field">Akun kas/bank *<select value={cashId} onChange={e=>{setCashId(e.target.value);const a=accounts.find(x=>String(x.id)===e.target.value);setMethod(String(a?.account_type||'CASH').toUpperCase()==='BANK'?'BANK':'CASH')}} required><option value="">Pilih akun</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select></label>
 </div>
 <h3>Faktur yang masih memiliki utang</h3>
 {!supplierId?<p>Pilih pemasok untuk melihat faktur yang belum lunas.</p>:visible.length===0?<p>Tidak ada utang tersisa untuk pemasok ini.</p>:visible.map(b=><div className="review-row" key={b.purchase_id}><div><strong>{b.purchase_code} — {b.supplier_invoice_no||'Tanpa nomor faktur'}</strong><small>{String(b.purchase_date).slice(0,10)} · Total {money(Number(b.grand_total))} · Sudah dibayar {money(Number(b.paid_total))} · Sisa {money(Number(b.outstanding))}</small></div><label className="field"><span>Bayar (Rp)</span><input type="number" min="0" max={Number(b.outstanding)} step="0.01" value={amounts[b.purchase_id]||''} onChange={e=>setAmounts(a=>({...a,[b.purchase_id]:e.target.value}))} placeholder="0"/></label></div>)}
 <div className="total-row"><span>Total pembayaran</span><strong>{money(total)}</strong></div>
 <button className="primary-button" disabled={busy||!supplierId||total<=0||!cashId}>Simpan pembayaran</button></form></section>
}

function ReviewCenter({token}:{token:string}){
 const [reports,setReports]=useState<any[]>([]);const [payments,setPayments]=useState<any[]>([]);const [cash,setCash]=useState<any[]>([]);const [cashId,setCashId]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('')
 async function load(){try{const [r,p,c]=await Promise.all([request('/api/admin/sales-reports',token),request('/api/admin/payments',token),request('/api/admin/cash-accounts',token)]);setReports(r.reports||[]);setPayments(p.payments||[]);setCash(c.accounts||[]);if(!cashId&&c.accounts?.length)setCashId(String(c.accounts[0].id))}catch(e){setError(e instanceof Error?e.message:'Gagal memuat laporan')}}
 useEffect(()=>{load()},[])
 async function act(path:string,body:any={}){setError('');setMessage('');try{const d=await request(path,token,{method:'POST',body:JSON.stringify(body)});setMessage(d.message||'Berhasil diproses.');await load()}catch(e){setError(e instanceof Error?e.message:'Gagal memproses')}}
 return <section className="panel purchase-panel"><div className="section-head"><div><h2>Verifikasi transaksi distributor</h2><p>Laporan penjualan dan pembayaran yang dikirim mitra</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></div>{error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert">{message}</div>}<h3>Laporan penjualan</h3>{reports.length===0?<p>Belum ada laporan penjualan.</p>:reports.map(r=><div className="review-row" key={r.id}><div><strong>{r.report_code} — {r.distributor_name}</strong><small>{String(r.report_date).slice(0,10)} · {money(Number(r.sales_total))} · Status: {r.status}</small></div>{r.status==='SUBMITTED'&&<button className="primary-button" onClick={()=>act(`/api/admin/sales-reports/${r.id}/approve`)}>Setujui</button>}</div>)}<h3>Pembayaran distributor</h3>{payments.length===0?<p>Belum ada laporan pembayaran.</p>:payments.map(p=><div className="review-row" key={p.id}><div><strong>{p.submission_code} — {p.distributor_name}</strong><small>{String(p.payment_date).slice(0,10)} · {money(Number(p.amount))} · {p.proof_reference||'Tanpa referensi'} · {p.status}</small></div>{p.status==='PENDING'&&<div className="review-actions"><select value={cashId} onChange={e=>setCashId(e.target.value)} aria-label="Akun penerimaan">{cash.map(c=><option key={c.id} value={c.id}>{c.account_name}</option>)}</select><button className="primary-button" onClick={()=>act(`/api/admin/payments/${p.id}/verify`,{cash_account_id:Number(cashId)})}>Verifikasi</button><button className="secondary-button" onClick={()=>{const reason=window.prompt('Alasan penolakan pembayaran:');if(reason?.trim())act(`/api/admin/payments/${p.id}/reject`,{reason})}}>Tolak</button></div>}</div>)}</section>
}

function RetailSales({token}:{token:string}){
 const [products,setProducts]=useState<Product[]>([]);
 const [accounts,setAccounts]=useState<any[]>([]);
 const [cashId,setCashId]=useState('');
 const [date,setDate]=useState(today());
 const [items,setItems]=useState([{product_id:'',quantity:'1',unit_price:''}]);
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){setError('');try{const d=await request('/api/retail/options',token);setProducts(d.products||[]);setAccounts(d.accounts||[]);if(!cashId&&d.accounts?.length)setCashId(String(d.accounts[0].id));}catch(e){setError(e instanceof Error?e.message:'Gagal memuat data kasir')}}
 useEffect(()=>{load()},[]);
 const total=items.reduce((sum,it)=>sum+Math.max(0,Number(it.quantity)||0)*Math.max(0,Number(it.unit_price)||0),0);
 async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await request('/api/retail/sales',token,{method:'POST',body:JSON.stringify({sale_date:date,cash_account_id:Number(cashId),items:items.map(it=>({product_id:Number(it.product_id),quantity:Number(it.quantity),unit_price:Number(it.unit_price)}))})});setMessage(`Transaksi ${d.sale.sale_code} tersimpan. Total ${money(d.sale.total)}; laba kotor ${money(d.sale.gross_profit)}.`);setItems([{product_id:'',quantity:'1',unit_price:''}]);await load()}catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan penjualan')}finally{setBusy(false)}}
 return <section className="purchase-page"><div className="purchase-intro"><div><span className="eyebrow">KASIR RETAIL</span><h2>Penjualan eceran</h2><p>Harga jual dimasukkan manual untuk setiap transaksi. Harga retail pada master produk tidak dipakai sebagai harga otomatis.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></div>
 {error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert"><CheckCircle2 size={17}/>{message}</div>}
 <form className="panel purchase-panel" onSubmit={submit}><div className="form-grid"><label className="field">Tanggal penjualan *<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label className="field">Kas / Bank penerimaan *<select value={cashId} onChange={e=>setCashId(e.target.value)} required><option value="">Pilih akun</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.account_name}</option>)}</select></label></div>
 <div className="form-section-title"><span>01</span><div><h3>Rincian barang</h3><p>Masukkan harga jual aktual untuk tiap barang pada nota ini.</p></div></div>
 {items.map((it,i)=><div className="item-fields" key={i}><label className="field">Produk *<select value={it.product_id} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,product_id:e.target.value}:x))} required><option value="">Pilih produk</option>{products.map(p=><option key={p.id} value={p.id} disabled={Number(p.stock_qty||0)<=0}>{p.product_name} — stok {Number(p.stock_qty||0).toLocaleString('id-ID')} {p.unit||'pcs'}</option>)}</select></label><label className="field">Jumlah *<input type="number" min="0.001" step="0.001" value={it.quantity} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))} required/></label><label className="field">Harga jual satuan (Rp) *<input type="number" min="1" step="1" placeholder="Isi harga transaksi" value={it.unit_price} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,unit_price:e.target.value}:x))} required/></label><div className="field"><span>Subtotal</span><strong>{money((Number(it.quantity)||0)*(Number(it.unit_price)||0))}</strong></div><button type="button" className="remove-button" onClick={()=>setItems(a=>a.length===1?a:a.filter((_,j)=>j!==i))}>Hapus</button></div>)}
 <button type="button" className="add-item-button" onClick={()=>setItems(a=>[...a,{product_id:'',quantity:'1',unit_price:''}])}><Plus size={15}/> Tambah barang</button>
 <div className="review-row"><strong>Total penjualan</strong><strong>{money(total)}</strong></div><button className="primary-button" disabled={busy||!cashId||!products.length||total<=0}>{busy?'Menyimpan transaksi...':'Simpan penjualan retail'}</button></form>
 </section>
}

function Expenses({token}:{token:string}){const [date,setDate]=useState(today());const [category,setCategory]=useState('Operasional');const [description,setDescription]=useState('');const [amount,setAmount]=useState('');const [method,setMethod]=useState('CASH');const [message,setMessage]=useState('');const [error,setError]=useState('');const [busy,setBusy]=useState(false);async function submit(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await request('/api/expenses',token,{method:'POST',body:JSON.stringify({expense_date:date,category,description,amount:Number(amount),payment_method:method})});setMessage(`${d.message} Nomor: ${d.expense_code}`);setAmount('');setDescription('')}catch(e){setError(e instanceof Error?e.message:'Gagal mencatat pengeluaran')}finally{setBusy(false)}}return <section className="panel purchase-panel"><div className="form-section-title"><span>01</span><div><h3>Catat pengeluaran usaha</h3><p>Transaksi akan membentuk jurnal beban dan mengurangi kas/bank</p></div></div>{error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert">{message}</div>}<form onSubmit={submit} className="form-grid"><label className="field">Tanggal *<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label><label className="field">Kategori *<input value={category} onChange={e=>setCategory(e.target.value)} required/></label><label className="field">Nominal *<input type="number" min="1" step="1" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label className="field">Sumber pembayaran<select value={method} onChange={e=>setMethod(e.target.value)}><option value="CASH">Kas</option><option value="BANK">Bank</option></select></label><label className="field full-field">Keterangan<input value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="primary-button" disabled={busy}>{busy?'Menyimpan...':'Simpan pengeluaran'}</button></form></section>}

function Returns({token}:{token:string}){
 const [data,setData]=useState<any>({purchase_items:[],sale_items:[],distributor_sale_items:[]});
 const [mode,setMode]=useState<'PURCHASE'|'SALE'|'DISTRIBUTOR'>('PURCHASE');
 const [sourceId,setSourceId]=useState('');const [lines,setLines]=useState([{item_id:'',quantity:'1'}]);
 const [date,setDate]=useState(today());const [notes,setNotes]=useState('');
 const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false);
 async function load(){try{const d=await request('/api/returns/options',token);setData(d);setError('')}catch(e){setError(e instanceof Error?e.message:'Gagal memuat data retur')}}
 useEffect(()=>{load()},[]);
 const rows=mode==='PURCHASE'?data.purchase_items:mode==='SALE'?data.sale_items:data.distributor_sale_items;
 const sources=Array.from(new Map(rows.map((r:any)=>[Number(mode==='PURCHASE'?r.id:mode==='SALE'?r.sale_id:r.report_id),{id:Number(mode==='PURCHASE'?r.id:mode==='SALE'?r.sale_id:r.report_id),label:mode==='PURCHASE'?r.purchase_code:mode==='SALE'?r.sale_code:(r.report_code+' — '+r.distributor_name)}])).values());
 const selected=rows.filter((r:any)=>String(mode==='PURCHASE'?r.id:mode==='SALE'?r.sale_id:r.report_id)===sourceId);
 const getItemId=(r:any)=>String(mode==='PURCHASE'?r.purchase_item_id:mode==='SALE'?r.sale_item_id:r.report_item_id);
 const lineDetails=lines.map(line=>({line,chosen:selected.find((r:any)=>getItemId(r)===line.item_id)}));
 const total=lineDetails.reduce((sum,x)=>sum+(Number(x.line.quantity)||0)*Number((mode==='PURCHASE'?x.chosen?.unit_cost:x.chosen?.unit_price)||0),0);
 async function submit(e:FormEvent){e.preventDefault();const valid=lineDetails.filter(x=>x.chosen&&Number(x.line.quantity)>0);if(!valid.length||valid.length!==lines.length)return;setBusy(true);setError('');setMessage('');try{
  const path=mode==='PURCHASE'?'/api/returns/purchase':mode==='SALE'?'/api/returns/retail-sale':'/api/returns/distributor-sale';
  const items=valid.map(x=>mode==='PURCHASE'?{purchase_item_id:Number(x.line.item_id),quantity:Number(x.line.quantity)}:mode==='SALE'?{retail_sale_item_id:Number(x.line.item_id),quantity:Number(x.line.quantity)}:{sales_report_item_id:Number(x.line.item_id),quantity:Number(x.line.quantity)});
  const payload=mode==='PURCHASE'?{purchase_id:Number(sourceId),return_date:date,notes,items}:mode==='SALE'?{sale_id:Number(sourceId),return_date:date,notes,items}:{sales_report_id:Number(sourceId),return_date:date,notes,items};
  const d=await request(path,token,{method:'POST',body:JSON.stringify(payload)});
  setMessage(mode==='PURCHASE'?d.message+' Nilai retur '+money(Number(d.return.total)):d.message+' Nilai retur '+money(Number(d.return.refund_total)));
  setLines([{item_id:'',quantity:'1'}]);setNotes('');await load();
 }catch(e){setError(e instanceof Error?e.message:'Retur gagal dicatat')}finally{setBusy(false)}}
 return <section className="purchase-page"><div className="purchase-intro"><div><span className="eyebrow">RETUR BARANG</span><h2>Retur pembelian dan penjualan</h2><p>Retur memperbarui stok gudang atau stok distributor, saldo piutang/utang, dan jurnal secara bersamaan. Satu retur dapat memuat beberapa jenis barang.</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></div>
 {error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert"><CheckCircle2 size={17}/>{message}</div>}
 <form className="panel purchase-panel" onSubmit={submit}><div className="form-grid">
 <label className="field">Jenis retur<select value={mode} onChange={e=>{setMode(e.target.value as any);setSourceId('');setLines([{item_id:'',quantity:'1'}])}}><option value="PURCHASE">Retur pembelian ke pemasok</option><option value="SALE">Retur penjualan retail dari pelanggan</option><option value="DISTRIBUTOR">Retur penjualan distributor</option></select></label>
 <label className="field">Nomor transaksi asal *<select value={sourceId} onChange={e=>{setSourceId(e.target.value);setLines([{item_id:'',quantity:'1'}])}} required><option value="">Pilih transaksi</option>{sources.map((x:any)=><option key={x.id} value={x.id}>{x.label}</option>)}</select></label>
 <label className="field">Tanggal retur *<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label></div>
 <h3>Barang yang diretur</h3>
 {lineDetails.map(({line,chosen},i)=><div className="item-fields" key={i}><label className="field">Produk *<select value={line.item_id} onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,item_id:e.target.value}:x))} required><option value="">Pilih barang</option>{selected.map((x:any)=><option key={getItemId(x)} value={getItemId(x)} disabled={lines.some((l,j)=>j!==i&&l.item_id===getItemId(x))}>{x.product_name_snapshot} — sisa {Number(x.remaining_qty).toLocaleString('id-ID')}</option>)}</select></label>
 <label className="field">Jumlah *<input type="number" min="0.001" max={chosen?Number(chosen.remaining_qty):undefined} step="0.001" value={line.quantity} onChange={e=>setLines(a=>a.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))} required/></label>
 <div className="field"><span>Nilai</span><strong>{chosen?money(Number(line.quantity||0)*Number(mode==='PURCHASE'?chosen.unit_cost:chosen.unit_price)):money(0)}</strong></div>
 <button type="button" className="remove-button" onClick={()=>setLines(a=>a.length===1?a:a.filter((_,j)=>j!==i))}>Hapus</button></div>)}
 <button type="button" className="add-item-button" onClick={()=>setLines(a=>[...a,{item_id:'',quantity:'1'}])}><Plus size={15}/> Tambah barang</button>
 <label className="field">Catatan<input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Alasan/kondisi barang"/></label>
 <div className="review-row"><strong>Total nilai retur</strong><strong>{money(total)}</strong></div>
 <button className="primary-button" disabled={busy||!sourceId||!lineDetails.every(x=>x.chosen&&Number(x.line.quantity)>0&&Number(x.line.quantity)<=Number(x.chosen.remaining_qty))||total<=0}>{busy?'Menyimpan retur...':'Simpan retur'}</button></form></section>
}

function TransactionHistory({token}:{token:string}){
 const [from,setFrom]=useState(new Date(new Date().getFullYear(),0,1).toLocaleDateString('en-CA'));const [to,setTo]=useState(today());
 const [rows,setRows]=useState<any[]>([]);const [error,setError]=useState('');
 async function load(){setError('');try{const d=await request(`/api/transactions/history?from=${from}&to=${to}`,token);setRows(d.transactions||[])}catch(e){setError(e instanceof Error?e.message:'Gagal memuat histori')}}
 useEffect(()=>{load()},[]);
 function exportCsv(){const header=['Tanggal','Nomor','Jenis','Pihak','Nominal','Status','Keterangan'];const lines=[header,...rows.map(r=>[r.transaction_date,r.transaction_code,r.transaction_type,r.party_name,r.amount,r.status,r.description||''])];const csv='\\uFEFF'+lines.map(line=>line.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\\r\\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`histori-transaksi-${from}-${to}.csv`;a.click();URL.revokeObjectURL(url)}
 return <section className="panel purchase-panel"><div className="section-head"><div><span className="eyebrow">BUKU TRANSAKSI</span><h2>Histori transaksi</h2><p>Pembelian, penjualan retail, retur, pembayaran pemasok, dan pengeluaran.</p></div><button className="secondary-button" onClick={exportCsv} disabled={!rows.length}><Download size={15}/> Ekspor CSV</button></div>
 <div className="form-grid"><label className="field">Dari tanggal<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field">Sampai tanggal<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="primary-button" onClick={load}>Tampilkan</button></div>
 {error&&<div className="form-alert error-alert">{error}</div>}<p>{rows.length} transaksi ditemukan (maksimal 1.000 baris).</p>
 <div className="table-wrap"><table><thead><tr><th>Tanggal</th><th>Nomor</th><th>Jenis</th><th>Pihak</th><th>Nominal</th><th>Status</th></tr></thead><tbody>{rows.map((r,i)=><tr key={r.transaction_code+'-'+i}><td>{String(r.transaction_date).slice(0,10)}</td><td>{r.transaction_code}</td><td>{r.transaction_type}</td><td>{r.party_name||'-'}</td><td>{money(Number(r.amount))}</td><td>{r.status}</td></tr>)}</tbody></table></div>
 </section>
}

function ProfitLoss({token}:{token:string}){
 const [from,setFrom]=useState(`${new Date().getFullYear()}-01-01`);const [to,setTo]=useState(today());const [data,setData]=useState<any>(null);const [ops,setOps]=useState<any>(null);const [error,setError]=useState('');
 async function load(){setError('');try{const [pl,op]=await Promise.all([request(`/api/admin/reports/profit-loss?from=${from}&to=${to}`,token),request(`/api/reports/operational?from=${from}&to=${to}`,token)]);setData(pl);setOps(op)}catch(e){setError(e instanceof Error?e.message:'Gagal mengambil laporan')}}
 useEffect(()=>{load()},[]);
 function exportCsv(){if(!data||!ops)return;const lines:any[]=[['LAPORAN SPAREPART MANAGEMENT',from,to],[],['LABA RUGI'],['Akun','Nilai'],['Pendapatan',data.revenue],['Beban dan HPP',data.expenses],['Laba / Rugi',data.net_profit],[],['RINGKASAN TRANSAKSI'],['Jenis','Jumlah transaksi','Total nominal'],...(ops.transactions||[]).map((r:any)=>[r.transaction_type,r.transaction_count,r.total_amount]),[],['BUKU BESAR'],['Kode akun','Nama akun','Debit','Kredit','Saldo debit'],...(ops.ledger||[]).map((r:any)=>[r.account_code,r.account_name,r.debit_total,r.credit_total,r.net_debit])];const csv='\\uFEFF'+lines.map(line=>line.map((v:any)=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\\r\\n');const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'}));const a=document.createElement('a');a.href=url;a.download=`laporan-keuangan-${from}-${to}.csv`;a.click();URL.revokeObjectURL(url)}
 return <section className="panel purchase-panel"><div className="section-head"><div><span className="eyebrow">LAPORAN USAHA</span><h2>Laba-rugi dan laporan operasional</h2><p>Jurnal, retur, transaksi, dan ringkasan buku besar berdasarkan periode.</p></div><button className="secondary-button" onClick={exportCsv} disabled={!data||!ops}><Download size={15}/> Ekspor CSV</button></div>
 <div className="form-grid"><label className="field">Dari tanggal<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label><label className="field">Sampai tanggal<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label><button className="primary-button" onClick={load}>Tampilkan laporan</button></div>
 {error&&<div className="form-alert error-alert">{error}</div>}
 {data&&<><h3>Laba-rugi</h3><div className="status-grid"><article className="status-card"><div><span>Pendapatan</span><strong>{money(Number(data.revenue))}</strong></div></article><article className="status-card"><div><span>Beban dan HPP</span><strong>{money(Number(data.expenses))}</strong></div></article><article className="status-card"><div><span>Laba / (rugi)</span><strong>{money(Number(data.net_profit))}</strong></div></article></div>
 <h3>Ringkasan transaksi</h3><div className="table-wrap"><table><thead><tr><th>Jenis transaksi</th><th>Jumlah</th><th>Total nominal</th></tr></thead><tbody>{(ops?.transactions||[]).map((r:any)=><tr key={r.transaction_type}><td>{r.transaction_type}</td><td>{Number(r.transaction_count).toLocaleString('id-ID')}</td><td>{money(Number(r.total_amount))}</td></tr>)}</tbody></table></div>
 <h3>Buku besar per akun</h3><div className="table-wrap"><table><thead><tr><th>Kode</th><th>Nama akun</th><th>Debit</th><th>Kredit</th><th>Saldo debit</th></tr></thead><tbody>{(ops?.ledger||[]).map((r:any)=><tr key={r.account_code}><td>{r.account_code}</td><td>{r.account_name}</td><td>{money(Number(r.debit_total))}</td><td>{money(Number(r.credit_total))}</td><td>{money(Number(r.net_debit))}</td></tr>)}</tbody></table></div>
 <div className="notice">Ekspor CSV dapat dibuka di Excel. Pastikan retur dan pembayaran telah dicatat sebelum menggunakan laporan untuk tutup buku.</div></>}</section>
}
function DistributorPortal({token,user,onLogout}:{token:string;user:User;onLogout:()=>void}){const [stock,setStock]=useState<any[]>([]);const [summary,setSummary]=useState<any>({});const [items,setItems]=useState([{product_id:'',quantity_sold:'1'}]);const [date,setDate]=useState(today());const [notes,setNotes]=useState('');const [amount,setAmount]=useState('');const [paymentDate,setPaymentDate]=useState(today());const [method,setMethod]=useState('TRANSFER');const [proof,setProof]=useState('');const [error,setError]=useState('');const [message,setMessage]=useState('');const [busy,setBusy]=useState(false)
 async function load(){try{const [s,r]=await Promise.all([request('/api/distributor/stock',token),request('/api/distributor/summary',token)]);setStock(s.items||[]);setSummary(r)}catch(e){setError(e instanceof Error?e.message:'Gagal memuat portal')}}useEffect(()=>{load()},[])
 async function sendSales(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await request('/api/distributor/sales-reports',token,{method:'POST',body:JSON.stringify({report_date:date,notes,items:items.map(i=>({product_id:Number(i.product_id),quantity_sold:Number(i.quantity_sold)}))})});setMessage(d.message);setItems([{product_id:'',quantity_sold:'1'}]);await load()}catch(e){setError(e instanceof Error?e.message:'Gagal mengirim laporan')}finally{setBusy(false)}}
 async function sendPayment(e:FormEvent){e.preventDefault();setBusy(true);setError('');setMessage('');try{const d=await request('/api/distributor/payments',token,{method:'POST',body:JSON.stringify({payment_date:paymentDate,amount:Number(amount),payment_method:method,proof_reference:proof})});setMessage(d.message);setAmount('');setProof('');await load()}catch(e){setError(e instanceof Error?e.message:'Gagal mengirim pembayaran')}finally{setBusy(false)}}
 return <div className="distributor-screen"><header className="topbar"><div><span className="eyebrow">PORTAL DISTRIBUTOR</span><h1>{user.full_name||user.username}</h1></div><button className="secondary-button" onClick={onLogout}><LogOut size={15}/> Keluar</button></header>{error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert">{message}</div>}<div className="status-grid"><article className="status-card"><div><span>Total penjualan disetujui</span><strong>{money(Number(summary.sales_total))}</strong></div></article><article className="status-card"><div><span>Pembayaran terverifikasi</span><strong>{money(Number(summary.paid_total))}</strong></div></article><article className="status-card"><div><span>Menunggu verifikasi</span><strong>{money(Number(summary.pending_payment))}</strong></div></article><article className="status-card"><div><span>Sisa piutang</span><strong>{money(Number(summary.receivable))}</strong></div></article></div><section className="panel purchase-panel"><div className="section-head"><div><h2>Stok titipan saya</h2><p>Barang yang masih tercatat berada pada Anda</p></div><button className="secondary-button" onClick={load}><RefreshCw size={15}/> Muat ulang</button></div>{stock.length===0?<p>Belum ada stok titipan tersedia.</p>:stock.map(s=><div className="review-row" key={s.product_id}><div><strong>{s.product_name}</strong><small>{s.sku}</small></div><strong>{s.stock_qty} {s.unit||'pcs'}</strong></div>)}</section><form className="panel purchase-panel" onSubmit={sendSales}><h2>Kirim laporan penjualan</h2><p>Laporan menunggu persetujuan pemilik sebelum mengurangi stok dan menjadi penjualan.</p><label className="field">Tanggal laporan<input type="date" value={date} onChange={e=>setDate(e.target.value)} required/></label>{items.map((it,i)=><div className="item-fields" key={i}><label className="field">Produk<select value={it.product_id} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,product_id:e.target.value}:x))} required><option value="">Pilih stok</option>{stock.map(s=><option key={s.product_id} value={s.product_id}>{s.product_name} — tersedia {s.stock_qty}</option>)}</select></label><label className="field">Terjual<input type="number" min="1" step="1" value={it.quantity_sold} onChange={e=>setItems(a=>a.map((x,j)=>j===i?{...x,quantity_sold:e.target.value}:x))} required/></label><button type="button" className="remove-button" onClick={()=>setItems(a=>a.length===1?a:a.filter((_,j)=>j!==i))}>Hapus</button></div>)}<button type="button" className="add-item-button" onClick={()=>setItems(a=>[...a,{product_id:'',quantity_sold:'1'}])}><Plus size={15}/> Tambah produk</button><label className="field">Catatan<input value={notes} onChange={e=>setNotes(e.target.value)}/></label><button className="primary-button" disabled={busy||!stock.length}>Kirim laporan penjualan</button></form><form className="panel purchase-panel" onSubmit={sendPayment}><h2>Laporkan pembayaran</h2><p>Pembayaran belum dianggap diterima sampai diverifikasi pemilik.</p><div className="form-grid"><label className="field">Tanggal pembayaran<input type="date" value={paymentDate} onChange={e=>setPaymentDate(e.target.value)} required/></label><label className="field">Nominal<input type="number" min="1" value={amount} onChange={e=>setAmount(e.target.value)} required/></label><label className="field">Metode<select value={method} onChange={e=>setMethod(e.target.value)}><option value="TRANSFER">Transfer</option><option value="CASH">Tunai</option><option value="OTHER">Lainnya</option></select></label><label className="field">Referensi / tautan bukti<input value={proof} onChange={e=>setProof(e.target.value)} placeholder="Nomor transaksi atau URL"/></label></div><button className="primary-button" disabled={busy}>Kirim laporan pembayaran</button></form></div>
}

function Products({token}:{token:string}) {
  const empty={sku:'',product_name:'',unit:'pcs',purchase_cost:'0',distributor_price:'0',retail_price:'0'}
  const [rows,setRows]=useState<Product[]>([]); const [loading,setLoading]=useState(true); const [saving,setSaving]=useState(false)
  const [error,setError]=useState(''); const [message,setMessage]=useState(''); const [form,setForm]=useState(empty); const [editing,setEditing]=useState<number|null>(null)
  async function load(){setLoading(true);setError('');try{const d=await request('/api/products',token);setRows(d.products||[])}catch(e){setError(e instanceof Error?e.message:'Gagal memuat produk')}finally{setLoading(false)}}
  useEffect(()=>{load()},[])
  function reset(){setForm(empty);setEditing(null)}
  async function save(e:FormEvent){e.preventDefault();setSaving(true);setError('');setMessage('');try{const body={...form,purchase_cost:Number(form.purchase_cost),distributor_price:Number(form.distributor_price),retail_price:Number(form.retail_price)};const d=await request(editing?`/api/products/${editing}`:'/api/products',token,{method:editing?'PUT':'POST',body:JSON.stringify(body)});setMessage(d.message);reset();await load()}catch(e){setError(e instanceof Error?e.message:'Gagal menyimpan produk')}finally{setSaving(false)}}
  async function toggle(p:Product){const active=Number(p.is_active)===1; if(!window.confirm(`${active?'Nonaktifkan':'Aktifkan'} produk ${p.product_name}?`))return;try{const d=await request(`/api/products/${p.id}/status`,token,{method:'PATCH',body:JSON.stringify({is_active:!active})});setMessage(d.message);await load()}catch(e){setError(e instanceof Error?e.message:'Gagal mengubah status produk')}}
  function edit(p:Product){setEditing(p.id);setForm({sku:p.sku,product_name:p.product_name,unit:p.unit||'pcs',purchase_cost:String(p.purchase_cost||0),distributor_price:String(p.distributor_price||0),retail_price:String(p.retail_price||0)});window.scrollTo({top:0,behavior:'smooth'})}
  return <section className="purchase-page">
    <div className="purchase-intro"><div><span className="eyebrow">MASTER BARANG</span><h2>Produk & Persediaan</h2><p>Tambah produk, perbarui harga, dan pantau jumlah stok gudang.</p></div><button className="secondary-button" onClick={load} disabled={loading}><RefreshCw size={15}/> Muat ulang</button></div>
    {error&&<div className="form-alert error-alert">{error}</div>}{message&&<div className="form-alert success-alert">{message}</div>}
    <form className="panel purchase-panel" onSubmit={save}><div className="form-section-title"><span>01</span><div><h3>{editing?'Ubah produk':'Tambah produk baru'}</h3><p>SKU boleh dikosongkan; sistem akan membuatkannya otomatis.</p></div></div>
      <div className="form-grid"><label className="field">Nama produk *<input value={form.product_name} onChange={e=>setForm({...form,product_name:e.target.value})} required maxLength={150}/></label><label className="field">SKU<input value={form.sku} onChange={e=>setForm({...form,sku:e.target.value})} placeholder="Otomatis jika kosong" maxLength={50}/></label><label className="field">Satuan *<input value={form.unit} onChange={e=>setForm({...form,unit:e.target.value})} required/></label><label className="field">Harga beli<input type="number" min="0" value={form.purchase_cost} onChange={e=>setForm({...form,purchase_cost:e.target.value})} required/></label><label className="field">Harga distributor<input type="number" min="0" value={form.distributor_price} onChange={e=>setForm({...form,distributor_price:e.target.value})} required/></label><label className="field">Harga ecer<input type="number" min="0" value={form.retail_price} onChange={e=>setForm({...form,retail_price:e.target.value})} required/></label></div>
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={reset}>Bersihkan</button><button className="primary-button" disabled={saving}>{saving?'Menyimpan...':editing?'Simpan perubahan':'Tambah produk'}</button></div>
    </form>
    <section className="panel purchase-panel"><div className="section-head"><div><h2>Daftar produk</h2><p>{rows.length} produk terdaftar, termasuk yang nonaktif</p></div></div>{loading?<p className="muted">Memuat produk...</p>:rows.length===0?<p className="muted">Belum ada produk. Tambahkan melalui formulir di atas.</p>:<div className="product-table-wrap"><table className="product-table"><thead><tr><th>Produk</th><th>Stok</th><th>Harga beli</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{rows.map(p=><tr key={p.id}><td><strong>{p.product_name}</strong><small>{p.sku} · {p.unit||'pcs'}</small></td><td>{Number(p.stock_qty||0).toLocaleString('id-ID')}</td><td>{money(Number(p.purchase_cost))}</td><td><span className="tag">{Number(p.is_active)===1?'Aktif':'Nonaktif'}</span></td><td><div className="product-actions"><button className="secondary-button" type="button" onClick={()=>edit(p)} disabled={Number(p.is_active)!==1}><Pencil size={14}/> Edit</button><button className="secondary-button" type="button" onClick={()=>toggle(p)}><Power size={14}/> {Number(p.is_active)===1?'Nonaktifkan':'Aktifkan'}</button></div></td></tr>)}</tbody></table></div>}</section>
  </section>
}

function Purchases({token}:{token:string}) {
  const [options, setOptions] = useState<Options>({ suppliers: [], products: [], locations: [] })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [supplierId, setSupplierId] = useState('')
  const [purchaseDate, setPurchaseDate] = useState(new Date().toISOString().slice(0, 10))
  const [invoice, setInvoice] = useState('')
  const [notes, setNotes] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<'CASH'|'CREDIT'>('CASH')
  const [supplierModalOpen, setSupplierModalOpen] = useState(false)
  const [supplierName, setSupplierName] = useState('')
  const [supplierCode, setSupplierCode] = useState('')
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [items, setItems] = useState<Item[]>([{ product_id: '', quantity: '1', unit_cost: '' }])

  async function importKakAli() {
    const confirmed=window.confirm('Impor belanja KAK ALI-2.xlsx sekarang? Sistem akan membuat pemasok/produk yang belum ada, menambah stok, dan mencatat pembayaran tunai Rp37.335.000. Jangan jalankan jika transaksi ini sudah pernah dimasukkan.');
    if(!confirmed)return;
    setSaving(true);setError('');setSuccess('');
    const dateKey=purchaseDate.replaceAll('-','');
    const suppliers=[
      {supplier_name:'INDORAYA',invoice_no:`KAK-ALI-INDORAYA-${dateKey}`,items:[
        {product_name:'tatakan rinai K4',quantity:800,unit_cost:9000},
        {product_name:'tatakan rinai k6',quantity:700,unit_cost:10000},
        {product_name:'tatakan multi bulat',quantity:350,unit_cost:9000},
        {product_name:'tatakan matahri',quantity:100,unit_cost:13000},
        {product_name:'catok pngaman',quantity:100,unit_cost:6500},
        {product_name:'knop kuniz',quantity:1000,unit_cost:950},
        {product_name:'tungku todachi',quantity:200,unit_cost:9000},
        {product_name:'knop rinai abs',quantity:200,unit_cost:1300}
      ]},
      {supplier_name:'UD ADI JUWANA',invoice_no:`KAK-ALI-ADI-JUWANA-${dateKey}`,items:[
        {product_name:'burner rinnai RK super 90gr',quantity:250,unit_cost:17000},
        {product_name:'burner rinai rb B',quantity:250,unit_cost:13000},
        {product_name:'burner rk w1',quantity:250,unit_cost:13000},
        {product_name:'burner bgx tebal',quantity:150,unit_cost:28500}
      ]}
    ];
    try{const d=await request('/api/purchases/import-batch',token,{method:'POST',body:JSON.stringify({purchase_date:purchaseDate,suppliers})});setSuccess(`${d.message} Total ${money(Number(d.total))}. Nomor pembelian: ${(d.purchases||[]).map((x:any)=>x.purchase_code).join(', ')}`);await loadOptions()}
    catch(e){setError(e instanceof Error?e.message:'Gagal mengimpor belanja Excel')}
    finally{setSaving(false)}
  }

  async function loadOptions() {
    setLoading(true); setError('')
    try {
      const response = await fetch(`${API}/api/purchases/options`, { headers: { Authorization: `Bearer ${token}` } })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.message || 'Gagal mengambil data pemasok dan produk.')
      setOptions({ suppliers: data.suppliers || [], products: data.products || [], locations: data.locations || [] })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Tidak dapat terhubung ke server.')
    } finally { setLoading(false) }
  }

  useEffect(() => { loadOptions() }, [])

  const total = useMemo(() => items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0), 0), [items])
  const warehouse = options.locations.find(l => l.location_type === 'WAREHOUSE') || options.locations[0]

  function updateItem(index: number, key: keyof Item, value: string) {
    setItems(current => current.map((item, i) => {
      if (i !== index) return item
      if (key === 'product_id') {
        const product = options.products.find(p => String(p.id) === value)
        return { ...item, product_id: value, unit_cost: product ? String(product.purchase_cost ?? '') : item.unit_cost }
      }
      return { ...item, [key]: value }
    }))
  }

  function addItem() { setItems(current => [...current, { product_id: '', quantity: '1', unit_cost: '' }]) }
  function removeItem(index: number) { setItems(current => current.length === 1 ? current : current.filter((_, i) => i !== index)) }

  async function createSupplier() {
    const name = supplierName.trim()
    const code = supplierCode.trim()

    if (!name) {
      setError('Nama pemasok wajib diisi.')
      return
    }

    setSavingSupplier(true)
    setError('')

    try {
      const response = await fetch(`${API}/api/suppliers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplier_name: name,
          supplier_code: code || undefined
        })
      })

      const data = await response.json()

      if (!response.ok || !data.ok) {
        throw new Error(data.message || 'Gagal menambahkan pemasok.')
      }

      await loadOptions()
      setSupplierId(String(data.supplier.id))
      setSupplierName('')
      setSupplierCode('')
      setSupplierModalOpen(false)
      setSuccess(`Pemasok "${data.supplier.supplier_name}" berhasil ditambahkan.`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan saat menambahkan pemasok.')
    } finally {
      setSavingSupplier(false)
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(''); setSuccess('')
    if (!supplierId) { setError('Pilih pemasok terlebih dahulu.'); return }
    const validItems = items.filter(i => i.product_id && Number(i.quantity) > 0 && Number(i.unit_cost) >= 0)
    if (!validItems.length) { setError('Tambahkan minimal satu barang dengan jumlah dan harga yang benar.'); return }
    setSaving(true)
    try {
      const response = await fetch(`${API}/api/purchases`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          supplier_id: Number(supplierId), purchase_date: purchaseDate,
          supplier_invoice_no: invoice || undefined,
          notes: notes || undefined, payment_method: paymentMethod,
          items: validItems.map(i => ({ product_id: Number(i.product_id), quantity: Number(i.quantity), unit_cost: Number(i.unit_cost) }))
        })
      })
      const data = await response.json()
      if (!response.ok || !data.ok) throw new Error(data.message || data.error || 'Transaksi gagal disimpan.')
      setSuccess(`Pembelian berhasil disimpan${data.purchase?.purchase_code ? ` dengan nomor ${data.purchase.purchase_code}` : ''}. Stok masuk ke ${warehouse?.location_name || 'gudang'}.`)
      setInvoice(''); setNotes('')
      setItems([{ product_id: '', quantity: '1', unit_cost: '' }])
      await loadOptions()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan saat menyimpan transaksi.')
    } finally { setSaving(false) }
  }

  return <section className="purchase-page">
    <div className="purchase-intro">
      <div><span className="eyebrow">BARANG MASUK</span><h2>Catat pembelian dari pemasok</h2><p>Barang yang diterima akan menambah stok Gudang Sukoanyar dan memperbarui HPP rata-rata bergerak.</p></div>
      <div className="purchase-header-actions"><button className="secondary-button" type="button" onClick={importKakAli} disabled={saving}><Package size={15}/> {saving?'Mengimpor...':'Impor belanja KAK ALI'}</button><button className="secondary-button" type="button" onClick={loadOptions} disabled={loading}><RefreshCw size={15}/> Muat ulang</button></div>
    </div>

    {error && <div className="form-alert error-alert"><AlertCircle size={18}/><span>{error}</span></div>}
    {success && <div className="form-alert success-alert"><CheckCircle2 size={18}/><span>{success}</span></div>}

    {loading ? <div className="panel loading-panel">Memuat data pemasok dan produk...</div> :
    options.suppliers.length === 0 || options.products.length === 0 ?
      <div className="panel empty-state">
        <Package size={30}/>
        <h3>Data pemasok atau produk belum tersedia</h3>
        <p>Daftar pemasok atau produk belum tersedia. Tambahkan produk di menu Produk & Persediaan, atau gunakan tombol Impor belanja KAK ALI di bagian atas untuk memasukkan data Excel yang sudah diterima.</p>
        <button className="primary-button" type="button" onClick={loadOptions}><RefreshCw size={16}/> Periksa lagi</button>
      </div> :
      <form onSubmit={submit}>
        <div className="panel purchase-panel">
          <div className="form-section-title"><span>01</span><div><h3>Informasi pembelian</h3><p>Data pemasok dan dokumen pembelian</p></div></div>
          <div className="form-grid">
            <div className="field full-field">
              <div className="supplier-field-head">
                <span>Pemasok *</span>
                <button type="button" className="inline-add-button" onClick={() => { setError(''); setSupplierModalOpen(true) }}>
                  <Plus size={14}/> Tambah Pemasok
                </button>
              </div>
              <select value={supplierId} onChange={e => setSupplierId(e.target.value)} required>
                <option value="">Pilih pemasok</option>
                {options.suppliers.map(s => <option key={s.id} value={s.id}>{s.supplier_name}{s.supplier_code ? ` (${s.supplier_code})` : ''}</option>)}
              </select>
            </div>
            <label className="field">Tanggal pembelian *
              <input type="date" value={purchaseDate} onChange={e => setPurchaseDate(e.target.value)} required/>
            </label>
            <label className="field">No. faktur pemasok
              <input value={invoice} onChange={e => setInvoice(e.target.value)} placeholder="Opsional"/>
            </label>
            <label className="field">Catatan
              <input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Opsional"/>
            </label>
          </div>
          <div className="warehouse-note"><Database size={17}/><div><strong>Lokasi penerimaan: {warehouse?.location_name || 'Gudang Sukoanyar'}</strong><small>Stok pembelian otomatis masuk ke gudang utama.</small></div></div>
          <label className="field" style={{marginTop:16}}>Status pembayaran *
            <select value={paymentMethod} onChange={e=>setPaymentMethod(e.target.value as 'CASH'|'CREDIT')}>
              <option value="CASH">Lunas — dibayar tunai</option>
              <option value="CREDIT">Belum lunas — utang pemasok</option>
            </select>
          </label>
          {paymentMethod==='CASH' && <div className="cash-note"><CheckCircle2 size={17}/><div><strong>Pembayaran tunai langsung dicatat</strong><small>Kas berkurang dan transaksi pembelian tercatat lunas.</small></div></div>}
        </div>

        <div className="panel purchase-panel items-panel">
          <div className="form-section-title"><span>02</span><div><h3>Rincian barang</h3><p>Jumlah dan harga beli dapat diubah sebelum disimpan</p></div></div>
          <div className="purchase-items">
            {items.map((item, index) => {
              const product = options.products.find(p => String(p.id) === item.product_id)
              const lineTotal = (Number(item.quantity) || 0) * (Number(item.unit_cost) || 0)
              return <div className="purchase-item" key={index}>
                <div className="item-topline"><strong>Barang {index + 1}</strong><button type="button" className="remove-button" onClick={() => removeItem(index)} disabled={items.length === 1}><Trash2 size={15}/> Hapus</button></div>
                <label className="field">Nama barang *
                  <select value={item.product_id} onChange={e => updateItem(index, 'product_id', e.target.value)} required>
                    <option value="">Pilih barang</option>
                    {options.products.map(p => <option key={p.id} value={p.id}>{p.product_name} — {p.sku}</option>)}
                  </select>
                </label>
                <div className="item-fields">
                  <label className="field">Jumlah *
                    <input type="number" min="0.001" step="0.001" value={item.quantity} onChange={e => updateItem(index, 'quantity', e.target.value)} required/>
                  </label>
                  <label className="field">Harga beli / pcs *
                    <input type="number" min="0" step="1" value={item.unit_cost} onChange={e => updateItem(index, 'unit_cost', e.target.value)} required/>
                  </label>
                </div>
                {product && <div className="item-total"><span>Subtotal barang</span><strong>{money(lineTotal)}</strong></div>}
              </div>
            })}
          </div>
          <button type="button" className="add-item-button" onClick={addItem}><Plus size={16}/> Tambah barang</button>
          <div className="purchase-total"><span>Total pembelian</span><strong>{money(total)}</strong></div>
        </div>
        <div className="submit-row"><span>Periksa kembali jumlah dan harga sebelum menyimpan.</span><button className="primary-button" type="submit" disabled={saving || !supplierId || !options.products.length}><Save size={17}/>{saving ? 'Menyimpan...' : 'Simpan pembelian'}</button></div>
      </form>}
  </section>
}
