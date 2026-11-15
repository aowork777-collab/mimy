export const socialPlatforms = [
 {key:'social_x', label:'X', host:'x.com', hosts:['x.com','www.x.com','twitter.com','www.twitter.com']},
 {key:'social_instagram', label:'Instagram', host:'instagram.com', hosts:['instagram.com','www.instagram.com']},
 {key:'social_tiktok', label:'TikTok', host:'www.tiktok.com', hosts:['tiktok.com','www.tiktok.com']},
 {key:'social_youtube', label:'YouTube', host:'www.youtube.com', hosts:['youtube.com','www.youtube.com','m.youtube.com']},
] as const;
export type SocialKey = typeof socialPlatforms[number]['key'];

/** Convert a public profile ID or an official profile URL to a canonical HTTPS URL. */
export function socialProfileUrl(key:SocialKey, input:unknown):string {
 if(typeof input!=='string'||input.length>300)throw Error('IDまたはURLを300文字以内で入力してください');
 const value=input.trim();
 if(!value)return '';
 const platform=socialPlatforms.find(item=>item.key===key)!;
 let path=value.replace(/^@/,'');
 if(/^https?:\/\//i.test(value)){
  const url=new URL(value);
  if(url.protocol!=='https:'||url.username||url.password||url.port||!platform.hosts.some(host=>host===url.hostname)){
   throw Error(`${platform.label}の公式プロフィールURLを入力してください`);
  }
  path=decodeURIComponent(url.pathname).replace(/^\//,'').replace(/\/$/,'');
 }else if(value.includes('://')||value.includes('/')||value.includes(':')){
  throw Error(`${platform.label}のIDまたはHTTPSのプロフィールURLを入力してください`);
 }
 if(key==='social_youtube'){
  if(/^channel\/UC[A-Za-z0-9_-]{22}$/.test(path))return `https://${platform.host}/${path}`;
  if(/^UC[A-Za-z0-9_-]{22}$/.test(path))return `https://${platform.host}/channel/${path}`;
  if(/^c\/[A-Za-z0-9_.-]{1,100}$/.test(path)||/^user\/[A-Za-z0-9_.-]{1,100}$/.test(path))return `https://${platform.host}/${path}`;
  path=path.replace(/^@/,'');
  if(!/^[\p{L}\p{N}_.-]{1,100}$/u.test(path))throw Error('YouTubeのハンドルまたはチャンネルURLを入力してください');
  return `https://${platform.host}/@${encodeURIComponent(path)}`;
 }
 path=path.replace(/^@/,'');
 const pattern=key==='social_x'?/^[A-Za-z0-9_]{1,15}$/:/^[A-Za-z0-9_.]{1,30}$/;
 if(!pattern.test(path))throw Error(`${platform.label}のプロフィールIDを確認してください`);
 return `https://${platform.host}/${key==='social_tiktok'?'@':''}${path}`;
}
