const $ = id => document.getElementById(id);
const storageKey = 'character-studio-v1';
const defaults = () => ({
  mode:'photo', purpose:choices.purpose[0], age:choices.age[2], platform:'gpt', language:'ja',
  photoStyle:choices.photoStyle[0], artStyle:choices.artStyle[0],
  faces:[], items:[], overrides:{}, negativeText:{photo:'', art:''},
});
function readStorage() {
  try { return JSON.parse(localStorage.getItem(storageKey)) || {}; }
  catch { return {}; }
}
function normalize(value) {
  if (!value || typeof value !== 'object' || !['photo','art'].includes(value.mode)) {
    throw new Error('人物設定ファイルを選択してください。');
  }
  const result = defaults();
  for (const [key, item] of Object.entries(value)) {
    if (!Object.hasOwn(result, key) && !fields.has(key)) continue;
    if (typeof item === 'string' || typeof item === 'boolean') result[key] = item;
  }
  for (const [key, keys] of [['faces',['part','trait','text','pin']],['items',['slot','name','color','material','pattern','fit','wear']]]) {
    result[key] = Array.isArray(value[key]) ? value[key].filter(row => row && typeof row === 'object').slice(0,100).map(row =>
      Object.fromEntries(keys.filter(k => typeof row[k] === 'string' || typeof row[k] === 'boolean').map(k => [k,row[k]]))) : [];
  }
  result.overrides = Object.fromEntries(Object.entries(value.overrides || {}).filter(([k,v]) => /^[a-zA-Z]+:[a-zA-Z]+$/.test(k) && typeof v === 'boolean'));
  for (const mode of ['photo','art']) {
    if (typeof value.negativeText?.[mode] === 'string') result.negativeText[mode] = value.negativeText[mode];
  }
  return result;
}
const fields = new Set('mode purpose age platform language gender nationality includeNationality birth raised location occupation profileNote photoStyle artStyle photoBody artBody wardrobe uniform season wardrobeNote framing blur grime grimeArea skin skinArea damage lenses lensEdge lensNote dye hairColor hairNote artSkin setting gesture mood shotNote ratio resolution'.split(' '));
const saved = readStorage();
let state = defaults();
try { if (saved.draft) state = normalize(saved.draft); } catch {}
let favorites = Array.isArray(saved.favorites) ? saved.favorites.filter(f => f && typeof f.name === 'string') : [];
let isEdited = false;

function persist() {
  try { localStorage.setItem(storageKey, JSON.stringify({draft:state,favorites})); return true; }
  catch { $('status').textContent = 'ブラウザーに保存できませんでした。JSON出力で設定を保存できます。'; return false; }
}

function node(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function fixedOptions(values) {
  return values.map(value => [value, value.split('|')[0]]);
}
const countries = new Intl.DisplayNames(['ja'], {type:'region',fallback:'none'});
const countryEnglish = new Intl.DisplayNames(['en'], {type:'region',fallback:'none'});
const countryCodes = 'JP KR CN TW HK MO MN VN TH ID MY SG PH KH LA MM BN TL IN PK BD NP BT LK MV AF IR IQ IL PS JO LB SY SA AE QA OM KW BH YE TR AM AZ GE KZ KG TJ TM UZ AU NZ FJ PG WS TO TV NR KI MH FM PW SB VU US CA MX GT BZ SV HN NI CR PA CU DO HT JM BS BB TT AG DM GD KN LC VC AR BR CL PE BO PY UY CO VE EC GY SR IS NO SE FI DK GB IE FR DE ES PT IT NL BE LU CH AT LI MC AD SM VA MT GR CY PL CZ SK HU RO BG HR SI RS BA ME MK AL XK EE LV LT UA MD BY RU MA DZ TN LY EG SD SS ET ER DJ SO KE UG TZ RW BI CD CG GA GQ CM CF TD NG NE BJ TG GH CI BF ML SN GM GN GW SL LR MR CV ST AO ZM ZW MW MZ NA BW ZA LS SZ MG MU SC KM'.split(' ');
const countryList = countryCodes.map(code => [code, countries.of(code) || code]).sort((a,b) => a[1].localeCompare(b[1],'ja'));

function field(parent, target, key, label, options, config = {}) {
  const wrapper = node('label', label, config.check ? 'check wide' : config.wide ? 'wide' : '');
  const control = node(options ? 'select' : 'input');
  if (options) {
    for (const [value, name] of (config.required ? options : [['','指定なし'],...options])) {
      control.add(new Option(name,value));
    }
    if (config.multiple) {
      control.multiple = true;
      control.size = 4;
      for (const option of control.options) option.selected = (target[key] || '').split(',').includes(option.value);
    } else control.value = target[key] || '';
  } else if (config.check) {
    control.type = 'checkbox';
    control.checked = !!target[key];
    wrapper.prepend(control);
  } else {
    control.value = target[key] || '';
    control.placeholder = config.placeholder || '';
    control.maxLength = 500;
  }
  if (!config.check) wrapper.append(control);
  parent.append(wrapper);
  control.addEventListener(options || config.check ? 'change' : 'input', () => {
    target[key] = config.check ? control.checked : config.multiple
      ? [...control.selectedOptions].map(option => option.value).join(',')
      : control.value;
    if (config.refresh) render();
    else if (config.negatives) renderNegatives();
    update();
  });
  return control;
}
function select(parent,key,label,optionKey=key,config={}) {
  return field(parent,state,key,label,fixedOptions(choices[optionKey]),config);
}
function input(parent,key,label,placeholder='') {
  return field(parent,state,key,label,null,{placeholder});
}
function listRows(id, rows, draw) {
  const group = $(id);
  group.replaceChildren();
  for (const [index,row] of rows.entries()) {
    const card = node('div','','repeat');
    const grid = node('div','','grid');
    card.append(grid);
    draw(grid,row);
    const remove = node('button','削除');
    remove.type = 'button';
    remove.setAttribute('aria-label',`${index + 1}件目を削除`);
    remove.onclick = () => { rows.splice(index,1); renderRows(); update(); };
    card.append(remove);
    group.append(card);
  }
}
function renderRows() {
  listRows('faces',state.faces,(grid,row) => {
    field(grid,row,'part','パーツ',fixedOptions(choices.face));
    field(grid,row,'trait','特徴候補',fixedOptions(choices.faceTrait));
    field(grid,row,'text','具体的な特徴',null,{wide:true,placeholder:'例：左眉尻に小さな切れ目 / a small notch in the left eyebrow'});
    field(grid,row,'pin','人物の特徴として優先する',null,{check:true});
  });
  listRows('items',state.items,(grid,row) => {
    field(grid,row,'slot','アイテムの種類',fixedOptions(choices.garment));
    field(grid,row,'name','アイテム名',null,{placeholder:'例：ローファー / loafers'});
    for (const [key,label] of [['color','色'],['material','素材'],['pattern','柄'],['fit','サイズ感'],['wear','着用感']]) {
      field(grid,row,key,label,fixedOptions(choices[key]));
    }
  });
}
function purposeKey(s) {
  if (s.purpose === choices.purpose[1]) return 'sheet';
  if (s.purpose === choices.purpose[2]) return 'icon';
  return 'portrait';
}
function activeRules(s) {
  const context = purposeKey(s);
  return {...avoid[s.mode], ...avoid.common, ...avoid.purpose[context]};
}
function conflicts(s,key) {
  const custom = s.negativeText[s.mode] || '';
  if (key === 'eyesMismatch') return s.lenses === choices.lenses.at(-1);
  if (key === 'blurFace') return s.blur === choices.blur.at(-1);
  if (key === 'symmetry') return s.faces.some(row => /完全に左右対称|perfect symmetry/i.test(row.text || ''));
  if (key === 'text') return /ラベル|注釈|文字入れ|caption|labels?/i.test(s.shotNote || '');
  if (key === 'logo') return /ロゴ|logo/i.test(s.wardrobeNote || '') || s.items.some(row => /ロゴ|logo/i.test(row.name || ''));
  if (key === 'custom') return (
    (/ぼかし(?:を)?(?:禁止|なし)|no blur/i.test(custom) && Boolean(s.blur && s.blur !== choices.blur[0])) ||
    (/汚れ(?:を)?(?:禁止|なし)|no dirt/i.test(custom) && choices.grime.slice(2).includes(s.grime)) ||
    (/傷跡(?:を)?(?:禁止|なし)|no scars/i.test(custom) && choices.skin.slice(-2).includes(s.skin))
  );
  return false;
}
function renderNegatives() {
  const group = $('negative');
  group.replaceChildren();
  for (const [key,[label]] of Object.entries(activeRules(state))) {
    const option = `${state.mode}:${key}`;
    const checked = state.overrides[option] ?? !conflicts(state,key);
    const row = node('label','','check');
    const box = node('input');
    box.type = 'checkbox';
    box.dataset.rule = key;
    box.checked = checked;
    row.append(box, label);
    box.onchange = () => { state.overrides[option] = box.checked; update(); };
    group.append(row);
  }
}
function render() {
  for (const id of ['profile','appearance','wardrobe','finish','format','negative-text']) $(id).replaceChildren();
  document.querySelector(`input[name=mode][value=${state.mode}]`).checked = true;

  const profile = $('profile');
  select(profile,'purpose','画像の用途','purpose',{required:true,refresh:true});
  select(profile,'age','年齢帯');
  select(profile,'gender','性別表現');
  input(profile,'occupation','職業・立場');
  field(profile,state,'nationality','国籍（Ctrl / ⌘ で複数選択）',countryList,{multiple:true,required:true,wide:true});
  field(profile,state,'includeNationality','国籍をプロンプトに含める',null,{check:true});
  input(profile,'birth','出生地');
  input(profile,'raised','育った場所');
  input(profile,'location','居住地');
  input(profile,'profileNote','人物の補足・言語など');

  const appearance = $('appearance');
  select(appearance,'skin','肌の質感・ダメージ');
  select(appearance,'damage','肌の特徴の強さ');
  input(appearance,'skinArea','肌の特徴の部位','例：左頬');
  if (state.mode === 'art') input(appearance,'artSkin','肌の特徴の描き方','例：薄い色面で表現');
  select(appearance,'lenses','カラコン','lenses',{negatives:true});
  select(appearance,'lensEdge','カラコンのフチ');
  input(appearance,'lensNote','左右の色・発色');
  select(appearance,'dye','ヘアカラー加工');
  select(appearance,'hairColor','髪色','color');
  input(appearance,'hairNote','髪型・色の補足');

  const wardrobe = $('wardrobe');
  select(wardrobe,'wardrobe','服装カテゴリ','wardrobe',{refresh:true});
  select(wardrobe,'season','季節');
  if (state.wardrobe === choices.wardrobe[0]) select(wardrobe,'uniform','制服の種類');
  field(wardrobe,state,'wardrobeNote','衣装セット・補足',null,{wide:true,placeholder:'例：紺のジャケットと白シャツ'});

  const finish = $('finish');
  const photo = state.mode === 'photo';
  select(finish,photo?'photoStyle':'artStyle','スタイル',photo?'photoStyle':'artStyle',{required:true});
  select(finish,photo?'photoBody':'artBody','体格・頭身');
  if (purposeKey(state) === 'portrait') select(finish,'framing','画角');
  select(finish,'grime','清潔感・汚れ');
  input(finish,'grimeArea','汚れ・着用感の部位','例：靴のつま先だけ');
  select(finish,'blur','ぼかし効果','blur',{negatives:true});
  select(finish,'mood','光の当たり方');
  select(finish,'gesture','表情・しぐさ');
  input(finish,'setting','背景・場所・時間帯');
  select(finish,'ratio','縦横比');
  select(finish,'resolution','希望解像度');
  field(finish,state,'shotNote','構図・表情差分などの補足',null,{wide:true});

  field($('format'),state,'platform','出力先',[['gpt','GPT'],['mid','Midjourney']],{required:true,refresh:true});
  if (state.platform === 'gpt') field($('format'),state,'language','出力言語',[['ja','日本語'],['en','English']],{required:true});
  else $('format').append(node('p','選択項目は英語で出力します。自由入力は入力した言語のまま反映されます。','wide'));

  field($('negative-text'),state.negativeText,state.mode,'避けたい表現を追加（自由入力）',null,{placeholder:'例：背景の看板やポスターを避ける'});
  renderRows();
  renderNegatives();
}

function build(s) {
  const en = s.platform === 'mid' || s.language === 'en';
  const value = raw => {
    if (!raw) return '';
    const option = String(raw).split('|');
    return en ? option[1] || option[0] : option[0];
  };
  const pair = (ja,english) => en ? english : ja;
  const join = values => values.map(item => String(item || '').trim()).filter(Boolean).join(en ? ', ' : '、');
  const describe = (label, content) => content ? `${label}${en ? ': ' : '：'}${content}` : '';
  const base = s.mode === 'photo' ? s.photoStyle : s.artStyle;
  const shape = s.mode === 'photo' ? s.photoBody : s.artBody;
  const purpose = purposeKey(s);
  const purposeDescriptions = {
    portrait:pair('ブロマイド。自然なポーズで、視線の先に余白を取る。','Bromide portrait, relaxed pose, breathing room in the direction of the gaze.'),
    sheet:pair('全身の正面・側面・背面と顔アップを無地背景に並べたキャラクター設定シート。同じ髪型・衣装・頭身を各ビューに反映。','Character reference sheet with full-body front, side and back views and a face close-up on a plain background. Preserve hairstyle, clothes and proportions in each view.'),
    icon:pair('正方形のアイコン。顔を中央に置き、円形に切り抜ける余白を確保。','Square face-centered avatar, with safe margins for a circular crop.'),
  };
  const nationalities = (s.nationality || '').split(',').filter(code => countryCodes.includes(code)).map(code => en ? countryEnglish.of(code) : countries.of(code));
  const identity = [
    value(s.age),value(s.gender),value(shape),
    s.includeNationality ? describe(pair('国籍','nationality'),join(nationalities)) : '',
    describe(pair('出生地','birthplace'),s.birth),describe(pair('育った場所','raised in'),s.raised),
    describe(pair('居住地','residence'),s.location),s.occupation,s.profileNote,
  ];
  const faces = [...s.faces].sort((a,b) => Number(!!b.pin) - Number(!!a.pin))
    .filter(row => row.trait || row.text)
    .map(row => describe(join([row.pin ? pair('優先する特徴','key feature to preserve') : '',value(row.part)]) || pair('顔の特徴','facial feature'),join([value(row.trait),row.text])));
  const details = [
    ...faces,
    s.skin && describe(pair('肌','skin'),join([value(s.skin),value(s.damage),s.skinArea,s.mode === 'art' && s.artSkin])),
    describe(pair('瞳','eyes'),join([value(s.lenses),value(s.lensEdge),s.lensNote])),
    describe(pair('髪','hair'),join([value(s.dye),value(s.hairColor),s.hairNote])),
  ];
  const clothes = [
    s.wardrobe === choices.wardrobe[0] && s.uniform ? value(s.uniform) : value(s.wardrobe),
    value(s.season),s.wardrobeNote,
    ...s.items.map(row => {
      const item = join([row.name,value(row.color),value(row.material),value(row.pattern),value(row.fit),value(row.wear)]);
      return row.slot ? describe(value(row.slot),item) || value(row.slot) : item;
    }),
  ];
  const ratio = value(s.ratio) || ({sheet:'3:2',icon:'1:1',portrait:'2:3'})[purpose];
  const finish = [
    purpose === 'portrait' && value(s.framing),value(s.gesture),s.setting,value(s.mood),
    s.grime && describe(pair('清潔感・汚れ','wear and dirt'),join([value(s.grime),s.grimeArea])),
    value(s.blur),s.shotNote,
    s.resolution && describe(pair('希望解像度','requested resolution'),value(s.resolution)),
    s.platform !== 'mid' && describe(pair('縦横比','aspect ratio'),ratio),
  ];
  const rules = Object.entries(activeRules(s)).filter(([key]) => s.overrides[`${s.mode}:${key}`] ?? !conflicts(s,key));
  const warnings = rules.filter(([key]) => conflicts(s,key)).map(([,rule]) => rule[0]);
  if (conflicts(s,'custom')) warnings.push('避けたい表現の自由入力');
  if (purpose === 'icon' && ratio !== '1:1') warnings.push('アイコンの構図と縦横比');
  const custom = s.negativeText[s.mode].trim();
  const lines = [
    value(base),purposeDescriptions[purpose],
    describe(pair('人物','Subject'),join(identity)),
    describe(pair('顔・肌・髪','Face, skin and hair'),join(details)),
    describe(pair('衣装','Wardrobe'),join(clothes)),
    describe(pair('構図・仕上げ','Framing and finish'),join(finish)),
  ].filter(Boolean);
  if (s.platform === 'mid') {
    const positive = rules.filter(([,rule]) => !rule[2]).map(([,rule]) => rule[1]);
    const exclude = rules.filter(([,rule]) => rule[2]).map(([,rule]) => rule[1]);
    const body = [...lines,...positive,custom && `Avoid the following appearance: ${custom}`].filter(Boolean).join('\n');
    return {prompt:`${body}\n--ar ${ratio}${exclude.length ? ` --no ${exclude.join(', ')}` : ''}`, warnings};
  }
  const exclusions = rules.map(([,rule]) => {
    if (!en) return rule[0];
    return rule[2] ? `Exclude ${rule[1]}.` : `Use ${rule[1]}.`;
  });
  if (custom) exclusions.push(en ? `Avoid: ${custom}` : custom);
  if (exclusions.length) lines.push(describe(pair('避けたい表現','Constraints'),join(exclusions)));
  return {prompt:lines.join('\n'),warnings};
}

function update() {
  for (const box of $('negative').querySelectorAll('input[data-rule]')) {
    const key = box.dataset.rule;
    box.checked = state.overrides[`${state.mode}:${key}`] ?? !conflicts(state,key);
  }
  const {prompt,warnings} = build(state);
  if (!isEdited) $('result').value = prompt;
  $('warning').hidden = !warnings.length;
  $('warning').textContent = warnings.length ? `設定が競合しています。 ${warnings.join('、')}` : '';
  persist();
}
function refreshFavorites(index) {
  $('favorites').replaceChildren(new Option(favorites.length ? 'お気に入りを選択' : 'お気に入りなし',''));
  favorites.forEach((favorite,i) => $('favorites').add(new Option(favorite.name,i)));
  if (index !== undefined) $('favorites').value = index;
  const selected = $('favorites').value !== '';
  $('load').disabled = !selected;
  $('remove').disabled = !selected;
}
function loadSettings(value) {
  state = normalize(value);
  isEdited = false;
  render();
  update();
}

$('settings').addEventListener('submit',event => event.preventDefault());
for (const radio of document.querySelectorAll('input[name=mode]')) {
  radio.onchange = () => { state.mode = radio.value; isEdited = false; render(); update(); };
}
for (const [button,key] of [['add-face','faces'],['add-item','items']]) {
  $(button).onclick = () => {
    state[key].push({});
    renderRows();
    update();
    $(key).lastElementChild.querySelector('select').focus();
  };
}
$('result').oninput = () => {
  isEdited = true;
  $('status').textContent = '編集中のプレビューを保持しています。設定を反映するには再生成してください。';
};
$('regenerate').onclick = () => {
  isEdited = false;
  $('status').textContent = '設定から再生成しました。';
  update();
};
$('copy').onclick = async () => {
  try { await navigator.clipboard.writeText($('result').value); }
  catch {
    $('result').select();
    if (!document.execCommand('copy')) {
      $('status').textContent = '選択したプロンプトを Ctrl / ⌘ + C でコピーしてください。';
      return;
    }
  }
  $('status').textContent = 'プロンプトをコピーしました。';
};
$('save').onclick = () => {
  const name = $('favorite-name').value.trim() || `キャラクター ${favorites.length + 1}`;
  favorites.push({name,settings:structuredClone(state)});
  refreshFavorites(favorites.length - 1);
  if (persist()) $('status').textContent = 'ブラウザーのお気に入りに保存しました。';
};
$('favorites').onchange = () => refreshFavorites($('favorites').value);
$('load').onclick = () => {
  try {
    loadSettings(favorites[Number($('favorites').value)].settings);
    $('status').textContent = 'お気に入りを開きました。';
  } catch { $('status').textContent = '設定を読み込めませんでした。'; }
};
$('remove').onclick = () => {
  favorites.splice(Number($('favorites').value),1);
  refreshFavorites();
  if (persist()) $('status').textContent = 'お気に入りを削除しました。';
};
$('export').onclick = () => {
  const url = URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  const anchor = node('a');
  anchor.href = url;
  anchor.download = 'character-settings.json';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url),1000);
};
$('import').onchange = async () => {
  const file = $('import').files[0];
  if (!file) return;
  try {
    loadSettings(JSON.parse(await file.text()));
    $('status').textContent = '設定ファイルを読み込みました。';
  } catch { $('status').textContent = '設定ファイルを読み込めませんでした。'; }
  finally { $('import').value = ''; }
};

render();
refreshFavorites();
update();
