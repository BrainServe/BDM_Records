import test from 'node:test';
import assert from 'node:assert/strict';
import {sectionInput, csvCell, validAmount, chunkUpdates, downloadName, parsedAmount, displayAmount} from '../src/directoryUtils.js';

test('editing sections strips database metadata rejected by the backend',()=> {
  const input=sectionInput({id:'UUID',name:'Government',recordLabel:'Institute',itemLabel:'Course',amountUnit:'₹',recordCount:123,itemCount:8});
  assert.deepEqual(input,{name:'Government',recordLabel:'Institute',itemLabel:'Course',amountUnit:'₹'});
});
test('empty/new sections receive appropriate editable defaults',()=> {
  assert.deepEqual(sectionInput(),{name:'',recordLabel:'Institute',itemLabel:'Course',amountUnit:'₹'});
  assert.equal(sectionInput({name:'Higher Education'}).name,'Higher Education');
});
test('numeric amount validation preserves blank/zero and rejects invalid amounts',()=> {
  for(const v of ['', '  ', '0', '0.00','123.45','99999999999999.99'])assert.equal(validAmount(v),true,v);
  for(const v of ['-1','1.999','1e5','abc','$90','999999999999999.99','2.','1,000'])assert.equal(validAmount(v),false,v);
});
test('CSV export escapes formulas, quotes and line-prefix attacks',()=> {
  assert.equal(csvCell('=HYPERLINK("http://attacker")'),'"\'=HYPERLINK(""http://attacker"")"');
  assert.equal(csvCell('  +cmd'),'"\'  +cmd"');
  assert.equal(csvCell('-5'),'"\'-5"');
  assert.equal(csvCell('Safe, Inc.'),'"Safe, Inc."');
  assert.equal(csvCell(200),'"200"');
});

test('bulk-edit batches never exceed the API limit and preserve order', () => {
  const updates=Array.from({length:1203},(_,i)=>i);
  const batches=chunkUpdates(updates,500);
  assert.deepEqual(batches.map(a=>a.length),[500,500,203]);
  assert.deepEqual(batches.flat(),updates);
  assert.deepEqual(chunkUpdates([]),[]);
  for(const size of [0,-1,1001,Infinity])assert.throws(()=>chunkUpdates([1],size),RangeError);
});

test('download filenames strip unsafe paths and extensions',()=> {
  assert.equal(downloadName('IT'), 'it-directory.pdf');
  assert.equal(downloadName('../../Higher Education'), 'higher-education-directory.pdf');
  assert.equal(downloadName('తెలుగు'), 'directory-directory.pdf');
});

test('decimal values are transmitted and displayed without floating point rounding',()=>{
 assert.equal(parsedAmount('99999999999999.99'),'99999999999999.99');
 assert.equal(parsedAmount(' 123.45 '),'123.45');
 assert.equal(parsedAmount(''),null);
 assert.equal(displayAmount('99999999999999.99'),'99,999,999,999,999.99');
 assert.equal(displayAmount('0.00'),'0.00');
});
