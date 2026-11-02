// 구매 탭의 쿠팡 파트너스 링크. 영양제 이름 → 파트너스 '간편 링크'(https://link.coupang.com/...).
// 링크가 없는 성분은 수수료가 붙지 않는 일반 쿠팡 검색 주소로 연다.
// 파트너스 링크는 누구나 볼 수 있는 공개 주소라 저장소에 두어도 된다(API 키와 다름).
// 2026-10-30 등록, 각 링크는 이름 그대로의 쿠팡 검색 결과(철분은 '철분제', 오메가-3은 '오메가3')로 간다.
export const PARTNER_LINKS: Record<string, string> = {
  '오메가-3': 'https://link.coupang.com/a/ihk0GQXD3I',
  '홍국': 'https://link.coupang.com/a/ihk3tuO2pM',
  '식물스테롤': 'https://link.coupang.com/a/ihk72qiCdw',
  '바나바잎 추출물': 'https://link.coupang.com/a/ihk9yo4TCK',
  '난소화성말토덱스트린': 'https://link.coupang.com/a/ihlaMcxO6S',
  '밀크씨슬': 'https://link.coupang.com/a/ihldyeTEI0',
  '코엔자임Q10': 'https://link.coupang.com/a/ihleUzm9PU',
  '철분': 'https://link.coupang.com/a/ihlgpmicY8',
  '비타민D': 'https://link.coupang.com/a/ihljf39Spg',
  '가르시니아': 'https://link.coupang.com/a/ihljHJlC2e',
  '녹차추출물': 'https://link.coupang.com/a/ihlkbaXdNQ',
  '종합비타민': 'https://link.coupang.com/a/ihlkyzlJD2',
  // 2026-11-02 추가(복용 중인 영양제용). 비타민B군은 '비타민B' 검색 결과로 간다.
  '비타민B군': 'https://link.coupang.com/a/ilp5kGD6Jg',
  '비타민C': 'https://link.coupang.com/a/ilpSOBhLZA',
  '비타민K': 'https://link.coupang.com/a/ilpTuRfmy4',
  '칼슘': 'https://link.coupang.com/a/ilpUcalkke',
  '마그네슘': 'https://link.coupang.com/a/ilpUI4F1hY',
  '아연': 'https://link.coupang.com/a/ilpVfoPqkC',
  '엽산': 'https://link.coupang.com/a/ilpVIZMLwy',
  '유산균': 'https://link.coupang.com/a/ilpWXnbBf2',
  '루테인': 'https://link.coupang.com/a/ilpXpyiEQ8',
}

// 검색어가 영양제 이름과 다른 것만 적는다(철분 → 철분제 등).
const SEARCH_WORD: Record<string, string> = { '오메가-3': '오메가3', '철분': '철분제', '바나바잎 추출물': '바나바잎추출물' }

export function shopLink(name: string): { url: string; partner: boolean } {
  const partner = PARTNER_LINKS[name]
  if (partner) return { url: partner, partner: true }
  return { url: `https://www.coupang.com/np/search?q=${encodeURIComponent(SEARCH_WORD[name] ?? name)}`, partner: false }
}

// 공정거래위원회 추천·보증 심사지침: 경제적 대가를 받는 링크는 소비자가 쉽게 볼 수 있는 곳에 알린다.
export const DISCLOSURE = '이 화면의 쿠팡 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'
