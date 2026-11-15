import {socialPlatforms,socialProfileUrl,type SocialKey} from '../lib/social-links';
type SocialProfile=Partial<Record<SocialKey,string>>;

export function SocialFields({profile}:{profile:SocialProfile|null}){
 return <fieldset className="social-editor">
  <legend>SNSリンク</legend>
  <p className="muted">任意でIDまたはプロフィールURLを入力できます。保存するとプロフィールに公開されます。</p>
  {socialPlatforms.map(platform=><label key={platform.key} className="social-field">
   <span className={'social-label '+platform.key}>{platform.label}</span>
   <input name={platform.key} defaultValue={profile?.[platform.key]||''} maxLength={300}
    placeholder={platform.label+'のID または https://…'} autoCapitalize="none" spellCheck={false}/>
  </label>)}
 </fieldset>;
}

export function SocialLinks({profile}:{profile:SocialProfile}){
 const links=socialPlatforms.flatMap(platform=>{
  try{
   const href=socialProfileUrl(platform.key,profile[platform.key]||'');
   return href?[{...platform,href}]:[];
  }catch{return [];}
 });
 if(!links.length)return null;
 return <nav className="cast-social-links" aria-label="キャストのSNS">
  {links.map(link=><a key={link.key} href={link.href} target="_blank" rel="noopener noreferrer"
   className={'social-link '+link.key} aria-label={link.label+'のプロフィールを開く（新しいタブ）'}>
   {link.label}<span aria-hidden="true">↗</span>
  </a>)}
 </nav>;
}
