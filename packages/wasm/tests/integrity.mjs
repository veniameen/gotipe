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
  assert.match(schemaEditor.export_html(), /style="color:#1d4ed8"/);
  assert.match(schemaEditor.export_markdown(), /span style="color:#1d4ed8"/);
  console.log('WASM integrity: strict schemas reject atomically and text color exports preserve marks.');
} finally { schemaEditor.free(); }
