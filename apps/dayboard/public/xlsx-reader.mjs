/** Small, bounded OOXML reader. Workbook values stay in this browser. */
const MiB = 1024 * 1024;
const LIMITS = Object.freeze({file:8*MiB,expanded:20*MiB,entry:8*MiB,entries:500,sheets:30,rows:10000,columns:256,cells:100000,text:200000,nodes:500000});
const utf8 = new TextDecoder('utf-8', {fatal:true});
function bad(message){throw new TypeError(message);}

function entityText(value){
  return value.replace(/&([^;\s<&]+);/g,(_,entity)=>{
    const named={amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"};
    if(Object.hasOwn(named,entity))return named[entity];
    const match=/^#(x[\da-f]+|\d+)$/i.exec(entity);
    if(!match)bad('This workbook contains unsupported XML entities.');
    const number=match[1][0].toLowerCase()==='x'?parseInt(match[1].slice(1),16):Number(match[1]);
    if(!number||number>0x10ffff||(number>=0xd800&&number<=0xdfff))bad('This workbook contains an invalid text character.');
    return String.fromCodePoint(number);
  });
}

// A deliberately small XML event reader: no DTDs, entity declarations or fetching.
function walkXml(xml,handlers={}){
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))bad('Workbook XML declarations are not supported.');
  const stack=[];let pos=0,nodes=0,roots=0;
  const text=value=>{if(value){if(!stack.length&&value.trim())bad('Malformed workbook XML.');handlers.text?.(entityText(value));}};
  while(pos<xml.length){
    const next=xml.indexOf('<',pos);
    if(next<0){text(xml.slice(pos));break;}
    text(xml.slice(pos,next));
    if(xml.startsWith('<!--',next)){const end=xml.indexOf('-->',next+4);if(end<0)bad('Malformed workbook XML comment.');pos=end+3;continue;}
    if(xml.startsWith('<?',next)){const end=xml.indexOf('?>',next+2);if(end<0)bad('Malformed workbook XML declaration.');pos=end+2;continue;}
    if(xml.startsWith('<![CDATA[',next)){const end=xml.indexOf(']]>',next+9);if(end<0||!stack.length)bad('Malformed workbook XML text.');handlers.text?.(xml.slice(next+9,end));pos=end+3;continue;}
    let end=next+1,quote='';
    for(;end<xml.length;end++){const c=xml[end];if(quote){if(c===quote)quote='';}else if(c==='"'||c==="'")quote=c;else if(c==='>')break;}
    if(end===xml.length)bad('Malformed workbook XML tag.');
    let tag=xml.slice(next+1,end);pos=end+1;
    if(tag.startsWith('/')){const name=tag.slice(1).trim();if(!stack.length||stack.pop()!==name)bad('Workbook XML tags do not match.');handlers.end?.(name.split(':').pop());continue;}
    if(++nodes>LIMITS.nodes||stack.length>64)bad('This workbook is too complex to import.');
    const selfClosing=/\/\s*$/.test(tag);if(selfClosing)tag=tag.replace(/\/\s*$/,'');
    const nameMatch=/^([A-Za-z_][\w:.-]*)/.exec(tag);if(!nameMatch)bad('Malformed workbook XML tag.');
    const name=nameMatch[1],attrs=Object.create(null);let rest=tag.slice(name.length),count=0;
    while(rest.trim()){
      const attr=/^\s+([A-Za-z_][\w:.-]*)\s*=\s*("[^"]*"|'[^']*')/.exec(rest);
      if(!attr||++count>128||Object.hasOwn(attrs,attr[1]))bad('Malformed workbook XML attribute.');
      attrs[attr[1]]=entityText(attr[2].slice(1,-1));rest=rest.slice(attr[0].length);
    }
    if(!stack.length&&++roots>1)bad('Workbook XML has more than one root.');
    if(!selfClosing)stack.push(name);
    handlers.start?.(name.split(':').pop(),attrs);
    if(selfClosing)handlers.end?.(name.split(':').pop());
  }
  if(stack.length||roots!==1)bad('Incomplete workbook XML.');
}

function xmlText(bytes){
  let decoder=utf8;
  if(bytes[0]===0xff&&bytes[1]===0xfe)decoder=new TextDecoder('utf-16le',{fatal:true});
  else if(bytes[0]===0xfe&&bytes[1]===0xff)decoder=new TextDecoder('utf-16be',{fatal:true});
  let xml;
  try{xml=decoder.decode(bytes).replace(/^\uFEFF/,'');}catch{bad('This workbook contains invalid text encoding.');}
  if(/\0/.test(xml))bad('This workbook contains unsupported XML encoding.');
  return xml;
}

const crcTable=Array.from({length:256},(_,n)=>{for(let i=0;i<8;i++)n=n&1?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
function crc32(bytes){let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}

function cleanPath(path){
  if(!path||path.includes('\0')||path.includes('\\')||path.startsWith('/')||path.split('/').includes('..'))bad('This workbook contains an invalid entry path.');
  return path.split('/').filter(x=>x&&x!=='.').join('/');
}

function openZip(bytes){
  const data=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const u16=at=>data.getUint16(at,true),u32=at=>data.getUint32(at,true);
  let end=-1;
  for(let pos=bytes.length-22;pos>=Math.max(0,bytes.length-65557);pos--){if(u32(pos)===0x06054b50&&pos+22+u16(pos+20)===bytes.length){end=pos;break;}}
  if(end<0)bad('This is not a readable .xlsx file. Export the board as Excel or CSV again.');
  const count=u16(end+10),centralSize=u32(end+12),centralOffset=u32(end+16);
  if(u16(end+4)||u16(end+6)||u16(end+8)!==count)bad('Split Excel archives are not supported.');
  if(count===0xffff||centralSize===0xffffffff||centralOffset===0xffffffff)bad('ZIP64 Excel archives are not supported.');
  if(!count||count>LIMITS.entries||centralOffset+centralSize>end)bad('This workbook is too large or has an invalid directory.');
  const entries=new Map();let cursor=centralOffset,total=0;
  for(let n=0;n<count;n++){
    if(cursor+46>centralOffset+centralSize||u32(cursor)!==0x02014b50)bad('This workbook has an invalid ZIP directory.');
    const flags=u16(cursor+8),method=u16(cursor+10),compressed=u32(cursor+20),size=u32(cursor+24),nameLength=u16(cursor+28),extraLength=u16(cursor+30),commentLength=u16(cursor+32),offset=u32(cursor+42),crc=u32(cursor+16);
    if(flags&1)bad('Password-protected Excel files are not supported. Save an unprotected copy first.');
    if(u16(cursor+34)||size===0xffffffff||compressed===0xffffffff||offset===0xffffffff)bad('This workbook uses an unsupported ZIP format.');
    const next=cursor+46+nameLength+extraLength+commentLength;
    if(next>centralOffset+centralSize)bad('Truncated workbook directory.');
    let name;try{name=cleanPath(utf8.decode(bytes.subarray(cursor+46,cursor+46+nameLength)));}catch{bad('This workbook contains an invalid file name.');}
    if(entries.has(name))bad('This workbook contains duplicate ZIP entries.');
    if(size>LIMITS.entry||(total+=size)>LIMITS.expanded)bad('This workbook expands beyond the 20 MB import limit. Export a smaller selection.');
    if(offset+30>centralOffset||u32(offset)!==0x04034b50||u16(offset+8)!==method||(u16(offset+6)&1))bad('This workbook has an invalid file entry.');
    const localNameLength=u16(offset+26),start=offset+30+localNameLength+u16(offset+28);
    if(start+compressed>centralOffset)bad('Truncated workbook contents.');
    let localName;try{localName=cleanPath(utf8.decode(bytes.subarray(offset+30,offset+30+localNameLength)));}catch{bad('This workbook contains an invalid file name.');}
    if(localName!==name)bad('Workbook directory and contents do not match.');
    entries.set(name,{name,start,compressed,size,method,crc});cursor=next;
  }
  if(cursor!==centralOffset+centralSize)bad('Invalid workbook directory size.');
  let expanded=0;
  return {has:name=>entries.has(name),async read(name){
    const entry=entries.get(name);if(!entry)bad(`The workbook is missing ${name}.`);
    if(![0,8].includes(entry.method))bad('This workbook uses an unsupported compression method.');
    const compressed=bytes.subarray(entry.start,entry.start+entry.compressed);let output;
    if(entry.method===0){output=compressed;if(output.length!==entry.size)bad('Workbook entry length does not match.');}
    else {
      let stream;try{stream=new DecompressionStream('deflate-raw');}catch{bad('This browser cannot open Excel files locally. Update the browser or import a CSV export.');}
      const reader=new Blob([compressed]).stream().pipeThrough(stream).getReader(),chunks=[];let length=0;
      try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.length;if(length>entry.size||length>LIMITS.entry||expanded+length>LIMITS.expanded){await reader.cancel();bad('This workbook expands beyond the import limit.');}chunks.push(value);}}
      catch(error){if(error instanceof TypeError&&/import limit/.test(error.message))throw error;bad('This workbook contains damaged compressed data. Export it again.');}
      if(length!==entry.size)bad('Workbook entry length does not match.');
      output=new Uint8Array(length);let index=0;for(const chunk of chunks){output.set(chunk,index);index+=chunk.length;}
    }
    expanded+=output.length;if(expanded>LIMITS.expanded)bad('This workbook expands beyond the import limit.');
    if(crc32(output)!==entry.crc)bad('This workbook contains damaged data. Export it again.');
    return xmlText(output);
  }};
}

function resolvePath(base,target){
  if(!target||/[\\\0]/.test(target)||/^[a-z][a-z\d+.-]*:/i.test(target))bad('Invalid workbook relationship.');
  const parts=target.startsWith('/')?[]:base.split('/').slice(0,-1);
  for(const part of target.split('/')){if(!part||part==='.')continue;if(part==='..'){if(!parts.length)bad('Invalid workbook relationship.');parts.pop();}else parts.push(part);}
  return cleanPath(parts.join('/'));
}
function relationships(xml,base){const map=new Map();walkXml(xml,{start(name,a){if(name==='Relationship'){if(!a.Id||map.has(a.Id))bad('Invalid workbook relationships.');map.set(a.Id,{type:a.Type||'',external:a.TargetMode==='External',target:a.TargetMode==='External'?a.Target:resolvePath(base,a.Target)});}}});return map;}

function readSharedStrings(xml){
  const strings=[];let inItem=false,inText=false,phonetic=0,value='';
  walkXml(xml,{start(name){if(name==='si'){inItem=true;value='';}if(name==='rPh')phonetic++;if(name==='t'&&inItem&&!phonetic)inText=true;},text(text){if(inText){value+=text;if(value.length>LIMITS.text)bad('A workbook cell contains too much text.');}},end(name){if(name==='t')inText=false;if(name==='rPh')phonetic--;if(name==='si'){strings.push(value);inItem=false;if(strings.length>LIMITS.cells)bad('This workbook contains too many text values.');}}});
  return strings;
}

function formatKind(id,custom){
  if([14,15,16,17,27,28,29,30,31,32,33,34,35,36,50,51,52,53,54,55,56,57,58].includes(id))return 'date';
  if([18,19,20,21,45,46,47].includes(id))return 'time';
  if(id===22)return 'datetime';
  const format=(custom||'').split(';')[0].replace(/"(?:[^"]|"")*"/g,'').replace(/\\.|_.|\*./g,'').replace(/\[(?![hms]+\])[^\]]*\]/gi,'').toLowerCase();
  const time=/[hs]/.test(format),date=/[yd]/.test(format)||(!time&&/m/.test(format));
  return date?(time?'datetime':'date'):(time?'time':'');
}
function readStyles(xml){
  const formats=new Map(),styles=[];let inCellXfs=false;
  walkXml(xml,{start(name,a){if(name==='numFmt')formats.set(Number(a.numFmtId),a.formatCode||'');if(name==='cellXfs')inCellXfs=true;if(name==='xf'&&inCellXfs){const id=Number(a.numFmtId||0);styles.push(formatKind(id,formats.get(id)));}},end(name){if(name==='cellXfs')inCellXfs=false;}});
  return styles;
}
function excelDate(raw,kind,date1904,warnings){
  const serial=Number(raw);if(!Number.isFinite(serial)||serial<0||serial>(date1904?2957003:2958465)){warnings.add('A date outside the supported range was kept as its original value.');return raw;}
  const day=Math.floor(serial),seconds=Math.round((serial-day)*86400),time=new Date(seconds*1000).toISOString().slice(11,19);
  if(kind==='time')return time;
  if(!date1904&&day===60){warnings.add('An Excel date uses the nonexistent February 29, 1900; confirm that value.');return '1900-02-29 (Excel date)';}
  const epoch=date1904?Date.UTC(1904,0,1):Date.UTC(1899,11,day<60?31:30);
  const date=new Date(epoch+day*86400000+(kind==='datetime'?seconds*1000:0));
  if(!Number.isFinite(date.getTime()))return raw;
  return date.toISOString().slice(0,10)+(kind==='datetime'?`T${date.toISOString().slice(11,19)}`:'');
}
function columnIndex(ref){const match=/^([A-Z]+)(\d+)$/i.exec(ref||'');if(!match)return null;let column=0;for(const char of match[1].toUpperCase())column=column*26+char.charCodeAt(0)-64;return {column:column-1,row:Number(match[2])-1};}

function readSheet(xml,shared,styles,date1904){
  const matrix=[],warnings=new Set();let row=-1,col=-1,cell=null,capture='',phonetic=0,cells=0,formulaCount=0,errorCount=0;
  walkXml(xml,{start(name,a){
    if(name==='row'){row=a.r?Number(a.r)-1:row+1;if(!Number.isSafeInteger(row)||row<0||row>=LIMITS.rows)bad('This workbook exceeds the 10,000-row limit. Export a smaller selection.');if(matrix[row])bad('Workbook rows are duplicated.');matrix[row]=[];col=-1;}
    if(name==='c'){
      if(row<0||cell)bad('Malformed worksheet cell.');
      const ref=a.r?columnIndex(a.r):null;if(a.r&&!ref)bad('Invalid worksheet cell address.');
      col=ref?ref.column:col+1;
      if((ref&&ref.row!==row)||col<0||col>=LIMITS.columns||Object.hasOwn(matrix[row],col))bad('Invalid, duplicated, or unsupported worksheet column.');
      if(++cells>LIMITS.cells)bad('This workbook exceeds the 100,000-cell limit. Export a smaller selection.');
      cell={type:a.t||'n',style:Number(a.s||0),value:'',inline:'',formula:false};
    }
    if(name==='rPh')phonetic++;
    if(cell&&name==='v')capture='value';
    if(cell&&name==='t'&&!phonetic)capture='inline';
    if(cell&&name==='f')cell.formula=true;
  },text(text){if(cell&&capture){cell[capture]+=text;if(cell[capture].length>LIMITS.text)bad('A workbook cell contains too much text.');}},end(name){
    if(name==='v'||name==='t')capture='';if(name==='rPh')phonetic--;
    if(name==='c'&&cell){
      let value=cell.value;
      if(cell.type==='s'){const index=Number(value);if(!/^\d+$/.test(value)||!Number.isSafeInteger(index)||index>=shared.length)bad('A workbook text reference is invalid.');value=shared[index];}
      else if(cell.type==='inlineStr')value=cell.inline;
      else if(cell.type==='b')value=value==='1'?'TRUE':value==='0'?'FALSE':value;
      else if(cell.type==='e')errorCount++;
      else if((cell.type==='n'||!cell.type)&&value.trim()&&styles[cell.style])value=excelDate(value,styles[cell.style],date1904,warnings);
      if(cell.formula){formulaCount++;if(!value)warnings.add('Some formulas have no saved result; those cells are empty.');}
      matrix[row][col]=value;cell=null;capture='';
    }
  }});
  if(formulaCount)warnings.add(`${formulaCount} formula ${formulaCount===1?'cell uses':'cells use'} saved results. Formulas are never run.`);
  if(errorCount)warnings.add(`${errorCount} spreadsheet error ${errorCount===1?'value was':'values were'} kept for review.`);
  for(let index=0;index<matrix.length;index++){const values=matrix[index]||[];for(let column=0;column<values.length;column++)if(!Object.hasOwn(values,column))values[column]='';while(values.length&&values.at(-1)==='')values.pop();matrix[index]=values;}
  while(matrix.length&&!matrix.at(-1).some(value=>value.trim()))matrix.pop();
  return {matrix,warnings:[...warnings]};
}

function tableFromMatrix(matrix){
  const key=value=>String(value||'').trim().toLowerCase().replace(/[_\s]+/g,' ');
  const titles=new Set(['name','task','task name','title','item','item name','task title']);
  const fields=new Set(['status','owner','assignee','assignees','people','person','date','due date','deadline','priority','description','task content','group','subitems','task id','item id','id','task link']);
  let header=-1,best=-1;
  matrix.slice(0,50).forEach((row,index)=>{const keys=row.map(key);if(!keys.some(value=>titles.has(value)))return;const score=3+keys.filter(value=>fields.has(value)).length;if(score>best){best=score;header=index;}});
  const warnings=[];
  if(header<0){header=matrix.findIndex(row=>row.some(value=>value.trim()));if(header>=0)warnings.push('No standard task heading was found. Check the selected columns before importing.');}
  if(header<0)return {headers:[],rows:[],headerRow:0,warnings};
  const width=Math.max(matrix[header].length,...matrix.slice(header+1).map(row=>row.length));
  const headers=Array.from({length:width},(_,index)=>matrix[header][index]?.trim()||`Column ${index+1}`);
  return {headers,rows:matrix.slice(header+1).map(row=>Array.from({length:width},(_,index)=>row[index]||'')),headerRow:header+1,warnings};
}

/** Read .xlsx values without uploading, evaluating formulas, or following links. */
export async function readXlsx(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);
  if(bytes.length>LIMITS.file)bad('Excel files must be 8 MB or smaller. Export a smaller selection.');
  if(bytes.length<22)bad('This file is empty or is not a readable .xlsx workbook.');
  const zip=openZip(bytes);
  if(!zip.has('[Content_Types].xml')||!zip.has('xl/workbook.xml')||!zip.has('xl/_rels/workbook.xml.rels'))bad('This is not a supported .xlsx workbook. Older .xls files must be saved as .xlsx or CSV.');
  const contentTypes=await zip.read('[Content_Types].xml');
  if(/macroEnabled|vbaProject/i.test(contentTypes))bad('Macro-enabled workbooks are not supported. Save a plain .xlsx or CSV copy.');
  walkXml(contentTypes);
  const workbook=await zip.read('xl/workbook.xml'),rels=relationships(await zip.read('xl/_rels/workbook.xml.rels'),'xl/workbook.xml');
  const descriptors=[];let date1904=false;
  walkXml(workbook,{start(name,a){if(name==='workbookPr')date1904=a.date1904==='1'||a.date1904==='true';if(name==='sheet'){const relationship=rels.get(a['r:id']||Object.entries(a).find(([key])=>key.endsWith(':id'))?.[1]);if(!relationship||relationship.external||!relationship.type.endsWith('/worksheet'))bad('This workbook contains an unsupported sheet reference.');descriptors.push({name:a.name||`Sheet ${descriptors.length+1}`,path:relationship.target,hidden:!!a.state&&a.state!=='visible'});}}});
  if(!descriptors.length||descriptors.length>LIMITS.sheets)bad('Choose a workbook with between 1 and 30 worksheets.');
  const sharedRel=[...rels.values()].find(item=>item.type.endsWith('/sharedStrings')),stylesRel=[...rels.values()].find(item=>item.type.endsWith('/styles'));
  if(sharedRel?.external||stylesRel?.external)bad('External workbook text and styles are not supported.');
  const sharedPath=sharedRel?.target||(zip.has('xl/sharedStrings.xml')?'xl/sharedStrings.xml':''),stylesPath=stylesRel?.target||(zip.has('xl/styles.xml')?'xl/styles.xml':'');
  const shared=sharedPath?readSharedStrings(await zip.read(sharedPath)):[],styles=stylesPath?readStyles(await zip.read(stylesPath)):[];
  const sheets=[];
  for(const descriptor of descriptors){const sheet=readSheet(await zip.read(descriptor.path),shared,styles,date1904),table=tableFromMatrix(sheet.matrix);sheets.push({name:descriptor.name,hidden:descriptor.hidden,...sheet,...table,warnings:[...sheet.warnings,...table.warnings,...(descriptor.hidden?['This worksheet was hidden in the source workbook.']:[])]});}
  return {sheets,warnings:['Only cell values are read. Images, formatting, attachments, and linked files are not imported.']};
}
