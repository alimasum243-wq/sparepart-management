import test from 'node:test';
import assert from 'node:assert/strict';
import { bankRowNet, scoreBankMatch, shortageChargeCap, validShortageDecision, investorChannelContribution } from '../src/audit-gap-simulation.js';

test('shortage approval is bounded by claimed quantity and charge cap',()=>{
 assert.equal(validShortageDecision(4,3,25000,75000),true);
 assert.equal(validShortageDecision(4,5,25000,125000),false);
 assert.equal(validShortageDecision(2.333,2.333,10.55,24.61),true);
 assert.equal(shortageChargeCap(3,25000),75000);
 assert.equal(validShortageDecision(2.333,2.333,10.55,24.62),false);
 assert.equal(validShortageDecision(1.2,1.1,10,11),false);
});
test('bank statement sign and candidate match rules',()=>{
 const stmt={date:'2026-11-10',description:'SETORAN DISTRIBUTOR ABC',debit:0,credit:150000};
 assert.equal(bankRowNet(stmt),150000);
 assert.ok(scoreBankMatch(stmt,{date:'2026-11-11',description:'SETORAN ABC SALES',amount:150000,sourceType:'SALES',sourceId:5},3)>0.8);
 assert.equal(scoreBankMatch(stmt,{date:'2026-11-11',description:'TRANSFER OTHER',amount:149000,sourceType:'SALES',sourceId:6},3),0);
 assert.throws(()=>bankRowNet({date:'2026-11-01',description:'bad',debit:10,credit:10}));
});
test('investor contribution handles returns and allocations consistently',()=>{
 const retail=investorChannelContribution(500000,20000,260000,45000);
 const sales=investorChannelContribution(1000000,50000,600000,100000);
 assert.deepEqual([retail.netRevenue,retail.contribution],[480000,175000]);
 assert.deepEqual([sales.netRevenue,sales.contribution],[950000,250000]);
 assert.equal(retail.contribution+sales.contribution,425000);
 assert.throws(()=>investorChannelContribution(100,120,10,0));
});
test('randomized synthetic ledger identities: 5000 trials',()=>{
 let seed=918273;
 const rand=()=>{seed=(seed*48271)%2147483647;return seed/2147483647;};
 for(let i=0;i<5000;i++){
  const gross=Math.round(rand()*1_000_000*100)/100;
  const returns=Math.round(rand()*gross*100)/100;
  const cogs=Math.round(rand()*Math.max(0,gross-returns)*100)/100;
  const costs=Math.round(rand()*100_000*100)/100;
  const r=investorChannelContribution(gross,returns,cogs,costs);
  assert.ok(Math.abs(r.netRevenue-(gross-returns))<0.011);
  assert.ok(Math.abs(r.contribution-(gross-returns-cogs-costs))<0.011);
 }
});
