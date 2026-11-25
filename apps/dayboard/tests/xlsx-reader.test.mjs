import test from 'node:test';
import assert from 'node:assert/strict';
import {deflateRawSync} from 'node:zlib';
import {readXlsx} from '../public/xlsx-reader.mjs';

const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function zip(entries,{method=8,declaredSize=null,encrypted=false}={}){
  const local=[],central=[];let offset=0;
  for(const [path,value]of entries){
    const name=Buffer.from(path),raw=Buffer.from(value),compressed=method===8?deflateRawSync(raw):raw,crc=crc32(raw);
    const header=Buffer.alloc(30);header.writeUInt32LE(0x04034b50);header.writeUInt16LE(20,4);header.writeUInt16LE(encrypted?1:0,6);header.writeUInt16LE(method,8);header.writeUInt32LE(crc,14);header.writeUInt32LE(compressed.length,18);header.writeUInt32LE(declaredSize??raw.length,22);header.writeUInt16LE(name.length,26);
    local.push(header,name,compressed);
    const record=Buffer.alloc(46);record.writeUInt32LE(0x02014b50);record.writeUInt16LE(20,4);record.writeUInt16LE(20,6);record.writeUInt16LE(encrypted?1:0,8);record.writeUInt16LE(method,10);record.writeUInt32LE(crc,16);record.writeUInt32LE(compressed.length,20);record.writeUInt32LE(declaredSize??raw.length,24);record.writeUInt16LE(name.length,28);record.writeUInt32LE(offset,42);
    central.push(record,name);offset+=header.length+name.length+compressed.length;
  }
  const directory=Buffer.concat(central),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);end.writeUInt32LE(directory.length,12);end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,directory,end]);
}
const xml=value=>`<?xml version="1.0" encoding="UTF-8"?>${value}`;
const escape=value=>String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const inline=(ref,value)=>`<c r="${ref}" t="inlineStr"><is><t>${escape(value)}</t></is></c>`;
function workbook({sheet='',extraSheets=[],shared='',styles='',date1904=false,relationships='',contentType='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'}={}){
  const sheets=[['Tasks',sheet],...extraSheets];
  const files=[
    ['[Content_Types].xml',xml(`<Types><Override PartName="/xl/workbook.xml" ContentType="${contentType}"/></Types>`)],
    ['xl/workbook.xml',xml(`<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><workbookPr date1904="${date1904?1:0}"/><sheets>${sheets.map(([name],i)=>`<sheet name="${escape(name)}" sheetId="${i+1}" r:id="r${i}"${i?' state="hidden"':''}/>`).join('')}</sheets></workbook>`)],
    ['xl/_rels/workbook.xml.rels',xml(`<Relationships>${sheets.map((_,i)=>`<Relationship Id="r${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}${relationships}</Relationships>`)],
    ...sheets.map(([,data],i)=>[`xl/worksheets/sheet${i+1}.xml`,xml(`<worksheet><sheetData>${data}</sheetData></worksheet>`)]),
  ];
  if(shared)files.push(['xl/sharedStrings.xml',xml(`<sst>${shared}</sst>`)]);
  if(styles)files.push(['xl/styles.xml',xml(styles)]);
  return files;
}

test('reads a monday-style board with title, groups, subitems, sparse cells, and a separate updates sheet',async()=>{
  const sheet=`<row r="1">${inline('A1','Website launch')}</row><row r="3">${inline('A3','Name')}${inline('B3','Owner')}${inline('C3','Status')}${inline('D3','Date')}</row><row r="4">${inline('A4','This week')}</row><row r="5">${inline('A5','Review mobile layout')}${inline('C5','Working on it')}<c r="D5" s="1"><v>46351</v></c></row><row r="6">${inline('A6','Subitems')}</row><row r="7">${inline('A7','Check portrait view')}${inline('B7','Chris')}${inline('C7','Done')}</row>`;
  const result=await readXlsx(zip(workbook({sheet,styles:'<styleSheet><cellXfs count="2"><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>',extraSheets:[['Updates & replies',`<row r="1">${inline('A1','Item')}${inline('B1','Update')}</row><row r="2">${inline('A2','Review mobile layout')}${inline('B2','Ready <for> review & feedback')}</row>`]]})));
  assert.equal(result.sheets.length,2);
  const table=result.sheets[0];
  assert.deepEqual(table.headers,['Name','Owner','Status','Date']);
  assert.equal(table.headerRow,3);
  assert.deepEqual(table.rows[1],['Review mobile layout','','Working on it','2026-11-25']);
  assert.equal(table.rows[2][0],'Subitems');
  assert.deepEqual(table.matrix[1],[]);
  assert.equal(result.sheets[1].rows[0][1],'Ready <for> review & feedback');
  assert.equal(result.sheets[1].hidden,true);
  assert.match(result.sheets[1].warnings.join(' '),/hidden/);
});

test('reads rich shared strings without phonetic duplication and uses cached formulas without evaluation',async()=>{
  const shared='<si><t>Name</t></si><si><r><t>Check </t></r><r><t>API &amp; UI</t></r><rPh><t>phonetic annotation</t></rPh></si>';
  const sheet='<row r="1"><c r="A1" t="s"><v>0</v></c>'+inline('B1','Estimate')+'</row><row r="2"><c r="A2" t="s"><v>1</v></c><c r="B2"><f>WEBSERVICE("https://example.invalid")</f><v>42</v></c></row><row r="3">'+inline('A3','=HYPERLINK("https://example.invalid")')+'<c r="B3"><f>1+1</f></c></row>';
  const result=await readXlsx(zip(workbook({sheet,shared})));
  assert.equal(result.sheets[0].rows[0][0],'Check API & UI');
  assert.equal(result.sheets[0].rows[0][1],'42');
  assert.equal(result.sheets[0].rows[1][0],'=HYPERLINK("https://example.invalid")');
  assert.match(result.sheets[0].warnings.join(' '),/Formulas are never run/);
  assert.match(result.sheets[0].warnings.join(' '),/no saved result/);
});

test('converts only styled date cells, supports the 1904 epoch and preserves local datetime precision',async()=>{
  const styles='<styleSheet><numFmts><numFmt numFmtId="164" formatCode="yyyy-mm-dd hh:mm"/></numFmts><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="164"/></cellXfs></styleSheet>';
  const sheet=`<row r="1">${inline('A1','Name')}${inline('B1','Due date')}${inline('C1','ID')}${inline('D1','Start date')}</row><row r="2">${inline('A2','Test')}<c r="B2" s="1"><v>0</v></c><c r="C2"><v>46351</v></c><c r="D2" s="2"><v>1.5</v></c></row>`;
  const result=await readXlsx(zip(workbook({sheet,styles,date1904:true}),{method:0}));
  assert.deepEqual(result.sheets[0].rows[0],['Test','1904-01-01','46351','1904-01-02T12:00:00']);
});

test('does not normalize the fictitious Excel leap day into another deadline',async()=>{
  const sheet=`<row r="1">${inline('A1','Name')}${inline('B1','Date')}</row><row r="2">${inline('A2','Historical note')}<c r="B2" s="1"><v>60</v></c></row>`;
  const result=await readXlsx(zip(workbook({sheet,styles:'<styleSheet><cellXfs><xf numFmtId="0"/><xf numFmtId="14"/></cellXfs></styleSheet>'})));
  assert.equal(result.sheets[0].rows[0][1],'1900-02-29 (Excel date)');
  assert.match(result.sheets[0].warnings.join(' '),/nonexistent/);
});

test('rejects malformed, encrypted, oversized, and dishonest ZIP contents before importing anything',async()=>{
  await assert.rejects(readXlsx(new Uint8Array([1,2,3])),/not a readable/);
  const valid=workbook({sheet:`<row r="1">${inline('A1','Name')}</row>`});
  await assert.rejects(readXlsx(zip(valid,{encrypted:true})),/Password-protected/);
  await assert.rejects(readXlsx(zip(valid,{declaredSize:21*1024*1024})),/20 MB/);
  const tampered=zip(valid,{method:0});tampered[55]^=1;
  await assert.rejects(readXlsx(tampered),/damaged|do not match|invalid/);
  await assert.rejects(readXlsx(zip([...valid,valid[0]])),/duplicate ZIP/);
  await assert.rejects(readXlsx(zip([...valid,['../outside.xml','<xml/>']])),/invalid file name/);
  await assert.rejects(readXlsx(zip(valid,{declaredSize:1})),/import limit|length does not match/);
});

test('rejects XML entities, external sheet relationships and macro-enabled files',async()=>{
  const files=workbook();files[3][1]='<!DOCTYPE worksheet [<!ENTITY leak SYSTEM "https://example.invalid">]><worksheet/>';
  await assert.rejects(readXlsx(zip(files)),/declarations/);
  const external=workbook();external[2][1]='<Relationships><Relationship Id="r0" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="https://example.invalid/sheet.xml" TargetMode="External"/></Relationships>';
  await assert.rejects(readXlsx(zip(external)),/unsupported sheet reference/);
  await assert.rejects(readXlsx(zip(workbook({contentType:'application/vnd.ms-excel.sheet.macroEnabled.main+xml'}))),/Macro-enabled/);
});

test('rejects sparse addresses that would exceed bounded row/column allocations',async()=>{
  await assert.rejects(readXlsx(zip(workbook({sheet:`<row r="100000000">${inline('A100000000','Oops')}</row>`}))),/10,000-row/);
  await assert.rejects(readXlsx(zip(workbook({sheet:`<row r="1">${inline('ZZZ1','Oops')}</row>`}))),/worksheet column/);
});
