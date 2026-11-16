// Desktop import parser only. Keep the phone's Buffer shim byte-unchanged.
const Base = globalThis.Buffer;
class ImportBuffer extends Base {
  static from(value, encoding) { const bytes=Base.from(value,encoding);const out=new ImportBuffer(bytes.length);out.set(bytes);return out; }
  static isBuffer(value) { return value instanceof Base; }
  subarray(start,end) { const bytes=super.subarray(start,end);const out=new ImportBuffer(bytes.length);out.set(bytes);return out; }
  readInt32LE(offset=0) { return this.readUInt32LE(offset)|0; }
  readBigUInt64LE(offset=0) { return BigInt(this.readUInt32LE(offset))|(BigInt(this.readUInt32LE(offset+4))<<32n); }
  readBigInt64LE(offset=0) { return BigInt.asIntN(64,this.readBigUInt64LE(offset)); }
  toString(encoding='utf8') {
    if(encoding==='utf16le'){let result='';for(let i=0;i+1<this.length;i+=2)result+=String.fromCharCode(this.readUInt16LE(i));return result;}
    return super.toString(encoding);
  }
}
module.exports=ImportBuffer;
