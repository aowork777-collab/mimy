'use client';
import {useEffect,useRef,useState} from 'react';
import type {Room,Track} from 'livekit-client';
type Props={id:string;starts:number;minutes:number;status:string;configured:boolean};
export function VoiceCall({id,starts,minutes,status,configured}:Props){
 const room=useRef<Room|null>(null),audio=useRef<HTMLDivElement>(null),generation=useRef(0);
 const [connected,setConnected]=useState(false),[busy,setBusy]=useState(false),[muted,setMuted]=useState(false),[error,setError]=useState(''),[peers,setPeers]=useState(0),[now,setNow]=useState(Date.now());
 const localVideo=useRef<HTMLVideoElement>(null),remoteVideo=useRef<HTMLVideoElement>(null),cameraLock=useRef(false);
 const attached=useRef<{local?:Track;remote?:Track}>({});
 const [cameraOn,setCameraOn]=useState(false),[remoteCameraOn,setRemoteCameraOn]=useState(false),[cameraBusy,setCameraBusy]=useState(false);
 function clearVideo(){
  if(localVideo.current)attached.current.local?.detach(localVideo.current);
  if(remoteVideo.current)attached.current.remote?.detach(remoteVideo.current);
  attached.current={};setCameraOn(false);setRemoteCameraOn(false);
 }
 const endsAt=starts+minutes*60000;
 function leave(){clearVideo();generation.current++;const current=room.current;room.current=null;void current?.disconnect();audio.current?.replaceChildren();setConnected(false);setPeers(0);setBusy(false);setCameraBusy(false);}
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),1000);return()=>{clearInterval(timer);generation.current++;void room.current?.disconnect();room.current=null;};},[]);
 useEffect(()=>{if(status!=='confirmed'||now>=endsAt){if(room.current){leave();setError('予約の通話が終了しました。');}}},[status,now,endsAt]);
 useEffect(()=>{if(!connected)return;let stopped=false;const timer=setInterval(async()=>{try{const r=await fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'check',id})});if(!r.ok)throw Error('予約状態を確認できないため通話を終了しました。');}catch(e){if(!stopped){leave();setError((e as Error).message);}}},10000);return()=>{stopped=true;clearInterval(timer);};},[connected,id]);
 async function join(){
  const attempt=++generation.current;setBusy(true);setError('');let current:Room|undefined;
  try{
   const r=await fetch('/api/call',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'join',id})});const data=await r.json() as {error?:string;url:string;token:string;endsAt:number};if(!r.ok)throw Error(data.error);
   const {Room,RoomEvent,Track}=await import('livekit-client');if(attempt!==generation.current)return;
   current=new Room({adaptiveStream:true,dynacast:true,videoCaptureDefaults:{facingMode:'user',resolution:{width:640,height:360,frameRate:15}},publishDefaults:{videoCodec:'vp8',simulcast:false,videoEncoding:{maxBitrate:350000,maxFramerate:15}}});room.current=current;
   const refreshVideo=()=>{
    if(room.current!==current)return;
    const local=current!.localParticipant.getTrackPublication(Track.Source.Camera);
    const remote=[...current!.remoteParticipants.values()][0]?.getTrackPublication(Track.Source.Camera);
    const attach=(kind:'local'|'remote',track:import('livekit-client').Track|undefined,element:HTMLVideoElement|null)=>{
     if(!element)return;
     if(attached.current[kind]!==track){attached.current[kind]?.detach(element);attached.current[kind]=track;track?.attach(element);}
    };
    const own=local&&!local.isMuted?local.track:undefined,other=remote&&!remote.isMuted?remote.track:undefined;
    attach('local',own,localVideo.current);attach('remote',other,remoteVideo.current);
    setCameraOn(!!own);setRemoteCameraOn(!!other);
   };
   for(const event of [RoomEvent.TrackSubscribed,RoomEvent.TrackUnsubscribed,RoomEvent.TrackMuted,RoomEvent.TrackUnmuted,RoomEvent.LocalTrackPublished,RoomEvent.LocalTrackUnpublished,RoomEvent.ParticipantDisconnected,RoomEvent.Reconnected])current.on(event,refreshVideo);
   current.on(RoomEvent.TrackSubscribed,(track)=>{if(track.kind===Track.Kind.Audio)audio.current?.appendChild(track.attach());});
   current.on(RoomEvent.TrackUnsubscribed,(track)=>{if(track.kind===Track.Kind.Audio)track.detach().forEach(el=>el.remove());});
   current.on(RoomEvent.ParticipantConnected,()=>setPeers(current!.remoteParticipants.size));
   current.on(RoomEvent.ParticipantDisconnected,()=>setPeers(current!.remoteParticipants.size));
   current.on(RoomEvent.Disconnected,()=>{if(room.current===current){room.current=null;clearVideo();setConnected(false);setPeers(0);audio.current?.replaceChildren();}});
   await current.connect(data.url,data.token);
   if(attempt!==generation.current){await current.disconnect();return;}
   await current.localParticipant.setMicrophoneEnabled(true);
   if(attempt!==generation.current){await current.disconnect();return;}
   refreshVideo();await current.startAudio();setPeers(current.remoteParticipants.size);setMuted(false);setConnected(true);
  }catch(e){await current?.disconnect();if(attempt===generation.current){room.current=null;setError((e as Error).name==='NotAllowedError'?'マイクの使用を許可してください。':(e as Error).message||'接続できませんでした。');}}
  finally{if(attempt===generation.current)setBusy(false);}
 }
 async function toggle(){try{await room.current?.localParticipant.setMicrophoneEnabled(muted);setMuted(!muted);}catch{setError('マイクの切り替えに失敗しました。');}}
 async function toggleCamera(){
  const current=room.current;if(!current||cameraLock.current)return;
  const attempt=generation.current;cameraLock.current=true;setCameraBusy(true);setError('');
  try{
   await current.localParticipant.setCameraEnabled(!current.localParticipant.isCameraEnabled);
   if(attempt!==generation.current||room.current!==current){await current.disconnect();return;}
   setCameraOn(current.localParticipant.isCameraEnabled);
  }catch(e){if(attempt===generation.current)setError((e as Error).name==='NotAllowedError'?'カメラの使用が許可されていません。ブラウザーの設定を確認してください。音声通話は継続できます。':'カメラを起動できません。接続や他のアプリでの使用状況を確認してください。');}
  finally{cameraLock.current=false;if(attempt===generation.current)setCameraBusy(false);}
 }
 const available=configured&&status==='confirmed'&&now>=starts&&now<endsAt;
 return <div className="call-box"><div><strong>ビデオ・音声通話</strong><p>{!configured?'準備中：運営による無料プランの接続設定が必要です。':connected?(peers?'通話中':'相手の参加を待っています'):status!=='confirmed'?'確定した予約で利用できます。':now<starts?'予約開始時刻になると参加できます。':now>=endsAt?'この予約の通話時間は終了しました。':'マイクを許可して参加してください。'}</p>{configured&&<p className="muted">参加時はカメラオフ。オンにすると相手に映像が届きます。録画機能はありません。</p>}<div className="call-videos" hidden={!connected}>
 <div className="call-video-tile"><video ref={remoteVideo} autoPlay playsInline muted aria-label="相手の映像" hidden={!remoteCameraOn}/>{!remoteCameraOn&&<span>{peers?'相手のカメラはオフです':'相手の参加を待っています'}</span>}<small>相手</small></div>
 <div className="call-video-tile own-video"><video ref={localVideo} autoPlay playsInline muted aria-label="自分の映像" hidden={!cameraOn}/>{!cameraOn&&<span>自分のカメラはオフです</span>}<small>あなた</small></div>
 </div>{connected?<><p>残り {Math.max(0,Math.ceil((endsAt-now)/60000))}分</p><button className="secondary" onClick={toggle}>{muted?'マイクをオン':'ミュート'}</button><button className="secondary" disabled={cameraBusy} aria-pressed={cameraOn} onClick={toggleCamera}>{cameraBusy?'カメラ切替中…':cameraOn?'カメラをオフ':'カメラをオン'}</button><button className="secondary" onClick={leave}>退出する</button></>:<button className="primary" disabled={!available||busy} onClick={join}>{busy?'接続中…':'通話に参加する'}</button>}{busy&&<button className="secondary" onClick={leave}>接続を中止</button>}{error&&<p role="alert">{error}</p>}<div ref={audio}/></div></div>;
}
