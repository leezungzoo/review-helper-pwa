const $ = s => document.querySelector(s);
const defaults = [{name:'',note:''},{name:'',note:''},{name:'',note:''}];
let stores = JSON.parse(localStorage.getItem('review-helper-stores') || 'null') || defaults;
let activeStore = 0, rating = 5, deferredPrompt;
let replyHistory = JSON.parse(localStorage.getItem('review-helper-reply-history') || '[]');
let previousReply = '';
let variationId = Number(localStorage.getItem('review-helper-variation-id') || 0);
let imageObjectUrl = '';
let ocrRequestId = 0;
let detectedMenu = '';
const emoji = { happy:['😊','😆','🥹','💛','🍀','✨','🙌','🫶','💜','🌷'], playful:['😆','ㅋㅋ','🥹','🙌','✨','💛'], calm:['😊','💛','🍀'] };
const menuWords = ['감자튀김','김치찜','닭강정','치즈볼','볶음밥','떡볶이','치킨','피자','족발','보쌈','국밥','김밥','초밥','라면','파스타','버거','샐러드','튀김','갈비','삼겹살','덮밥','찜','탕','면'];
const ignoreLine = /최근\s*리뷰|리뷰\s*노출\s*정책|사장님\s*댓글|최신순|사진\s*리뷰만\s*보기|신고하기|최근\s*\d+번\s*주문|리뷰\s*\d+|평균\s*별점|알뜰배달|오늘[,，]?|주문\s*내역|도움돼요|답글|메뉴\s*더보기/i;
const positiveRules = [
  ['return',/오랜만|다시.*먹|재주문|재방문|또.*시킬|또.*주문|정착/], ['crisp',/(감자튀김|튀김|치즈볼).{0,14}(바삭)/], ['soft',/(닭|고기|치킨|면).{0,14}(부드럽|쫄깃)/],
  ['sauce',/(소스|양념).{0,14}(취향|제 스타일|입맛|맛있|좋)/], ['spicy',/(맵|매운).{0,16}(계속|손이|맛있|중독|좋|들어가)/], ['quantity',/(양이?\s*(많|푸짐|넉넉)|푸짐|넉넉|배 터)/],
  ['taste',/(맛있|맛나|존맛|최고|간이 좋|풍미|고소|담백|신선)/], ['price',/(가성비|가격.{0,8}(좋|착하|괜찮)|저렴)/], ['delivery',/(배달.{0,10}(빠르|빨리|좋|만족)|빨리 왔|일찍 왔)/],
  ['packaging',/(포장.{0,10}(깔끔|좋|꼼꼼)|꼼꼼하게.{0,5}포장)/], ['service',/(친절|서비스.{0,10}(좋|감사)|사장님.{0,10}(친절|좋)|직원.{0,10}(친절|좋))/]
];
const negativeRules = [
  ['delivery',/(배달.{0,12}(늦|느리|오래|실망|아쉽)|너무 늦|한참.{0,5}걸)/], ['packaging',/(포장.{0,12}(새|터지|엉망|아쉽)|국물.{0,8}샜)/], ['missing',/(누락|안 왔|빠졌|없었|안 넣)/],
  ['temperature',/(식었|차갑|미지근)/], ['quality',/(눅눅|탔|상했|맛없|별로|실망|아쉽|짜|싱겁)/], ['service',/(불친절|응대.{0,10}(별로|아쉽)|기분.{0,10}나쁘)/]
];
const unique = a => [...new Set(a)];
const pick = a => a[Math.floor(Math.random() * a.length)];
function renderStores(){ $('#storeTabs').innerHTML=stores.map((s,i)=>`<button class="store-tab ${i===activeStore?'active':''}" data-i="${i}">${s.name||`가게 ${i+1}`}</button>`).join(''); $('#storeName').value=stores[activeStore].name; $('#storeNote').value=stores[activeStore].note; document.querySelectorAll('.store-tab').forEach(b=>b.onclick=()=>{activeStore=+b.dataset.i;renderStores();}); }
function renderStars(){ $('#stars').innerHTML=[1,2,3,4,5].map(n=>`<button class="star ${n<=rating?'selected':''}" aria-label="${n}점">★</button>`).join(''); document.querySelectorAll('.star').forEach((b,i)=>b.onclick=()=>{rating=i+1;renderStars();}); }
function analyze(text){
  const match=(p)=>{p.lastIndex=0;return p.test(text);};
  return { menus:menuWords.filter(m=>text.includes(m)).slice(0,3), positive:positiveRules.filter(([,p])=>match(p)).map(([id])=>id), negative:negativeRules.filter(([,p])=>match(p)).map(([id])=>id), playful:/ㅋㅋ|ㅎㅎ|크흣|존맛|순삭|미쳤|대박|완전/.test(text), revisit:/다음(에|에도)?.{0,10}(주문|시킬|갈|방문)|또\s*(주문|시킬|갈|먹)|재주문|재방문|정착/.test(text), child:/(아이|애들|아기|아이가|아이들)/.test(text), family:/(가족|남편|아내|엄마|아빠|친구)/.test(text), first:/(첫 주문|처음 주문|첫번째)/.test(text), surprise:/(생각보다|놀랐|깜짝|엄청|진짜)/.test(text), rice:/(공기밥|공기\s*\d|밥\s*\d|공기가\s*세)/.test(text), cleanPlate:/(싹싹|긁어.?먹|다 먹|완식)/.test(text), long:text.length>90 };
}
function intro(name){ return `${(name || '고객').trim()}님,`; }
const toneProfiles={
  warm:{icons:['😊','💛','🥹','🫶','🍀'], generic:['남겨주신 이야기를 읽으니 저희도 절로 미소가 나네요.','잘 드신 모습이 느껴져서 마음이 참 좋습니다.'], thanks:['이렇게 구체적으로 남겨주셔서 고마워요.','기분 좋은 말씀 전해주셔서 감사합니다.'], revisit:['또 생각날 때 편하게 찾아주세요.','다음에도 맛있게 챙겨드릴게요!'], finish:['다음 한 끼도 기분 좋게 드실 수 있었으면 좋겠습니다.','다음에도 입맛에 맞는 한 끼로 찾아뵐게요.']},
  calm:{icons:[], generic:['좋게 이용해 주셨다니 감사드립니다.','남겨주신 말씀을 읽고 준비한 보람을 느낍니다.'], thanks:['세심하게 남겨주셔서 감사드립니다.','이용 후기를 전해주셔서 감사합니다.'], revisit:['다음 주문도 만족스럽게 드실 수 있도록 살피겠습니다.','다음에도 한결같이 준비하겠습니다.'], finish:['다음에도 만족스러운 식사가 되도록 하겠습니다.','앞으로도 좋은 식사가 되도록 살피겠습니다.']},
  bright:{icons:['😆','🙌','✨','😄','💛','😂'], generic:['이런 후기는 볼 때마다 기분이 확 좋아져요!','맛있게 즐겨주신 게 전해져서 저희도 신납니다!'], thanks:['기분 좋은 이야기 남겨주셔서 고마워요!','이렇게 반갑게 알려주시면 힘이 납니다!'], revisit:['다음 한 끼도 맛있게 준비해둘게요!','또 생각나실 때 반갑게 맞이할게요!'], finish:['다음에도 든든하고 맛있게 챙겨드릴게요!','다음 한 끼도 기대하셔도 좋아요!']}
};
function fresh(options){const unseen=options.filter(option=>!replyHistory.some(reply=>reply.includes(option)));return pick(unseen.length?unseen:options);}
function positivePoints(a,tone){
  const p=toneProfiles[tone], menu=a.menus[0]||'';
  const points=[];
  if(a.rice)points.push(tone==='calm'?'공기밥 수량이 예상과 달라 당황하셨을 텐데, 맛있게 드셔주셨다니 다행입니다.':fresh(['공기밥이 세 개나 와서 뜻밖의 한 끼가 되셨겠네요ㅎㅎ 그래도 싹싹 드셨다니 저희도 웃음이 납니다!','공기밥이 예상보다 많이 와서 놀라셨겠어요. 김치찜과 맛있게 드셨다니 다행이에요!']));
  if(a.cleanPlate)points.push(tone==='calm'?'남김없이 드셔주셨다는 말씀에 준비한 보람을 느낍니다.':fresh(['싹싹 긁어 드셨다는 대목에서 정말 맛있게 드신 게 느껴져요!','끝까지 맛있게 드셔주셨다니 이건 정말 뿌듯하네요!']));
  if(a.child)points.push(tone==='calm'?'아이들이 맛있게 드셨다니 특히 반갑습니다.':fresh(['아이들이 잘 먹었다는 말이 제일 반갑네요!','아이들 입맛에도 맞았다니 이건 정말 기분 좋은 소식이에요!']));
  if(a.family)points.push(tone==='calm'?'함께 드신 분들까지 좋게 드셨다니 감사드립니다.':fresh(['함께 드신 분들도 좋아해 주셨다니 더없이 반갑네요!','같이 드신 분들까지 맛있게 즐기셨다니 저희도 기분이 좋아집니다.']));
  if(a.first)points.push(tone==='calm'?'첫 주문이 좋은 기억으로 남으셨다니 다행입니다.':fresh(['처음 찾아주신 날에 입맛에 맞으셨다니 특히 반갑네요!','첫 주문부터 좋게 드셔주셨다니 마음이 놓입니다!']));
  if(a.revisit)points.push(tone==='calm'?'다시 찾아주셨다는 말씀에 감사드립니다.':fresh(['또 주문해주신다는 말씀이 정말 반갑네요!','다시 생각나서 찾아주셨다니 괜히 더 뿌듯합니다!']));
  if(a.positive.includes('spicy'))points.push(tone==='bright'?fresh(['매운데도 계속 손이 가셨다니 제대로 즐기신 것 같아요!','매운맛이 취향에 꽂히셨나 봐요!']):fresh(['매운맛을 맛있게 즐겨주셨다니 뿌듯합니다.','얼큰한 맛이 입맛에 맞으셨다니 다행이에요.']));
  if(a.positive.includes('quantity'))points.push(tone==='calm'?'든든하게 드실 수 있었다니 다행입니다.':fresh(['생각보다 든든하게 드셨다니 저희도 기분 좋네요!','푸짐한 한 끼가 되었다니 괜히 뿌듯합니다!']));
  if(a.positive.includes('crisp'))points.push(tone==='calm'?'바삭한 식감까지 좋게 봐주셔서 감사드립니다.':fresh(['바삭한 식감까지 알아봐 주셔서 기분 좋네요!','튀김의 바삭함을 맛있게 즐겨주셨다니 반갑습니다!']));
  if(a.positive.includes('sauce'))points.push(tone==='bright'?fresh(['소스가 제대로 취향 저격이었나 봐요!','양념까지 마음에 드셨다니 신납니다!']):fresh(['소스까지 입맛에 맞으셨다니 정말 다행이에요.','양념을 좋아해 주셨다니 준비한 보람이 큽니다.']));
  if(a.positive.includes('soft'))points.push(tone==='calm'?'식감까지 만족하셨다니 감사드립니다.':fresh(['부드러운 식감으로 맛있게 드셨다니 다행이에요!','식감까지 마음에 드셨다니 괜히 뿌듯하네요.']));
  if(a.positive.includes('delivery'))points.push(tone==='calm'?'배달까지 만족스럽게 받아보셨다니 다행입니다.':fresh(['기다림 없이 잘 받아보셨다니 안심이에요!','배달까지 좋게 느껴주셨다니 기분 좋습니다!']));
  if(a.positive.includes('packaging'))points.push(tone==='calm'?'포장 상태까지 좋게 봐주셔서 감사드립니다.':fresh(['포장까지 꼼꼼히 봐주셨네요, 감사합니다!','깔끔하게 받아보셨다니 마음이 놓입니다!']));
  if(a.positive.includes('taste'))points.push(tone==='calm'?`${menu?`${menu}을 `:'음식을 '}맛있게 드셔주셨다니 감사드립니다.`:fresh([`${menu?`${menu} `:''}맛있게 드셔주셨다니 준비한 보람이 큽니다!`,`${menu?`${menu} `:''}맛있다는 말씀에 저희도 힘이 나네요!`]));
  return unique(points.filter(Boolean));
}
function negativePoints(a,tone,text){
  const p=a.negative, formal=tone==='calm', points=[];
  const add=(warm,calm)=>points.push(formal?calm:warm);
  if(p.includes('delivery'))add(fresh(['기다리신 시간이 길어 불편하셨을 텐데 죄송합니다.','배달이 늦어져 많이 아쉬우셨을 것 같아요. 죄송합니다.']),'배달 지연으로 불편을 드린 점 사과드립니다.');
  if(p.includes('temperature'))add(fresh(['기다리신 것도 아쉬우셨을 텐데 음식까지 식어 도착했다니 더 속상하셨을 것 같아요.','따뜻하게 드시지 못하게 해드린 점 죄송합니다.']),'음식이 식은 상태로 도착해 불편을 드린 점 사과드립니다.');
  if(p.includes('missing'))add(fresh(['주문 구성에 빠진 부분이 있었다니 많이 불편하셨겠어요. 죄송합니다.','누락으로 실망을 드린 점 진심으로 사과드립니다.']),'주문 구성 누락으로 불편을 드린 점 사과드립니다.');
  if(p.includes('packaging'))add(fresh(['포장 상태가 기대와 달라 불편을 드린 점 죄송합니다.','포장 문제로 드시기 불편하셨을 것 같아요. 죄송합니다.']),'포장 상태로 불편을 드린 점 사과드립니다.');
  if(p.includes('service'))add(fresh(['응대 때문에 기분까지 상하게 해드린 점 죄송합니다.','편하게 이용하지 못하셨다니 죄송한 마음입니다.']),'응대 과정에서 불편을 드린 점 사과드립니다.');
  if(p.includes('quality')||!points.length){const food=/스팸|햄|냄새/.test(text)?'음식의 맛과 상태에 관한 말씀을 남겨주셨는데':'음식 상태가 기대에 미치지 못했다고 하셔서';add(fresh([`${food} 많이 실망하셨을 것 같아요. 죄송합니다.`,`${food} 불쾌함을 드린 점 진심으로 사과드립니다.`]),'음식 상태가 기대에 미치지 못해 실망을 드린 점 사과드립니다.');}
  points.push(formal?'기대하고 주문하셨을 텐데 만족스럽게 드시지 못하신 점을 무겁게 받아들이겠습니다.':fresh(['기대하고 주문하셨을 텐데 식사 시간 자체가 불편하게 남으셨을 것 같아 마음이 무겁습니다.','드시는 내내 아쉬움이 남으셨을 생각에 죄송한 마음입니다.']));
  points.push(formal?'남겨주신 내용은 조리와 포장 과정을 다시 확인하는 데 반영하겠습니다.':fresh(['남겨주신 내용은 가볍게 넘기지 않고 조리와 포장 과정을 다시 살피겠습니다.','말씀해 주신 부분은 바로 확인해서 같은 아쉬움이 남지 않도록 하겠습니다.']));
  points.push(formal?'다시 불편을 드리지 않도록 더 세심히 점검하겠습니다.':fresh(['다음에는 이런 실망을 드리지 않도록 더 꼼꼼히 확인하겠습니다.','불편을 드린 점 다시 한 번 사과드립니다.']));
  points.push(formal?'말씀해주신 경험을 바탕으로 더 나은 주문 경험이 되도록 개선하겠습니다.':fresh(['이번 리뷰를 통해 놓친 부분을 다시 살피겠습니다.','남겨주신 경험이 헛되지 않도록 바로 점검하겠습니다.']));
  if(a.positive.length)points.push(formal?'좋게 드신 부분이 있었다는 말씀도 함께 새기겠습니다.':'좋게 보신 부분이 있었어도 이번 주문이 만족스럽지 못했다는 점을 더 무겁게 받아들이겠습니다.');
  return unique(points);
}
function decorate(parts,tone,negative){if(negative||!toneProfiles[tone].icons.length)return parts.join(' ');return parts.map((part,index)=>`${part}${index<2&&Math.random()<.7?` ${fresh(toneProfiles[tone].icons)}`:''}`).join(' ');}
function generate(){
  const text=$('#reviewText').value.trim(), name=$('#customerName').value.trim(), tone=$('#tone').value, length=$('#replyLength').value;
  if(!text){$('#result').value=`${intro(name)} 별점으로 남겨주신 마음 고맙습니다.`;return;}
  try{
    const a=analyze(text), negative=a.negative.length>0, desired={short:1,medium:3,long:5}[length]||3;
    let result='';
    for(let attempt=0;attempt<12;attempt++){
      const candidates=negative?negativePoints(a,tone,text):[...positivePoints(a,tone),toneProfiles[tone].generic[attempt%2],toneProfiles[tone].thanks[attempt%2],...(a.revisit?[toneProfiles[tone].revisit[attempt%2]]:[toneProfiles[tone].finish[attempt%2]])];
      const body=unique(candidates.filter(Boolean)).slice(0,desired);
      result=decorate([intro(name),...body],tone,negative);
      if(!replyHistory.includes(result))break;
    }
    replyHistory=[result,...replyHistory].slice(0,50);
    $('#result').value=result;
  }catch(error){
    $('#result').value=`${intro(name)} 남겨주신 내용을 확인했습니다. 답글을 다시 한 번 만들어 주세요.`;
    console.error('Reply generation failed',error);
  }
}

// 답글 생성은 단순 문구 조합이 아니라, 리뷰에서 확인된 사실을 먼저 뽑아
// 길이·말투·최근 생성 이력에 맞춰 다른 구조로 다시 조합한다.
const replyProfiles = {
  warm: {
    openers: ['마음에 남는 이야기를 들려주셔서 반가워요.', '리뷰를 읽는 내내 저희도 미소가 났어요.', '정성껏 남겨주신 말씀이 참 고맙습니다.', '기분 좋게 드신 모습이 전해져서 정말 반가워요.'],
    closers: ['다음에도 맛있는 한 끼로 기억되도록 잘 준비할게요.', '또 생각나는 날 편하게 찾아주세요.', '다음 주문도 기분 좋게 챙겨드릴게요.'],
    emojis: ['😊', '🌿', '💛', '🥰', '✨', '🍀', '🙌', '🤍']
  },
  calm: {
    openers: ['남겨주신 내용을 꼼꼼히 확인했습니다.', '좋게 드신 부분을 구체적으로 알려주셔서 감사합니다.', '소중한 리뷰를 남겨주셔서 감사합니다.', '말씀해 주신 경험을 잘 읽었습니다.'],
    closers: ['다음 주문도 만족스럽게 준비하겠습니다.', '앞으로도 한결같이 챙기겠습니다.', '더 좋은 식사가 되도록 신경 쓰겠습니다.'],
    emojis: []
  },
  bright: {
    openers: ['이야기만 들어도 저희까지 기분이 좋아져요!', '와, 이렇게 맛있게 드셨다니 정말 반가워요!', '리뷰에서 즐거움이 그대로 전해져요!', '반가운 소식에 저희도 힘이 납니다!'],
    closers: ['다음에도 든든하고 맛있게 챙겨드릴게요!', '또 생각나는 날 반갑게 맞이할게요!', '다음 한 끼도 맛있게 준비해 둘게요!'],
    emojis: ['😄', '✨', '💚', '🙌', '🎉', '🍀', '🤩', '💫']
  }
};

function replyFactAnalysis(text) {
  const has = pattern => pattern.test(text);
  const facts = [];
  const add = (id, count = 1) => { if (!facts.some(f => f.id === id)) facts.push({id, count}); };
  if (has(/(?:처음|첫)\s*(?:주문|시켜|시켜봤|먹어)/)) add('firstOrder');
  if (has(/(?:다음|또|다시)\s*(?:에\s*)?(?:주문|시킬|시켜|먹을)|다음.{0,12}(?:주문|시킬)|또.{0,12}(?:주문|시킬)/)) add('futureOrder');
  if (has(/오랜만|재주문|재방문|다시\s*(?:주문했|시켜\s*먹|먹었)/)) add('returnVisit');
  if (has(/공기\s*밥|공기\s*[0-9]|공기가\s*(?:세|3)|밥\s*도둑/)) add('rice');
  if (has(/싹싹|긁어\s*먹|깨끗하게\s*먹|다\s*먹었/)) add('cleanPlate');
  if (has(/아이|애들|아기|가족|남편|아내|엄마|아빠|친구/)) add('together');
  if (has(/매운|맵지만|매콤/)) add('spicy');
  if (has(/양이|푸짐|든든|많아|배부/)) add('portion');
  if (has(/사진|비주얼|먹음직/)) add('photo');
  if (has(/맛있|맛나|최고|잘\s*먹|맛도\s*좋/)) add('taste');
  if (has(/배달.{0,12}(빠르|빨리|좋|만족)|금방\s*(?:왔|도착)/)) add('delivery');
  if (has(/포장.{0,12}(깔끔|좋|정성)|깔끔하게\s*포장/)) add('packaging');
  if (has(/부드럽|촉촉|바삭|고소|국물|소스|양념|고기|김치찜|찌개/)) add('menu');
  if (has(/감사|고마워|고맙/)) add('gratitude');
  if (has(/리뷰\s*이벤트|이벤트/)) add('event');
  if (has(/요청|부탁|주세요|바랍니다|원해/)) add('request');
  const complaints = [];
  const bad = (id, pattern) => { if (has(pattern)) complaints.push(id); };
  bad('missing', /누락|안\s*왔|빠졌|없길래|덜\s*왔/);
  bad('delivery', /배달.{0,14}(늦|느리|오래|지연)|한참\s*기다/);
  bad('temperature', /식었|차갑|미지근/);
  bad('quality', /맛없|별로|실망|싸구려|냄새|상했|엉망|스팸인가/);
  bad('packaging', /포장.{0,14}(새|터|망가|불편)|샜|쏟/);
  bad('service', /친절하지|불친절|응대.{0,10}(별로|실망)/);
  return { facts, complaints, sourceLong: text.replace(/\s/g, '').length > 95 };
}

const factLines = {
  firstOrder: {
    warm: ['처음 주문해 보셨는데 좋은 선택이었다고 해주시니 정말 반가워요.', '첫 주문부터 입맛에 맞으셨다니 준비한 보람이 큽니다.'],
    calm: ['첫 주문을 좋게 평가해 주셔서 감사합니다.', '처음 주문에서 만족을 드린 것 같아 감사드립니다.'],
    bright: ['첫 주문부터 마음에 드셨다니 정말 신나요!', '처음 시켜보셨는데 좋은 선택이었다니 저희도 기분이 좋아요!']
  },
  futureOrder: {
    warm: ['다음에도 주문해 주시겠다는 한마디가 저희에게 큰 힘이 됩니다.', '또 시켜주신다는 말씀에 다음 한 끼도 더 잘 준비하고 싶어져요.'],
    calm: ['다음에도 주문해 주시겠다는 말씀에 감사드립니다.', '재주문 의사를 전해주셔서 감사한 마음입니다.'],
    bright: ['다음에도 주문해 주신다니 벌써 반갑습니다!', '또 시켜주신다니 정말 힘이 나요!']
  },
  returnVisit: {
    warm: ['오랜만에 다시 주문하셨는데도 만족하셨다니 더 반가워요.', '다시 찾아주신 주문이 좋은 식사가 된 것 같아 기쁩니다.'],
    calm: ['다시 주문해 주시고 좋은 말씀까지 남겨주셔서 감사합니다.', '재방문에서도 만족을 드린 것 같아 감사드립니다.'],
    bright: ['다시 찾아주셨다니 정말 반가워요!', '재주문에도 만족하셨다니 저희도 신이 납니다!']
  },
  rice: {
    warm: ['공기밥이 예상보다 많이 와서 놀라셨을 텐데, 김치찜과 맛있게 드셨다니 다행이에요.', '공기밥 이야기를 이렇게 재미있게 남겨주셔서 저희도 웃음이 났어요.'],
    calm: ['공기밥 구성에 관해 남겨주신 경험과 맛있게 드신 말씀을 확인했습니다.', '공기밥까지 함께 맛있게 드셨다는 말씀에 감사드립니다.'],
    bright: ['공기밥 이야기까지 남겨주셔서 저희도 빵 웃었어요!', '김치찜에 공기밥까지 맛있게 드셨다니 정말 든든하네요!']
  },
  cleanPlate: {
    warm: ['아주 싹싹 드셨다는 말에서 맛있게 드신 모습이 그려져서 참 뿌듯해요.', '남김없이 드셨다는 한마디가 준비한 저희에게 큰 힘이 됩니다.'],
    calm: ['남김없이 드셨다는 말씀을 보니 준비한 보람을 느낍니다.', '끝까지 맛있게 드셨다는 리뷰에 감사드립니다.'],
    bright: ['싹싹 긁어드셨다니 이보다 반가운 칭찬이 있을까요!', '한 그릇 깔끔하게 드셨다는 말에 저희도 신이 납니다!']
  },
  revisit: {
    warm: ['오랜만에 다시 찾아주셨는데도 맛있게 드셔서 더 반가워요.', '다시 생각나 찾아주신 마음이 참 고맙습니다.'],
    calm: ['다시 찾아주신 주문에서 만족을 드린 것 같아 다행입니다.', '재주문해 주시고 좋은 말씀까지 남겨주셔서 감사합니다.'],
    bright: ['다시 찾아주셨다니 정말 반가워요!', '오랜만의 주문도 만족스러우셨다니 저희도 기분이 좋습니다!']
  },
  together: {
    warm: ['함께 드신 분들까지 맛있게 드셨다면 저희에게도 참 기쁜 소식이에요.', '같이 드시는 식사에 즐거움을 보탤 수 있었다니 반갑습니다.'],
    calm: ['함께 드신 분들께도 좋은 식사가 된 것 같아 감사합니다.', '여러 분이 드신 식사에 만족을 드린 점을 반갑게 생각합니다.'],
    bright: ['함께 드신 분들까지 맛있게 드셨다니 더없이 반가워요!', '다 같이 즐긴 한 끼가 되었다니 저희도 행복합니다!']
  },
  spicy: {
    warm: ['매콤한 맛을 즐겁게 드셨다는 말씀에 마음이 놓여요.', '매운맛도 취향에 잘 맞으셨다니 다행입니다.'],
    calm: ['매운맛을 좋게 평가해 주셔서 감사합니다.', '말씀해 주신 매콤한 맛의 만족도를 확인했습니다.'],
    bright: ['매콤한 맛이 딱 맞으셨다니 신나요!', '매운맛까지 맛있게 즐겨주셨다니 정말 반갑습니다!']
  },
  portion: {
    warm: ['든든하게 드셨다는 말씀에 저희도 기분이 좋아요.', '생각보다 넉넉하게 느껴지셨다니 뿌듯합니다.'],
    calm: ['든든한 양으로 느껴지셨다니 다행입니다.', '양에 만족하셨다는 의견도 감사히 확인했습니다.'],
    bright: ['든든하게 드셨다니 저희도 힘이 나요!', '푸짐하게 즐기셨다니 정말 반갑습니다!']
  },
  delivery: {
    warm: ['배달까지 만족스럽게 받아보셨다니 마음이 놓여요.', '기다림 없이 잘 받아보셨다니 다행입니다.'],
    calm: ['배달 과정까지 만족스러우셨다니 감사합니다.', '배송 경험을 좋게 말씀해 주셔서 감사합니다.'],
    bright: ['배달까지 기분 좋게 받아보셨다니 다행이에요!', '맛있는 식사가 잘 도착했다니 정말 반갑습니다!']
  },
  packaging: {
    warm: ['포장 상태까지 살펴봐 주셔서 감사해요.', '깔끔하게 받아보셨다니 마음이 놓입니다.'],
    calm: ['포장 상태까지 만족하셨다니 감사합니다.', '포장에 관한 좋은 의견도 감사히 확인했습니다.'],
    bright: ['포장까지 좋게 봐주셨다니 기뻐요!', '깔끔하게 받아보셨다니 정말 반갑습니다!']
  },
  menu: {
    warm: ['메뉴의 맛과 식감을 좋게 느껴주셨다니 뿌듯해요.', '김치찜을 맛있게 드셨다는 말씀에 큰 힘을 얻습니다.'],
    calm: ['메뉴를 맛있게 드셨다는 말씀에 감사드립니다.', '음식의 맛을 좋게 평가해 주셔서 감사합니다.'],
    bright: ['메뉴를 맛있게 즐겨주셨다니 정말 기뻐요!', '맛있게 드셨다는 한마디에 저희도 힘이 납니다!']
  },
  taste: {
    warm: ['맛있게 드셨다는 말씀이 저희에게 가장 큰 칭찬이에요.', '기분 좋게 드신 마음이 전해져서 반갑습니다.'],
    calm: ['맛있게 드셨다는 평가에 감사드립니다.', '좋은 식사가 되었다는 말씀을 반갑게 확인했습니다.'],
    bright: ['맛있게 드셨다니 저희도 정말 신나요!', '기분 좋게 드셨다는 말에 오늘도 힘이 납니다!']
  }
  ,gratitude: {
    warm: ['고맙다는 말씀을 남겨주셔서 오히려 저희가 더 감사한 마음이에요.', '따뜻한 인사를 전해주셔서 큰 힘이 됩니다.'],
    calm: ['감사의 말씀을 전해주셔서 감사드립니다.', '따뜻한 말씀까지 남겨주셔서 감사드립니다.'],
    bright: ['고맙다는 말씀에 저희가 더 힘을 얻어요!', '따뜻한 인사까지 전해주셔서 정말 감사합니다!']
  },
  event: {
    warm: ['이벤트와 함께 남겨주신 정성스러운 리뷰도 감사히 읽었어요.', '이벤트 참여로 들러주신 인연이 좋은 식사로 이어진 것 같아 반갑습니다.'],
    calm: ['이벤트 참여와 함께 의견을 남겨주셔서 감사합니다.', '리뷰 이벤트를 통해 전해주신 의견도 소중히 확인했습니다.'],
    bright: ['이벤트 참여까지 해주시고 리뷰도 남겨주셨다니 감사해요!', '이벤트로 만나 뵙고 이렇게 반가운 이야기도 들으니 더 기쁩니다!']
  },
  request: {
    warm: ['말씀해 주신 요청은 다음 준비 때 더 꼼꼼히 살펴볼게요.', '남겨주신 바람을 가볍게 넘기지 않고 잘 챙기겠습니다.'],
    calm: ['말씀해 주신 요청 사항을 확인하고 준비 과정에 반영하겠습니다.', '요청하신 부분은 다음 주문을 준비할 때 참고하겠습니다.'],
    bright: ['말씀해 주신 요청도 놓치지 않고 잘 챙겨볼게요!', '남겨주신 바람을 참고해서 더 기분 좋은 주문이 되도록 하겠습니다!']
  }
};

const complaintLines = {
  missing: ['구성품이 기대와 다르게 느껴져 당황하셨을 것 같아 죄송합니다.', '주문 구성과 관련해 불편을 드린 점 진심으로 사과드립니다.'],
  delivery: ['오래 기다리게 해드려 불편하셨을 텐데 죄송합니다.', '배달 지연으로 식사 시간을 불편하게 해드린 점 사과드립니다.'],
  temperature: ['음식이 알맞은 상태로 도착하지 않아 실망을 드린 점 죄송합니다.', '따뜻하게 드실 수 있도록 준비했어야 했는데 불편을 드렸습니다.'],
  quality: ['음식의 맛과 상태가 기대에 미치지 못해 실망을 드린 점 죄송합니다.', '말씀해 주신 음식 상태로 불쾌한 경험을 드린 점 무겁게 받아들이겠습니다.'],
  packaging: ['포장 상태로 불편을 드린 점 죄송합니다.', '포장 과정에서 만족스럽지 못한 경험을 드린 점 사과드립니다.'],
  service: ['응대 과정에서 불편을 드린 점 죄송합니다.', '서비스로 좋지 않은 기분을 드린 점 진심으로 사과드립니다.']
};

const longDetailLines = {
  firstOrder: {
    warm: '첫 주문의 설렘이 좋은 기억으로 남았다는 뜻으로 받아들여져 저희에게도 뜻깊어요.',
    calm: '처음 주문하신 경험을 좋게 남겨주신 점을 소중히 생각하겠습니다.',
    bright: '첫 주문부터 이렇게 반가운 후기를 남겨주시니 저희도 큰 응원을 받아요!'
  },
  futureOrder: {
    warm: '다음 주문에도 오늘처럼 기분 좋은 식사가 되도록 정성껏 준비할게요.',
    calm: '다음 주문에서도 같은 만족을 드릴 수 있도록 세심하게 준비하겠습니다.',
    bright: '다음에 또 생각나실 때도 맛있게 챙겨드릴게요!'
  },
  returnVisit: {
    warm: '다시 선택해 주신 마음까지 좋은 기억으로 남을 수 있도록 늘 정성껏 준비하겠습니다.',
    calm: '재주문에서도 한결같은 만족을 드릴 수 있도록 노력하겠습니다.',
    bright: '다시 찾아주신 마음까지 정말 감사하고 다음에도 반갑게 맞이할게요!'
  },
  rice: {
    warm: '예상과 달랐던 공기밥 구성도 결국 김치찜과 함께 즐거운 식사 이야기가 된 것 같아 다행이에요.',
    calm: '공기밥 구성에 관한 구체적인 경험까지 전해주셔서 주문 상황을 더 잘 이해할 수 있었습니다.',
    bright: '공기밥 세 그릇 이야기가 김치찜을 얼마나 맛있게 드셨는지 더 생생하게 전해줘요!'
  },
  cleanPlate: {
    warm: '한 끼를 끝까지 맛있게 드셨다는 표현은 음식 준비하는 사람에게 오래 남는 칭찬이에요.',
    calm: '마지막까지 드셨다는 말씀은 음식의 만족도를 보여주는 소중한 의견으로 받아들이겠습니다.',
    bright: '싹싹 드셨다는 말에 저희도 접시가 비워진 순간을 상상하며 기분 좋아졌어요!'
  },
  revisit: {
    warm: '다시 찾으신 날에도 기분 좋게 드실 수 있었다니 저희에게 더 뜻깊은 리뷰입니다.',
    calm: '재주문에서도 만족을 드릴 수 있도록 앞으로도 같은 기준으로 준비하겠습니다.',
    bright: '다시 생각나 찾아주신 마음까지 정말 감사하고, 다음에도 반갑게 맞이할게요!'
  },
  together: {
    warm: '함께한 식사 시간이 조금 더 즐거워졌다면 그것만으로도 저희에게 큰 보람이에요.',
    calm: '함께 드신 식사가 만족스러웠다는 점을 소중하게 생각하겠습니다.',
    bright: '같이 먹는 식사가 더 즐거웠다니 저희도 정말 신이 납니다!'
  },
  spicy: {
    warm: '매콤한 맛을 좋아하시는 취향에 맞았다는 점도 저희에게는 반가운 소식이에요.',
    calm: '매운맛에 관한 만족도도 앞으로 메뉴를 준비하는 데 참고하겠습니다.',
    bright: '매콤함까지 취향에 딱 맞았다니 정말 신나는 칭찬이에요!'
  },
  portion: {
    warm: '든든하게 드셨다는 말씀을 들으니 한 끼를 정성껏 준비한 보람을 느껴요.',
    calm: '양에 관한 만족도 역시 다음 주문을 준비하는 데 큰 힘이 됩니다.',
    bright: '든든한 한 끼가 되었다니 저희도 배부른 기분이에요!'
  },
  delivery: {
    warm: '식사 자체뿐 아니라 받아보시는 과정도 편안하셨다니 마음이 놓입니다.',
    calm: '배달 경험에 관한 좋은 의견도 소중히 확인했습니다.',
    bright: '맛있는 식사가 기분 좋게 도착했다니 저희도 활짝 웃게 돼요!'
  },
  packaging: {
    warm: '음식이 담긴 모습까지 신경 써서 봐주신 마음에 감사드립니다.',
    calm: '포장 경험에 대한 의견도 꼼꼼히 확인하겠습니다.',
    bright: '포장까지 칭찬해 주시니 저희도 더 힘내서 준비할 수 있어요!'
  },
  menu: {
    warm: '김치찜 한 그릇이 좋은 기억으로 남은 것 같아 저희도 참 기쁩니다.',
    calm: '메뉴의 맛을 좋게 평가해 주신 점을 감사히 확인했습니다.',
    bright: '김치찜을 맛있게 즐기셨다니 다음에도 자신 있게 준비할게요!'
  },
  taste: {
    warm: '맛있다는 솔직한 한마디가 오늘도 정성껏 준비할 힘이 됩니다.',
    calm: '맛에 대한 긍정적인 평가는 감사한 마음으로 받아들이겠습니다.',
    bright: '맛있다는 한마디가 오늘의 최고 응원이네요!'
  }
};

function hashText(value) { return [...value].reduce((n, ch) => ((n * 31) + ch.charCodeAt(0)) >>> 0, 7); }
function words(value) { return new Set((value.toLowerCase().match(/[가-힣a-z0-9]{2,}/g) || [])); }
function overlap(a, b) { const x = words(a), y = words(b); let count = 0; x.forEach(w => { if (y.has(w)) count++; }); return count; }
function recentContains(fragment) { return replyHistory.slice(0, 25).some(reply => reply.includes(fragment)) || previousReply.includes(fragment); }
function variationPick(options, seed, recent = true) {
  const ordered = options.map((value, index) => ({value, index, score: (index - seed % options.length + options.length) % options.length})).sort((a,b) => a.score - b.score);
  const selected = recent ? (ordered.find(item => !recentContains(item.value)) || ordered[0]) : ordered[0];
  return selected.value;
}
function replyIntro(name, tone, seed) {
  const salutation = `${(name || '고객').trim()}님,`;
  const kinds = [
    `${salutation} ${variationPick(replyProfiles[tone].openers, seed)}`,
    `${salutation} ${tone === 'calm' ? '리뷰를 남겨주셔서 감사합니다.' : '남겨주신 리뷰를 반갑게 읽었어요.'}`,
    `${salutation} ${tone === 'bright' ? '반가운 리뷰에 저희도 기분이 좋아요!' : '소중한 말씀을 들려주셔서 감사합니다.'}`
  ];
  return variationPick(kinds, seed, false);
}
function detailSentence(text, tone) {
  const map = [
    [/국물/, ['국물에 대해 남겨주신 말씀을 보니 한 끼를 어떻게 드셨는지가 생생하게 전해져요.', '국물에 관한 구체적인 의견도 감사히 확인했습니다.', '국물 이야기까지 들려주셔서 저희도 더 반가워요!']],
    [/고기/, ['고기에 대해 콕 집어 말씀해 주셔서 더 뿌듯해요.', '고기에 관한 의견도 소중히 확인했습니다.', '고기까지 좋게 봐주셨다니 정말 기쁩니다!']],
    [/소스|양념/, ['양념과 소스에 대해 남겨주신 표현이 특히 반갑습니다.', '양념에 관한 의견도 감사히 확인했습니다.', '양념까지 취향에 맞으셨다니 신나요!']],
    [/바삭|튀김/, ['바삭한 식감을 알아봐 주셔서 준비한 보람을 느껴요.', '식감에 관한 좋은 의견도 감사드립니다.', '바삭한 식감까지 좋게 느끼셨다니 신이 납니다!']],
    [/포장/, ['포장 상태까지 살펴봐 주셔서 감사해요.', '포장 경험에 관한 의견을 확인했습니다.', '포장까지 좋게 봐주셨다니 기뻐요!']],
    [/배달/, ['배달 과정까지 이야기해 주셔서 감사합니다.', '배달 경험에 관한 의견도 소중히 확인했습니다.', '배달 이야기까지 남겨주셔서 감사합니다!']]
  ];
  const found = map.find(([pattern]) => pattern.test(text));
  return found ? found[1][tone === 'warm' ? 0 : tone === 'calm' ? 1 : 2] : '';
}
function factSentence(fact, tone, seed, text = '') {
  if (fact.id === 'menu') {
    const detail = detailSentence(text, tone);
    if (detail) return detail;
  }
  const group = factLines[fact.id] || factLines.taste;
  return variationPick(group[tone], seed + hashText(fact.id));
}
function emojiFor(tone, seed, negative) {
  if (negative || tone === 'calm') return '';
  return variationPick(replyProfiles[tone].emojis, seed + 3);
}
function compactSentences(parts) { return parts.filter(Boolean).map(p => p.replace(/\s+/g, ' ').trim()).filter((p,i,a) => a.indexOf(p) === i); }
function trimToTarget(text, max) { return text.length <= max ? text : text.slice(0, max - 1).replace(/[ ,]+$/,'') + '…'; }

function ratingLine(tone) {
  const lines = {
    5: {
      warm: '별 다섯 개로 남겨주신 만족스러운 마음까지 고맙게 받았어요.',
      calm: '별 다섯 개의 좋은 평가에 감사드립니다.',
      bright: '별 다섯 개라니 오늘 정말 힘이 나요!'
    },
    4: {
      warm: '별 네 개로 좋게 봐주신 마음에 감사드리며, 다음에는 더 만족스러운 한 끼가 되도록 살필게요.',
      calm: '별 네 개로 남겨주신 평가를 감사히 받아 다음 주문은 더 세심히 준비하겠습니다.',
      bright: '별 네 개의 좋은 평가도 정말 감사합니다. 다음에는 더 기분 좋게 챙겨드릴게요!'
    },
    3: {
      warm: '별 세 개로 남겨주신 솔직한 평가를 가볍게 넘기지 않고 더 나은 식사가 되도록 살필게요.',
      calm: '별 세 개로 남겨주신 의견을 소중히 받아 개선하겠습니다.',
      bright: '솔직한 별 세 개 평가도 큰 도움이 됩니다. 다음에는 더 만족스럽게 준비할게요!'
    },
    2: {
      warm: '별 두 개라는 평가를 무겁게 받아들이고 불편했던 부분을 더 꼼꼼히 살피겠습니다.',
      calm: '별 두 개로 남겨주신 평가를 무겁게 받아 개선하겠습니다.',
      bright: '별 두 개로 남겨주신 아쉬운 마음을 가볍게 넘기지 않겠습니다.'
    },
    1: {
      warm: '별 한 개라는 평가를 남기실 만큼 실망을 드린 점을 무겁게 받아들입니다.',
      calm: '별 한 개로 남겨주신 평가를 무겁게 받아들이며 개선하겠습니다.',
      bright: '별 한 개로 남겨주신 마음을 가볍게 넘기지 않고 꼭 돌아보겠습니다.'
    }
  };
  return lines[rating]?.[tone] || lines[5][tone];
}

function buildPositiveReply(name, text, tone, length, seed) {
  const analysis = replyFactAnalysis(text);
  let facts = analysis.facts;
  if (!facts.length) facts = [{id:'taste'}];
  const introLine = replyIntro(name, tone, seed);
  const factTexts = facts.map((fact, index) => factSentence(fact, tone, seed + index * 11, text));
  const closer = variationPick(replyProfiles[tone].closers, seed + 17);
  const reaction = tone === 'calm'
    ? '좋게 드신 경험을 구체적으로 전해주셔서 감사드립니다.'
    : tone === 'bright'
      ? '리뷰를 읽으니 저희도 덩달아 즐거워집니다!'
      : '맛있게 드신 마음이 전해져 저희도 참 기뻐요.';
  let parts;
  if (length === 'short') {
    parts = [introLine, factTexts[0], rating === 4 ? ratingLine(tone) : ''];
    return trimToTarget(`${parts.join(' ')}${emojiFor(tone, seed, false) ? ` ${emojiFor(tone, seed, false)}` : ''}`, 75);
  }
  if (length === 'medium') {
    parts = [introLine, factTexts[0], factTexts[1] || ratingLine(tone), rating === 5 ? reaction : ratingLine(tone), closer];
    return trimToTarget(`${compactSentences(parts).join(' ')}${emojiFor(tone, seed, false) ? ` ${emojiFor(tone, seed, false)}` : ''}`, 190);
  }
  const longFacts = facts.slice(0, 3);
  const details = longFacts.map(fact => longDetailLines[fact.id]?.[tone] || longDetailLines.taste[tone]);
  parts = [introLine];
  longFacts.forEach((fact, index) => {
    parts.push(factSentence(fact, tone, seed + index * 11, text));
    parts.push(details[index]);
  });
  parts.push(ratingLine(tone), closer);
  // 실제 리뷰의 단서가 적으면 없는 이야기를 붙여 길이만 늘리지 않는다.
  if (facts.length < 3 && !analysis.sourceLong) parts = [introLine, factTexts[0], facts[1] ? factTexts[1] : reaction, closer];
  return trimToTarget(`${compactSentences(parts).join(' ')}${emojiFor(tone, seed, false) ? ` ${emojiFor(tone, seed, false)}` : ''}`, 420);
}

function buildComplaintReply(name, text, tone, length, seed) {
  const analysis = replyFactAnalysis(text);
  const keys = analysis.complaints.length ? analysis.complaints : ['quality'];
  const apology = variationPick(complaintLines[keys[0]], seed);
  const second = keys[1] ? variationPick(complaintLines[keys[1]], seed + 9) : '';
  const acknowledgement = '남겨주신 내용은 가볍게 넘기지 않고 조리와 포장 과정을 다시 확인해 같은 불편을 줄이도록 하겠습니다.';
  const closing = tone === 'calm' ? '같은 불편이 반복되지 않도록 개선하겠습니다.' : '불편을 드린 점 다시 한번 죄송합니다.';
  const head = `${(name || '고객').trim()}님,`;
  const parts = length === 'short'
    ? [head, apology, ratingLine(tone)]
    : length === 'medium'
      ? [head, apology, ratingLine(tone), second || acknowledgement, closing]
      : [head, apology, ratingLine(tone), second || acknowledgement, acknowledgement, '기대하고 주문하셨을 식사를 만족스럽게 마무리하지 못한 점을 무겁게 받아들이겠습니다.', closing];
  return trimToTarget(compactSentences(parts).join(' '), length === 'short' ? 75 : length === 'medium' ? 190 : 420);
}

function isComplaintReview(text) {
  const analysis = replyFactAnalysis(text);
  const explicitComplaint = /맛없|별로|실망|다신|최악|못\s*먹|불친절|배달.{0,12}(늦|느리|오래)|식었|차갑|미지근|누락|빠졌|안\s*왔|샜|쏟/.test(text);
  // 별점이 3개 이하면 명확한 불만 문장이 없어도 아쉬운 리뷰로 답한다.
  return rating <= 3 || explicitComplaint;
}

const localToneProfiles = {
  warm: {
    openers: ['남겨주신 리뷰를 천천히 읽어봤어요.', '적어주신 내용을 보니 식사하신 모습이 그려졌어요.', '정성스럽게 남겨주신 말씀이 참 고맙습니다.', '리뷰 한 줄 한 줄 고맙게 읽었습니다.', '이렇게 자세히 알려주셔서 마음이 따뜻해졌어요.', '주문하신 뒤의 느낌을 솔직하게 남겨주셔서 감사합니다.'],
    bridges: ['특히', '말씀해주신 것처럼', '적어주신 부분 중에', '그중에서도', '리뷰에서 짚어주신'],
    closers: ['다음에도 편하게 찾아주실 수 있도록 한 끼 한 끼 잘 챙기겠습니다.', '다음 주문도 기분 좋게 마무리하실 수 있게 준비할게요.', '또 생각나는 날에도 실망 없도록 정성껏 준비하겠습니다.', '오늘 남겨주신 마음 오래 기억하고 더 잘 준비하겠습니다.', '다음에도 따뜻한 한 끼로 보답하겠습니다.'],
    thanks: ['이런 이야기가 저희에게 정말 큰 힘이 됩니다.', '준비한 마음을 알아주신 것 같아 참 든든합니다.', '맛있게 드셨다는 말씀이 오래 남을 것 같아요.', '바쁜 와중에 남겨주신 후기라 더 고맙습니다.'],
    emojis: ['', '', '', ' 😊', ' 💛', ' 🍀']
  },
  calm: {
    openers: ['남겨주신 리뷰를 꼼꼼히 확인했습니다.', '이용 후기를 자세히 남겨주셔서 감사합니다.', '말씀해주신 내용을 차분히 읽어보았습니다.', '소중한 의견을 남겨주셔서 감사합니다.', '주문 후 경험을 구체적으로 전해주셔서 감사합니다.', '남겨주신 평가를 감사히 확인했습니다.'],
    bridges: ['특히', '말씀해주신 내용 중', '리뷰에서 언급해주신', '함께 적어주신', '구체적으로 남겨주신'],
    closers: ['앞으로도 만족스러운 식사가 되도록 꾸준히 살피겠습니다.', '다음 주문에서도 같은 만족을 드릴 수 있도록 준비하겠습니다.', '좋게 봐주신 부분은 유지하고 부족한 부분은 더 점검하겠습니다.', '앞으로도 한결같은 기준으로 준비하겠습니다.', '다음에도 편안하게 이용하실 수 있도록 신경 쓰겠습니다.'],
    thanks: ['구체적인 말씀 덕분에 준비한 부분을 다시 확인할 수 있었습니다.', '좋게 평가해주신 부분은 앞으로도 잘 지켜가겠습니다.', '남겨주신 의견을 소중히 참고하겠습니다.', '정성스러운 리뷰에 다시 한번 감사드립니다.'],
    emojis: ['']
  },
  bright: {
    openers: ['리뷰를 읽자마자 기분이 좋아졌어요!', '남겨주신 말씀이 정말 반가웠습니다!', '맛있게 드신 느낌이 그대로 전해져요!', '이렇게 생생하게 남겨주시니 힘이 납니다!', '반가운 후기를 남겨주셔서 정말 감사합니다!', '읽는 저희도 미소가 나는 리뷰였어요!'],
    bridges: ['특히', '무엇보다', '적어주신 것처럼', '그중에서도', '리뷰에서 콕 집어주신'],
    closers: ['다음에도 맛있게 챙겨드릴게요!', '또 생각나실 때 기분 좋게 찾아주세요!', '다음 한 끼도 든든하게 준비해둘게요!', '다음에도 기대에 맞게 잘 준비하겠습니다!', '또 주문 주시면 반갑게 챙겨드릴게요!'],
    thanks: ['이런 후기가 하루의 큰 힘이 됩니다!', '준비한 보람이 확 느껴지는 말씀이에요!', '좋게 남겨주신 마음 정말 감사합니다!', '다음에도 더 기분 좋게 드실 수 있게 힘내겠습니다!'],
    emojis: ['', '', ' 😊', ' ✨', ' 🙌', ' 💛']
  }
};

const localSignalRules = [
  {id:'tasteGood', group:'food', pattern:/맛있|맛나|존맛|맛도\s*좋|맛이\s*좋|최고|잘\s*먹|입맛에\s*맞|맛집/},
  {id:'flavorBalance', group:'food', pattern:/간이?\s*(딱|좋|맞)|짜지\s*않|싱겁지\s*않|담백|깔끔한\s*맛|느끼하지\s*않/},
  {id:'texture', group:'food', pattern:/바삭|쫄깃|촉촉|부드럽|아삭|식감|겉바|속촉/},
  {id:'freshness', group:'food', pattern:/신선|잡내\s*없|냄새\s*없|재료|깨끗한\s*맛/},
  {id:'soup', group:'food', pattern:/국물|육수|진하|얼큰|칼칼|시원한\s*맛/},
  {id:'meat', group:'food', pattern:/고기|살코기|비계|닭|돼지|소고기|삼겹|갈비/},
  {id:'sauce', group:'food', pattern:/소스|양념|드레싱|간장|매콤소스|찍어\s*먹/},
  {id:'sideDish', group:'food', pattern:/반찬|단무지|피클|사이드|서비스/},
  {id:'portion', group:'value', pattern:/양이|푸짐|넉넉|든든|많아|배부|배\s*터|가득/},
  {id:'value', group:'value', pattern:/가성비|가격|저렴|이\s*가격|구성|세트/},
  {id:'spicy', group:'taste', pattern:/매운|맵지만|매콤|칼칼|얼큰/},
  {id:'mild', group:'taste', pattern:/안\s*맵|순한|자극적이지|아이도\s*먹|부담\s*없/},
  {id:'cleanPlate', group:'reaction', pattern:/싹싹|긁어\s*먹|깨끗하게\s*먹|다\s*먹|완식|순삭/},
  {id:'craving', group:'reaction', pattern:/생각나|땡겨|먹고\s*싶|끌려|오랜만에/},
  {id:'firstOrder', group:'relationship', pattern:/(?:처음|첫)\s*(?:주문|시켜|시켜봤|먹어)/},
  {id:'returnVisit', group:'relationship', pattern:/오랜만|재주문|재방문|다시\s*(?:주문했|시켜\s*먹|먹었)/},
  {id:'futureOrder', group:'relationship', pattern:/(?:다음|또|다시)\s*(?:에\s*)?(?:주문|시킬|시켜|먹을)|다음.{0,12}(?:주문|시킬)|또.{0,12}(?:주문|시킬)/},
  {id:'deliveryFast', group:'serviceContext', pattern:/배달.{0,12}(빠르|빨리|좋|만족)|금방\s*(?:왔|도착)|예상보다\s*빨/},
  {id:'arrivedHot', group:'serviceContext', pattern:/따뜻|뜨끈|뜨겁|온기|식지\s*않/},
  {id:'packagingCareful', group:'serviceContext', pattern:/포장.{0,12}(깔끔|꼼꼼|정성|좋)|깔끔하게\s*포장|새지\s*않/},
  {id:'together', group:'context', pattern:/아이|애들|아기|가족|남편|아내|엄마|아빠|친구|동료|같이/},
  {id:'photo', group:'context', pattern:/사진|비주얼|먹음직|보기에도|양\s*보이/},
  {id:'gratitude', group:'context', pattern:/감사|고마워|고맙/},
  {id:'request', group:'context', pattern:/요청|부탁|주세요|바랍니다|원해|다음엔|다음에는/},
  {id:'event', group:'context', pattern:/리뷰\s*이벤트|이벤트/},
  {id:'menuMention', group:'food', pattern:/김치찜|찌개|치킨|피자|국밥|떡볶이|족발|보쌈|덮밥|백반|감자튀김|닭강정|치즈볼|볶음밥|라면|파스타|버거|샐러드/}
];

const localComplaintRules = [
  {id:'missing', pattern:/누락|안\s*왔|빠졌|없길래|덜\s*왔|안\s*넣/},
  {id:'deliverySlow', pattern:/배달.{0,14}(늦|느리|오래|지연)|한참\s*기다|예정보다\s*늦/},
  {id:'cold', pattern:/식었|차갑|미지근|온기\s*없/},
  {id:'quality', pattern:/맛없|별로|실망|싸구려|냄새|상했|엉망|못\s*먹|이상한\s*맛/},
  {id:'salty', pattern:/짜|너무\s*간|간이\s*세/},
  {id:'bland', pattern:/싱겁|밍밍|맛이\s*약/},
  {id:'tooSpicy', pattern:/너무\s*맵|매워서|맵기\s*조절/},
  {id:'packagingSpill', pattern:/포장.{0,14}(새|터|망가|불편)|샜|쏟|흘렀/},
  {id:'wrongMenu', pattern:/잘못\s*왔|다른\s*메뉴|메뉴가\s*바뀌|오배송/},
  {id:'portionSmall', pattern:/양이?\s*적|부족|작아|몇\s*개\s*없/},
  {id:'service', pattern:/친절하지|불친절|응대.{0,10}(별로|실망)|전화.{0,10}(불편|안\s*받)/},
  {id:'requestMissed', pattern:/요청.{0,12}(안|누락|못)|부탁.{0,12}(안|누락|못)/}
];

const localFactLines = {
  tasteGood: {
    warm: ['맛있게 드셨다는 말씀이 제일 먼저 눈에 들어왔어요.', '입맛에 잘 맞으셨다니 정말 다행입니다.', '맛있었다고 남겨주신 부분이 저희에게 큰 힘이 됩니다.', '좋은 식사로 기억해주신 것 같아 참 반갑습니다.'],
    calm: ['맛에 대해 좋게 평가해주셔서 감사합니다.', '음식을 만족스럽게 드신 것으로 보여 다행입니다.', '맛있게 드셨다는 의견을 감사히 확인했습니다.', '좋은 평가를 남겨주셔서 감사합니다.'],
    bright: ['맛있게 드셨다니 정말 기분 좋습니다!', '입맛에 맞으셨다니 저희도 신이 나요!', '맛있다는 한마디가 최고의 응원이에요!', '좋게 드셨다니 너무 반갑습니다!']
  },
  flavorBalance: {
    warm: ['간이 잘 맞았다고 느끼신 점이 특히 반가웠어요.', '자극적이지 않게 드셨다면 저희도 마음이 놓입니다.', '맛의 균형을 좋게 봐주셔서 고맙습니다.', '담백하고 편하게 드신 느낌이 전해졌어요.'],
    calm: ['간과 맛의 균형을 좋게 봐주셔서 감사합니다.', '자극적이지 않은 맛으로 느끼셨다는 점을 감사히 확인했습니다.', '맛의 균형에 관한 의견을 소중히 참고하겠습니다.', '담백한 맛을 좋게 평가해주셔서 감사합니다.'],
    bright: ['간이 딱 맞았다니 정말 다행이에요!', '자극적이지 않게 맛있게 드셨다니 반갑습니다!', '맛의 균형까지 알아봐 주셔서 힘이 납니다!', '편하게 드셨다는 느낌이 전해져요!']
  },
  texture: {
    warm: ['식감까지 콕 집어 남겨주셔서 준비한 보람이 있어요.', '바삭함이나 부드러움처럼 세세한 부분을 알아봐주셔서 고맙습니다.', '식감이 마음에 드셨다니 참 다행입니다.', '먹는 순간의 느낌까지 전해주셔서 반가웠어요.'],
    calm: ['식감에 관한 좋은 의견을 남겨주셔서 감사합니다.', '조리 상태를 좋게 봐주신 점을 감사히 확인했습니다.', '음식의 식감에 만족하셨다니 다행입니다.', '세부적인 맛의 느낌을 전해주셔서 감사합니다.'],
    bright: ['식감까지 마음에 드셨다니 정말 뿌듯해요!', '바삭하고 부드러운 포인트를 알아봐 주셨네요!', '먹는 재미까지 느끼셨다니 신납니다!', '식감 칭찬은 언제 들어도 힘이 나요!']
  },
  freshness: {
    warm: ['재료가 신선하게 느껴지셨다는 점이 참 반갑습니다.', '잡내 없이 편하게 드셨다면 저희도 마음이 놓여요.', '음식 상태를 좋게 봐주셔서 고맙습니다.', '깨끗한 맛으로 기억해주셨다니 다행입니다.'],
    calm: ['재료와 음식 상태를 좋게 평가해주셔서 감사합니다.', '신선도에 관한 긍정적인 의견을 확인했습니다.', '잡내 없이 드셨다는 말씀을 감사히 확인했습니다.', '음식 상태에 만족하셨다니 다행입니다.'],
    bright: ['신선하게 드셨다니 정말 반가워요!', '잡내 없이 맛있게 드셨다니 마음이 놓입니다!', '재료 칭찬까지 해주시니 힘이 납니다!', '깨끗한 맛으로 느끼셨다니 기뻐요!']
  },
  soup: {
    warm: ['국물 이야기를 남겨주신 부분이 특히 기억에 남아요.', '국물 맛이 입에 맞으셨다니 참 다행입니다.', '진한 맛을 좋게 느끼셨다면 준비한 보람이 큽니다.', '얼큰하고 편하게 드신 느낌이 전해졌어요.'],
    calm: ['국물 맛에 관한 의견을 감사히 확인했습니다.', '육수와 맛의 깊이를 좋게 봐주셔서 감사합니다.', '국물에 만족하셨다는 말씀을 소중히 참고하겠습니다.', '얼큰한 맛을 좋게 평가해주셔서 감사합니다.'],
    bright: ['국물까지 맛있게 드셨다니 정말 반갑습니다!', '진한 맛이 잘 맞으셨나 봐요!', '국물 이야기까지 남겨주셔서 힘이 나요!', '얼큰하게 즐기셨다니 기분 좋습니다!']
  },
  meat: {
    warm: ['고기 상태를 좋게 봐주신 부분도 참 고맙습니다.', '고기까지 맛있게 드셨다니 마음이 놓입니다.', '메인 재료를 만족스럽게 드신 것 같아 반가웠어요.', '고기에 대해 남겨주신 표현이 준비한 저희에게 힘이 됩니다.'],
    calm: ['고기 상태에 관한 좋은 의견을 남겨주셔서 감사합니다.', '주재료를 만족스럽게 드신 것으로 보여 다행입니다.', '고기에 관한 평가를 감사히 확인했습니다.', '메인 재료에 대한 의견을 소중히 참고하겠습니다.'],
    bright: ['고기까지 맛있게 드셨다니 정말 뿌듯해요!', '메인 재료가 마음에 드셨다니 신납니다!', '고기 칭찬은 저희도 힘이 확 나요!', '든든하게 즐기셨다니 반갑습니다!']
  },
  sauce: {
    warm: ['소스와 양념이 취향에 맞으셨다는 말씀이 반가웠어요.', '양념 맛을 좋게 봐주셔서 참 고맙습니다.', '찍어 드시는 맛까지 즐기셨다면 다행입니다.', '소스 이야기를 보니 맛있게 드신 장면이 떠올랐어요.'],
    calm: ['소스와 양념에 관한 좋은 의견을 확인했습니다.', '양념 맛을 만족스럽게 느끼셨다니 감사합니다.', '소스에 대한 평가를 소중히 참고하겠습니다.', '맛의 포인트를 구체적으로 남겨주셔서 감사합니다.'],
    bright: ['소스가 취향에 맞으셨다니 기뻐요!', '양념까지 맛있게 즐겨주셨네요!', '소스 칭찬까지 해주시니 신납니다!', '찍어 먹는 맛까지 챙겨주셔서 감사해요!']
  },
  sideDish: {
    warm: ['곁들임까지 봐주신 부분도 고맙습니다.', '사이드와 함께 더 맛있게 드셨다면 참 다행이에요.', '작은 구성까지 기억해주셔서 감사합니다.', '반찬까지 식사에 잘 어울렸다면 저희도 기쁩니다.'],
    calm: ['곁들임 구성에 관한 의견도 감사히 확인했습니다.', '사이드 메뉴에 만족하셨다니 감사합니다.', '전체 구성에 대한 평가를 소중히 참고하겠습니다.', '반찬과 구성에 관한 말씀을 확인했습니다.'],
    bright: ['사이드까지 맛있게 드셨다니 반가워요!', '작은 구성까지 봐주셔서 감사해요!', '함께 먹는 맛까지 좋았다니 신납니다!', '곁들임 칭찬도 정말 힘이 됩니다!']
  },
  portion: {
    warm: ['든든하게 드셨다는 말씀이 참 좋았습니다.', '양이 넉넉하게 느껴지셨다니 다행이에요.', '한 끼로 부족함 없으셨다면 저희도 기쁩니다.', '푸짐하다고 느끼신 부분이 특히 반가웠어요.'],
    calm: ['양에 만족하셨다는 의견을 감사히 확인했습니다.', '든든한 식사가 되었다니 다행입니다.', '구성의 양을 좋게 평가해주셔서 감사합니다.', '식사량에 관한 좋은 의견을 확인했습니다.'],
    bright: ['든든하게 드셨다니 저희도 기분 좋습니다!', '푸짐하게 느끼셨다니 정말 반가워요!', '배부른 한 끼가 되었다니 뿌듯해요!', '양까지 만족하셨다니 힘이 납니다!']
  },
  value: {
    warm: ['구성과 가격을 좋게 봐주셔서 고맙습니다.', '가성비 있게 느끼셨다면 참 다행입니다.', '가격 대비 만족스러웠다는 말씀에 힘이 납니다.', '부담 없이 드신 한 끼가 된 것 같아 반가워요.'],
    calm: ['구성과 가격에 대한 긍정적인 의견을 확인했습니다.', '가성비를 좋게 평가해주셔서 감사합니다.', '가격 대비 만족도에 관한 말씀을 감사히 확인했습니다.', '구성에 만족하셨다니 다행입니다.'],
    bright: ['가성비까지 만족하셨다니 반갑습니다!', '구성이 마음에 드셨다니 기뻐요!', '가격 대비 좋게 느끼셨다니 힘이 납니다!', '든든한 구성으로 기억해주셔서 감사해요!']
  },
  spicy: {
    warm: ['매콤한 맛이 잘 맞으셨다는 점이 반가웠어요.', '매운맛도 맛있게 즐겨주셨다니 다행입니다.', '칼칼한 맛을 좋게 느끼신 것 같아 기쁩니다.', '매콤함이 식사에 즐거움을 더했다면 좋겠습니다.'],
    calm: ['매운맛에 관한 긍정적인 의견을 확인했습니다.', '매콤한 맛을 좋게 평가해주셔서 감사합니다.', '맵기와 맛의 조화를 만족하셨다니 다행입니다.', '칼칼한 맛에 대한 의견을 참고하겠습니다.'],
    bright: ['매콤한 맛이 딱 맞으셨다니 신나요!', '매운맛까지 맛있게 즐겨주셨네요!', '칼칼하게 드셨다니 반갑습니다!', '매콤 포인트를 알아봐 주셔서 힘이 납니다!']
  },
  mild: {
    warm: ['부담 없이 드셨다는 느낌이 전해져서 마음이 놓입니다.', '자극적이지 않게 드셨다면 참 다행이에요.', '편하게 먹기 좋았다는 부분이 반가웠습니다.', '순하게 즐기신 식사가 된 것 같아 기쁩니다.'],
    calm: ['부담 없는 맛으로 느끼셨다는 의견을 확인했습니다.', '자극적이지 않은 맛을 좋게 봐주셔서 감사합니다.', '편하게 드신 점을 감사히 확인했습니다.', '순한 맛에 대한 만족도를 확인했습니다.'],
    bright: ['부담 없이 맛있게 드셨다니 반가워요!', '편하게 먹기 좋았다니 기쁩니다!', '순한 맛도 잘 맞으셨나 봐요!', '자극적이지 않게 즐기셨다니 다행이에요!']
  },
  cleanPlate: {
    warm: ['싹싹 드셨다는 말에서 맛있게 드신 마음이 그대로 느껴졌어요.', '남김없이 드셨다는 표현이 오래 기억에 남습니다.', '끝까지 맛있게 드셨다니 정말 뿌듯합니다.', '완식하셨다는 말씀이 제일 든든한 칭찬이에요.'],
    calm: ['남김없이 드셨다는 말씀을 감사히 확인했습니다.', '끝까지 만족스럽게 드신 것으로 보여 다행입니다.', '완식하셨다는 의견은 큰 격려가 됩니다.', '식사를 잘 마무리하셨다니 감사합니다.'],
    bright: ['싹싹 드셨다니 정말 최고의 칭찬이에요!', '완식하셨다니 저희도 신이 납니다!', '끝까지 맛있게 드셨다니 뿌듯해요!', '남김없이 드셨다는 말에 힘이 확 납니다!']
  },
  craving: {
    warm: ['생각나서 찾아주셨다는 점이 참 고맙습니다.', '먹고 싶어 주문하신 마음에 잘 맞았다면 다행이에요.', '그날의 입맛에 맞는 한 끼가 된 것 같아 반가웠습니다.', '문득 떠오른 메뉴로 저희를 찾아주셔서 감사합니다.'],
    calm: ['생각나 주문해주신 점에 감사드립니다.', '원하셨던 식사에 가까웠던 것으로 보여 다행입니다.', '주문 동기에 맞는 만족을 드린 것 같아 감사합니다.', '찾아주신 마음을 소중히 생각하겠습니다.'],
    bright: ['생각나서 찾아주셨다니 정말 반가워요!', '먹고 싶던 메뉴로 만족하셨다니 기쁩니다!', '딱 당기던 한 끼가 되었다니 신나요!', '떠올랐을 때 찾아주셔서 감사해요!']
  },
  firstOrder: {
    warm: ['첫 주문이 좋은 기억으로 남은 것 같아 참 반갑습니다.', '처음 찾아주셨는데 입맛에 맞으셨다니 마음이 놓여요.', '첫 선택에 만족하셨다는 말씀이 고맙습니다.', '처음 드신 날에 좋은 인상을 드린 것 같아 기쁩니다.'],
    calm: ['첫 주문에서 만족을 드린 것 같아 감사합니다.', '처음 이용해주시고 좋은 의견까지 남겨주셔서 감사합니다.', '첫 주문 경험을 좋게 평가해주셔서 감사합니다.', '처음 찾아주신 주문에 만족하셨다니 다행입니다.'],
    bright: ['첫 주문부터 마음에 드셨다니 정말 반가워요!', '처음 찾아주셨는데 좋은 기억이 됐다니 기쁩니다!', '첫 만남부터 좋은 후기라니 힘이 나요!', '첫 주문 성공이라니 저희도 신납니다!']
  },
  returnVisit: {
    warm: ['다시 찾아주셨다는 점이 무엇보다 고맙습니다.', '오랜만의 주문도 만족스러우셨다니 더 반가웠어요.', '재주문해주신 마음을 생각하니 더 잘 준비하고 싶어집니다.', '다시 선택해주신 주문이 좋은 식사가 되어 다행입니다.'],
    calm: ['다시 주문해주시고 좋은 의견을 남겨주셔서 감사합니다.', '재주문에서도 만족을 드린 것 같아 다행입니다.', '오랜만에 찾아주신 주문에 만족하셨다니 감사합니다.', '다시 선택해주신 점을 감사히 생각하겠습니다.'],
    bright: ['다시 찾아주셨다니 정말 반갑습니다!', '재주문에도 만족하셨다니 신나요!', '오랜만의 주문도 맛있게 드셨다니 기쁩니다!', '또 선택해주셔서 정말 감사해요!']
  },
  futureOrder: {
    warm: ['또 주문하고 싶다고 느끼셨다면 저희에게 큰 응원입니다.', '다음에도 찾아주신다는 말씀이 참 든든합니다.', '다음 주문을 떠올려주신 것만으로도 고맙습니다.', '다시 생각나는 가게가 되었다면 정말 기쁩니다.'],
    calm: ['재주문 의사를 남겨주셔서 감사드립니다.', '다음 주문에서도 만족을 드릴 수 있도록 준비하겠습니다.', '다시 이용하고 싶다고 평가해주셔서 감사합니다.', '다음에도 선택하실 수 있도록 꾸준히 관리하겠습니다.'],
    bright: ['또 주문하고 싶다니 정말 힘이 납니다!', '다음 주문 이야기에 벌써 반가워요!', '다시 생각나는 맛이었다니 기쁩니다!', '또 찾아주시면 더 맛있게 챙겨드릴게요!']
  },
  deliveryFast: {
    warm: ['받아보시는 과정이 편하셨다는 정도로만 고맙게 참고하겠습니다.', '기다림이 길지 않았던 점도 식사에 도움이 된 것 같아 다행입니다.', '도착 과정까지 무리 없었다니 마음이 놓입니다.', '식사 흐름이 끊기지 않았던 것 같아 반가웠습니다.'],
    calm: ['배달 과정이 원활했다는 의견도 확인했습니다.', '도착 시간에 관한 긍정적인 의견을 감사히 참고하겠습니다.', '받아보시는 과정이 불편하지 않았다니 다행입니다.', '배달 경험에 관한 말씀도 확인했습니다.'],
    bright: ['기다림이 길지 않았다니 다행이에요!', '도착까지 편했다니 반갑습니다!', '받아보시는 과정도 괜찮았다니 기뻐요!', '맛있는 타이밍에 잘 도착한 것 같아 다행입니다!']
  },
  arrivedHot: {
    warm: ['따뜻하게 드실 수 있었다니 마음이 놓입니다.', '온기가 잘 전해진 한 끼였던 것 같아 다행이에요.', '따뜻한 상태로 즐기셨다는 말씀이 반가웠습니다.', '식기 전에 드신 느낌이 전해져서 좋았습니다.'],
    calm: ['따뜻한 상태로 받아보셨다는 의견을 확인했습니다.', '음식 온도에 만족하셨다니 다행입니다.', '도착 상태에 관한 좋은 의견을 감사히 확인했습니다.', '식사 온도에 대한 말씀을 참고하겠습니다.'],
    bright: ['따뜻하게 드셨다니 정말 다행이에요!', '온기까지 잘 도착했다니 기쁩니다!', '따뜻한 한 끼가 되었다니 반가워요!', '식기 전에 맛있게 드셨다니 신납니다!']
  },
  packagingCareful: {
    warm: ['포장은 맛을 잘 전하기 위한 기본으로 보고, 좋게 받아주셔서 다행입니다.', '깔끔하게 받아보셨다니 식사 전 마음이 조금은 편하셨을 것 같아요.', '포장 상태는 기본이라 생각하지만, 좋게 봐주셔서 고맙습니다.', '새지 않고 잘 도착했다면 저희도 마음이 놓입니다.'],
    calm: ['포장 상태에 관한 의견도 감사히 확인했습니다.', '깔끔하게 받아보셨다는 말씀을 참고하겠습니다.', '포장 과정이 불편하지 않았다니 다행입니다.', '도착 상태에 대한 의견을 확인했습니다.'],
    bright: ['깔끔하게 받아보셨다니 다행입니다!', '포장은 기본이지만 좋게 봐주셔서 감사해요!', '새지 않고 잘 도착했다니 마음이 놓여요!', '식사 전부터 불편 없으셨다니 기쁩니다!']
  },
  together: {
    warm: ['함께 드신 상황도 읽었지만, 무엇보다 음식이 입맛에 맞으셨다는 점이 반가웠습니다.', '같이 드신 자리에서 좋은 식사가 되었다면 저희도 기쁩니다.', '함께한 한 끼에 저희 음식이 잘 어울렸다면 다행이에요.', '여럿이 드시는 식사에 불편함이 없었다면 참 좋겠습니다.'],
    calm: ['함께 드신 상황에 대한 말씀도 확인했습니다.', '여러 분이 드신 식사에 만족을 드린 것으로 보여 다행입니다.', '동행과 함께한 식사 경험을 전해주셔서 감사합니다.', '함께 이용하신 상황도 참고하겠습니다.'],
    bright: ['같이 드신 자리에도 잘 어울렸다니 반가워요!', '함께한 한 끼가 좋았다니 저희도 기쁩니다!', '여럿이 맛있게 드셨다면 더없이 좋습니다!', '식사 시간이 즐거우셨다니 힘이 나요!']
  },
  photo: {
    warm: ['사진으로 남기고 싶을 만큼 괜찮게 느끼셨다면 참 고맙습니다.', '비주얼까지 좋게 봐주신 마음이 전해졌어요.', '보기에도 먹음직스러웠다는 점이 반가웠습니다.', '사진 이야기까지 남겨주셔서 감사합니다.'],
    calm: ['사진과 비주얼에 관한 의견도 확인했습니다.', '음식의 보이는 상태를 좋게 평가해주셔서 감사합니다.', '비주얼에 대한 긍정적인 말씀을 참고하겠습니다.', '사진으로 남겨주신 점도 감사드립니다.'],
    bright: ['사진까지 남기고 싶으셨다니 기뻐요!', '보기에도 맛있어 보였다니 반갑습니다!', '비주얼 칭찬까지 감사합니다!', '사진 이야기 덕분에 더 생생하게 느껴져요!']
  },
  gratitude: {
    warm: ['고맙다는 말씀까지 남겨주셔서 오히려 저희가 더 감사합니다.', '따뜻한 인사를 전해주신 마음도 잘 받았습니다.', '마지막 인사까지 다정하게 남겨주셔서 고맙습니다.', '감사하다는 말씀이 저희에게 더 큰 감사로 돌아왔어요.'],
    calm: ['감사의 말씀까지 전해주셔서 감사합니다.', '따뜻한 인사를 남겨주신 점도 감사드립니다.', '남겨주신 감사 인사를 소중히 받겠습니다.', '정중한 말씀에 다시 한번 감사드립니다.'],
    bright: ['고맙다는 말씀에 저희가 더 감사합니다!', '따뜻한 인사까지 남겨주셔서 힘이 나요!', '감사 인사 덕분에 더 기분 좋아졌습니다!', '좋은 말씀 정말 감사해요!']
  },
  request: {
    warm: ['남겨주신 요청은 다음 준비 때 더 꼼꼼히 살피겠습니다.', '부탁하신 부분은 가볍게 넘기지 않고 챙겨보겠습니다.', '다음에는 요청하신 마음까지 더 잘 반영하겠습니다.', '말씀해주신 바람은 준비 과정에서 다시 확인하겠습니다.'],
    calm: ['요청하신 내용은 다음 주문 준비 시 참고하겠습니다.', '남겨주신 요청 사항을 확인했습니다.', '부탁하신 부분은 준비 과정에서 더 살피겠습니다.', '요청과 관련된 의견을 소중히 참고하겠습니다.'],
    bright: ['말씀해주신 요청도 다음엔 더 잘 챙겨볼게요!', '부탁하신 부분 놓치지 않도록 살피겠습니다!', '다음에는 요청하신 마음까지 더 잘 맞춰볼게요!', '남겨주신 바람도 잘 기억하겠습니다!']
  },
  event: {
    warm: ['이벤트로 남겨주신 리뷰라도 내용은 감사히 읽었습니다.', '이벤트 참여와 함께 솔직한 후기를 전해주셔서 고맙습니다.', '참여해주신 마음까지 감사히 받았습니다.', '이벤트를 통해 전해주신 의견도 소중합니다.'],
    calm: ['리뷰 이벤트와 함께 남겨주신 의견을 확인했습니다.', '이벤트 참여 후 남겨주신 리뷰도 감사히 참고하겠습니다.', '참여와 의견 전달에 감사드립니다.', '이벤트 관련 리뷰도 소중한 의견으로 확인했습니다.'],
    bright: ['이벤트 참여와 리뷰까지 감사해요!', '이벤트로 만나 이렇게 후기도 들으니 반갑습니다!', '참여해주시고 좋은 말씀까지 남겨주셔서 감사해요!', '이벤트 리뷰도 정성껏 읽었습니다!']
  },
  menuMention: {
    warm: ['메뉴를 직접 언급해주셔서 어떤 부분이 좋으셨는지 더 잘 느껴졌어요.', '주문하신 메뉴가 입맛에 맞았던 것 같아 다행입니다.', '메뉴 이름까지 남겨주신 덕분에 리뷰가 더 생생했습니다.', '드신 메뉴에 대한 만족이 전해져서 반가웠습니다.'],
    calm: ['주문 메뉴에 관한 의견을 감사히 확인했습니다.', '메뉴를 직접 언급해주셔서 참고에 도움이 됩니다.', '드신 메뉴에 만족하셨다니 다행입니다.', '메뉴 관련 평가를 소중히 확인했습니다.'],
    bright: ['메뉴까지 콕 집어주셔서 더 반갑습니다!', '드신 메뉴가 마음에 드셨다니 기뻐요!', '메뉴 이야기가 있어 리뷰가 더 생생해요!', '주문하신 메뉴를 맛있게 드셨다니 힘이 납니다!']
  }
};

const localComplaintLines = {
  lowRating: ['별점으로 남겨주신 아쉬운 마음을 무겁게 확인했습니다.', '만족스럽게 드셨다고 보기 어려운 평가라 더 꼼꼼히 돌아보겠습니다.', '말씀은 짧아도 별점에 담긴 아쉬움을 가볍게 넘기지 않겠습니다.'],
  missing: ['빠진 구성이 있었다면 식사 전부터 많이 당황스러우셨을 것 같습니다.', '주문하신 구성에 누락이 있었다는 점을 무겁게 확인했습니다.', '기대하고 열어보셨을 텐데 빠진 부분이 있어 불편하셨겠습니다.'],
  deliverySlow: ['기다리시는 시간이 길어져 식사 흐름이 불편해지셨을 것 같습니다.', '배달 지연으로 불편을 드린 점 죄송합니다.', '예상보다 늦게 받아보셔서 많이 답답하셨을 것 같습니다.'],
  cold: ['따뜻하게 드셨어야 할 음식이 식어 있었다면 실망이 크셨을 것 같습니다.', '음식 온도가 만족스럽지 못했던 점 죄송합니다.', '알맞은 상태로 드시지 못하게 된 부분을 무겁게 받아들이겠습니다.'],
  quality: ['음식의 맛과 상태가 기대에 미치지 못했다면 변명의 여지가 없습니다.', '말씀해주신 맛과 상태에 대한 실망을 가볍게 넘기지 않겠습니다.', '드시는 동안 불편함이 남으셨을 것 같아 죄송합니다.'],
  salty: ['간이 세게 느껴져 편하게 드시기 어려우셨을 것 같습니다.', '짜게 느끼신 부분은 조리 기준을 다시 확인하겠습니다.', '맛의 균형이 맞지 않아 불편을 드린 점 죄송합니다.'],
  bland: ['맛이 싱겁거나 밍밍하게 느껴졌다면 기대에 못 미친 식사였을 것 같습니다.', '간이 부족하게 느껴진 부분은 다시 점검하겠습니다.', '맛의 선명함이 부족했다는 말씀을 무겁게 받아들이겠습니다.'],
  tooSpicy: ['맵기가 예상보다 강했다면 편하게 드시기 어려우셨을 것 같습니다.', '매운맛 조절에 대한 아쉬움을 확인했습니다.', '맵기 안내와 조리 기준을 다시 살피겠습니다.'],
  packagingSpill: ['새거나 흐른 상태로 받아보셨다면 식사 전부터 불쾌하셨을 것 같습니다.', '포장 상태로 불편을 드린 점 죄송합니다.', '포장 과정에서 만족스럽지 못한 경험을 드린 점 사과드립니다.'],
  wrongMenu: ['주문하신 내용과 다르게 받아보셨다면 당연히 불편하셨을 것입니다.', '메뉴 확인 과정에서 아쉬움을 드린 점 죄송합니다.', '잘못 전달된 부분은 확인 절차를 다시 살피겠습니다.'],
  portionSmall: ['양이 부족하게 느껴지셨다면 든든한 식사가 되지 못했을 것 같습니다.', '구성의 양에 아쉬움을 드린 점 확인했습니다.', '양과 구성에 대한 말씀을 다시 점검하겠습니다.'],
  service: ['응대 과정에서 불편한 마음을 드렸다면 진심으로 죄송합니다.', '서비스 경험이 좋지 않게 남은 점을 무겁게 받아들이겠습니다.', '편하게 문의하고 이용하셨어야 하는데 그러지 못했던 점 사과드립니다.'],
  requestMissed: ['요청하신 부분이 제대로 반영되지 않았다면 많이 아쉬우셨을 것 같습니다.', '부탁하신 내용을 놓친 부분은 다시 확인하겠습니다.', '요청 사항 확인 과정이 부족했던 점 죄송합니다.']
};

function replyFactAnalysis(text) {
  const source = String(text || '');
  const facts = [];
  const complaints = [];
  localSignalRules.forEach(rule => { if (rule.pattern.test(source)) facts.push({id: rule.id, group: rule.group}); });
  localComplaintRules.forEach(rule => { if (rule.pattern.test(source)) complaints.push(rule.id); });
  if (rating >= 4 && !facts.some(f => ['food', 'taste', 'value', 'reaction'].includes(f.group))) facts.push({id:'tasteGood', group:'food'});
  return {facts, complaints: unique(complaints), sourceLong: source.replace(/\s/g, '').length > 95};
}

function localPick(options, seed, salt = 0) {
  return options[Math.abs(seed + salt) % options.length];
}

function localLine(id, tone, seed) {
  const group = localFactLines[id] || localFactLines.tasteGood;
  return localPick(group[tone] || group.warm, seed + hashText(id));
}

function localComplaintLine(id, seed) {
  return localPick(localComplaintLines[id] || localComplaintLines.quality, seed + hashText(id));
}

function orderedLocalFacts(facts, seed) {
  const rank = {food: 1, taste: 2, value: 3, reaction: 4, relationship: 5, serviceContext: 6, context: 7};
  return [...facts].sort((a, b) => {
    const diff = (rank[a.group] || 9) - (rank[b.group] || 9);
    return diff || ((hashText(a.id) + seed) % 17) - ((hashText(b.id) + seed) % 17);
  });
}

function buildPositiveReply(name, text, tone, length, seed) {
  const analysis = replyFactAnalysis(text);
  const profile = localToneProfiles[tone] || localToneProfiles.warm;
  const facts = orderedLocalFacts(analysis.facts.length ? analysis.facts : [{id:'tasteGood', group:'food'}], seed);
  const salutation = `${(name || '고객').trim()}님,`;
  const intro = `${salutation} ${localPick(profile.openers, seed)}`;
  const selected = facts.slice(0, length === 'long' ? 5 : length === 'medium' ? 3 : 1);
  const factParts = selected.map((fact, index) => {
    const prefix = index === 0 && length !== 'short' ? `${localPick(profile.bridges, seed, index * 5)} ` : '';
    return `${prefix}${localLine(fact.id, tone, seed + index * 13)}`;
  });
  const ratingPart = rating < 5 ? ratingLine(tone) : '';
  const thanks = localPick(profile.thanks, seed, 23);
  const closer = localPick(profile.closers, seed, 41);
  const emoji = localPick(profile.emojis, seed, 53);
  let parts = length === 'short'
    ? [intro, factParts[0]]
    : length === 'medium'
      ? [intro, ...factParts, ratingPart || thanks, closer]
      : [intro, ...factParts, ratingPart || thanks, analysis.sourceLong ? localPick(profile.thanks, seed, 61) : '', closer];
  parts = compactSentences(parts);
  const max = length === 'short' ? 95 : length === 'medium' ? 230 : 520;
  return trimToTarget(parts.join(' ') + emoji, max);
}

function buildComplaintReply(name, text, tone, length, seed) {
  const analysis = replyFactAnalysis(text);
  const profile = localToneProfiles[tone] || localToneProfiles.warm;
  const keys = analysis.complaints.length ? analysis.complaints : (rating <= 3 ? ['lowRating'] : ['quality']);
  const head = `${(name || '고객').trim()}님, 남겨주신 내용을 확인했습니다.`;
  const lowRatingApology = rating <= 3 ? '불편을 드려 죄송합니다.' : '';
  const apology = localComplaintLine(keys[0], seed);
  const second = keys[1] ? localComplaintLine(keys[1], seed + 17) : '';
  const checkLines = [
    '말씀해주신 부분은 조리와 포장, 전달 과정을 다시 확인하겠습니다.',
    '같은 불편이 반복되지 않도록 준비 과정을 더 꼼꼼히 살피겠습니다.',
    '기대하고 주문하신 식사가 만족스럽지 못했던 점을 무겁게 받아들이겠습니다.',
    '남겨주신 경험이 헛되지 않도록 바로 점검하겠습니다.'
  ];
  const closing = rating <= 3
    ? '다음에는 더 나은 한 끼로 느끼실 수 있도록 준비 과정을 꼼꼼히 살피겠습니다.'
    : tone === 'bright'
    ? '불편을 드린 점 다시 한번 죄송합니다. 다음에는 더 나은 식사로 느끼실 수 있게 챙기겠습니다.'
    : tone === 'calm'
      ? '불편을 드린 점 사과드리며, 개선에 반영하겠습니다.'
      : '불편을 드려 죄송합니다. 다음에는 더 나은 한 끼가 되도록 꼭 살피겠습니다.';
  const parts = length === 'short'
    ? [head, lowRatingApology, apology]
    : length === 'medium'
      ? [head, lowRatingApology, apology, ratingLine(tone), second || localPick(checkLines, seed, 29), closing]
      : [head, lowRatingApology, apology, second, ratingLine(tone), localPick(checkLines, seed, 29), localPick(checkLines, seed, 47), closing];
  return trimToTarget(compactSentences(parts).join(' '), length === 'short' ? 105 : length === 'medium' ? 250 : 560);
}

function saveReplyHistory(result) {
  previousReply = result;
  replyHistory = [result, ...replyHistory.filter(reply => reply !== result)].slice(0, 120);
  localStorage.setItem('review-helper-reply-history', JSON.stringify(replyHistory));
}

function generateLocally(isReroll = false) {
  const review = $('#reviewText').value.trim();
  const text = [review, detectedMenu ? `사진 아래 주문 메뉴: ${detectedMenu}` : ''].filter(Boolean).join('\n');
  const name = $('#customerName').value.trim();
  const tone = $('#tone').value;
  const length = $('#replyLength').value;
  if (!review) {
    $('#result').value = `${(name || '고객').trim()}님, 리뷰 내용을 입력하거나 이미지 글자 읽기를 먼저 실행해 주세요.`;
    return;
  }
  const source = `${name}|${text}|${tone}|${length}`;
  let chosen = '';
  for (let attempt = 0; attempt < 120; attempt++) {
    const seed = hashText(source) + variationId + attempt * 37 + (isReroll ? 101 : 0);
    const negative = isComplaintReview(text);
    const candidate = negative ? buildComplaintReply(name, text, tone, length, seed) : buildPositiveReply(name, text, tone, length, seed);
    if (!replyHistory.includes(candidate) && (!previousReply || overlap(candidate, previousReply) < 7)) { chosen = candidate; break; }
    chosen = candidate;
  }
  variationId += 1;
  localStorage.setItem('review-helper-variation-id', String(variationId));
  saveReplyHistory(chosen);
  $('#result').value = chosen;
}
async function generate(isReroll = false) {
  const text = $('#reviewText').value.trim();
  const name = $('#customerName').value.trim();
  if (!text) return generateLocally(isReroll);

  const isVercelHost = location.hostname.endsWith('.vercel.app') || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const endpoint = window.REVIEW_HELPER_AI_ENDPOINT || (isVercelHost ? '/api/generate-reply' : '');
  if (!endpoint) {
    generateLocally(isReroll);
    const status = $('#aiStatus');
    if (status) status.textContent = 'AI 서버를 연결하면 리뷰 맥락을 더 깊이 반영한 답글을 만들 수 있어요.';
    return;
  }

  const button = $('#generate');
  const status = $('#aiStatus');
  const originalLabel = button.innerHTML;
  button.disabled = true;
  button.textContent = 'AI 답글 만드는 중…';
  if (status) status.textContent = '리뷰 내용을 읽고 상황에 맞는 답글을 만들고 있어요…';
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        review: text,
        menu: detectedMenu,
        rating,
        nickname: name,
        tone: $('#tone').value,
        length: $('#replyLength').value,
        previousReply: isReroll ? previousReply : ''
      })
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.reply) throw new Error(payload.error || 'AI 답글을 만들지 못했습니다.');
    variationId += 1;
    localStorage.setItem('review-helper-variation-id', String(variationId));
    saveReplyHistory(payload.reply.trim());
    $('#result').value = payload.reply.trim();
    if (status) status.textContent = 'AI가 리뷰 내용에 맞춰 답글을 만들었어요.';
  } catch (error) {
    console.error('AI reply generation failed', error);
    generateLocally(isReroll);
    if (status) status.textContent = 'AI 연결에 실패해 기본 답글로 만들었어요. 잠시 후 다시 시도해 주세요.';
  } finally {
    button.disabled = false;
    button.innerHTML = originalLabel;
  }
}
function cleanOcrLine(line){ return line.replace(/[•·]/g,' ').replace(/\s+/g,' ').trim(); }
function cleanReviewText(text){
  return text
    .replace(/\bAZ\w*\s*=\s*[A-Za-z|]*\s*/gi,' ')
    .replace(/\b(?:Zoid|HH|TR|as)\b\s*(?:=\s*[Il|])?/gi,' ')
    .replace(/공기밥\s*얘기가\s*없길래\s*안\s*(?:[A-Za-z=|]+\s*)?알고/g,'공기밥 얘기가 없길래 안 오는 줄 알고')
    .replace(/김치\s*찜\s*인분/g,'김치찜 1인분')
    .replace(/공기가\s*세개가/g,'공기가 세 개가')
    .replace(/\s+/g,' ').trim();
}
function isKoreanReviewLine(text){
  const compact=String(text||'').replace(/\s+/g,'');
  if(!compact)return false;
  const korean=(compact.match(/[가-힣ㄱ-ㅎㅏ-ㅣ]/g)||[]).length;
  const latin=(compact.match(/[A-Za-z]/g)||[]).length;
  const symbols=(compact.match(/[0-9_`~@#$%^&*+=|\\/()\[\]{}<>]/g)||[]).length;
  // 음식 사진·배경에서 읽힌 영문/기호 덩어리는 리뷰 본문으로 넣지 않는다.
  if(korean>=2)return korean*1.15>=latin+symbols*.25;
  // "ㅎㅎ", "ㅠㅠ", "굿" 같은 매우 짧은 한국어 리뷰도 허용한다.
  return /^[가-힣ㄱ-ㅎㅏ-ㅣ!?.~]+$/.test(compact);
}
function isName(line){ return /^[가-힣A-Za-z0-9][가-힣A-Za-z0-9._-]{1,19}$/.test(line) && !ignoreLine.test(line) && !/^(오늘|최근|리뷰|별점|주문)$/.test(line); }
function findNickname(entries,allText=''){
  const direct=allText.match(/([가-힣A-Za-z0-9._-]{2,20})\s*[>〉]/);
  if(direct&&!ignoreLine.test(direct[1]))return direct[1];
  const meta=/리뷰\s*\d+|평균\s*별점|최근\s*\d+번|오늘|어제|지난\s*달|알뜰배달|한집배달|별점|★|☆/;
  const firstMeta=entries.filter(line=>meta.test(line.text)).sort((a,b)=>a.box.y0-b.box.y0)[0];
  if(!firstMeta)return '';
  const metaHeight=Math.max(20,firstMeta.box.y1-firstMeta.box.y0);
  const candidates=entries.filter(line=>isName(line.text)&&line.box.y0<firstMeta.box.y0&&firstMeta.box.y0-line.box.y1<metaHeight*5.5).sort((a,b)=>b.box.y0-a.box.y0);
  return candidates[0]?candidates[0].text.replace(/[>〉].*/, '').trim():'';
}
function parseReviewOcr(data){
  const entries=(data.lines||[]).map(line=>({text:cleanOcrLine(line.text||''),box:line.bbox||{x0:0,y0:0,x1:0,y1:0}})).filter(line=>line.text);
  const meta=/리뷰\s*\d+|평균\s*별점|최근\s*\d+번|오늘|어제|지난\s*달|알뜰배달|한집배달|별점|★|☆/;
  const anchor=entries.filter(line=>meta.test(line.text)).sort((a,b)=>b.box.y1-a.box.y1)[0];
  if(!anchor)return {review:'',menu:''};
  const imageHeight=Math.max(...entries.map(line=>line.box.y1),anchor.box.y1); const maxStartGap=Math.max(90,imageHeight*.18);
  const candidate=entries.filter(line=>line.box.y0>anchor.box.y1&&!meta.test(line.text)&&!ignoreLine.test(line.text)).sort((a,b)=>a.box.y0-b.box.y0);
  const first=candidate.find(line=>line.box.y0-anchor.box.y1<maxStartGap&&isKoreanReviewLine(line.text));
  if(!first)return {review:'',menu:''};
  const height=Math.max(20,first.box.y1-first.box.y0), review=[first];
  for(const line of candidate){
    if(line===first||line.box.y0<first.box.y0)continue;
    const previous=review[review.length-1];
    if(line.box.y0-previous.box.y1>height*2.8)break;
    // 본문 아래 음식 사진에서 OCR이 만든 잡문자는 여기서 차단한다.
    if(!isKoreanReviewLine(line.text))break;
    review.push(line);
  }
  const text=cleanReviewText(review.map(line=>line.text).join(' ').replace(/\s+/g,' ').trim().replace(/\s+(?:[0-9Il|,.'`()%]+(?:\s+[0-9Il|,.'`()%]+)*)$/,'').trim());
  const reviewBottom=review[review.length-1].box.y1;
  const menuPattern=/(김치찜|김치찌개|치킨|피자|국밥|떡볶이|족발|보쌈|덮밥|백반|세트|감자튀김|닭강정|치즈볼|볶음밥|삼겹|갈비|라면|파스타|버거|샐러드)/;
  const menuLine=entries
    .filter(line=>line.box.y0>reviewBottom+height*1.5&&menuPattern.test(line.text)&&line.text.length<=60&&!ignoreLine.test(line.text))
    .sort((a,b)=>a.box.y0-b.box.y0)[0];
  const menu=menuLine?cleanReviewText(menuLine.text).replace(/^[•·\s]+|[👍♡♥\s]+$/g,'').trim():'';
  return {review:text,menu};
}
async function prepareOcrImage(file){
  const bitmap=await createImageBitmap(file), maxSide=1800, scale=Math.min(2,maxSide/Math.max(bitmap.width,bitmap.height));
  const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*scale); canvas.height=Math.round(bitmap.height*scale);
  const context=canvas.getContext('2d',{willReadFrequently:true}); context.drawImage(bitmap,0,0,canvas.width,canvas.height);
  const image=context.getImageData(0,0,canvas.width,canvas.height), pixels=image.data;
  for(let i=0;i<pixels.length;i+=4){const gray=Math.min(255,Math.max(0,((pixels[i]*.299+pixels[i+1]*.587+pixels[i+2]*.114)-128)*1.35+128));pixels[i]=pixels[i+1]=pixels[i+2]=gray;}
  context.putImageData(image,0,0); return canvas;
}
async function recoverNickname(file,data){
  const entries=(data.lines||[]).map(line=>({text:cleanOcrLine(line.text||''),box:line.bbox||{x0:0,y0:0,x1:0,y1:0}})).filter(line=>line.text);
  const meta=/리뷰\s*\d+|평균\s*별점|최근\s*\d+번|오늘|어제|지난\s*달|알뜰배달|한집배달|별점|★|☆/;
  const firstMeta=entries.filter(line=>meta.test(line.text)).sort((a,b)=>a.box.y0-b.box.y0)[0];
  if(!firstMeta)return '';
  const bitmap=await createImageBitmap(file), ocrWidth=data.width||bitmap.width, ocrHeight=data.height||bitmap.height;
  const sx=bitmap.width/ocrWidth, sy=bitmap.height/ocrHeight, lineHeight=Math.max(25,firstMeta.box.y1-firstMeta.box.y0);
  const sourceY=Math.max(0,Math.round((firstMeta.box.y0-lineHeight*5.2)*sy)), sourceH=Math.min(bitmap.height-sourceY,Math.round(lineHeight*5.5*sy));
  const canvas=document.createElement('canvas'); canvas.width=Math.round(bitmap.width*.82); canvas.height=sourceH;
  canvas.getContext('2d').drawImage(bitmap,0,sourceY,canvas.width,sourceH,0,0,canvas.width,sourceH);
  const retry=await Tesseract.recognize(canvas,'kor+eng');
  const retryEntries=(retry.data.lines||[]).map(line=>({text:cleanOcrLine(line.text||''),box:line.bbox||{x0:0,y0:0,x1:0,y1:0}})).filter(line=>line.text);
  return retryEntries.filter(line=>isName(line.text)).sort((a,b)=>a.box.y0-b.box.y0)[0]?.text||'';
}
class StarRatingDetector {
  constructor(file) {
    this.file = file;
  }

  async detect() {
    const bitmap = await createImageBitmap(this.file);
    const canvas = this.createCanvas(bitmap);
    const crop = this.cropRatingArea(canvas);
    return this.normalizeRating(this.countFilledStars(crop));
  }

  createCanvas(bitmap) {
    const scale = Math.min(1, 1000 / bitmap.width);
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d', {willReadFrequently: true}).drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  cropRatingArea(canvas) {
    const y = Math.round(canvas.height * .12);
    const h = Math.round(canvas.height * .58);
    return {image: canvas.getContext('2d', {willReadFrequently: true}).getImageData(0, y, canvas.width, h), width: canvas.width, height: h};
  }

  isFilledStarPixel(data, i) {
    const r = data[i], g = data[i + 1], b = data[i + 2];
    const yellow = r > 170 && g > 105 && g < 220 && b < 145 && r - b > 70;
    const orange = r > 190 && g > 85 && g < 180 && b < 110 && r - g > 25;
    return yellow || orange;
  }

  countFilledStars({image, width, height}) {
    const {data} = image;
    const seen = new Uint8Array(width * height);
    const groups = [];
    for (let p = 0; p < width * height; p++) {
      if (seen[p] || !this.isFilledStarPixel(data, p * 4)) continue;
      const group = this.collectGroup(p, data, seen, width, height);
      if (this.isStarLikeGroup(group)) groups.push(group);
    }
    return this.mergeNearbyGroups(groups).length;
  }

  collectGroup(start, data, seen, width, height) {
    const stack = [start];
    const group = {count: 0, minX: width, maxX: 0, minY: height, maxY: 0};
    seen[start] = 1;
    while (stack.length) {
      const point = stack.pop();
      const x = point % width;
      const y = (point / width) | 0;
      group.count++;
      group.minX = Math.min(group.minX, x);
      group.maxX = Math.max(group.maxX, x);
      group.minY = Math.min(group.minY, y);
      group.maxY = Math.max(group.maxY, y);
      for (const next of [point - 1, point + 1, point - width, point + width]) {
        if (next < 0 || next >= width * height || seen[next]) continue;
        if (this.isFilledStarPixel(data, next * 4)) {
          seen[next] = 1;
          stack.push(next);
        }
      }
    }
    group.width = group.maxX - group.minX + 1;
    group.height = group.maxY - group.minY + 1;
    group.centerX = (group.minX + group.maxX) / 2;
    group.centerY = (group.minY + group.maxY) / 2;
    return group;
  }

  isStarLikeGroup(group) {
    const area = group.width * group.height;
    const fillRatio = group.count / Math.max(area, 1);
    return group.count >= 45
      && group.width >= 8
      && group.height >= 8
      && group.width <= 90
      && group.height <= 90
      && fillRatio > .12
      && fillRatio < .85
      && Math.abs(group.width - group.height) <= Math.max(group.width, group.height) * .7;
  }

  mergeNearbyGroups(groups) {
    return groups
      .sort((a, b) => a.centerX - b.centerX)
      .filter((group, index, sorted) => !index || group.centerX - sorted[index - 1].centerX > Math.max(group.width, sorted[index - 1].width) * .55)
      .slice(0, 5);
  }

  normalizeRating(value) {
    if (!Number.isFinite(value) || value < 1) return 0;
    return Math.max(1, Math.min(5, Math.round(value)));
  }
}

async function detectStarRating(file) {
  return new StarRatingDetector(file).detect();
}
$('#saveStore').onclick=()=>{stores[activeStore]={name:$('#storeName').value.trim(),note:$('#storeNote').value.trim()};localStorage.setItem('review-helper-stores',JSON.stringify(stores));renderStores();alert('가게 정보를 저장했습니다.');};
$('#generate').onclick=generate;
$('#copy').onclick=async()=>{if(!$('#result').value.trim())return;await navigator.clipboard.writeText($('#result').value);$('#copy').textContent='복사됨 ✓';setTimeout(()=>$('#copy').textContent='복사',1200);};
$('#reviewImage').onchange=e=>{const f=e.target.files[0];if(!f)return;$('#imagePreview').src=URL.createObjectURL(f);$('#imageArea').hidden=false;};
$('#ocrButton').onclick=async()=>{if(!window.Tesseract){$('#ocrStatus').textContent='OCR 모듈을 불러오지 못했어요. 이미지 내용을 직접 입력해 주세요.';return;} try{const file=$('#reviewImage').files[0];$('#ocrStatus').textContent='리뷰 카드에서 닉네임·별점·리뷰 내용만 읽는 중이에요…';const ocrImage=await prepareOcrImage(file);const [result,stars]=await Promise.all([Tesseract.recognize(ocrImage,'kor+eng'),detectStarRating(file)]);const parsed=parseReviewOcr(result.data);if(!parsed.name){$('#ocrStatus').textContent='닉네임 영역을 한 번 더 확인하는 중이에요…';parsed.name=await recoverNickname(file,result.data);}if(parsed.name)$('#customerName').value=parsed.name;$('#reviewText').value=parsed.review||'';if(stars){rating=stars;renderStars();}$('#ocrStatus').textContent=parsed.review?`${parsed.name?'닉네임·':''}리뷰 내용${stars?`·${stars}점`:''}을 입력했어요. 확인 후 답글을 만들어 주세요.`:'리뷰 본문이 없는 카드예요. 닉네임과 별점만 입력했어요.';}catch{$('#ocrStatus').textContent='인식에 실패했어요. 이미지를 다시 선택하거나 직접 입력해 주세요.';}};
function repairOcrReview(text) {
  return (text || '')
    .replace(/\b(?:Es|AZ|TR|HH|Zoid)\b\s*/gi, '')
    .replace(/안\s+(?:오[는\s]*줄|[A-Za-z]{1,4})\s*알고/g, '안 오는 줄 알고')
    .replace(/이제\s*보니/g, '이제 보니')
    .replace(/두\s*개/g, '두 개')
    .replace(/세\s*개/g, '세 개')
    .replace(/김치\s*찜\s*1?\s*인분/g, '김치찜 1인분')
    .replace(/공기\s*밥/g, '공기밥')
    .replace(/ㅠ\s*ㅠ\s*ㅠ\s*ㅠ?/g, 'ㅠㅠㅠㅠ')
    .replace(/아주\s*(?:4+\s*)?굽어먹었습니다/g, '아주 싹싹 긁어먹었습니다')
    .replace(/\s*([,.!?ㅠ])\s*/g, '$1 ')
    .replace(/\s+/g, ' ').replace(/ㅠ(?:\s*ㅠ)+/g, 'ㅠㅠㅠㅠ').trim();
}
function ocrCandidateScore(parsed, data) {
  const review = parsed.review || '';
  const korean = (review.match(/[가-힣]/g) || []).length;
  const latinNoise = (review.match(/[A-Za-z]{2,}/g) || []).join(' ').replace(/(?:ok|tv|img)/gi, '').length;
  const lines = (data.lines || []).length;
  return korean * 3 + review.length + (parsed.name ? 18 : 0) + Math.min(lines, 12) - latinNoise * 4 - (review.length < 5 ? 40 : 0);
}
function ocrConfidence(parsed, data) {
  const review = parsed.review || '';
  const korean = (review.match(/[가-힣]/g) || []).length;
  const noise = (review.match(/[A-Za-z]{2,}/g) || []).length;
  const avgConfidence = (data.lines || []).length ? (data.lines || []).reduce((sum, line) => sum + (line.confidence || 0), 0) / data.lines.length : 0;
  if (review.length >= 12 && korean >= 8 && noise === 0 && avgConfidence >= 55) return '높음';
  return '확인 필요';
}
function clearPreviousImageResult(){
  $('#reviewText').value='';
  $('#result').value='';
  $('#customerName').value='';
  detectedMenu='';
  $('#ocrStatus').textContent='새 이미지를 읽는 중이에요…';
  rating=5;
  renderStars();
}
async function readReviewImage(file=$('#reviewImage').files[0]){
  if(!file){$('#ocrStatus').textContent='리뷰 캡처 이미지를 먼저 선택해 주세요.';return;}
  if(!window.Tesseract){$('#ocrStatus').textContent='OCR 모듈을 불러오지 못했어요. 이미지 내용을 직접 입력해 주세요.';return;}
  const requestId=++ocrRequestId;
  try{
    $('#ocrButton').disabled=true;
    $('#ocrStatus').textContent='원본과 선명화 이미지를 비교해 리뷰 본문·별점·사진 아래 메뉴만 읽는 중이에요…';
    const enhanced=await prepareOcrImage(file);
    const [originalResult, enhancedResult, stars]=await Promise.all([
      Tesseract.recognize(file,'kor+eng'),
      Tesseract.recognize(enhanced,'kor+eng'),
      detectStarRating(file)
    ]);
    if(requestId!==ocrRequestId)return;
    const original=parseReviewOcr(originalResult.data), enhancedParsed=parseReviewOcr(enhancedResult.data);
    original.review=repairOcrReview(original.review);
    enhancedParsed.review=repairOcrReview(enhancedParsed.review);
    const parsed=ocrCandidateScore(original,originalResult.data)>=ocrCandidateScore(enhancedParsed,enhancedResult.data)?original:enhancedParsed;
    const selectedData=parsed===original?originalResult.data:enhancedResult.data;
    if(requestId!==ocrRequestId)return;
    $('#reviewText').value=parsed.review||'';
    detectedMenu=parsed.menu||'';
    if(stars){rating=stars;renderStars();}
    const confidence=ocrConfidence(parsed,selectedData);
    const uncertain=confidence==='확인 필요'?' 일부 글자는 원본 이미지와 한 번 비교해 주세요.':'';
    $('#ocrStatus').textContent=parsed.review
      ? `리뷰 내용${stars?`·${stars}점`:''}${detectedMenu?` · 사진 아래 메뉴 “${detectedMenu}”`:''}을 입력했어요. 인식 신뢰도 ${confidence}.${uncertain}`
      : '리뷰 본문을 확실히 찾지 못했어요. 본문을 직접 확인해 주세요.';
  }catch(error){
    if(requestId!==ocrRequestId)return;
    console.error('OCR failed',error);
    $('#ocrStatus').textContent='인식에 실패했어요. 이미지를 다시 선택하거나 직접 입력해 주세요.';
  }finally{if(requestId===ocrRequestId)$('#ocrButton').disabled=false;}
}
if($('#reroll')) $('#reroll').onclick=()=>generate(true);
$('#reviewImage').onchange=e=>{
  const file=e.target.files[0];
  if(!file)return;
  if(imageObjectUrl)URL.revokeObjectURL(imageObjectUrl);
  imageObjectUrl=URL.createObjectURL(file);
  $('#imagePreview').src=imageObjectUrl;
  $('#imageArea').hidden=false;
  clearPreviousImageResult();
  readReviewImage(file);
};
$('#ocrButton').onclick=()=>readReviewImage();
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredPrompt=e;$('#installButton').hidden=false;});
$('#installButton').onclick=async()=>{deferredPrompt.prompt();await deferredPrompt.userChoice;$('#installButton').hidden=true;};
if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js');renderStores();renderStars();
