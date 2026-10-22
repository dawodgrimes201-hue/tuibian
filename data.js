/* 蜕变 · 语音教练 —— 内容层：动作库、语音流程、画像问题、贴士 */
'use strict';

const APP = {
  name: '蜕变',
  sub: '语音教练',
  start: '2026-10-21',
  end: '2027-02-06',
  title: '下班之后，把六条线各往前挪一格'
};

/* 只保留「下班时间」能推进的五条线（事业暂不在每日动作里） */
const DIMS = [
  { key: 'body',     name: '身体', icon: '●', color: '#4cc9a4', goal: '力量 3 次/周、8000 步、睡 7 小时、腰不疼' },
  { key: 'mind',     name: '心力', icon: '◐', color: '#6aa9ff', goal: '每天一句情绪 + 3 分钟呼吸、屏幕 ≤3h' },
  { key: 'relation', name: '关系', icon: '♡', color: '#ff7a90', goal: '每天主动联系一个人、每周一次家庭通话' },
  { key: 'order',    name: '秩序', icon: '▦', color: '#c084fc', goal: '10 分钟整理 + 记账、证件归档' },
  { key: 'growth',   name: '见识', icon: '✦', color: '#8bd3dd', goal: '读 2 本书、写 12 篇、20 条录音' }
];

/* ========== 动作库 ==========
   kind: move（计时热身）| rep（计次）| hold（计时）| stretch（拉伸，可左右）
   语音会按 sets/reps/tempo 自动生成口令，颗粒度到「每一次」。 */
const EX = {
  /* —— 热身 —— */
  walk3:      { n: '原地踏步', say: '原地踏步', kind: 'move', secs: 180,
    cue: '原地踏步，手臂自然摆，三分钟，微微出汗就好。' },
  walk2:      { n: '慢走放松', say: '慢走', kind: 'move', secs: 120, cue: '慢走两分钟，让心率下来，别突然停。' },
  walk1:      { n: '慢走放松', say: '慢走', kind: 'move', secs: 60, cue: '慢走一分钟，呼吸放长。' },
  hipCircle:  { n: '髋绕环', say: '髋绕环', kind: 'rep', sets: 1, reps: 10, repSecs: 3, rest: 15, sides: 2,
    cue: '双手叉腰，画大圈，左右各十次。', easy: '圈小一点，慢一点。' },
  shoulderCircle: { n: '肩绕环', say: '肩绕环', kind: 'rep', sets: 1, reps: 10, repSecs: 3, rest: 15, sides: 2,
    cue: '肩膀向后画大圈，左右各十次，别耸肩。' },
  catCow:     { n: '猫牛', say: '猫牛', kind: 'rep', sets: 1, reps: 10, repSecs: 32 / 10, rest: 15,
    cue: '四足跪姿，吸气塌腰抬头，呼气拱背低头，一节一节动，跟着呼吸走。' },
  bodySquat:  { n: '自重深蹲', say: '自重深蹲', kind: 'rep', sets: 1, reps: 10, repSecs: 3, rest: 20,
    cue: '手扶椅背或前伸，找坐下去的感觉，膝盖对脚尖。' },
  bandPull:   { n: '弹力带拉开', say: '弹力带拉开', kind: 'rep', sets: 1, reps: 15, repSecs: 2.4, rest: 20,
    cue: '双手与肩同高把带子拉开，先夹肩胛骨，再拉手肘。' },
  gluteWarm:  { n: '臀桥热身', say: '臀桥', kind: 'rep', sets: 1, reps: 10, repSecs: 3, rest: 20,
    cue: '仰卧屈膝，脚跟发力顶髋，顶住一秒，慢慢下。' },

  /* —— 力量 A：下肢 + 推 —— */
  gobletSquat: { n: '高脚杯深蹲', say: '深蹲', kind: 'rep', sets: 3, reps: 10, repMax: 12, repSecs: 4, rest: 90,
    cue: '双脚与肩同宽，脚尖略外八，哑铃抱在胸前；屁股往后往下坐，像坐身后的椅子；下蹲三秒，起身一秒。',
    easy: '没哑铃就自重；做不了就身后放把椅子，轻轻碰到就起。',
    bad: '膝盖内扣、脚跟离地、低头弓腰。' },
  pushup:     { n: '俯卧撑', say: '俯卧撑', kind: 'rep', sets: 3, reps: 8, repMax: 12, repSecs: 3.2, rest: 90,
    cue: '双手略宽于肩，头背臀一条直线，肘部约四十五度往后，胸口降到离地一拳。',
    easy: '做不了就跪姿，或手撑桌沿，位置越高越省力。',
    bad: '撅屁股、肘完全打开成九十度、只降一半。' },
  gluteBridge: { n: '臀桥', say: '臀桥', kind: 'rep', sets: 3, reps: 12, repMax: 15, repSecs: 3.4, rest: 60,
    cue: '仰卧屈膝，脚跟离屁股一掌；脚跟发力把髋顶到身体一条直线，顶住一秒，慢慢下。',
    easy: '先做小幅度，找到臀部发力。',
    bad: '用腰顶、脖子用力、顶太高。' },
  splitSquat: { n: '箭步蹲', say: '箭步蹲', kind: 'rep', sets: 3, reps: 8, repMax: 10, repSecs: 4, rest: 60, sides: 2,
    cue: '一脚前一脚后，身体直上直下，前膝对脚尖，后膝接近地面，前脚发力站起。',
    easy: '扶墙保持平衡；腰不舒服就改成上台阶。',
    bad: '前膝内扣、身体前倾、步子太小。' },
  plank:      { n: '平板支撑', say: '平板支撑', kind: 'hold', sets: 3, secs: 30, rest: 45,
    cue: '肘在肩正下方，收腹夹臀，身体一条直线，正常呼吸。',
    easy: '膝盖着地，或手撑高一点。',
    bad: '塌腰、撅屁股、憋气。' },

  /* —— 力量 B：拉 + 核心 —— */
  bandRow:    { n: '弹力带划船', say: '弹力带划船', kind: 'rep', sets: 3, reps: 12, repMax: 15, repSecs: 3, rest: 60,
    cue: '带子固定在胸口高度；先夹肩胛骨，再拉手肘；肘贴身体两侧，顶端停一秒。',
    easy: '站近一点减少阻力。',
    bad: '耸肩、只用手臂拉、身体后仰。' },
  oneArmRow:  { n: '哑铃单臂划船', say: '单臂划船', kind: 'rep', sets: 3, reps: 10, repMax: 12, repSecs: 4, rest: 60, sides: 2,
    cue: '一手一膝撑椅，背保持平；另一手提哑铃沿身体往后拉，顶端停一秒，慢慢放。',
    easy: '先用矿泉水瓶。',
    bad: '转腰借力、耸肩、弓背。' },
  deadlift:   { n: '哑铃硬拉', say: '硬拉', kind: 'rep', sets: 3, reps: 10, repMax: 12, repSecs: 4, rest: 90,
    cue: '双脚与髋同宽，哑铃贴腿；屁股往后推，背保持平直，哑铃滑到膝盖下方；脚跟蹬地起身，站直夹臀。',
    easy: '腰不舒服先只做「屁股碰墙」的髋铰链，不拿重量。',
    bad: '弓背、用腰抬、哑铃离身体太远。' },
  deadBug:    { n: '死虫', say: '死虫', kind: 'rep', sets: 3, reps: 8, repMax: 10, repSecs: 5, rest: 45, sides: 2,
    cue: '仰卧，双手举向天花板，双腿屈膝九十度；腰贴地，对侧手脚慢慢伸出，呼气；腰一离地就缩小幅度。',
    bad: '腰拱起、动作太快、憋气。' },
  sidePlank:  { n: '侧桥', say: '侧桥', kind: 'hold', sets: 3, secs: 20, rest: 45, sides: 2,
    cue: '侧卧，肘在肩下；髋抬到身体一条直线，脖子放松，正常呼吸。',
    easy: '下面的膝盖着地。',
    bad: '髋掉下去、身体前倾、耸肩。' },

  /* —— 力量 C：全身 + 臀 —— */
  stepUp:     { n: '上台阶', say: '上台阶', kind: 'rep', sets: 3, reps: 8, repMax: 10, repSecs: 4, rest: 60, sides: 2,
    cue: '找稳固台阶，整只脚踩上去，用上面那条腿发力站起，慢慢下。',
    bad: '后脚蹬地借力、膝盖内扣。' },
  press:      { n: '哑铃站姿推举', say: '推举', kind: 'rep', sets: 3, reps: 10, repMax: 12, repSecs: 3.5, rest: 60,
    cue: '收腹夹臀，哑铃从肩往头顶推，手臂伸直但肘不锁死，慢慢下。',
    easy: '用矿泉水瓶。',
    bad: '腰后仰、耸肩。' },
  singleBridge:{ n: '单腿臀桥', say: '单腿臀桥', kind: 'rep', sets: 3, reps: 8, repMax: 10, repSecs: 4, rest: 60, sides: 2,
    cue: '一条腿伸直抬起，另一条腿脚跟发力顶髋，骨盆保持水平，顶住一秒。',
    bad: '骨盆歪、用腰顶。' },
  bentRow:    { n: '俯身划船', say: '俯身划船', kind: 'rep', sets: 3, reps: 10, repMax: 12, repSecs: 3, rest: 60,
    cue: '髋往后坐、背平，把手肘往后拉，夹住肩胛骨。',
    bad: '弓背、耸肩。' },
  farmerWalk: { n: '农夫行走', say: '农夫行走', kind: 'hold', sets: 3, secs: 30, rest: 45,
    cue: '双手提重物，挺胸收腹，肩膀下沉，小步快走。',
    bad: '含胸驼背、憋气。' },
  birdDog:    { n: '鸟狗', say: '鸟狗', kind: 'rep', sets: 2, reps: 8, repMax: 10, repSecs: 4, rest: 30, sides: 2,
    cue: '四足跪姿，对侧手脚同时伸出，腰保持不动，停两秒。',
    bad: '腰转、抬太高。' },

  /* —— 腰背专项 —— */
  wallStand:  { n: '靠墙站', say: '靠墙站', kind: 'hold', sets: 1, secs: 120, rest: 0,
    cue: '后脑、肩胛、臀贴墙，收下巴，正常呼吸。' },

  /* —— 拉伸 —— */
  quadStretch:{ n: '股四头拉伸', say: '股四头拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '单手扶墙，另一手抓脚背，膝盖并拢，骨盆微微后倾。' },
  gluteStretch:{ n: '臀部拉伸', say: '臀部拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '坐着翘二郎腿，身体前倾，感觉臀部外侧拉开。' },
  chestStretch:{ n: '胸部门框拉伸', say: '胸部门框拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '小臂贴门框，身体微微前移，胸口打开。' },
  latStretch: { n: '背阔肌拉伸', say: '背阔肌拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '双手扶椅背，屁股后坐，背拉长。' },
  hipStretch: { n: '髋前侧拉伸', say: '髋前侧拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '弓步，夹臀，身体微微前移，别塌腰。' },
  calfStretch:{ n: '小腿拉伸', say: '小腿拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '手扶墙，后脚跟踩实，身体前倾。' },
  hamStretch: { n: '腿后侧拉伸', say: '腿后侧拉伸', kind: 'stretch', secs: 30, sides: 2,
    cue: '一脚前伸脚尖回勾，背挺直，身体从髋部前倾。' }
};

/* ========== 语音流程 ========== */
const ROUTINES = {
  strengthA: { title: '力量 A · 下肢 + 推', dim: 'body', kind: 'strength', minutes: 35, day: 1,
    warm: ['walk3', 'hipCircle', 'catCow', 'bodySquat', 'shoulderCircle'],
    main: ['gobletSquat', 'pushup', 'gluteBridge', 'splitSquat', 'plank'],
    cool: ['walk2', 'quadStretch', 'gluteStretch', 'chestStretch'] },
  strengthB: { title: '力量 B · 拉 + 核心', dim: 'body', kind: 'strength', minutes: 35, day: 3,
    warm: ['walk3', 'shoulderCircle', 'bandPull', 'catCow', 'gluteWarm'],
    main: ['bandRow', 'oneArmRow', 'deadlift', 'deadBug', 'sidePlank'],
    cool: ['walk1', 'latStretch', 'hipStretch'] },
  strengthC: { title: '力量 C · 全身 + 臀', dim: 'body', kind: 'strength', minutes: 30, day: 5,
    warm: ['walk3', 'hipCircle', 'bodySquat', 'gluteWarm', 'catCow'],
    main: ['stepUp', 'press', 'singleBridge', 'bentRow', 'farmerWalk', 'birdDog'],
    cool: ['walk1', 'gluteStretch', 'hamStretch'] },

  walk: { title: '快走 · 40 分钟', dim: 'body', kind: 'walk', minutes: 40,
    blocks: [
      { k: 'say', t: '快走训练。先慢走五分钟热身，让身体热起来。' },
      { k: 'hold', secs: 300, label: '慢走热身 5 分钟', beepEvery: 0,
        cues: [{ at: 120, t: '保持轻松，呼吸顺畅。' }] },
      { k: 'say', t: '开始快走。强度是「能说话、不能唱歌」，步频快一点，步子别太大。' },
      { k: 'hold', secs: 1800, label: '快走 30 分钟 · 能说话不能唱歌', beepEvery: 300,
        cues: [
          { at: 300, t: '五分钟了。挺胸，肩膀放松，手臂自然摆。' },
          { at: 600, t: '十分钟。注意别低头看手机。' },
          { at: 1200, t: '还剩五分钟，保持这个强度。' },
          { at: 1500, t: '最后一分钟，慢慢降速。' }
        ] },
      { k: 'say', t: '快走结束。慢走两分钟，然后拉伸小腿和大腿前侧。' },
      { k: 'hold', secs: 120, label: '慢走放松 2 分钟', beepEvery: 0, cues: [] }
    ] },

  longwalk: { title: '长走 · 60 分钟', dim: 'body', kind: 'walk', minutes: 60,
    blocks: [
      { k: 'say', t: '长走六十分钟。选一条有点起伏的路线，强度还是能说话。' },
      { k: 'hold', secs: 300, label: '慢走热身 5 分钟', beepEvery: 0, cues: [] },
      { k: 'hold', secs: 3000, label: '持续走 50 分钟', beepEvery: 300,
        cues: [
          { at: 900, t: '每十五分钟喝两口水，现在可以喝一口。' },
          { at: 1800, t: '一半了。保持呼吸，别冲太快。' },
          { at: 2700, t: '还有五分钟，快到家了。' }
        ] },
      { k: 'say', t: '走完了。回家把腿抬起来靠墙五分钟。' }
    ] },

  back10: { title: '腰背专项 · 10 分钟', dim: 'body', kind: 'back', minutes: 10,
    seq: ['catCow',
      { id: 'birdDog', sets: 2, reps: 8 },
      { id: 'deadBug', sets: 2, reps: 8 },
      { id: 'gluteBridge', sets: 2, reps: 15 },
      { id: 'sidePlank', sets: 2, secs: 20 },
      'wallStand'] },

  bellyWalk: { title: '饭后散步 + 腹式呼吸 · 20 分钟', dim: 'body', kind: 'belly', minutes: 20,
    blocks: [
      { k: 'say', t: '今天肚子不舒服，就不练力量了。饭后二十分钟散步，比躺着更有用。' },
      { k: 'hold', secs: 1200, label: '饭后散步 20 分钟 · 慢一点', beepEvery: 300,
        cues: [{ at: 300, t: '走慢一点，别弯腰压肚子。' }, { at: 900, t: '还有五分钟。' }] },
      { k: 'say', t: '散步结束。回家做三分钟腹式呼吸：一只手放肚子上，吸气让肚子鼓起来。' }
    ] },

  sleep3: { title: '睡前 3 分钟 · 呼吸 + 一句', dim: 'mind', kind: 'sleep', minutes: 5,
    blocks: [
      { k: 'say', t: '睡前流程。先把手机放到看不见的地方，坐下来，背挺直。' },
      { k: 'say', t: '腹式呼吸，四拍吸气，两拍停，六拍呼气。跟着我的口令。' },
      { k: 'breath', rounds: 8, inhale: 4, hold: 2, exhale: 6 },
      { k: 'say', t: '好。现在在心里说一句：今天最难的是什么，我做到了什么。不用写，说出来就行。' },
      { k: 'hold', secs: 25, label: '心里说一句：今天最难的事 / 我做到的一件事', beepEvery: 0, cues: [] },
      { k: 'say', t: '今天就到这。去洗漱，关灯，明天见。' }
    ] },

  morning2: { title: '晨间 2 分钟 · 见光 + 腰背', dim: 'body', kind: 'morning', minutes: 3,
    blocks: [
      { k: 'say', t: '早上好。先走到窗边，拉开窗帘，看远处二十秒，让眼睛见到光。' },
      { k: 'hold', secs: 20, label: '见光 20 秒 · 看远处', beepEvery: 0, cues: [] },
      { k: 'say', t: '喝一杯温水。今天早上不要空腹喝咖啡，也不要喝冰的。' },
      { k: 'hold', secs: 20, label: '喝一杯温水', beepEvery: 0, cues: [] },
      { k: 'say', t: '腰背两分钟。先猫牛，跟着呼吸，慢。' },
      { k: 'hold', secs: 40, label: '猫牛 · 跟着呼吸', beepEvery: 0, cues: [] },
      { k: 'say', t: '然后靠墙站一分钟，后脑、肩胛、臀贴墙。' },
      { k: 'hold', secs: 60, label: '靠墙站 1 分钟', beepEvery: 0, cues: [] },
      { k: 'say', t: '好了。今天不用完美，做一件就算赢。' }
    ] },

  reset90: { title: '久坐打断 · 90 秒', dim: 'body', kind: 'reset', minutes: 2,
    blocks: [
      { k: 'say', t: '起来一下。九十秒就好。' },
      { k: 'hold', secs: 20, label: '站起来，走两步', beepEvery: 0, cues: [] },
      { k: 'say', t: '髋绕环，左右各五次，画大圈。' },
      { k: 'hold', secs: 20, label: '髋绕环 · 左右各 5 次', beepEvery: 0, cues: [] },
      { k: 'say', t: '肩膀向后画圈十次，别耸肩。' },
      { k: 'hold', secs: 20, label: '肩绕环 10 次', beepEvery: 0, cues: [] },
      { k: 'say', t: '靠墙站三十秒，然后回去继续。' },
      { k: 'hold', secs: 30, label: '靠墙站 30 秒', beepEvery: 0, cues: [] }
    ] },

  stretch10: { title: '收尾拉伸 · 8 分钟', dim: 'body', kind: 'stretch', minutes: 8,
    seq: [{ id: 'walk2', sets: 1 }, 'quadStretch', 'gluteStretch', 'chestStretch', 'latStretch', 'calfStretch'] },

  minimal20: { title: '保底 20 分钟', dim: 'body', kind: 'min', minutes: 20,
    blocks: [
      { k: 'say', t: '今天时间不多，就做保底版。二十分钟，做完就算赢。' },
      { k: 'hold', secs: 600, label: '快走 10 分钟', beepEvery: 120, cues: [{ at: 300, t: '一半了。保持能说话的强度。' }] },
      { k: 'hold', secs: 600, label: '腰背 10 分钟 · 猫牛 / 鸟狗 / 靠墙站', beepEvery: 0,
        cues: [{ at: 180, t: '换鸟狗，对侧手脚伸出，腰不动。' }, { at: 480, t: '最后靠墙站两分钟。' }] }
    ] }
};

/* 每天默认排哪套（周一=1 … 周日=0） */
const DAY_ROUTINE = {
  1: 'strengthA', 2: 'walk', 3: 'strengthB', 4: 'walk',
  5: 'strengthC', 6: 'longwalk', 0: 'back10'
};

/* ========== 每日一条 ========== */
const TIPS = [
  { ref: '2.11', t: '每天 7000–8000 步，或每周快走 150–300 分钟，死亡风险低约四成半。' },
  { ref: '2.16', t: '每周 30–60 分钟力量训练就够，再多不会更好——别把练当成惩罚。' },
  { ref: '2.13', t: '规律作息比睡多久更能预测风险。固定起床，比周末补觉值钱。' },
  { ref: '6.29', t: '腰痛别指望「正确姿势」防住，规律锻炼能让发作少 35–45%。' },
  { ref: '4.1', t: '把「打算做」写成「几点、在哪、做什么」，达成率明显更高。' },
  { ref: '3.1', t: '关掉非必要通知。不是靠意志抵抗，是把诱惑挪出视线。' },
  { ref: '3.16', t: '不想接的请求，直接说「这次不行，我手上排满了」。' },
  { ref: '2.32', t: '把 BMI 控制在 20–25。先看腰围和照片，别只看体重。' },
  { ref: '6.18', t: '体检别买通用套餐，只查有证据的那几项。' },
  { ref: '2.17', t: '久坐最久的人死亡风险是坐得最少的人的 2.63 倍。每 45 分钟起来一次。' },
  { ref: '24.', t: '持续两周以上的不舒服，别自己扛，去门诊。查不到就说不确定，不硬猜。' },
  { ref: '5.6', t: '看到「高收益、保本、稳赚」直接走开。' },
  { ref: '13.3', t: '突然嘴歪、一侧没劲、说话不清，立刻打 120。' },
  { ref: '1.25', t: '情绪低落超过两周，打 12356 或去精神心理科。' }
];

/* ========== 更深的画像：语音问诊 ========== */
const INTAKE = [
  { id: 'offWork', q: '你一般几点下班到家？', opts: ['18:00 前后', '18:30', '19:00', '20:00 以后', '不固定'] },
  { id: 'sleepAt', q: '通常几点上床？', opts: ['22:00 前', '22:30', '23:00', '23:30', '0:00 以后'] },
  { id: 'wakeAt', q: '通常几点起？', opts: ['6:30 前', '7:00', '7:30', '8:00', '8:30 以后'] },
  { id: 'morningSign', q: '早上起来，身体最常出现什么？', multi: true,
    opts: ['没什么', '肚子疼', '肚子胀', '腰酸', '头晕', '乏力', '嗓子干'] },
  { id: 'breakfast', q: '你早饭一般吃什么？', opts: ['热饭热粥', '面包+牛奶', '咖啡+面包', '不吃', '楼下外卖'] },
  { id: 'back', q: '腰现在什么情况？', opts: ['没明显感觉', '久坐会酸', '弯腰会疼', '疼到腿或麻', '医生诊断过'] },
  { id: 'mood', q: '最近的情绪状态？', opts: ['基本稳定', '偶尔低落', '经常低落', '焦虑睡不好'] },
  { id: 'family', q: '家里现在几个人一起住？', opts: ['一个人', '和伴侣', '伴侣+孩子', '和父母', '其他'] },
  { id: 'focus', q: '这三个月，你最想先改哪一条？', opts: ['身体', '心力', '关系', '秩序', '见识'] },
  { id: 'fail', q: '以前坚持不下来的事，最常因为什么？', multi: true,
    opts: ['太累了', '计划太满', '没人管', '看不到效果', '应酬打断', '不知道该做什么'] },
  { id: 'gear', q: '家里有什么装备？', multi: true, opts: ['哑铃', '弹力带', '跑鞋', '瑜伽垫', '什么都没有'] }
];

/* 腹痛日记可选项 */
const BELLY_FOODS = ['冰的', '咖啡', '辣的', '油腻', '牛奶', '空腹很久', '应酬喝酒', '外卖', '吃太快'];
const SYMPTOMS = ['肚子疼', '肚子胀', '腰酸', '腰疼到腿', '头痛', '乏力', '心慌', '嗓子痛', '睡得不好'];
