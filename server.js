'use strict';

require('dotenv').config();

const path = require('path');
const express = require('express');
const OpenAI = require('openai');
const Anthropic = require('@anthropic-ai/sdk');

const app = express();
const PORT = process.env.PORT || 3000;

// ───── 비용/안전 상수 ─────
const MAX_TOKENS = 600;                       // 비용 안전 가드
const OPENAI_MODEL = 'gpt-4o';                // 현행 모델 (절감 필요 시 gpt-4o-mini)
const ANTHROPIC_MODEL = 'claude-opus-4-7';    // 또는 'claude-sonnet-4-6' — 구 모델 금지
const FAIL_MSG = 'AI가 응답을 못 받았어요. 잠시 후 다시 시도해주세요.';

// ───── 시스템 프롬프트 (공공기관 문체 · 300자 이내 · 인사/안내/다음단계) ─────
const SYSTEM_PROMPT = [
  '당신은 부산정보산업진흥원(BIPA)의 상담 담당자입니다.',
  "아래 시민·기업의 문의에 공공기관 공식 문체로 '답변 초안'을 작성하세요.",
  '',
  '[작성 규칙]',
  '- 전체 300자 이내(공백 포함).',
  '- 구조: ① 인사 1줄 → ② 안내 본문 1~2문단 → ③ 다음 단계 안내 1줄.',
  '- 정중하고 명확한 존댓말. 과장·추측·확정되지 않은 약속 금지.',
  '- 모르는 사실은 "담당 부서 확인 후 안내드리겠습니다"로 처리.',
  '- 마크다운·이모지·제목 없이 본문 텍스트만 출력.',
].join('\n');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// 공급자 선택: OpenAI 우선 → 없으면 Anthropic 폴백
function pickProvider() {
  if (process.env.OPENAI_API_KEY) return 'openai';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

async function draftWithOpenAI(userMsg) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const r = await client.chat.completions.create({
    model: OPENAI_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMsg },
    ],
  });
  return (r.choices && r.choices[0] && r.choices[0].message && r.choices[0].message.content || '').trim();
}

async function draftWithAnthropic(userMsg) {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const r = await client.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: MAX_TOKENS,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMsg }],
  });
  return (r.content && r.content[0] && r.content[0].text || '').trim();
}

app.post('/api/draft-reply', async (req, res) => {
  const { category, title, content } = req.body || {};
  if (!category || !title || !content) {
    return res.status(400).json({ ok: false, message: FAIL_MSG });
  }

  const provider = pickProvider();
  if (!provider) {
    console.error('[draft-reply] API 키가 없습니다 (.env 확인)');
    return res.status(500).json({ ok: false, message: FAIL_MSG });
  }

  const userMsg = `[카테고리] ${category}\n[제목] ${title}\n[내용] ${content}`;

  try {
    const draft = provider === 'openai'
      ? await draftWithOpenAI(userMsg)
      : await draftWithAnthropic(userMsg);
    if (!draft) throw new Error('empty draft');

    const model = provider === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL;
    return res.json({ ok: true, draft, provider, model });
  } catch (err) {
    console.error('[draft-reply] 오류:', err && err.message ? err.message : err);
    return res.status(502).json({ ok: false, message: FAIL_MSG });
  }
});

// 로컬 실행 시에만 listen. Vercel 서버리스에서는 app을 export해 핸들러로 사용.
if (require.main === module) {
  app.listen(PORT, () => {
    const provider = pickProvider();
    console.log(`✅ 중계 서버 실행: http://localhost:${PORT}`);
    console.log(provider
      ? `   공급자: ${provider} (${provider === 'openai' ? OPENAI_MODEL : ANTHROPIC_MODEL})`
      : '   ⚠️  API 키가 없습니다 — OPENAI_API_KEY 또는 ANTHROPIC_API_KEY를 설정하세요.');
  });
}

module.exports = app;
