import express from 'express';
import { randomBytes } from 'node:crypto';
const app=express();app.use(express.json({limit:'1mb'}));app.use(express.static('public'));
const rooms=new Map();const now=()=>Date.now();
const clean=(v,n=40)=>String(v??'').trim().slice(0,n);
const send=(res,room)=>res.json(room);
app.get('/health',(_,res)=>res.json({status:'ok',rooms:rooms.size}));
app.post('/api/rooms',(req,res)=>{const id=randomBytes(3).toString('hex').toUpperCase();const room={id,revision:0,updatedAt:now(),phase:'lobby',players:[],territories:[],round:null,history:[],usedImages:[],winner:null};rooms.set(id,room);send(res,room)});
app.get('/api/rooms/:id',(req,res)=>{const room=rooms.get(clean(req.params.id).toUpperCase());if(!room)return res.status(404).json({error:'الغرفة غير موجودة'});send(res,room)});
app.post('/api/rooms/:id/action',(req,res)=>{const room=rooms.get(clean(req.params.id).toUpperCase());if(!room)return res.status(404).json({error:'الغرفة غير موجودة'});
 const {type,payload={}}=req.body??{};
 switch(type){
 case 'join':{const name=clean(payload.name);if(!name)return res.status(400).json({error:'الاسم مطلوب'});if(!room.players.some(p=>p.name===name))room.players.push({name,color:room.players.length%2?'#ffae65':'#65c7ff'});break}
 case 'setup':{if(room.players.length<2)return res.status(400).json({error:'يجب انضمام لاعبين'});if(!Array.isArray(payload.territories)||payload.territories.length!==10)return res.status(400).json({error:'مطلوب عشر مناطق'});room.territories=payload.territories.map((t,i)=>({id:i,owner:i<5?0:1,category:clean(t.category,60)}));room.phase='battle';break}
 case 'attack':{if(room.phase!=='battle'||room.round)return res.status(409).json({error:'هناك مواجهة جارية'});const from=Number(payload.from),to=Number(payload.to);const a=room.territories[from],b=room.territories[to];if(!a||!b||a.owner===b.owner)return res.status(400).json({error:'اختر منطقة مهاجمة وأخرى للخصم'});room.round={from,to,category:a.category,image:clean(payload.image,1000),answer:clean(payload.answer,200),status:'question',result:null,startedAt:now()};break}
 case 'reveal':if(!room.round)return res.status(409).json({error:'لا توجد مواجهة'});room.round.status='revealed';break;
 case 'resolve':{const r=room.round;if(!r)return res.status(409).json({error:'لا توجد مواجهة'});const success=!!payload.success;const a=room.territories[r.from],b=room.territories[r.to];if(success){b.owner=a.owner;b.category=a.category;}room.history.unshift({category:r.category,from:r.from,to:r.to,success,image:r.image,at:now()});room.history=room.history.slice(0,50);if(r.image)room.usedImages.push(r.image);room.round=null;const counts=[0,1].map(x=>room.territories.filter(t=>t.owner===x).length);if(counts.includes(0)){room.phase='finished';room.winner=counts[0]===0?1:0}break}
 case 'reset':room.phase='lobby';room.territories=[];room.round=null;room.history=[];room.usedImages=[];room.winner=null;break;
 default:return res.status(400).json({error:'إجراء غير معروف'});
 }room.updatedAt=now();room.revision++;send(res,room)
});
setInterval(()=>{for(const [id,r] of rooms)if(now()-r.updatedAt>1000*60*60*12)rooms.delete(id)},1000*60*30).unref();
const port=Number(process.env.PORT)||3000;app.listen(port,'0.0.0.0',()=>console.log('Image Battle ready on '+port));
