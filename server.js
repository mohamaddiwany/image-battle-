
import express from 'express';
import { randomBytes } from 'node:crypto';

const app = express();
app.use(express.json());
const PORT = process.env.PORT || 3000;
const rooms = new Map();
const imageCache = new Map();

const categories = {
  'حيوانات': [
    'lion','elephant','giraffe','zebra','tiger',
    'panda','kangaroo','camel','gorilla','fox',
    'wolf','hippopotamus','rhinoceros','koala','polar bear'
  ],
  'طيور': [
    'peacock','flamingo','eagle bird','owl bird','penguin',
    'parrot','toucan','swan','ostrich','hummingbird',
    'pelican','kingfisher','woodpecker','puffin','stork'
  ],
  'معالم عالمية': [
    'Eiffel Tower','Statue of Liberty','Taj Mahal',
    'Colosseum','Big Ben','Great Wall of China',
    'Sydney Opera House','Machu Picchu','Petra Jordan',
    'Burj Khalifa','Sagrada Familia','Leaning Tower of Pisa',
    'Christ the Redeemer','Pyramids of Giza','Tower Bridge'
  ],
  'لاعبو كرة القدم': [
    'Lionel Messi','Cristiano Ronaldo','Mohamed Salah',
    'Kylian Mbappe','Erling Haaland','Neymar',
    'Luka Modric','Kevin De Bruyne','Karim Benzema',
    'Robert Lewandowski','Zlatan Ibrahimovic','Harry Kane',
    'Jude Bellingham','Vinicius Junior','Sadio Mane'
  ],
  'أعلام الدول': [
    'Flag of Japan','Flag of Brazil','Flag of Canada',
    'Flag of Turkey','Flag of Morocco','Flag of Germany',
    'Flag of South Korea','Flag of Argentina','Flag of Mexico',
    'Flag of South Africa','Flag of India','Flag of Italy',
    'Flag of Australia','Flag of Spain','Flag of Sweden'
  ],
  'سيارات': [
    'Ferrari car','Lamborghini car','Porsche 911',
    'Toyota Land Cruiser','Ford Mustang','Tesla Model 3',
    'Jeep Wrangler','Mercedes-Benz G-Class','Mini Cooper',
    'Volkswagen Beetle','Bugatti Chiron','Rolls-Royce Phantom',
    'BMW i8','Audi R8','Nissan GT-R'
  ],
  'فواكه وخضروات': [
    'pineapple fruit','dragon fruit','kiwifruit',
    'pomegranate fruit','mango fruit','watermelon',
    'strawberry','avocado fruit','papaya fruit',
    'passion fruit','broccoli vegetable','artichoke vegetable',
    'eggplant','pumpkin','coconut fruit'
  ],
  'فضاء وعلوم': [
    'Saturn planet','Jupiter planet','Mars planet','Moon',
    'Milky Way galaxy','Orion Nebula',
    'International Space Station','Hubble Space Telescope',
    'solar eclipse','astronaut space suit','rocket launch',
    'Andromeda Galaxy','comet','Earth from space',
    'James Webb Space Telescope'
  ],
  'طبيعة': [
    'Niagara Falls','Mount Everest','Grand Canyon',
    'Sahara Desert','Amazon rainforest','Victoria Falls',
    'Mount Fuji','Northern lights','Great Barrier Reef',
    'Iguazu Falls','Lake Baikal','Matterhorn mountain',
    'Antarctica iceberg','Salar de Uyuni','Yosemite Valley'
  ],
  'طعام': [
    'pizza margherita','sushi food','hamburger',
    'falafel','shawarma','croissant','tacos food',
    'lasagna','paella','ramen noodles','baklava',
    'hummus','macarons','pancakes','biryani'
  ]
};

function createRoom() {
  return {
    id: randomBytes(3).toString('hex').toUpperCase(),
    key: randomBytes(18).toString('hex'),
    teams: ['الفريق الأحمر', 'الفريق الأزرق'],
    scores: [0, 0],
    remaining: [45000, 45000],
    active: 0,
    running: false,
    ended: false,
    category: '',
    question: null,
    used: [],
    version: 1,
    updated: Date.now()
  };
}

function tick(r) {
  if (!r.running || r.ended) return;

  const now = Date.now();
  r.remaining[r.active] = Math.max(
    0,
    r.remaining[r.active] - Math.max(0, now - r.updated)
  );
  r.updated = now;

  if (r.remaining[r.active] === 0) {
    r.running = false;
    r.ended = true;
    r.version++;
  }
}

function view(r, host = false) {
  tick(r);
  const { key, used, ...publicRoom } = r;

  return {
    ...publicRoom,
    question: r.question ? {
      category: r.question.category,
      image: r.question.image,
      ...(host ? { answer: r.question.answer } : {})
    } : null,
    categories: Object.keys(categories)
  };
}

async function findImage(term) {
  if (imageCache.has(term)) return imageCache.get(term);

  try {
    const search = 'filetype:bitmap ' + term;
    const url =
      'https://commons.wikimedia.org/w/api.php' +
      '?action=query&generator=search' +
      '&gsrsearch=' + encodeURIComponent(search) +
      '&gsrnamespace=6&gsrlimit=15' +
      '&prop=imageinfo&iiprop=url%7Cmime' +
      '&iiurlwidth=1000&format=json';

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'ImageBattleQuiz/1.0 (educational game)'
      },
      signal: AbortSignal.timeout(9000)
    });

    if (!response.ok) return null;

    const data = await response.json();
    const candidates = Object.values(
      data.query?.pages || {}
    ).filter(p =>
      p.imageinfo?.[0]?.thumburl &&
      /^image\//.test(p.imageinfo[0].mime || '') &&
      !/logo|icon|diagram|map|collage|montage/i.test(p.title)
    );

    const result = candidates[0]?.imageinfo[0].thumburl || null;
    if (result) imageCache.set(term, result);
    return result;
  } catch {
    return null;
  }
}

app.post('/api/new', (req, res) => {
  const r = createRoom();
  rooms.set(r.id, r);
  res.json({ ...view(r, true), key: r.key });
});

app.get('/api/room/:id', (req, res) => {
  const r = rooms.get(req.params.id.toUpperCase());

  if (!r) {
    return res.status(404).json({
      error: 'الغرفة غير موجودة'
    });
  }

  res.json(view(r, req.query.key === r.key));
});

app.post('/api/room/:id/action', async (req, res) => {
  const r = rooms.get(req.params.id.toUpperCase());

  if (!r) {
    return res.status(404).json({
      error: 'الغرفة غير موجودة'
    });
  }

  if (req.body?.key !== r.key) {
    return res.status(403).json({
      error: 'هذه الشاشة للعرض فقط'
    });
  }

  tick(r);
  const { type, category, teams } = req.body;

  if (
    type === 'names' &&
    Array.isArray(teams) &&
    teams.length === 2
  ) {
    r.teams = teams.map((name, i) =>
      String(name || r.teams[i]).slice(0, 35)
    );
  } else if (
    type === 'category' &&
    categories[category]
  ) {
    r.category = category;
  } else if (type === 'next') {
    if (!categories[r.category]) {
      return res.status(400).json({
        error: 'اختر فئة أولًا'
      });
    }

    const available = categories[r.category].filter(
      term => !r.used.includes(term)
    );

    if (!available.length) {
      return res.status(400).json({
        error: 'انتهت صور هذه الفئة'
      });
    }

    const term = available[
      Math.floor(Math.random() * available.length)
    ];

    r.used.push(term);
    r.question = {
      answer: term,
      category: r.category,
      image: await findImage(term)
    };
  } else if (type === 'start' && !r.ended) {
    r.running = true;
    r.updated = Date.now();
  } else if (type === 'pause') {
    r.running = false;
  } else if (
    type === 'correct' &&
    !r.ended &&
    r.question
  ) {
    r.scores[r.active]++;
    r.active = 1 - r.active;
    r.question = null;
    r.updated = Date.now();
  } else if (
    type === 'wrong' &&
    !r.ended &&
    r.question
  ) {
    r.remaining[r.active] = Math.max(
      0,
      r.remaining[r.active] - 3000
    );

    if (!r.remaining[r.active]) {
      r.ended = true;
      r.running = false;
    }

    r.updated = Date.now();
  } else if (
    type === 'switch' &&
    !r.ended
  ) {
    r.active = 1 - r.active;
    r.question = null;
    r.updated = Date.now();
  } else if (type === 'reset') {
    const fresh = createRoom();

    Object.assign(r, {
      ...fresh,
      id: r.id,
      key: r.key,
      teams: r.teams
    });
  } else if (
    ![
      'names', 'category', 'next', 'start',
      'pause', 'correct', 'wrong', 'switch', 'reset'
    ].includes(type)
  ) {
    return res.status(400).json({
      error: 'أمر غير معروف'
    });
  }

  r.version++;
  res.json(view(r, true));
});

const html = `
<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>مواجهة الصور</title>
<style>
* { box-sizing: border-box; }
body {
  margin: 0;
  background: #0d1528;
  color: #f8fafc;
  font-family: system-ui, Tahoma, sans-serif;
}
main {
  max-width: 900px;
  margin: auto;
  padding: 16px;
}
h1 {
  text-align: center;
  font-size: clamp(26px,5vw,42px);
}
h2 { font-size: 20px; }
button,input {
  font: inherit;
  border-radius: 12px;
  padding: 12px;
  border: 1px solid #536079;
}
button {
  background: #36476a;
  color: white;
  cursor: pointer;
  font-weight: 700;
}
button:disabled { opacity: .5; }
button.primary { background: #2563eb; }
button.good { background: #16854d; }
button.bad { background: #b91c1c; }
button.warn { background: #a76b12; }
input {
  background: #19253e;
  color: white;
  min-width: 0;
}
.card {
  background: #19253e;
  border: 1px solid #334155;
  border-radius: 18px;
  padding: 16px;
  margin: 12px 0;
}
.row {
  display: flex;
  gap: 9px;
  flex-wrap: wrap;
  align-items: center;
}
.row > * { flex: 1; }
.teams {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}
.team {
  padding: 15px 5px;
  border-radius: 14px;
  text-align: center;
  background: #26334c;
  border: 3px solid transparent;
}
.red { border-color: #ef4444; }
.blue { border-color: #3b82f6; }
.active { box-shadow: 0 0 0 3px #facc15; }
.time {
  font-size: clamp(30px,7vw,65px);
  font-weight: 900;
  font-variant-numeric: tabular-nums;
}
.photo {
  width: 100%;
  max-height: 55vh;
  object-fit: contain;
  background: #080c17;
  border-radius: 12px;
  min-height: 190px;
}
.answer {
  font-size: 23px;
  color: #facc15;
  font-weight: 800;
}
.muted { color: #b8c6da; }
#stage { display: none; }
#question { text-align: center; }
.category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit,minmax(125px,1fr));
  gap: 8px;
}
.category-grid button {
  padding: 10px;
  font-size: 14px;
}
.selected { outline: 3px solid #facc15; }
.notice {
  color: #facc15;
  text-align: center;
}
.full { width: 100%; }

#tvMode .controls,
#tvMode .host-only {
  display: none !important;
}
#tvMode main { max-width: 1400px; }
#tvMode .photo { max-height: 68vh; }
#tvMode .time {
  font-size: clamp(40px,8vw,105px);
}
</style>
</head>
<body>
<main>
<h1>🏆 مواجهة الصور</h1>

<div id="lobby" class="card">
  <h2>لعبة الفريقين</h2>
  <button class="primary full" onclick="createRoom()">
    إنشاء غرفة جديدة
  </button>
  <div class="row" style="margin-top:10px">
    <input id="joinCode" placeholder="رمز الغرفة">
    <button onclick="joinRoom()">عرض الغرفة</button>
  </div>
</div>

<div id="stage">
  <div class="card host-only">
    <div class="row">
      <span>رمز الغرفة: <strong id="code"></strong></span>
      <button onclick="copyTv()">نسخ رابط التلفاز 📺</button>
      <button onclick="openTv()">فتح شاشة التلفاز</button>
    </div>
    <p class="muted">
      افتح رابط التلفاز في متصفح التلفاز،
      وليس عبر انعكاس شاشة الهاتف.
    </p>
    <div class="row">
      <input id="team0" value="الفريق الأحمر">
      <input id="team1" value="الفريق الأزرق">
      <button onclick="saveNames()">حفظ الأسماء</button>
    </div>
  </div>

  <div class="teams">
    <div id="box0" class="team red">
      <div id="name0">الأحمر</div>
      <div class="time" id="time0">00:45</div>
      <div>✓ <span id="score0">0</span></div>
    </div>
    <div id="box1" class="team blue">
      <div id="name1">الأزرق</div>
      <div class="time" id="time1">00:45</div>
      <div>✓ <span id="score1">0</span></div>
    </div>
  </div>

  <div class="card host-only">
    <h2>اختر فئة الصور</h2>
    <div class="category-grid" id="categories"></div>
  </div>

  <div class="card" id="question">
    <div class="muted" id="catLabel">
      اختر فئة وابدأ المسابقة
    </div>
    <img
      id="photo"
      class="photo"
      style="display:none"
      alt="صورة السؤال"
    >
    <div id="placeholder" class="notice">
      📷 الصورة القادمة تظهر هنا
    </div>
    <p class="answer host-only" id="answer"></p>
  </div>

  <div class="card controls">
    <div class="row">
      <button class="primary" onclick="act('next')">
        🖼️ صورة جديدة
      </button>
      <button class="good" onclick="act('correct')">
        ✓ صحيح + تبديل الدور
      </button>
      <button class="bad" onclick="act('wrong')">
        ✕ خطأ −3 ثوانٍ
      </button>
    </div>
    <div class="row" style="margin-top:10px">
      <button onclick="act('start')">▶ تشغيل / استئناف</button>
      <button class="warn" onclick="act('pause')">⏸ إيقاف</button>
      <button onclick="act('switch')">⇄ تبديل الفريق</button>
      <button onclick="if(confirm('إعادة اللعبة من البداية؟'))act('reset')">
        ↻ إعادة
      </button>
    </div>
  </div>

  <p class="notice" id="status"></p>
</div>
</main>

<script>
const query = new URLSearchParams(location.search);
const tv = query.get('view') === 'tv';

if (tv) document.body.id = 'tvMode';

let roomId = (query.get('room') || '').toUpperCase();
let key = tv ? '' : (
  sessionStorage.getItem('host-' + roomId) ||
  query.get('key') ||
  ''
);
let state = null;

const $ = id => document.getElementById(id);

const esc = x => String(x).replace(
  /[&<>"']/g,
  c => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c])
);

async function request(path, body) {
  const response = await fetch(path, {
    method: body ? 'POST' : 'GET',
    headers: { 'Content-Type':'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json();

  if (!response.ok) {
    throw Error(data.error || 'حدث خطأ');
  }
  return data;
}

async function createRoom() {
  try {
    const r = await request('/api/new', {});
    sessionStorage.setItem('host-' + r.id, r.key);
    location.href = '/?room=' + r.id;
  } catch (e) {
    alert(e.message);
  }
}

function joinRoom() {
  const id = $('joinCode').value.trim().toUpperCase();
  if (id) {
    location.href = '/?room=' + encodeURIComponent(id) + '&view=tv';
  }
}

function tvUrl() {
  return location.origin +
    '/?room=' + encodeURIComponent(roomId) +
    '&view=tv';
}

function openTv() {
  window.open(tvUrl(), '_blank');
}

async function copyTv() {
  try {
    await navigator.clipboard.writeText(tvUrl());
    alert('تم نسخ رابط التلفاز');
  } catch {
    prompt('انسخ الرابط', tvUrl());
  }
}

async function act(type) {
  if (!key) return alert('هذه شاشة عرض فقط');

  try {
    state = await request('/api/room/' + roomId + '/action', {
      type, key
    });
    render();
  } catch (e) {
    alert(e.message);
  }
}

async function saveNames() {
  try {
    state = await request('/api/room/' + roomId + '/action', {
      type: 'names',
      key,
      teams: [$('team0').value, $('team1').value]
    });
    render();
  } catch (e) {
    alert(e.message);
  }
}

async function choose(category) {
  try {
    state = await request('/api/room/' + roomId + '/action', {
      type: 'category',
      key,
      category
    });
    render();
  } catch (e) {
    alert(e.message);
  }
}

function fmt(ms) {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, '0') +
    ':' +
    String(seconds % 60).padStart(2, '0');
}

function render() {
  if (!state) return;

  $('lobby').style.display = 'none';
  $('stage').style.display = 'block';
  $('code').textContent = state.id;

  for (let i = 0; i < 2; i++) {
    $('name' + i).textContent = state.teams[i];
    $('score' + i).textContent = state.scores[i];
    $('box' + i).classList.toggle(
      'active',
      state.active === i
    );
  }

  $('catLabel').textContent =
    state.question?.category ||
    state.category ||
    'اختر فئة';

  $('answer').textContent = state.question?.answer
    ? 'الإجابة: ' + state.question.answer
    : '';

  if (state.question?.image) {
    if ($('photo').src !== state.question.image) {
      $('photo').src = state.question.image;
    }
    $('photo').style.display = 'block';
    $('placeholder').style.display = 'none';
  } else {
    $('photo').style.display = 'none';
    $('placeholder').style.display = 'block';
    $('placeholder').textContent = state.question
      ? 'الصورة غير متاحة؛ اختر صورة جديدة'
      : '📷 بانتظار الصورة التالية';
  }

  $('status').textContent = state.ended
    ? 'انتهى الوقت! الفائز: ' + state.teams[1 - state.active]
    : state.running
      ? 'الساعة تعمل'
      : 'الساعة متوقفة';

  if (!tv) {
    $('categories').innerHTML = state.categories.map(c =>
      '<button class="' +
      (c === state.category ? 'selected' : '') +
      '" onclick="choose(' +
      JSON.stringify(c).replace(/"/g, '&quot;') +
      ')">' + esc(c) + '</button>'
    ).join('');
  }
}

function clock() {
  if (!state) return;

  for (let i = 0; i < 2; i++) {
    let time = state.remaining[i];

    if (
      state.running &&
      !state.ended &&
      i === state.active
    ) {
      time -= Date.now() - state.updated;
    }

    $('time' + i).textContent = fmt(time);
  }
}

async function poll() {
  if (!roomId) return;

  try {
    state = await request(
      '/api/room/' + roomId +
      (key ? '?key=' + encodeURIComponent(key) : '')
    );
    render();
  } catch (e) {
    $('status').textContent =
      'تعذر الاتصال بالخادم؛ جارٍ إعادة المحاولة';
  }
}

if (roomId) {
  $('lobby').style.display = 'none';
  setInterval(poll, 1100);
  setInterval(clock, 100);
  poll();
}
</script>
</body>
</html>
`;

app.get('/', (req, res) => {
  res.type('html').send(html);
});

app.get('/health', (req, res) => {
  res.json({
    ok: true,
    rooms: rooms.size
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('Image Battle ready on ' + PORT);
});
