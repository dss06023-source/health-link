// 구매 탭의 쿠팡 파트너스 링크. 영양제 이름 → 파트너스 '간편 링크'(https://link.coupang.com/...).
// 링크가 없는 성분은 수수료가 붙지 않는 일반 쿠팡 검색 주소로 연다.
// 파트너스 링크는 누구나 볼 수 있는 공개 주소라 저장소에 두어도 된다(API 키와 다름).
export const PARTNER_LINKS: Record<string, string> = {}

// 검색어가 영양제 이름과 다른 것만 적는다(철분 → 철분제 등).
const SEARCH_WORD: Record<string, string> = { '오메가-3': '오메가3', '철분': '철분제', '바나바잎 추출물': '바나바잎추출물' }

export function shopLink(name: string): { url: string; partner: boolean } {
  const partner = PARTNER_LINKS[name]
  if (partner) return { url: partner, partner: true }
  return { url: `https://www.coupang.com/np/search?q=${encodeURIComponent(SEARCH_WORD[name] ?? name)}`, partner: false }
}

// 공정거래위원회 추천·보증 심사지침: 경제적 대가를 받는 링크는 소비자가 쉽게 볼 수 있는 곳에 알린다.
export const DISCLOSURE = '이 화면의 쿠팡 링크는 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다.'
