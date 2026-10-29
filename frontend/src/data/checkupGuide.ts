import { ageItems } from './rules'
import type { CheckupTarget, ConfirmTest, UserProfile } from '../types'

// 국민건강보험공단 「2026년 건강검진 안내」 책자의 주의사항을 사용자에게 해당하는 것만 골라 묶는다.
// 장애인 검진·의료급여수급자처럼 앱이 모르는 조건의 안내는 넣지 않는다.
export interface GuideSection {
  id: string
  title: string
  why?: string // 이 안내가 보이는 이유
  items: string[]
}

const NHIS_APP = '공단 홈페이지·모바일앱(건강보험25시)'

export function checkupGuide(p: UserProfile, t: CheckupTarget, confirm: ConfirmTest | null): GuideSection[] {
  const age = t.year - p.birthYear
  // 작년 대상인데 받지 않았으면 올해 추가신청으로 받을 수 있으니, 대상자와 같은 준비 안내를 함께 보여 준다.
  const missed = !t.isTarget && !t.done && age >= 20 && p.lastCheckupYear !== t.year - 1
  const due = t.isTarget && !t.done
  const general = due || missed
  // 올해 검진을 이미 받았으면 암검진도 함께 받은 것으로 보고 준비 안내는 뺀다(항목별 수검 기록은 없음).
  const cancer = (id: string) => (t.done ? undefined : t.cancers.find((c) => c.id === id && (c.status === 'target' || c.status === 'maybe')))
  const next = t.year + 1
  const out: GuideSection[] = []

  if (missed) out.push({
    id: 'missed', title: '작년에 못 받았다면 추가신청', why: `${t.year - 1}년 검진 기록 없음`,
    items: [
      '전년도에 받지 못한 국가건강검진을 올해 추가로 신청할 수 있습니다. 신청한 뒤에는 아래 안내대로 준비해서 받으세요.',
      '보이는 ARS: 1577-1000 전화 → 9번 → 문자로 받은 주소 접속 → 건강검진 → 본인인증 후 추가신청.',
      `${NHIS_APP}: 건강모아 → 나의건강 → 검진신청 → 전년도 미수검자 추가신청.`,
      ...(p.jobType === 'office' || p.jobType === 'nonOffice'
        ? ['직장가입자의 일반검진 추가등록은 회사(사업장)를 통해서만 신청할 수 있습니다. 암검진은 본인이 직접 신청할 수 있습니다.'] : []),
    ],
  })


  if (general || (!t.done && t.cancers.some((c) => c.status === 'target'))) {
    out.push({
      id: 'before', title: '예약과 준비물',
      items: [
        '검진기관 사정(예약 집중 등)으로 예약이 일찍 마감될 수 있으니 미리 예약하고 방문하십시오.',
        '건강검진은 주소지와 관계없이 지정된 검진기관 어디서나 받을 수 있습니다. 공휴일 검진기관은 미리 전화로 날짜를 확인하십시오.',
        '신분증을 꼭 가져가 검진기관에 보여 주십시오.',
        `해외 체류, 군 입대, 직장 입·퇴사, 건강보험 자격 상실로 대상이 바뀔 수 있으니 검진 전에 ${NHIS_APP}에서 대상 여부와 항목을 확인하십시오.`,
        '검진 때 귀중품은 도난·분실 위험이 있으니 챙겨 두십시오.',
      ],
    })
    const fasting = general || cancer('stomach') || cancer('liver') || cancer('lung')
    out.push(fasting
      ? {
          id: 'fasting', title: '금식',
          why: general ? '일반건강검진 혈액검사' : [cancer('stomach'), cancer('liver'), cancer('lung')].filter(Boolean).map((c) => c!.name).join('·') + ' 검진',
          items: [
            '검진 전날 저녁 9시 이후에는 먹지 마십시오.',
            '검진 당일 아침에는 식사는 물론 물, 커피, 우유, 담배, 주스, 껌도 삼가십시오.',
            '되도록 오전에 받으십시오. 오후에 받는다면 검사 전 최소 8시간 공복을 지켜야 합니다. 공복이 아니면 결과가 다르게 나올 수 있습니다.',
          ],
        }
      : { id: 'fasting', title: '금식', why: '대장암·유방암·자궁경부암 검진만 받음', items: ['이 검진만 받는다면 금식하지 않아도 됩니다.'] })
  }

  if (general) {
    const extra = due ? t.items : ageItems(age, p.sex)
    out.push({
      id: 'form', title: '문진표',
      items: [
        '검진기관의 문진표는 반드시 본인이 작성하십시오.',
        `미리 웹 문진표를 쓰면 검진 시간이 줄어듭니다. ${NHIS_APP} → 건강모아 → 나의건강 → 검진신청 → 문진표/평가도구 작성. 일부 기관은 연계가 안 될 수 있으니 확인하십시오.`,
      ],
    })
    out.push({
      id: 'general', title: '일반건강검진 검사',
      why: due ? `${t.year}년 대상` : '추가신청 후 받을 때',
      items: [
        '비용은 국민건강보험공단이 전액 부담합니다.',
        '시력·청력 결과는 운전면허 신체검사에도 쓰이므로 안경·렌즈를 쓰는 분은 교정시력으로 검사받으십시오.',
        '구강검진은 구강검진기관으로 지정된 가까운 치과에서 받습니다.',
        ...extra.map((i) => `${age}세 추가 검사: ${i.name}${i.note ? ` (${i.note})` : ''}`),
      ],
    })
  }

  const stomach = cancer('stomach')
  if (stomach) out.push({
    id: 'stomach', title: '위암 검진', why: '40세 이상 2년마다',
    items: [
      '위내시경검사를 받습니다. 위내시경이 어려우면 위장조영검사를 고를 수 있습니다.',
      `위장조영검사에서 '위암의심'이 나오면 위내시경은 ${next}년 1월 31일까지 받을 수 있습니다.`,
      '비용은 공단 90%, 본인 10%입니다(국가암검진 대상자·의료급여수급자는 본인부담 없음). 수면내시경 마취비 같은 추가 검사비는 따로 냅니다.',
      '수면내시경을 받으면 검진 뒤 직접 운전하지 말고 대중교통을 이용하십시오. 안전을 위해 보호자와 함께 가십시오.',
    ],
  })
  const colon = cancer('colorectal')
  if (colon) out.push({
    id: 'colorectal', title: '대장암 검진', why: '50세 이상 매년',
    items: [
      '분변잠혈검사(대변검사)를 먼저 받습니다. 대변 검체는 신분증을 가지고 본인이 직접 검진기관에 내야 합니다.',
      `결과가 '잠혈반응 있음'이면 대장내시경을 ${next}년 1월 31일까지 받을 수 있습니다.`,
      '분변잠혈검사 없이 대장내시경을 먼저 받으면 비용을 전액 본인이 부담합니다.',
      '분변잠혈검사 비용은 공단이 전액 부담합니다. 수면내시경 마취비는 따로 냅니다.',
    ],
  })
  const liver = cancer('liver')
  if (liver) out.push({
    id: 'liver', title: '간암 검진', why: '40세 이상 간암 고위험군',
    items: [
      '간 초음파와 혈청 알파태아단백 검사를 1년에 2번 받습니다. 상반기(1~6월) 1회, 하반기(7~12월) 1회.',
      '공단 검진 외에 따로 받은 간염 검사에서 B형·C형간염 보균자로 나오면 결과서를 공단에 내면 계속 대상이 됩니다.',
      '비용은 공단 90%, 본인 10%입니다(국가암검진 대상자·의료급여수급자는 본인부담 없음).',
    ],
  })
  const breast = cancer('breast')
  if (breast) out.push({
    id: 'breast', title: '유방암 검진', why: '40세 이상 여성 2년마다',
    items: [
      '유방촬영 검사를 받습니다. 유방을 눌러 찍기 때문에 통증이 있을 수 있습니다.',
      '검사 중 언제든 멈출 수 있고, 거부할 권리가 있습니다.',
      '비용은 공단 90%, 본인 10%입니다(국가암검진 대상자·의료급여수급자는 본인부담 없음).',
    ],
  })
  const cervical = cancer('cervical')
  if (cervical) out.push({
    id: 'cervical', title: '자궁경부암 검진', why: '20세 이상 여성 2년마다',
    items: [
      '생리 기간(생리 전후 2~3일 포함)은 피해서 받으십시오.',
      '검진 48시간 전부터 성관계, 탐폰, 질 세척, 질 내 약물·윤활제, 질 내 피임약을 쓰지 마십시오.',
      '자궁 관련 수술 이력이 있거나 처음 받는 분은 검진 의사와 먼저 상담하십시오.',
      '비용은 공단이 전액 부담합니다.',
    ],
  })
  const lung = cancer('lung')
  if (lung) out.push({
    id: 'lung', title: '폐암 검진', why: '54~74세 폐암 고위험군',
    items: [
      '저선량 흉부 CT를 찍은 뒤 결과 사후상담과 금연상담을 받습니다. 사후상담까지가 국가암검진이며 ' + `${next}년 1월 31일까지 받을 수 있습니다.`,
      '비용은 공단 90%, 본인 10%입니다(국가암검진 대상자·의료급여수급자는 본인부담 없음).',
      ...(lung.status === 'maybe' ? [lung.note!] : []),
    ],
  })
  const excluded = t.cancers.filter((c) => c.status === 'excluded')
  if (excluded.length) out.push({
    id: 'excluded', title: '대상에서 빠진 암검진', why: excluded.map((c) => c.name).join('·'),
    items: [
      '암 산정특례자, 국가검진이나 진료로 대장내시경을 받은 뒤 5년이 지나지 않은 분은 해당 암검진 대상에서 빠집니다.',
      `본인이 원하면 ${NHIS_APP}, 고객센터(1577-1000)로 대상 등록을 할 수 있습니다.`,
    ],
  })

  if (confirm) out.push({
    id: 'confirm', title: '확진검사 1회 무료', why: `${confirm.diseases.join('·')} 질환의심`,
    items: [
      confirm.message,
      `받을 곳: ${confirm.where}.`,
      '일반건강검진 결과 통보서와 신분증을 꼭 가져가십시오.',
      '고혈압은 진찰·혈압측정, 당뇨병은 진찰·공복혈당·당화혈색소, 이상지질혈증은 진찰을 받습니다.',
    ],
  })

  if (t.done) out.push({
    id: 'limit', title: '검진 횟수', why: `${t.year}년 검진 받음`,
    items: [
      '검진 항목마다 정해진 횟수를 넘겨 받으면 검진비용을 환수합니다. 올해 일반건강검진을 다시 받지 마십시오.',
      ...(t.cancers.some((c) => c.status === 'target') ? [`올해 대상인 암검진(${t.cancers.filter((c) => c.status === 'target').map((c) => c.name).join('·')})을 아직 받지 않았다면 12월 31일까지 받을 수 있습니다.`] : []),
    ],
  })

  out.push({
    id: 'result', title: '결과 확인',
    items: [
      '검진 결과는 주소지로 우편 발송됩니다.',
      `최근 10년간 결과는 ${NHIS_APP} → 건강모아 → 나의건강 → 건강검진 결과조회에서 볼 수 있습니다.`,
      '문의: 국민건강보험공단 고객센터 1577-1000',
    ],
  })
  return out
}
