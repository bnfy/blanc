// Synthetic Chromium Session log; field order follows the shipping parser fixtures.
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {COMMAND,FILE_VERSION_CLEARTEXT,INITIAL_STATE_MARKER}=require('../../../src/main/chromium-session.js');
function align4(value) {
  return (value + 3) & ~3;
}

function createPickleWriter() {
  let buffer = Buffer.alloc(0);
  const append = (bytes) => {
    const start = buffer.length;
    const end = align4(start + bytes.length);
    const next = Buffer.alloc(end);
    buffer.copy(next);
    bytes.copy(next, start);
    buffer = next;
  };
  return {
    int32(value) {
      const bytes = Buffer.alloc(4);
      bytes.writeInt32LE(value);
      append(bytes);
      return this;
    },
    uint32(value) {
      const bytes = Buffer.alloc(4);
      bytes.writeUInt32LE(value);
      append(bytes);
      return this;
    },
    uint64(value) {
      const bytes = Buffer.alloc(8);
      bytes.writeBigUInt64LE(BigInt(value));
      append(bytes);
      return this;
    },
    bool(value) {
      append(Buffer.from([value ? 1 : 0]));
      return this;
    },
    string(value) {
      const bytes = Buffer.from(value, 'utf8');
      this.int32(bytes.length);
      append(bytes);
      return this;
    },
    string16(value) {
      const bytes = Buffer.from(value, 'utf16le');
      this.int32(bytes.length / 2);
      append(bytes);
      return this;
    },
    done() {
      const header = Buffer.alloc(4);
      header.writeUInt32LE(buffer.length);
      return Buffer.concat([header, buffer]);
    },
  };
}

function intPayload(...values) {
  const payload = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => payload.writeInt32LE(value, index * 4));
  return payload;
}

function navigationPayload(tabId, index, url, title) {
  return createPickleWriter()
    .int32(tabId)
    .int32(index)
    .string(url)
    .string16(title)
    .string('')
    .int32(1)
    .done();
}

function pinnedPayload(tabId, pinned) {
  const payload = Buffer.alloc(8);
  payload.writeInt32LE(tabId, 0);
  payload[4] = pinned ? 1 : 0;
  return payload;
}

function groupPayload(tabId, high, low, hasGroup = true) {
  const payload = Buffer.alloc(32);
  payload.writeInt32LE(tabId, 0);
  payload.writeBigUInt64LE(BigInt(high), 8);
  payload.writeBigUInt64LE(BigInt(low), 16);
  payload[24] = hasGroup ? 1 : 0;
  return payload;
}

function groupMetadataPayload(high, low, title) {
  return createPickleWriter()
    .uint64(high)
    .uint64(low)
    .string16(title)
    .uint32(0)
    .bool(false)
    .bool(false)
    .done();
}

function frame(id, payload = Buffer.alloc(0)) {
  const bytes = Buffer.alloc(3 + payload.length);
  bytes.writeUInt16LE(payload.length + 1, 0);
  bytes[2] = id;
  payload.copy(bytes, 3);
  return bytes;
}

function session(commands, { version = FILE_VERSION_CLEARTEXT, marker = true } = {}) {
  const header = Buffer.alloc(8);
  header.write('SNSS', 0, 'ascii');
  header.writeInt32LE(version, 4);
  return Buffer.concat([
    header,
    ...commands.map(({ id, payload }) => frame(id, payload)),
    ...(marker ? [frame(INITIAL_STATE_MARKER)] : []),
  ]);
}

function baseTabCommands({ windowId, tabId, index, url, title }) {
  return [
    { id: COMMAND.SET_TAB_WINDOW, payload: intPayload(windowId, tabId) },
    { id: COMMAND.SET_TAB_INDEX, payload: intPayload(tabId, index) },
    { id: COMMAND.UPDATE_NAVIGATION, payload: navigationPayload(tabId, 0, url, title) },
    { id: COMMAND.SET_SELECTED_NAVIGATION, payload: intPayload(tabId, 0) },
  ];
}


export function sessionBytes(rows,{version=3,marker=true}={}){
 const windows=[...new Set(rows.map(r=>r.window??1))];
 const commands=windows.map(id=>({id:COMMAND.SET_WINDOW_TYPE,payload:intPayload(id,0)}));
 const groups=new Map();
 for(const [i,row] of rows.entries()){
  const tabId=i+1,windowId=row.window??1,index=rows.slice(0,i).filter(r=>(r.window??1)===windowId).length;
  commands.push(...baseTabCommands({windowId,tabId,index,url:row.url,title:row.title??`Import ${i+1}`}));
  if(row.pinned)commands.push({id:COMMAND.SET_PINNED,payload:pinnedPayload(tabId,true)});
  if(row.group!==undefined){
   if(!groups.has(row.group))groups.set(row.group,groups.size+1);
   commands.push({id:COMMAND.SET_TAB_GROUP,payload:groupPayload(tabId,0,groups.get(row.group))});
  }
 }
 for(const [name,id] of groups)commands.push({id:COMMAND.SET_TAB_GROUP_METADATA,payload:groupMetadataPayload(0,id,name)});
 return session(commands,{version,marker});
}
