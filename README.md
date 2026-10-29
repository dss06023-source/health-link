# 건강잇다 (health-link)

국가건강검진 결과를 근거로 영양제 구성을 제안하고, 복용을 관리한 뒤 다음 검진에서 변화를 확인하는 서비스의 **시연용 프로그램**입니다.

| 폴더 | 내용 |
|---|---|
| `backend/` | API 서버 (Python FastAPI + SQLite) |
| `frontend/` | 웹 화면 (React + Vite + TypeScript) |
| `docs/` | API 규격 등 문서 |

모든 개인정보·건강정보는 가상 데이터입니다.

## 인터넷에 올리기 (Render 무료)

화면과 서버를 한 주소로 올립니다. 설정은 `Dockerfile`, `render.yaml`에 있습니다.

1. [render.com](https://render.com)에 GitHub 계정으로 가입합니다.
2. 대시보드에서 **New → Blueprint**를 누르고 이 저장소를 고릅니다.
3. 키 입력 칸(`DATA_GO_KR_KEY`, `JUSO_API_KEY`, `KAKAO_REST_API_KEY`)에 각 키를 넣고 만듭니다. 키는 저장소에 적지 않습니다.
4. 빌드가 끝나면 `https://health-itda.onrender.com` 같은 주소가 생깁니다.

무료 조건: 15분 동안 접속이 없으면 잠들고 다음 접속 때 1분쯤 걸려 깨어납니다. 잠들 때 저장 내용이 초기화됩니다(가상 데이터로 다시 시작). 사진 인식은 CPU가 작아 느릴 수 있습니다.
