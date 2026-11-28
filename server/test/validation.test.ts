import test from 'node:test';
import assert from 'node:assert/strict';
import { money2, isDateOnly, hasAtMost2Decimals, hasAtMost3Decimals, outstandingAmount, netChannelAuditMetrics, auditPercentageChange, possibleCannibalizationSignal, detectLappingRiskFlags, needsRetailPriceOverride, validRetailOverrideReason, channelNetContribution, channelCostAllocationWithinSource, salesQuantityMeetsMoq, retailMasterPriceConfigured, expectedPhysicalStockAfterPendingReports, stockOpnameVariance, salesPriceFromStockSnapshots, rapidPrintWithinThreshold } from '../src/validation.js';

test('date validation accepts real ISO dates and rejects malformed dates',()=>{
  assert.equal(isDateOnly('2026-11-28'),true);
  assert.equal(isDateOnly('2024-02-29'),true);
  assert.equal(isDateOnly('2025-02-29'),false);
  assert.equal(isDateOnly('2026-13-01'),false);
  assert.equal(isDateOnly('28-11-2026'),false);
  assert.equal(isDateOnly(null),false);
});

test('money rounds to cents consistently',()=>{
  assert.equal(money2(1.005),1.01);
  assert.equal(money2(12.345),12.35);
  assert.equal(money2(-12.345),-12.35);
  assert.equal(money2(-1.005),-1.01);
});

test('two-decimal amount validation rejects non-finite and excess precision',()=>{
  assert.equal(hasAtMost2Decimals(10),true);
  assert.equal(hasAtMost2Decimals(10.25),true);
  assert.equal(hasAtMost2Decimals(0.1+0.2),true);
  assert.equal(hasAtMost2Decimals(10.001),false);
  assert.equal(hasAtMost2Decimals(NaN),false);
  assert.equal(hasAtMost2Decimals(Infinity),false);
});

test('quantity validation accepts up to three decimals with floating tolerance',()=>{
  assert.equal(hasAtMost3Decimals(1),true);
  assert.equal(hasAtMost3Decimals(1.125),true);
  assert.equal(hasAtMost3Decimals(0.1+0.2),true);
  assert.equal(hasAtMost3Decimals(1.0001),false);
  assert.equal(hasAtMost3Decimals(NaN),false);
});

test('outstanding amount never goes below zero and uses cents',()=>{
  assert.equal(outstandingAmount(100,25,10),65);
  assert.equal(outstandingAmount(100,110,0),0);
  assert.equal(outstandingAmount(100.005,0,0),100.01);
});


test('channel audit net metrics subtract posted returns at item level',()=>{
  const net=netChannelAuditMetrics({units:100,revenue:1000,cost:600},{units:5,revenue:50,cost:30});
  assert.deepEqual(net,{units:95,revenue:950,cost:570,gross_profit:380});
});

test('channel audit percent change avoids misleading zero-baseline percentages',()=>{
  assert.equal(auditPercentageChange(150,100),50);
  assert.equal(auditPercentageChange(0,100),-100);
  assert.equal(auditPercentageChange(50,0),null);
  assert.equal(auditPercentageChange(20,-1),null);
});

test('cannibalization signal requires paired retail drop and sales rise',()=>{
  assert.equal(possibleCannibalizationSignal(-25,30,-5,10),true);
  assert.equal(possibleCannibalizationSignal(-25,10,-25,30),true);
  assert.equal(possibleCannibalizationSignal(-25,10,-25,10),false);
  assert.equal(possibleCannibalizationSignal(null,40,-25,40),true);
});


test('lapping audit finds older unpaid note against newer allocated note within selected period',()=>{
  const flags=detectLappingRiskFlags([
    {id:1,report_code:'OLD-1',distributor_id:7,distributor_name:'Sales A',report_date:'2026-10-01',due_date:'2026-10-02',outstanding:500,allocated_total:0},
    {id:2,report_code:'NEW-2',distributor_id:7,distributor_name:'Sales A',report_date:'2026-11-10',due_date:'2026-11-11',outstanding:0,allocated_total:200},
    {id:3,report_code:'OTHER',distributor_id:8,distributor_name:'Sales B',report_date:'2026-11-10',outstanding:400,allocated_total:0}
  ],'2026-11-01','2026-11-30');
  assert.equal(flags.length,1);assert.equal(flags[0].older_report_code,'OLD-1');assert.equal(flags[0].newer_report_code,'NEW-2');
});

test('lapping audit does not flag if no newer report allocation in selected range',()=>{
  const flags=detectLappingRiskFlags([{id:1,report_code:'OLD',distributor_id:1,distributor_name:'Sales',report_date:'2026-01-01',outstanding:300,allocated_total:0},{id:2,report_code:'NEW',distributor_id:1,distributor_name:'Sales',report_date:'2026-02-01',outstanding:100,allocated_total:0}], '2026-02-01','2026-02-28');
  assert.equal(flags.length,0);
});


test('retail price floor requires auditable reason only below master price',()=>{
  assert.equal(needsRetailPriceOverride(100,100),false);
  assert.equal(needsRetailPriceOverride(100,125),false);
  assert.equal(needsRetailPriceOverride(100,99),true);
  assert.equal(needsRetailPriceOverride(0,10),false);
  assert.equal(validRetailOverrideReason('Promo clearance'),true);
  assert.equal(validRetailOverrideReason('short'),false);
  assert.equal(validRetailOverrideReason('x'.repeat(501)),false);
});


test('channel net contribution subtracts nominal allocated costs and shares only positive totals',()=>{
  assert.deepEqual(channelNetContribution(1500,2500,500,1000),{retail_net_contribution:1000,sales_net_contribution:1500,total_net_contribution:2500,retail_net_share:40,sales_net_share:60});
  assert.equal(channelNetContribution(100,100,200,100).retail_net_share,null);
});


test('channel expense allocation cannot exceed source expense amount',()=>{
  assert.equal(channelCostAllocationWithinSource(1000,400,600),true);
  assert.equal(channelCostAllocationWithinSource(1000,400,600.01),false);
  assert.equal(channelCostAllocationWithinSource(1000,400,-1),false);
  assert.equal(channelCostAllocationWithinSource(1000,400,1.001),false);
});


test('sales report quantity meets configured per-product MOQ',()=>{
  assert.equal(salesQuantityMeetsMoq(5,5),true);
  assert.equal(salesQuantityMeetsMoq(4.999,5),false);
  assert.equal(salesQuantityMeetsMoq(1,1),true);
  assert.equal(salesQuantityMeetsMoq(0,1),false);
});


test('retail sales require a positive master retail price',()=>{
  assert.equal(retailMasterPriceConfigured(1),true);
  assert.equal(retailMasterPriceConfigured(0),false);
  assert.equal(retailMasterPriceConfigured(-1),false);
  assert.equal(retailMasterPriceConfigured(NaN),false);
});


test('consignment expected physical stock subtracts submitted pending sales and preserves 3 decimals',()=>{
  assert.equal(expectedPhysicalStockAfterPendingReports(20,3.125),16.875);
  assert.equal(expectedPhysicalStockAfterPendingReports(2,5),-3);
  assert.equal(stockOpnameVariance(8,10),-2);
  assert.equal(stockOpnameVariance(10.333,10),0.333);
});


test('Sales price uses weighted delivery snapshots net of approved, returned and pending reports',()=>{
  assert.equal(salesPriceFromStockSnapshots(22000,5500,1100,1100,150),110);
  assert.equal(salesPriceFromStockSnapshots(0,0,0,0,0),0);
});


test('rapid print audit threshold is exact in seconds',()=>{
  assert.equal(rapidPrintWithinThreshold(600,10),true);
  assert.equal(rapidPrintWithinThreshold(601,10),false);
  assert.equal(rapidPrintWithinThreshold(-1,10),false);
});
