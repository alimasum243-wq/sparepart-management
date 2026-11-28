export const money2 = (value:number):number => Math.round((Number(value)+Number.EPSILON)*100)/100;

export const isDateOnly = (value:unknown):boolean => {
  if(typeof value!=='string'||!/^(\d{4})-(\d{2})-(\d{2})$/.test(value)) return false;
  const [year,month,day]=value.split('-').map(Number);
  const date=new Date(Date.UTC(year,month-1,day));
  return date.getUTCFullYear()===year&&date.getUTCMonth()===month-1&&date.getUTCDate()===day;
};

export const hasAtMost2Decimals = (value:number):boolean =>
  Number.isFinite(value)&&Math.round(value*100)===value*100;

export const outstandingAmount = (total:number,paid:number,returns:number):number =>
  money2(Math.max(0,Number(total)-Number(paid)-Number(returns)));
