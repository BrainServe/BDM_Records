import test from 'node:test';
import assert from 'node:assert/strict';
import {paginateRows, PAGE_SIZE_OPTIONS} from '../src/pagination.js';

const makeRows=(count)=>Array.from({length:count},(_,index)=>({id:`row-${index+1}`,name:`Row ${index+1}`}));

test('pagination offers only the intended table page sizes',()=>{
 assert.deepEqual(PAGE_SIZE_OPTIONS,[10,25,50,100]);
});
test('paginates 23 records with correct boundaries and page numbers',()=>{
 const rows=makeRows(23);
 const first=paginateRows(rows,1,10);
 assert.equal(first.pageCount,3);assert.equal(first.rows.length,10);
 assert.equal(first.start,0);assert.equal(first.end,10);
 const second=paginateRows(rows,2,10);
 assert.equal(second.rows[0].id,'row-11');assert.equal(second.end,20);
 const third=paginateRows(rows,3,10);
 assert.deepEqual(third.rows.map(r=>r.id),['row-21','row-22','row-23']);
 assert.equal(third.start,20);assert.equal(third.end,23);
});
test('page count adjusts to filtered results and page size',()=>{
 assert.equal(paginateRows(makeRows(27),3,25).page,2);
 assert.equal(paginateRows(makeRows(27),2,25).rows.length,2);
 assert.equal(paginateRows(makeRows(27),1,50).pageCount,1);
 assert.equal(paginateRows(makeRows(10),1,10).pageCount,1);
});
test('page clamps correctly after deleting rows or applying a search',()=>{
 const filtered=makeRows(4);
 assert.deepEqual(paginateRows(filtered,99,10).rows,filtered);
 assert.equal(paginateRows(filtered,99,10).page,1);
 assert.equal(paginateRows(makeRows(11),3,10).page,2);
 assert.equal(paginateRows(makeRows(11),-12,10).page,1);
 assert.equal(paginateRows(makeRows(11),Number.NaN,10).page,1);
});
test('empty dataset has stable page one with zero rows',()=>{
 const p=paginateRows([],13,10);
 assert.deepEqual(p.rows,[]);assert.equal(p.page,1);assert.equal(p.pageCount,1);
 assert.equal(p.start,0);assert.equal(p.end,0);assert.equal(p.total,0);
});
test('invalid pagination input is rejected',()=>{
 assert.throws(()=>paginateRows(null,1,10),TypeError);
 assert.throws(()=>paginateRows([],1,0),RangeError);
 assert.throws(()=>paginateRows([],1,101),RangeError);
});
