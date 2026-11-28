import test from 'node:test';
import assert from 'node:assert/strict';
import { money2, isDateOnly, hasAtMost2Decimals, hasAtMost3Decimals, outstandingAmount, netChannelAuditMetrics, auditPercentageChange, possibleCannibalizationSignal } from '../src/validation.js';

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
