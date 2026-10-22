/* 蜕变 · 内容层：家庭无器械训练（按时间）、饮食热量、勋章 */
'use strict';

const APP = {
  name: '蜕变',
  start: '2026-10-21',
  end: '2027-02-06'
};

const PROFILE_DEFAULT = {
  age: 36, height: 178, weight: 80, waist: null,
  targetLow: 74, targetHigh: 80,
  intake: {}
};

/* ===== 动作库（家里、无器械为主）=====
   全部按「时间」练：每个动作做几十秒，休息几十秒，跟着口令走。 */
const EX = {
  march:   { n: '原地踏步', cue: '手臂自然摆，别含胸。' },
  squat:   { n: '自重深蹲', cue: '屁股往后坐，膝盖对脚尖，下蹲两秒、起身一秒。' },
  pushup:  { n: '俯卧撑', cue: '头、背、屁股一条直线，胸口降到离地一拳；做不了就跪着做，或手撑桌沿。' },
  bridge:  { n: '臀桥', cue: '脚跟发力顶髋，顶住一秒，别用腰顶。' },
  lunge:   { n: '箭步蹲', cue: '身体直上直下，前膝对脚尖；扶墙也行。' },
  plank:   { n: '平板支撑', cue: '肘在肩下，收腹夹臀，别塌腰，正常呼吸。' },
  deadbug: { n: '死虫', cue: '腰贴地，对侧手脚慢慢伸出，腰一离地就缩小幅度。' },
  birddog: { n: '鸟狗', cue: '对侧手脚伸出，腰不动，停两秒。' },
  superman:{ n: '小燕飞', cue: '趴着，手臂和腿轻轻抬起，胸口离地一点就够，别用力过猛。' },
  stepup:  { n: '上台阶', cue: '整只脚踩上去，用上面那条腿发力，慢慢下。' },
  calf:    { n: '提踵', cue: '踮脚到最高停一秒，慢慢下。' },
  walk:    { n: '快走', cue: '能说话、不能唱歌的强度，挺胸，手臂自然摆。' },
  wallstand:{ n: '靠墙站', cue: '后脑、肩胛、臀贴墙，收下巴。' }
};

/* ===== 训练（周一到周日，家庭版）=====
   k: warmup / ex / cool / walk */
const WORKOUTS = {
  lower: {
    title: '下肢 + 推', short: '力量 A', minutes: 25, music: 'beat', day: 1,
    intro: '今天练下肢和推，大概二十五分钟。全程跟着时间走，动作慢一点，姿势比对重要。',
    blocks: [
      { k: 'warmup', name: '原地踏步', secs: 120, ex: 'march' },
      { k: 'ex', ex: 'squat', sets: 3, secs: 40, rest: 25 },
      { k: 'ex', ex: 'pushup', sets: 3, secs: 30, rest: 25 },
      { k: 'ex', ex: 'bridge', sets: 3, secs: 40, rest: 20 },
      { k: 'ex', ex: 'lunge', sets: 2, secs: 30, rest: 20, sides: 2 },
      { k: 'ex', ex: 'plank', sets: 2, secs: 30, rest: 30 },
      { k: 'cool', ex: 'wallstand', secs: 60 },
      { k: 'cool', ex: 'calf', secs: 30, sides: 2 }
    ]
  },
  walk: {
    title: '快走', short: '快走', minutes: 35, music: 'calm', day: 2, kind: 'walk',
    intro: '今天快走三十五分钟。先慢走五分钟热身，然后保持能说话的强度。',
    blocks: [
      { k: 'walk', secs: 300, name: '慢走热身', cues: [{ at: 120, t: '保持轻松，让身体热起来。' }] },
      { k: 'walk', secs: 1500, name: '快走 25 分钟', cues: [
        { at: 300, t: '五分钟了。挺胸，手臂自然摆。' },
        { at: 900, t: '一半了，保持能说话的强度。' },
        { at: 1200, t: '还有五分钟，别加速，稳住。' }] },
      { k: 'walk', secs: 300, name: '慢走放松', cues: [{ at: 120, t: '慢慢降速，呼吸放长。' }] }
    ]
  },
  upper: {
    title: '拉 + 核心', short: '力量 B', minutes: 25, music: 'beat', day: 3,
    intro: '今天练背和核心，大概二十五分钟。家里没器械也没关系，用书包或者水瓶都能代替。',
    blocks: [
      { k: 'warmup', name: '原地踏步', secs: 90, ex: 'march' },
      { k: 'ex', ex: 'pushup', sets: 3, secs: 30, rest: 25 },
      { k: 'ex', ex: 'superman', sets: 3, secs: 30, rest: 20 },
      { k: 'ex', ex: 'deadbug', sets: 3, secs: 40, rest: 20 },
      { k: 'ex', ex: 'plank', sets: 3, secs: 30, rest: 25 },
      { k: 'ex', ex: 'birddog', sets: 2, secs: 30, rest: 15, sides: 2 },
      { k: 'cool', ex: 'wallstand', secs: 60 },
      { k: 'cool', ex: 'bridge', secs: 40 }
    ]
  },
  walk2: {
    title: '快走', short: '快走', minutes: 30, music: 'calm', day: 4, kind: 'walk',
    intro: '今天快走三十分钟。强度是能说话、不能唱歌。',
    blocks: [
      { k: 'walk', secs: 300, name: '慢走热身', cues: [] },
      { k: 'walk', secs: 1200, name: '快走 20 分钟', cues: [
        { at: 300, t: '五分钟了，肩膀放松。' },
        { at: 900, t: '还有五分钟。' }] },
      { k: 'walk', secs: 300, name: '慢走放松', cues: [] }
    ]
  },
  full: {
    title: '全身', short: '力量 C', minutes: 25, music: 'beat', day: 5,
    intro: '今天练全身，大概二十五分钟。动作不快，做稳。',
    blocks: [
      { k: 'warmup', name: '原地踏步', secs: 90, ex: 'march' },
      { k: 'ex', ex: 'stepup', sets: 3, secs: 30, rest: 20, sides: 2 },
      { k: 'ex', ex: 'squat', sets: 3, secs: 40, rest: 25 },
      { k: 'ex', ex: 'pushup', sets: 3, secs: 30, rest: 25 },
      { k: 'ex', ex: 'bridge', sets: 2, secs: 40, rest: 20 },
      { k: 'ex', ex: 'deadbug', sets: 2, secs: 40, rest: 20 },
      { k: 'cool', ex: 'wallstand', secs: 60 },
      { k: 'cool', ex: 'calf', secs: 30, sides: 2 }
    ]
  },
  longwalk: {
    title: '长走', short: '长走', minutes: 50, music: 'calm', day: 6, kind: 'walk',
    intro: '今天长走五十分钟。找个有点起伏的路线，每十五分钟喝两口水。',
    blocks: [
      { k: 'walk', secs: 300, name: '慢走热身', cues: [] },
      { k: 'walk', secs: 2400, name: '长走 40 分钟', cues: [
        { at: 900, t: '喝两口水，保持呼吸。' },
        { at: 1500, t: '一半了，别冲太快。' },
        { at: 2100, t: '还有五分钟，快到家了。' }] },
      { k: 'walk', secs: 300, name: '慢走放松', cues: [] }
    ]
  },
  stretch: {
    title: '拉伸 + 腰背', short: '恢复', minutes: 12, music: 'calm', day: 0,
    intro: '今天不练力量，做十二分钟拉伸和腰背，让身体恢复。',
    blocks: [
      { k: 'warmup', name: '猫牛', secs: 60, ex: 'birddog' },
      { k: 'ex', ex: 'birddog', sets: 2, secs: 30, rest: 15, sides: 2 },
      { k: 'ex', ex: 'bridge', sets: 2, secs: 40, rest: 20 },
      { k: 'ex', ex: 'deadbug', sets: 2, secs: 40, rest: 20 },
      { k: 'cool', ex: 'wallstand', secs: 90 },
      { k: 'cool', ex: 'calf', secs: 30, sides: 2 }
    ]
  }
};

/* 轻量版：每个动作少一组，休息多 10 秒 */
const LIGHT_DELTA = { sets: -1, rest: 10 };

const DAY_WORKOUT = { 1: 'lower', 2: 'walk', 3: 'upper', 4: 'walk2', 5: 'full', 6: 'longwalk', 0: 'stretch' };

/* ===== 饮食 ===== */
const MEALS = {
  breakfast: [
    { t: '两个鸡蛋 + 一碗热粥 + 一小把青菜', kcal: 420, p: 24 },
    { t: '燕麦一碗 + 牛奶 + 一个鸡蛋', kcal: 460, p: 26 },
    { t: '全麦面包两片 + 鸡蛋 + 无糖豆浆', kcal: 430, p: 23 }
  ],
  lunch: [
    { t: '米饭一碗 + 鸡胸肉一掌心 + 两份蔬菜', kcal: 650, p: 40 },
    { t: '牛肉面一碗 + 加一份青菜', kcal: 700, p: 32 },
    { t: '米饭一碗 + 清蒸鱼 + 炒青菜', kcal: 620, p: 38 }
  ],
  dinner: [
    { t: '半碗米饭 + 豆腐 + 蔬菜 + 一点瘦肉', kcal: 520, p: 30 },
    { t: '杂粮饭半碗 + 虾 + 两份蔬菜', kcal: 480, p: 32 },
    { t: '蔬菜汤 + 鸡蛋 + 少量主食', kcal: 450, p: 24 }
  ],
  snack: [
    { t: '一个苹果 / 一把坚果', kcal: 180, p: 4 },
    { t: '无糖酸奶一杯', kcal: 120, p: 8 },
    { t: '一根香蕉', kcal: 100, p: 1 }
  ]
};

const FOODS = [
  { n: '米饭 1 碗', kcal: 200, p: 4 }, { n: '杂粮饭 1 碗', kcal: 180, p: 5 },
  { n: '面条 1 碗', kcal: 280, p: 9 }, { n: '馒头 1 个', kcal: 180, p: 5 },
  { n: '鸡蛋 1 个', kcal: 70, p: 6 }, { n: '鸡胸肉 1 掌心', kcal: 160, p: 30 },
  { n: '牛肉 1 掌心', kcal: 200, p: 26 }, { n: '鱼 1 块', kcal: 150, p: 22 },
  { n: '豆腐 1 块', kcal: 120, p: 10 }, { n: '牛奶 250ml', kcal: 150, p: 8 },
  { n: '无糖豆浆 300ml', kcal: 90, p: 9 }, { n: '酸奶 1 杯', kcal: 120, p: 8 },
  { n: '青菜 1 份', kcal: 60, p: 3 }, { n: '西兰花 1 份', kcal: 50, p: 4 },
  { n: '黄瓜 1 根', kcal: 30, p: 1 }, { n: '番茄 1 个', kcal: 25, p: 1 },
  { n: '苹果 1 个', kcal: 95, p: 0 }, { n: '香蕉 1 根', kcal: 100, p: 1 },
  { n: '坚果 1 小把', kcal: 180, p: 5 }, { n: '饺子 10 个', kcal: 420, p: 16 },
  { n: '包子 1 个', kcal: 230, p: 6 }, { n: '粥 1 碗', kcal: 120, p: 3 },
  { n: '燕麦 1 小碗', kcal: 200, p: 7 }, { n: '全麦面包 2 片', kcal: 180, p: 7 },
  { n: '咖啡（不加糖）', kcal: 10, p: 0 }, { n: '奶茶 1 杯', kcal: 400, p: 3 },
  { n: '可乐 1 罐', kcal: 150, p: 0 }, { n: '啤酒 1 瓶', kcal: 200, p: 1 },
  { n: '外卖盖饭 1 份', kcal: 800, p: 25 }, { n: '炒菜 1 份', kcal: 250, p: 8 }
];

const DIET_RULES = {
  belly: [
    '早饭吃热的：粥、面、鸡蛋，别空腹喝咖啡、别喝冰的',
    '饭后慢走 10–20 分钟，别马上坐下',
    '辣的、油的、酒先停几天'
  ],
  back: [
    '每坐 45 分钟起来 1 分钟',
    '不搬重物、不做仰卧起坐和负重转腰'
  ],
  sleep: [
    '下午 2 点后不喝咖啡、浓茶',
    '晚饭别吃太晚，睡前 3 小时不进食'
  ],
  lose: [
    '每餐先吃菜和蛋白，最后吃主食',
    '主食减三分之一，用杂粮替一部分',
    '含糖饮料换成水或无糖茶'
  ]
};

/* ===== 勋章 ===== */
const BADGES = [
  { id: 'first', name: '第一次', icon: '🌱', desc: '完成第一次训练', goal: 1 },
  { id: 'train5', name: '五练', icon: '🔥', desc: '累计训练 5 次', goal: 5 },
  { id: 'train20', name: '二十练', icon: '⚡', desc: '累计训练 20 次', goal: 20 },
  { id: 'streak3', name: '三天不断', icon: '📅', desc: '连续记录 3 天', goal: 3 },
  { id: 'streak7', name: '一周不断', icon: '🪄', desc: '连续记录 7 天', goal: 7 },
  { id: 'streak30', name: '一月不断', icon: '👑', desc: '连续记录 30 天', goal: 30 },
  { id: 'early5', name: '早睡五晚', icon: '🌙', desc: '22:30 前睡 5 次', goal: 5 },
  { id: 'steps5', name: '每天八千步', icon: '👟', desc: '步数达标 5 天', goal: 5 },
  { id: 'family10', name: '常联系', icon: '📞', desc: '主动联系家人/朋友 10 次', goal: 10 },
  { id: 'read7', name: '读七天', icon: '📖', desc: '读 20 页 7 天', goal: 7 },
  { id: 'review4', name: '会复盘', icon: '🧭', desc: '完成 4 次周复盘', goal: 4 },
  { id: 'lose1', name: '减一公斤', icon: '⚖️', desc: '体重比基线少 1 kg', goal: 1 },
  { id: 'lose3', name: '减三公斤', icon: '🏆', desc: '体重比基线少 3 kg', goal: 3 },
  { id: 'nobelly', name: '肚子安静', icon: '🍵', desc: '连续 7 天没有肚子疼', goal: 7 }
];

const TIPS = [
  { t: '每天 7000–8000 步，死亡风险低约四成半。' },
  { t: '每周 30–60 分钟力量训练就够，再多不会更好。' },
  { t: '规律作息比睡多久更重要，固定起床时间。' },
  { t: '把「打算做」写成「几点、在哪、做什么」，达成率更高。' },
  { t: '坐满 45 分钟就起来 1 分钟，不用靠意志扛。' },
  { t: '先看腰围和照片，别只看体重。' },
  { t: '含糖饮料是最好戒的热量来源。' },
  { t: '不舒服超过两周，别自己扛，去门诊。' }
];

const SIGNALS = ['无', '肚子疼', '肚子胀', '腰酸', '头疼', '乏力', '没睡好'];
