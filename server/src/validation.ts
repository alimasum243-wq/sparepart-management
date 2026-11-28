export const money2 = (value:number):number => { const n=Number(value); if(!Number.isFinite(n))return n; const scaled=Math.abs(n)*100; return Math.sign(n)*Math.round(scaled+Number.EPSILON*scaled)/100; };

export const isDateOnly = (value:unknown):boolean => {
  if(typeof value!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
};

export const hasAtMost2Decimals = (value:number):boolean =>
  Number.isFinite(value)&&Math.abs(Math.round(value*100)-value*100)<1e-8;

export const hasAtMost3Decimals = (value:number):boolean =>
  Number.isFinite(value)&&Math.abs(Math.round(value*1000)-value*1000)<1e-8;

export const outstandingAmount = (total:number,paid:number,returns:number):number =>
  money2(Math.max(0,Number(total)-Number(paid)-Number(returns)));

export type ChannelAuditTotals = { units:number; revenue:number; cost:number };
export const netChannelAuditMetrics = (sold:ChannelAuditTotals,returns:ChannelAuditTotals) => {
  const units=Number(sold.units)-Number(returns.units),revenue=money2(Number(sold.revenue)-Number(returns.revenue)),cost=money2(Number(sold.cost)-Number(returns.cost));
  return {units,revenue,cost,gross_profit:money2(revenue-cost)};
};
export const auditPercentageChange = (current:number,previous:number):number|null =>
  Number.isFinite(current)&&Number.isFinite(previous)&&previous>0?money2((current-previous)/previous*100):null;
export const possibleCannibalizationSignal = (retailRevenueChange:number|null,salesRevenueChange:number|null,retailUnitsChange:number|null,salesUnitsChange:number|null,dropThreshold=20,riseThreshold=20):boolean =>
  (retailRevenueChange!==null&&salesRevenueChange!==null&&retailRevenueChange<=-dropThreshold&&salesRevenueChange>=riseThreshold)||
  (retailUnitsChange!==null&&salesUnitsChange!==null&&retailUnitsChange<=-dropThreshold&&salesUnitsChange>=riseThreshold);

export type RemittanceAuditReport = {id:number;report_code:string;distributor_id:number;distributor_name:string;report_date:string|Date;due_date?:string|Date|null;outstanding:number;allocated_total:number};
export const detectLappingRiskFlags = (reports:RemittanceAuditReport[],from:string,to:string) => {
  const groups=new Map<number,RemittanceAuditReport[]>();for(const r of reports){const key=Number(r.distributor_id);if(!groups.has(key))groups.set(key,[]);groups.get(key)!.push(r);}
  const flags:any[]=[];for(const list of groups.values()){list.sort((a,b)=>String(a.report_date).slice(0,10).localeCompare(String(b.report_date).slice(0,10))||Number(a.id)-Number(b.id));for(let i=0;i<list.length;i++){const older=list[i];if(Number(older.outstanding)<=0.01)continue;const newer=list.slice(i+1).find(n=>String(n.report_date).slice(0,10)>=from&&String(n.report_date).slice(0,10)<=to&&Number(n.allocated_total)>0.01);if(newer)flags.push({distributor_id:older.distributor_id,distributor_name:older.distributor_name,older_report_id:older.id,older_report_code:older.report_code,older_outstanding:money2(Number(older.outstanding)),older_due_date:older.due_date,newer_report_code:newer.report_code,newer_allocated:money2(Number(newer.allocated_total)),signal:'Nota lama masih memiliki saldo, sementara nota yang lebih baru sudah menerima alokasi setoran. Periksa kronologi dan bukti; bukan bukti lapping.'});}}
  return flags;
};

export const needsRetailPriceOverride = (retailPrice:number,transactionPrice:number):boolean => Number.isFinite(retailPrice)&&Number.isFinite(transactionPrice)&&retailPrice>0&&transactionPrice<retailPrice;
export const validRetailOverrideReason = (reason:unknown):boolean => typeof reason==='string'&&reason.trim().length>=10&&reason.trim().length<=500;
export const channelNetContribution = (retailGross:number,salesGross:number,retailCosts:number,salesCosts:number) => {
  const retailNet=money2(retailGross-retailCosts),salesNet=money2(salesGross-salesCosts),total=money2(retailNet+salesNet);
  return {retail_net_contribution:retailNet,sales_net_contribution:salesNet,total_net_contribution:total,retail_net_share:total>0?money2(retailNet/total*100):null,sales_net_share:total>0?money2(salesNet/total*100):null};
};
export const channelCostAllocationWithinSource = (sourceAmount:number,otherChannelAllocation:number,proposedAllocation:number):boolean => Number.isFinite(sourceAmount)&&Number.isFinite(otherChannelAllocation)&&Number.isFinite(proposedAllocation)&&sourceAmount>=0&&otherChannelAllocation>=0&&proposedAllocation>=0&&hasAtMost2Decimals(proposedAllocation)&&otherChannelAllocation+proposedAllocation<=sourceAmount+0.009;

export const salesQuantityMeetsMoq = (quantity:number,minimum:number):boolean => Number.isFinite(quantity)&&Number.isFinite(minimum)&&quantity>0&&minimum>0&&quantity+0.0000001>=minimum;
export const retailMasterPriceConfigured = (retailPrice:number):boolean => Number.isFinite(retailPrice)&&retailPrice>0;
export const expectedPhysicalStockAfterPendingReports = (ledgerStock:number,pendingReportedSales:number):number => Math.round((ledgerStock-pendingReportedSales)*1000)/1000;
export const stockOpnameVariance = (countedQuantity:number,systemQuantity:number):number => Math.round((countedQuantity-systemQuantity)*1000)/1000;
