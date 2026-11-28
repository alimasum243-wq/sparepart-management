/**
 * Pure domain helpers for synthetic prelaunch simulations.
 * They intentionally do not perform DB writes or accounting postings.
 */
export type ShortageClaimLine = { claimedQty:number; approvedQty:number; unitCost:number };
export type BankRow = { date:string; description:string; debit:number; credit:number };
export type BankCandidate = { date:string; description:string; amount:number; sourceType:string; sourceId:number };

export const validShortageDecision = (claimedQty:number, approvedQty:number, unitCost:number, chargeAmount:number) =>
  Number.isFinite(claimedQty) && claimedQty>0 && claimedQty<=1_000_000 &&
  Number.isFinite(approvedQty) && approvedQty>=0 && approvedQty<=claimedQty &&
  Number.isFinite(unitCost) && unitCost>=0 && unitCost<=1_000_000_000 &&
  Number.isFinite(chargeAmount) && chargeAmount>=0 && chargeAmount<=1_000_000_000 &&
  Math.round(claimedQty*1000)===claimedQty*1000 && Math.round(approvedQty*1000)===approvedQty*1000 &&
  Math.round(unitCost*100)===unitCost*100 && Math.round(chargeAmount*100)===chargeAmount*100 && chargeAmount<=Math.round(approvedQty*unitCost*100)/100;

export const shortageChargeCap = (approvedQty:number, unitCost:number) =>
  Math.round((approvedQty*unitCost+Number.EPSILON)*100)/100;

export const validBankBalanceSequence = (rows:Array<{debit:number;credit:number;balance:number|null}>) => {
 if(!rows.length)return false;const has=rows.some(r=>r.balance!==null);if(!has)return true;if(rows.some(r=>r.running_balance===null||!Number.isFinite(r.debit)||!Number.isFinite(r.credit)||r.debit<0||r.credit<0||r.debit>0&&r.credit>0))return false;for(let i=1;i<rows.length;i++){const expected=Math.round((Number(rows[i-1].balance)+rows[i].credit-rows[i].debit)*100)/100;if(Math.abs(expected-Number(rows[i].balance))>0.01)return false;}return true;
};

export const bankRowNet = (row:BankRow) => {
  if(!Number.isFinite(row.debit)||!Number.isFinite(row.credit)||row.debit<0||row.credit<0||row.debit>0&&row.credit>0)
    throw new Error('Statement row must have non-negative debit/credit and only one side populated.');
  return Math.round((row.credit-row.debit+Number.EPSILON)*100)/100;
};

const norm = (s:string) => s.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const scoreBankMatch = (statement:BankRow, candidate:BankCandidate, dateWindowDays=3) => {
  const net=bankRowNet(statement), amount=Math.round((candidate.amount+Number.EPSILON)*100)/100;
  if(net!==amount || !/^\d{4}-\d{2}-\d{2}$/.test(statement.date) || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) return 0;
  const days=Math.abs(Date.parse(statement.date+'T00:00:00Z')-Date.parse(candidate.date+'T00:00:00Z'))/86400000;
  if(days>dateWindowDays)return 0;
  const a=norm(statement.description),b=norm(candidate.description);
  const tokens=new Set(a.split(' ').filter(x=>x.length>=4));
  const overlap=b.split(' ').filter(x=>x.length>=4&&tokens.has(x)).length;
  return 0.65+(Math.max(0,dateWindowDays-days)/Math.max(1,dateWindowDays))*0.2+Math.min(0.15,overlap*0.05);
};

export const investorChannelContribution = (gross:number, returns:number, cogs:number, allocatedCosts:number) => {
  const vals=[gross,returns,cogs,allocatedCosts];
  if(vals.some(v=>!Number.isFinite(v)||v<0)||returns>gross)throw new Error('Invalid channel inputs.');
  const net= Math.round((gross-returns)*100)/100;
  const margin= Math.round((net-cogs-allocatedCosts)*100)/100;
  return {gross:Math.round(gross*100)/100,returns:Math.round(returns*100)/100,netRevenue:net,cogs:Math.round(cogs*100)/100,allocatedCosts:Math.round(allocatedCosts*100)/100,contribution:margin,marginPercent:net===0?0:Math.round(margin/net*10000)/100};
};
