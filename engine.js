/* ============================================================
 * engine.js — 相亲市场定位测试 · 评分与双画像引擎（同主题精致换皮版）
 * 纯逻辑模块：无任何 DOM 依赖，浏览器(window.DatingEngine) 与 Node(require) 双用。
 * 设计原则：本地计算、零上传、可解释（每个分数都能追到选项权重）。
 * ============================================================ */
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api; // Node
  if (typeof window !== 'undefined') window.DatingEngine = api;              // 浏览器
})(this, function () {
  'use strict';

  /* ---------- 1. 层级定义（综合分 -> 定位层级） ---------- */
  const TIERS = [
    { min: 85, key: 'top',     name: '顶配玩家', emoji: '👑',
      tagline: '你在市场顶端，选择权在你手里。别飘，挑个聊得来的。' },
    { min: 70, key: 'high',    name: '高潜优质', emoji: '🌟',
      tagline: '你是很多人眼里的「优质股」，稳定输出就能赢。' },
    { min: 55, key: 'solid',   name: '稳健中坚', emoji: '🛡️',
      tagline: '你不惊艳但很扛用，是市场里最被需要的一群人。' },
    { min: 40, key: 'grow',    name: '潜力成长', emoji: '🌱',
      tagline: '你的牌还没打全，先把硬实力补上，空间很大。' },
    { min: 0,  key: 'start',   name: '起步探索', emoji: '🚀',
      tagline: '起点低不是结局，先想清楚你到底要什么，再出发。' },
  ];
  function tierOf(pct) {
    for (const t of TIERS) if (pct >= t.min) return t;
    return TIERS[TIERS.length - 1];
  }

  /* ---------- 2. 画像档位标签（用于底线型/理想型映射） ---------- */
  const LABELS = {
    city:   ['三线及以下', '二线城市', '新一线', '一线城市'],
    edu:    ['高中及以下', '大专', '普通本科', '985/211本科', '硕士研究生', '博士研究生'],
    income: ['8千以下', '8千–1万', '1–1.5万', '1.5–3万', '3–5万', '5万以上'],
    look:   ['外貌偏低', '普通大众脸', '耐看型', '颜值不错', '高颜值'],
  };

  /* ---------- 3. 题库配置（9 维 / 含权重 w 与单选项分数 s、档位 tier） ---------- */
  const QUESTIONS = [
    {
      id: 'basic', step: 1, title: '基本信息', subtitle: '年龄 & 城市',
      questions: [
        { id: 'age',   label: '你现在多大？', type: 'number', unit: '岁', placeholder: '如 27', w: 6, maxScore: 10,
          hint: '数值仅用于本地画像，不上传' },
        { id: 'city',  label: '所在城市层级', type: 'single', w: 8,
          options: [
            { value: 't1', label: '一线城市',      s: 10, tier: 3 },
            { value: 't2', label: '新一线',        s: 8,  tier: 2 },
            { value: 't3', label: '二线城市',      s: 6,  tier: 1 },
            { value: 't4', label: '三线及以下',    s: 4,  tier: 0 },
          ] },
        { id: 'hukou', label: '户籍情况', type: 'single', w: 4,
          options: [
            { value: 'h1', label: '一线城市户籍',   s: 9 },
            { value: 'h2', label: '省会 / 重点城市', s: 7 },
            { value: 'h3', label: '普通城市户籍',   s: 5 },
            { value: 'h4', label: '农村户籍',       s: 3 },
          ] },
      ],
    },
    {
      id: 'eduJob', step: 2, title: '学历 & 职业', subtitle: '学历 & 职业',
      questions: [
        { id: 'edu', label: '最高学历', type: 'single', w: 10,
          options: [
            { value: 'e6', label: '博士研究生',        s: 10, tier: 5 },
            { value: 'e5', label: '硕士研究生',        s: 9,  tier: 4 },
            { value: 'e4', label: '985 / 211 本科',   s: 8,  tier: 3 },
            { value: 'e3', label: '普通本科',          s: 6,  tier: 2 },
            { value: 'e2', label: '大专',              s: 4,  tier: 1 },
            { value: 'e1', label: '高中及以下',        s: 2,  tier: 0 },
          ] },
        { id: 'career', label: '职业方向', type: 'single', w: 9,
          options: [
            { value: 'c1', label: '体制内（公务员 / 事业单位 / 国央企）', s: 9 },
            { value: 'c2', label: '金融 / 投行 / 咨询',                  s: 9 },
            { value: 'c3', label: '互联网大厂 / 技术研发',               s: 8 },
            { value: 'c4', label: '外资企业（500强 / 跨国公司）',        s: 8 },
            { value: 'c5', label: '医疗 / 教育 / 科研',                  s: 7 },
            { value: 'c6', label: '普通企业 / 中小私营',                s: 5 },
            { value: 'c7', label: '自由职业 / 个体 / 创业',             s: 5 },
          ] },
      ],
    },
    {
      id: 'asset', step: 3, title: '收入 & 资产', subtitle: '个人收入 & 资产',
      questions: [
        { id: 'income', label: '月收入（税后）', type: 'single', w: 10,
          options: [
            { value: 'i6', label: '5万以上',     s: 10, tier: 5 },
            { value: 'i5', label: '3–5万',      s: 9,  tier: 4 },
            { value: 'i4', label: '1.5–3万',    s: 8,  tier: 3 },
            { value: 'i3', label: '1–1.5万',    s: 6,  tier: 2 },
            { value: 'i2', label: '8千–1万',    s: 4,  tier: 1 },
            { value: 'i1', label: '8千以下',    s: 2,  tier: 0 },
          ] },
        { id: 'house', label: '本地房产情况', type: 'single', w: 7,
          options: [
            { value: 'ho1', label: '本人名下有房',     s: 9 },
            { value: 'ho2', label: '家里有房',         s: 7 },
            { value: 'ho3', label: '租房，有购房计划', s: 4 },
            { value: 'ho4', label: '暂无购房计划',     s: 2 },
          ] },
      ],
    },
    {
      id: 'familyAsset', step: 4, title: '家庭资产', subtitle: '家庭资产背景',
      questions: [
        { id: 'parentsHouse', label: '父母名下房产套数（含老家）', type: 'single', w: 5,
          options: [
            { value: 'ph1', label: '3套及以上', s: 9 },
            { value: 'ph2', label: '2套',      s: 7 },
            { value: 'ph3', label: '1套',      s: 5 },
            { value: 'ph4', label: '无房产',   s: 2 },
          ] },
        { id: 'familyFund', label: '家庭可动用存款 / 金融资产估算', type: 'single', w: 6,
          options: [
            { value: 'ff1', label: '500万以上',       s: 10 },
            { value: 'ff2', label: '100–500万',       s: 8 },
            { value: 'ff3', label: '20–100万',        s: 5 },
            { value: 'ff4', label: '20万以下 / 有负债', s: 2 },
          ] },
        { id: 'parentsPension', label: '父母是否有稳定退休金 / 养老保障', type: 'single', w: 5,
          options: [
            { value: 'pp1', label: '有，无需子女支持', s: 9 },
            { value: 'pp2', label: '部分，偶尔需要',   s: 5 },
            { value: 'pp3', label: '无，需要子女赡养', s: 2 },
          ] },
      ],
    },
    {
      id: 'familyStruct', step: 5, title: '家庭结构', subtitle: '家庭结构',
      questions: [
        { id: 'birthOrder', label: '你是家里第几个孩子', type: 'single', w: 3,
          options: [
            { value: 'bo1', label: '独生子女',          s: 7 },
            { value: 'bo2', label: '有弟妹，我是长子女', s: 5 },
            { value: 'bo3', label: '有兄姐，我是小子女', s: 4 },
            { value: 'bo4', label: '排中间',            s: 3 },
          ] },
        { id: 'siblingJob', label: '弟妹的就业情况', type: 'single', w: 2,
          options: [
            { value: 'sj1', label: '已就业 / 在校', s: 5 },
            { value: 'sj2', label: '未就业 / 待业', s: 2 },
          ] },
        { id: 'supportParents', label: '预计未来对父母的经济支持程度', type: 'single', w: 4,
          options: [
            { value: 'sp1', label: '父母自给自足，无需我支持', s: 9 },
            { value: 'sp2', label: '偶尔节日红包，压力不大',   s: 6 },
            { value: 'sp3', label: '需要我定期补贴生活费',     s: 3 },
            { value: 'sp4', label: '主要靠我养，压力较大',     s: 1 },
          ] },
      ],
    },
    {
      id: 'look', step: 6, title: '外貌 & 形象', subtitle: '外貌 & 形象',
      questions: [
        { id: 'looks', label: '颜值自评', type: 'single', w: 8,
          options: [
            { value: 'l5', label: '高颜值，陌生人会主动搭讪 / 回头看',       s: 10, tier: 4 },
            { value: 'l4', label: '颜值不错，第一眼好看，异性缘明显好',     s: 8,  tier: 3 },
            { value: 'l3', label: '耐看型，第一眼一般，熟了才好看',         s: 6,  tier: 2 },
            { value: 'l2', label: '普通大众脸，不出挑也不难看',             s: 4,  tier: 1 },
            { value: 'l1', label: '外貌偏低，自己也清楚',                   s: 2,  tier: 0 },
          ] },
        { id: 'height', label: '身高', type: 'number', unit: 'cm', placeholder: '如 168', w: 5, maxScore: 10,
          hint: '数值仅用于本地画像，不上传' },
        { id: 'imageMgmt', label: '整体形象管理', type: 'single', w: 4,
          options: [
            { value: 'im1', label: '精致打扮，很在意', s: 8 },
            { value: 'im2', label: '整洁得体，适度',   s: 6 },
            { value: 'im3', label: '随意为主',         s: 4 },
            { value: 'im4', label: '不太注重',         s: 2 },
          ] },
      ],
    },
    {
      id: 'personality', step: 7, title: '性格特质', subtitle: '性格特质',
      questions: [
        { id: 'social', label: '你的社交倾向', type: 'single', w: 3,
          options: [
            { value: 'so1', label: '外向，喜欢社交',   s: 8 },
            { value: 'so2', label: '中间型，随情况',   s: 6 },
            { value: 'so3', label: '偏内向，圈子小',   s: 4 },
            { value: 'so4', label: '内向，社交耗能',   s: 3 },
          ] },
        { id: 'emotion', label: '情绪稳定性自评', type: 'single', w: 6,
          options: [
            { value: 'em1', label: '很稳定，很少情绪化', s: 9 },
            { value: 'em2', label: '大体稳定，偶尔波动', s: 7 },
            { value: 'em3', label: '情绪起伏较明显',     s: 4 },
            { value: 'em4', label: '情绪波动大，敏感',   s: 2 },
          ] },
        { id: 'conflict', label: '处理感情矛盾的方式', type: 'single', w: 5,
          options: [
            { value: 'cf1', label: '冷静沟通，找解决方案', s: 9 },
            { value: 'cf2', label: '先冷静，再沟通',       s: 7 },
            { value: 'cf3', label: '倾向回避，不喜争吵',   s: 5 },
            { value: 'cf4', label: '容易激动，情绪先行',   s: 2 },
          ] },
      ],
    },
    {
      id: 'attitude', step: 8, title: '情感态度', subtitle: '情感 & 婚育态度',
      questions: [
        { id: 'exp', label: '感情经历', type: 'single', w: 3,
          options: [
            { value: 'ex1', label: '无恋爱经历', s: 5 },
            { value: 'ex2', label: '1–2段',     s: 7 },
            { value: 'ex3', label: '3–4段',     s: 5 },
            { value: 'ex4', label: '5段以上',   s: 3 },
          ] },
        { id: 'marry', label: '婚育意愿', type: 'single', w: 3,
          options: [
            { value: 'm1', label: '明确想结婚生育',     s: 7 },
            { value: 'm2', label: '想结婚，生育随缘',   s: 6 },
            { value: 'm3', label: '想结婚，不想生育',   s: 5 },
            { value: 'm4', label: '丁克 / 暂不考虑',    s: 4 },
          ] },
        { id: 'parentsAttitude', label: '父母对你相亲的态度', type: 'single', w: 3,
          options: [
            { value: 'pa1', label: '开明，不干涉',     s: 8 },
            { value: 'pa2', label: '偶尔催，可沟通',   s: 6 },
            { value: 'pa3', label: '频繁催，条件多',   s: 4 },
            { value: 'pa4', label: '强势干涉，难沟通', s: 2 },
          ] },
      ],
    },
    {
      id: 'expect', step: 9, title: '你的期望', subtitle: '择偶优先级',
      questions: [
        { id: 'priority', label: '你最看重对方哪几点？（可多选）', type: 'multi', w: 0,
          options: [
            { value: 'p_look',   label: '外貌颜值' },
            { value: 'p_income', label: '经济收入' },
            { value: 'p_edu',    label: '学历背景' },
            { value: 'p_char',   label: '性格人品' },
            { value: 'p_family', label: '家庭背景 / 资产' },
            { value: 'p_stable', label: '稳定性 / 安全感' },
          ] },
        { id: 'initiative', label: '你的相亲主动程度', type: 'single', w: 4,
          options: [
            { value: 'iv1', label: '非常主动',     s: 8 },
            { value: 'iv2', label: '适当主动',     s: 6 },
            { value: 'iv3', label: '比较被动',     s: 4 },
            { value: 'iv4', label: '很被动 / 社恐', s: 2 },
          ] },
      ],
    },
  ];

  /* ---------- 4. 数值型题目打分助手（供视图层在存答案时调用） ---------- */
  function ageScore(age) {
    age = Number(age);
    if (!age || age < 18) return 0;
    if (age >= 22 && age <= 28) return 9;
    if (age >= 29 && age <= 32) return 7;
    if (age >= 33 && age <= 36) return 5;
    if (age >= 37 && age <= 42) return 3;
    if (age > 42) return 2;
    return 6; // 18-21
  }
  function heightScore(gender, h) {
    h = Number(h);
    if (!h) return 0;
    if (gender === 'male') {
      if (h >= 178 && h <= 182) return 9;
      if (h >= 175 && h < 178) return 8;
      if (h >= 183) return 8;
      if (h >= 170 && h < 175) return 6;
      if (h >= 165 && h < 170) return 4;
      return 3;
    } else {
      if (h >= 165 && h <= 170) return 9;
      if (h >= 160 && h < 165) return 7;
      if (h >= 171) return 8;
      if (h >= 155 && h < 160) return 5;
      return 3;
    }
  }

  /* ---------- 5. 评分主函数 ---------- */
  // answers 结构：{ gender, age:{value,score}, city:{value,label,score,tier}, ... priority:[{value,label}], initiative:{...} }
  function computeScores(answers) {
    let tw = 0, tm = 0;                 // 综合：实际加权 / 最大加权
    const bucket = { hard: [0, 0], soft: [0, 0], family: [0, 0], active: [0, 0] };
    const G = {
      hard:   ['city', 'hukou', 'edu', 'career', 'income', 'house', 'parentsHouse', 'familyFund'],
      soft:   ['looks', 'height', 'imageMgmt', 'social', 'emotion', 'conflict'],
      family: ['parentsHouse', 'familyFund', 'parentsPension', 'birthOrder', 'siblingJob', 'supportParents'],
      active: ['social', 'initiative', 'conflict'],
    };

    for (const step of QUESTIONS) {
      for (const q of step.questions) {
        if (q.type === 'multi') continue;           // 多选不参与打分
        const w = q.w || 0;
        const max = q.type === 'number' ? q.maxScore : Math.max.apply(null, q.options.map(o => o.s));
        const a = answers[q.id];
        const sc = a && typeof a.score === 'number' ? a.score : 0;
        tw += sc * w; tm += max * w;
        for (const b of Object.keys(G)) {
          if (G[b].includes(q.id)) { bucket[b][0] += sc * w; bucket[b][1] += max * w; }
        }
      }
    }
    const pct = tm > 0 ? Math.round((tw / tm) * 100) : 0;
    const dims = {};
    for (const b of Object.keys(bucket)) {
      dims[b] = bucket[b][1] > 0 ? Math.round((bucket[b][0] / bucket[b][1]) * 100) : 0;
    }
    const tier = tierOf(pct);
    return { total: pct, dims, tier };
  }

  /* ---------- 6. 双画像生成（底线型 / 理想型） ---------- */
  function shiftTier(arr, idx, delta) {
    const i = Math.max(0, Math.min(arr.length - 1, idx + delta));
    return arr[i];
  }
  function optionTier(answers, qid) {
    const a = answers[qid];
    return (a && typeof a.tier === 'number') ? a.tier : Math.floor((a && a.options ? 0 : 0));
  }
  function generatePortrait(answers, scores) {
    const tier = scores.tier;
    const genderText = answers.gender === 'male' ? '男生' : '女生';

    // 取各档位当前索引
    const cityIdx   = optionTier(answers, 'city');
    const eduIdx    = optionTier(answers, 'edu');
    const incomeIdx = optionTier(answers, 'income');
    const lookIdx   = optionTier(answers, 'looks');

    const floor = {
      city:   shiftTier(LABELS.city, cityIdx, -1),
      edu:    shiftTier(LABELS.edu, eduIdx, -1),
      income: shiftTier(LABELS.income, incomeIdx, -1),
      look:   shiftTier(LABELS.look, lookIdx, -1),
    };
    const ideal = {
      city:   shiftTier(LABELS.city, cityIdx, +1),
      edu:    shiftTier(LABELS.edu, eduIdx, +1),
      income: shiftTier(LABELS.income, incomeIdx, +1),
      look:   shiftTier(LABELS.look, lookIdx, +1),
    };

    // 解析文案：结合用户自身标签 + 主动程度 + 最看重项
    const init = answers.initiative && answers.initiative.label ? answers.initiative.label : '适当主动';
    const prio = (answers.priority || []).map(p => p.label);
    const prioText = prio.length ? prio.join('、') : '性格人品与稳定性';

    const analysis =
      `作为${genderText}，你当前落在「${tier.name}」区间，综合相亲竞争力约 ${scores.total}/100。` +
      `你的硬实力（经济 / 资产 / 学历职业）打分 ${scores.dims.hard}，软实力（外貌 / 性格 / 情绪）${scores.dims.soft}，` +
      `家庭支持面 ${scores.dims.family}，主动出击度 ${scores.dims.active}。` +
      `你在意的是${prioText}，而你的相亲姿态偏向「${init}」——` +
      (init.includes('被动')
        ? '市场不会主动把人送到你面前，适度往前半步，匹配效率会明显提升。'
        : '保持这个节奏，多见面、少空想，机会会自己长出来。');

    const tips = [];
    if (scores.dims.hard < 55) tips.push('硬实力是市场的「入场券」，学历 / 收入 / 资产任一短板，优先补最易撬动的那块。');
    if (scores.dims.soft < 55) tips.push('软实力靠「可被感知」：情绪稳定 + 会沟通，比颜值更抗周期。');
    if (scores.dims.family < 50) tips.push('家庭负担重不是减分项，但要在相亲里主动说清边界，反而更显靠谱。');
    if (init.includes('被动') || init.includes('社恐')) tips.push('被动型最容易卡在「聊得不错但没下文」，给每次接触一个明确的小推进。');
    if (tips.length === 0) tips.push('四维都挺均衡，你现在的瓶颈多半不在条件，而在「见的人够不够多」。');
    tips.push('定位是参考不是判决：它告诉你市场在哪，决定权一直在你手里。');

    return { tier, genderText, floor, ideal, analysis, tips, prioText, init };
  }

  /* ---------- 7. 对外 API ---------- */
  return {
    TIERS, LABELS, QUESTIONS,
    ageScore, heightScore, computeScores, generatePortrait, tierOf,
  };
});
