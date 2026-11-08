/** Container-level metadata removal. Pixels are not re-encoded (no quality loss).
 * Only image data, animation/transparency, numeric colour hints and a freshly
 * constructed orientation tag survive. Original EXIF, GPS, XMP, IPTC, comments,
 * thumbnails, ICC profiles, unknown chunks and trailing bytes are discarded.
 * This is not a malware scanner or a full compressed-pixel decoder.
 */
const ascii=(b:Uint8Array)=>new TextDecoder('latin1').decode(b);
const join=(parts:Uint8Array[])=>{const out=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));let i=0;for(const p of parts){out.set(p,i);i+=p.length;}return out;};
const view=(b:Uint8Array)=>new DataView(b.buffer,b.byteOffset,b.byteLength);
const fail=():never=>{throw new Error('画像ファイルを読み取れません。JPEG・PNG・WebPの写真を選び直してください。');};
const u32=(n:number,le=false)=>{const b=new Uint8Array(4);view(b).setUint32(0,n,le);return b;};
const text=(s:string)=>new TextEncoder().encode(s);
// Read only IFD0 Orientation; never follow GPS, MakerNote, thumbnail or other pointers.
function orientation(input:Uint8Array){
 const b=ascii(input.subarray(0,6))==='Exif\0\0'?input.subarray(6):input;
 if(b.length<8)return 1;const little=ascii(b.subarray(0,2))==='II';
 if(!little&&ascii(b.subarray(0,2))!=='MM')return 1;
 const d=view(b);if(d.getUint16(2,little)!==42)return 1;const at=d.getUint32(4,little);
 if(at<8||at>b.length-2)return 1;const count=d.getUint16(at,little);if(count>4096||at+2+count*12>b.length)return 1;
 for(let i=0;i<count;i++){const p=at+2+i*12;if(d.getUint16(p,little)===0x112&&d.getUint16(p+2,little)===3&&d.getUint32(p+4,little)===1){const n=d.getUint16(p+8,little);return n>=1&&n<=8?n:1;}}
 return 1;
}
function orientationOnly(n:number){const b=new Uint8Array(26),d=view(b);b.set([73,73,42,0,8,0,0,0,1,0]);d.setUint16(10,0x112,true);d.setUint16(12,3,true);d.setUint32(14,1,true);d.setUint16(18,n,true);return b;}
function jpegSegment(marker:number,b:Uint8Array){const length=b.length+2;return join([new Uint8Array([255,marker,length>>8,length&255]),b]);}
function jpeg(b:Uint8Array){
 const out=[b.slice(0,2)];let pos=2,sawFrame=false,sawScan=false,rotate=1;
 while(pos<b.length){
  if(b[pos]!==255)fail();while(b[pos]===255)pos++;if(pos>=b.length)fail();const marker=b[pos++];
  if(marker===0xd9){if(!sawFrame||!sawScan)fail();out.push(new Uint8Array([255,0xd9]));if(rotate!==1)out.splice(1,0,jpegSegment(0xe1,join([text('Exif\0\0'),orientationOnly(rotate)])));return join(out);}
  if(marker===0||marker===0xd8||marker>=0xd0&&marker<=0xd7)fail();
  if(pos+2>b.length)fail();const len=view(b).getUint16(pos);if(len<2||pos+len>b.length)fail();const payload=b.subarray(pos+2,pos+len);pos+=len;
  if(marker===0xe1){if(ascii(payload.subarray(0,6))==='Exif\0\0')rotate=orientation(payload);continue;}
  if(marker>=0xe0&&marker<=0xef){
   if(marker===0xe0&&payload.length>=14&&ascii(payload.subarray(0,5))==='JFIF\0'){const jfif=payload.slice(0,14);jfif[12]=jfif[13]=0;out.push(jpegSegment(marker,jfif));}
   // Adobe colour transform is necessary for correct CMYK rendering; no private fields.
   if(marker===0xee&&payload.length>=12&&ascii(payload.subarray(0,5))==='Adobe')out.push(jpegSegment(marker,payload.slice(0,12)));
   continue;
  }
  if(marker===0xfe)continue;
  if([0xc0,0xc1,0xc2].includes(marker)){if(payload.length<6||view(payload).getUint16(1)===0||view(payload).getUint16(3)===0)fail();sawFrame=true;}
  // Reject unknown extension markers rather than copying opaque payloads.
  if(![0xc0,0xc1,0xc2,0xc4,0xdb,0xdd,0xda].includes(marker))fail();
  out.push(jpegSegment(marker,payload));
  if(marker===0xda){
   if(!sawFrame)fail();sawScan=true;const start=pos;
   while(pos<b.length){if(b[pos]!==255){pos++;continue;}let end=pos+1;while(b[end]===255)end++;if(end>=b.length)fail();if(b[end]===0||b[end]>=0xd0&&b[end]<=0xd7){pos=end+1;continue;}break;}
   out.push(b.slice(start,pos));
  }
 }
 return fail();
}
const crcTable=Uint32Array.from({length:256},(_,n)=>{let c=n;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);return c;});
function crc32(b:Uint8Array){let c=0xffffffff;for(const n of b)c=(c>>>8)^crcTable[(c^n)&255];return(c^0xffffffff)>>>0;}
function pngChunk(kind:string,b:Uint8Array){const payload=join([text(kind),b]);return join([u32(b.length),payload,u32(crc32(payload))]);}
function png(b:Uint8Array){
 const out=[b.slice(0,8)];let pos=8,header=false,pixels=false;
 const keep=new Set(['PLTE','IDAT','tRNS','sRGB','gAMA','cHRM','acTL','fcTL','fdAT']);
 while(pos+12<=b.length){const size=view(b).getUint32(pos),end=pos+12+size;if(end>b.length)fail();const kind=ascii(b.subarray(pos+4,pos+8)),body=b.subarray(pos+8,end-4);
  if(crc32(b.subarray(pos+4,end-4))!==view(b).getUint32(end-4))fail();
  if(!header&&kind!=='IHDR')fail();
  if(kind==='IHDR'){if(header||size!==13||!view(body).getUint32(0)||!view(body).getUint32(4))fail();header=true;out.push(b.slice(pos,end));}
  else if(kind==='IEND'){if(!pixels||size!==0)fail();out.push(b.slice(pos,end));return join(out);}
  else if(kind==='eXIf'){const n=orientation(body);if(n!==1)out.push(pngChunk(kind,orientationOnly(n)));}
  else if(keep.has(kind)){
   const lengths:Record<string,number>={sRGB:1,gAMA:4,cHRM:32,acTL:8,fcTL:26};
   if(kind in lengths&&size!==lengths[kind]||kind==='PLTE'&&(!size||size>768||size%3)||kind==='tRNS'&&size>256||kind==='fdAT'&&size<4)fail();
   if(kind==='IDAT')pixels=true;out.push(b.slice(pos,end));
  }
  else if((b[pos+4]&32)===0)fail();
  pos=end;
 }
 return fail();
}
function webpChunk(kind:string,b:Uint8Array){return join([text(kind),u32(b.length,true),b,...(b.length%2?[new Uint8Array(1)]:[])]);}
function webpFrame(b:Uint8Array){
 if(b.length<24)fail();const parts=[b.slice(0,16)];let pos=16,pixels=false;
 while(pos+8<=b.length){const kind=ascii(b.subarray(pos,pos+4)),size=view(b).getUint32(pos+4,true),end=pos+8+size+(size%2);if(end>b.length)fail();
  if(['ALPH','VP8 ','VP8L'].includes(kind)){if(!size)fail();parts.push(webpChunk(kind,b.slice(pos+8,pos+8+size)));if(kind!=='ALPH')pixels=true;}pos=end;
 }if(pos!==b.length||!pixels)fail();return join(parts);
}
function webp(b:Uint8Array){
 const end=view(b).getUint32(4,true)+8;if(end>b.length||end<20)fail();
 const out:Uint8Array[]=[];let pos=12,extended:Uint8Array|undefined,pixels=false,rotate=1;
 while(pos+8<=end){const kind=ascii(b.subarray(pos,pos+4)),size=view(b).getUint32(pos+4,true),next=pos+8+size+(size%2);if(next>end)fail();const body=b.slice(pos+8,pos+8+size);
  if(kind==='VP8X'){if(extended||pos!==12||size!==10)fail();body[0]&=~(0x20|0x08|0x04);extended=body;out.push(webpChunk(kind,body));}
  else if(kind==='EXIF')rotate=orientation(body);
  else if(['VP8 ','VP8L','ALPH','ANIM','ANMF'].includes(kind)){if(!size)fail();if(['VP8 ','VP8L','ANMF'].includes(kind))pixels=true;out.push(webpChunk(kind,kind==='ANMF'?webpFrame(body):body));}
  pos=next;
 }
 if(pos!==end||!pixels)fail();
 if(rotate!==1&&extended){extended[0]|=0x08;out[0]=webpChunk('VP8X',extended);out.push(webpChunk('EXIF',orientationOnly(rotate)));}
 const payload=join([text('WEBP'),...out]);return join([text('RIFF'),u32(payload.length,true),payload]);
}
export function sanitizePhoto(bytes:Uint8Array):{bytes:Uint8Array;type:string}{
 if(bytes.length>=12&&bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return{bytes:jpeg(bytes),type:'image/jpeg'};
 if(bytes.length>=24&&[137,80,78,71,13,10,26,10].every((n,i)=>bytes[i]===n))return{bytes:png(bytes),type:'image/png'};
 if(bytes.length>=20&&ascii(bytes.subarray(0,4))==='RIFF'&&ascii(bytes.subarray(8,12))==='WEBP')return{bytes:webp(bytes),type:'image/webp'};
 return fail();
}
