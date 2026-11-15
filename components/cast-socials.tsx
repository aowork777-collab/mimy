import {socialPlatforms,socialProfileUrl,type SocialKey} from '../lib/social-links';
type SocialProfile=Partial<Record<SocialKey,string>>;

const iconFiles: Record<SocialKey, string> = {
 social_x: 'x',
 social_instagram: 'instagram',
 social_tiktok: 'tiktok',
 social_youtube: 'youtube',
};

function SocialIcon({platform}: {platform: SocialKey}) {
 return <img className="social-icon" src={`/social-icons/${iconFiles[platform]}.svg`}
  width={20} height={20} alt="" />;
}

export function SocialFields({profile}:{profile:SocialProfile|null}){
 return <fieldset className="social-editor">
  <legend>SNSリンク</legend>
  <p className="muted">任意でIDまたはプロフィールURLを入力できます。保存するとプロフィールに公開されます。</p>
  {socialPlatforms.map(platform=><label key={platform.key} className="social-field">
   <span className="social-label">
    <SocialIcon platform={platform.key} />
    {platform.label}
   </span>
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
   className="social-link" title={link.label} aria-label={link.label+'のプロフィールを開く（新しいタブ）'}>
   <SocialIcon platform={link.key} />
  </a>)}
 </nav>;
}
