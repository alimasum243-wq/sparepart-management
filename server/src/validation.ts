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
