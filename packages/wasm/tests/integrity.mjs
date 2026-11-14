import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initSync, WasmEditor } from '../pkg/gotipe_wasm.js';

initSync({ module: readFileSync(new URL('../pkg/gotipe_wasm_bg.wasm', import.meta.url)) });
const base = JSON.stringify({version:0,blocks:[{id:'a',block_type:'paragraph',attrs:{},content:{type:'RichText',value:[{text:'Ж😀я',marks:[]}]},children:[]}]});
const a = WasmEditor.withDefaultSchema(base), b = WasmEditor.withDefaultSchema(base);
const tr = steps => JSON.stringify({steps,selection:null,metadata:{}});
const blocks = editor => JSON.parse(editor.export_json()).blocks;
try {
  a.enable_collaboration('a'); b.enable_collaboration('b');
  const before = a.export_json();
  assert.throws(() => a.apply(tr([{InsertText:{block_id:'a',offset:2,text:'invalid',marks:[]}}])));
  assert.equal(a.export_json(),before);
  a.apply(tr([{InsertText:{block_id:'a',offset:3,text:'🦀',marks:[]}}]));
  b.apply(tr([{DeleteRange:{block_id:'a',from:1,to:3}}]));
  const ua=a.get_update(),ub=b.get_update();
  a.receive_update(ub);b.receive_update(ua); assert.deepEqual(blocks(a),blocks(b));
  a.apply(tr([{SplitBlock:{block_id:'a',offset:1}}]));b.receive_update(a.get_update());
  assert.deepEqual(blocks(a),blocks(b));
  assert.equal(blocks(a).map(x=>x.content.value.map(s=>s.text).join('')).join('|'),'Ж|🦀я');
  const snapshot=blocks(b);b.receive_update(a.get_update());assert.deepEqual(blocks(b),snapshot);
  console.log('WASM integrity: Unicode, atomic failure, DeleteRange, concurrent sync, split IDs, duplicate delivery passed.');
} finally { a.free();b.free(); }

const nestedBase=JSON.stringify({version:0,blocks:[
  {id:'one',block_type:'paragraph',attrs:{align:['left',null],settings:{enabled:true,values:[1,{key:'Ж😀'}]}},content:{type:'RichText',value:[{text:'Hello World',marks:[]}]},children:[]},
  {id:'two',block_type:'paragraph',attrs:{},content:{type:'RichText',value:[{text:'Second',marks:[]}]},children:[]}
]});
const nestedSchema = JSON.stringify({nodes:{paragraph:{name:'paragraph',group:['block'],content:'RichText',attrs:{align:{attr_type:'Array',required:false,default:null},settings:{attr_type:'Object',required:false,default:null}},top_level:true,marks_allowed:'All',leaf:false,allows_children:false,child_types:null}},marks:{}});
const left=new WasmEditor(nestedSchema,nestedBase),right=new WasmEditor(nestedSchema,nestedBase);
try {
  left.enable_collaboration('left');right.enable_collaboration('right');
  const selection={Range:{anchor:{block_id:'two',offset:4},head:{block_id:'one',offset:3}}};
  left.set_selection(JSON.stringify(selection));
  left.apply(tr([{InsertText:{block_id:'one',offset:5,text:'localX',marks:[]}}]));
  right.apply(tr([{InsertText:{block_id:'one',offset:5,text:'remoteY',marks:[]}}]));
  const l=left.get_update(),r=right.get_update();left.receive_update(r);right.receive_update(l);
  assert.equal(left.can_undo_collaboration(),true);left.undo_collaboration();
  assert.equal(left.export_json().includes('localX'),false);assert.equal(left.export_json().includes('remoteY'),true);
  assert.deepEqual(JSON.parse(left.export_selection()),selection);
  right.receive_update(left.get_update());assert.deepEqual(blocks(left),blocks(right));
  left.redo_collaboration();right.receive_update(left.get_update());assert.deepEqual(blocks(left),blocks(right));
  assert.deepEqual(blocks(left)[0].attrs,JSON.parse(nestedBase).blocks[0].attrs);
  const before=left.get_update();left.clear_collaboration_history();assert.deepEqual(left.get_update(),before);assert.equal(left.can_undo_collaboration(),false);
  assert.deepEqual(JSON.parse(left.detect_pii('Ж😀 mail a@example.com'))[0].start,9);
  console.log('WASM integrity: nested JSON attrs, directional selection, selective undo/redo, history clearing and UTF16 PII passed.');
} finally {left.free();right.free();}

const clockEditor=WasmEditor.withDefaultSchema(base);
try {
  clockEditor.enable_collaboration('clock-local');
  const envelope=clock=>({protocol:'gotipe.crdt/1',base:JSON.parse(base),operations:[{id:{lamport:clock,peer_id:'clock-remote'},change:{SetData:{collection:'test',key:'clock-test',value:'true'}}}]});
  const bytes=value=>new TextEncoder().encode(JSON.stringify(value));
  const initial=clockEditor.export_json();
  assert.throws(()=>clockEditor.receive_update(bytes(envelope(Number.MAX_SAFE_INTEGER+1))));
  assert.equal(clockEditor.export_json(),initial);
  clockEditor.receive_update(bytes(envelope(Number.MAX_SAFE_INTEGER-1)));
  const before=clockEditor.export_json(), log=clockEditor.get_update();
  assert.throws(()=>clockEditor.apply(tr([{InsertText:{block_id:'a',offset:0,text:'XY',marks:[]}}])),/clock exhausted/);
  assert.equal(clockEditor.export_json(),before);assert.deepEqual(clockEditor.get_update(),log);
  clockEditor.apply(tr([{InsertText:{block_id:'a',offset:0,text:'X',marks:[]}}]));
  const exhausted=clockEditor.export_json(),lastLog=clockEditor.get_update();
  const comment={id:'clock-comment',anchor:{Inline:{block_id:'a',from:0,to:1}},author:'test',content:'comment',created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',resolved_at:null,resolved_by:null,parent_id:null,reactions:[],metadata:{}};
  assert.throws(()=>clockEditor.add_comment(JSON.stringify(comment)),/clock exhausted/);
  assert.equal(clockEditor.get_comments(),'[]');assert.deepEqual(clockEditor.get_update(),lastLog);
  clockEditor.set_suggestion_mode(true);
  assert.throws(()=>clockEditor.apply(tr([{InsertText:{block_id:'a',offset:0,text:'proposal',marks:[]}}])),/clock exhausted/);
  assert.equal(clockEditor.get_suggestions(),'[]');assert.equal(clockEditor.export_json(),exhausted);
  assert.throws(()=>clockEditor.undo_collaboration(),/clock exhausted/);
  assert.equal(clockEditor.can_undo_collaboration(),true);assert.deepEqual(clockEditor.get_update(),lastLog);
  console.log('WASM integrity: safe wire clocks and atomic exhaustion across text, comments, proposals and undo passed.');
} finally { clockEditor.free(); }

const schemaEditor = WasmEditor.withDefaultSchema(base);
try {
  const invalid = JSON.parse(base); invalid.blocks[0].attrs.unknown = true;
  assert.throws(() => WasmEditor.withDefaultSchema(JSON.stringify(invalid)), /Schema validation/);
  const before = schemaEditor.export_json();
  assert.throws(() => schemaEditor.apply(tr([{InsertText:{block_id:'a',offset:0,text:'rollback',marks:[]}},{SetBlockAttrs:{block_id:'a',attrs:{unknown:true}}}])));
  assert.equal(schemaEditor.export_json(),before);
  schemaEditor.apply(tr([{AddMark:{block_id:'a',from:0,to:1,mark:{mark_type:'textColor',attrs:{color:'#1d4ed8'}}}}]));
  assert.deepEqual(JSON.parse(schemaEditor.export_json()).blocks[0].content.value[0].marks, [{mark_type:'textColor',attrs:{color:'#1d4ed8'}}]);
  // HTML, Markdown and sanitizing live in @gotipe/core; the module does not carry them.
  for (const name of ['export_html', 'export_markdown', 'sanitize_html']) assert.equal(schemaEditor[name], undefined);
  console.log('WASM integrity: strict schemas reject atomically and text color marks are kept.');
} finally { schemaEditor.free(); }

const deltaA = WasmEditor.withDefaultSchema(base), deltaB = WasmEditor.withDefaultSchema(base);
try {
  const read = bytes => JSON.parse(new TextDecoder().decode(bytes));
  assert.throws(() => deltaA.get_local_update_after(0, 0), /Collaboration not enabled/);
  deltaA.enable_collaboration('a'); deltaB.enable_collaboration('b');
  deltaA.apply(tr([{AddMark:{block_id:'a',from:0,to:1,mark:{mark_type:'italic',attrs:{}}}}]));
  deltaA.apply(tr([{AddMark:{block_id:'a',from:0,to:1,mark:{mark_type:'bold',attrs:{}}}}]));
  const first = deltaA.get_local_update_after(0, 0), full = deltaA.get_update();
  assert.equal(read(first).protocol, 'gotipe.crdt/2'); assert.equal(read(first).base, undefined);
  assert.equal(read(first).remaining, 0); assert.equal(read(first).continues, false); assert.ok(first.length < full.length);
  assert.deepEqual(read(first).operations, read(full).operations);
  for (const clock of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN])
    assert.throws(() => deltaA.get_local_update_after(clock, 0), /Invalid collaboration clock/);
  const one = read(deltaA.get_local_update_after(0, 1));
  assert.equal(one.operations.length, 1); assert.equal(one.remaining, 1);
  assert.deepEqual(read(deltaA.get_local_update_after(one.operations[0].id.lamport, 0)).operations, read(full).operations.slice(1));
  deltaB.receive_update(first);
  assert.deepEqual(blocks(deltaB), blocks(deltaA));
  assert.deepEqual(blocks(deltaB)[0].content.value[0].marks.map(mark => mark.mark_type), ['italic', 'bold']);
  assert.equal(JSON.stringify(blocks(deltaB)), JSON.stringify(blocks(deltaA)));
  const missing = read(deltaA.get_update_missing_from(deltaB.get_update()));
  assert.deepEqual(missing.operations, []); assert.equal(missing.acknowledged, 2);
  assert.throws(() => deltaA.get_update_missing_from(new TextEncoder().encode('{"protocol":"other","operations":[]}')), /Unsupported collaboration protocol/);
  console.log('WASM integrity: incremental updates, exact clocks, missing operations and replicated mark order passed.');
} finally { deltaA.free(); deltaB.free(); }

// A frame ends only after a whole transaction; a larger one is read in parts
// that a peer applies together. One part alone would not satisfy the schema.
const author = WasmEditor.withDefaultSchema(base), reader = WasmEditor.withDefaultSchema(base), bootstrap = WasmEditor.withDefaultSchema(base);
try {
  const read = bytes => JSON.parse(new TextDecoder().decode(bytes));
  author.enable_collaboration('author'); reader.enable_collaboration('reader'); bootstrap.enable_collaboration('bootstrap');
  const block = (id, block_type, attrs, text) => ({id,block_type,attrs,content:{type:'RichText',value:[{text,marks:[]}]},children:[]});
  author.apply(tr([{InsertBlock:{parent_id:null,index:1,block:block('h','heading',{level:2},'z'.repeat(40))}},
    {InsertBlock:{parent_id:null,index:2,block:{id:'i',block_type:'image',attrs:{src:'https://example.test/i.png'},content:{type:'Empty'},children:[]}}}]));
  const parts = [];
  for (let after = 0;;) {
    const part = read(author.get_local_update_after(after, 300));
    parts.push(part); after = part.operations.at(-1).id.lamport;
    if (!part.continues) break;
  }
  assert.ok(parts.length > 2); assert.equal(parts.at(-1).remaining, 0);
  const envelope = operations => new TextEncoder().encode(JSON.stringify({protocol:'gotipe.crdt/2',operations}));
  assert.throws(() => reader.receive_update(envelope(parts[0].operations)), /Schema validation/);
  reader.receive_update(envelope(parts.flatMap(part => part.operations)));
  assert.deepEqual(blocks(reader), blocks(author));
  // Stored rows out of causal order: the child row alone fails, their union does not.
  author.apply(tr([{InsertBlock:{parent_id:null,index:3,block:{id:'l',block_type:'orderedList',attrs:{},content:{type:'Empty'},children:[block('l1','listItem',{},'one')]}}}]));
  const list = read(author.get_local_update_after(parts.at(-1).operations.at(-1).id.lamport, 0));
  author.apply(tr([{InsertBlock:{parent_id:'l',index:1,block:block('l2','listItem',{},'two')}}]));
  const item = read(author.get_local_update_after(list.operations.at(-1).id.lamport, 0));
  assert.throws(() => bootstrap.receive_update(envelope(item.operations)), /TopLevelNotAllowed/);
  bootstrap.receive_update(envelope([...item.operations, ...list.operations, ...parts.flatMap(part => part.operations)]));
  assert.deepEqual(blocks(bootstrap), blocks(author));
  console.log('WASM integrity: transaction-bounded frames, continued parts and order-free stored records passed.');
} finally { author.free(); reader.free(); bootstrap.free(); }
