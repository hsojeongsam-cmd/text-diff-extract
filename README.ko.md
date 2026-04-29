# text-diff-extract

한국어 · [English](./README.md)

WhatsApp 채팅 export(`.zip` / `.txt`)를 받아 **새로 추가된 메시지만** 골라서 `.txt` 로 저장해주는 PWA. 모든 처리는 브라우저 안에서만 일어나며, 채팅 내용은 단말 밖으로 나가지 않습니다.

**Live**: https://hsojeongsam-cmd.github.io/text-diff-extract/

## 왜 만들었나

WhatsApp 내보내기는 매번 *전체 대화*를 뱉습니다. 매주 같은 채팅을 받아 저장하면 중복이 99%. 이 앱은 직전 실행 때 본 메시지를 기억해뒀다가, 다음 export에서 **그 이후로 추가된 부분만** 추려줍니다.

## 어떻게 동작하나

1. WhatsApp에서 채팅 내보내기 → `.zip` 또는 `.txt` 를 이 앱에 던지기
2. 메시지 단위로 파싱 후 `(timestamp, sender, content)` 의 SHA-256 해시 계산
3. 같은 채팅의 직전 실행 해시 집합과 비교 → **신규 해시만** 추출
4. 새 메시지만 헤더와 함께 `.txt` 파일로 다운로드
5. 신규 해시를 기존 집합에 합쳐 IndexedDB에 저장 → 다음 실행 기준점이 됨

채팅 식별은 첫 메시지의 `(timestamp, sender)` 로 만든 안정 키. 사용자가 이름을 직접 지정하면 그 이름이 키가 됩니다 (= 같은 채팅 여러 export를 한 채팅으로 묶을 수 있음).

## 주요 기능

- **증분 추출**: 신규 메시지만 골라 다운로드
- **여러 채팅 추적**: 채팅별로 독립된 상태
- **WhatsApp 공유 시트 통합** (Android Chrome): 내보낸 파일을 공유 → 이 앱으로 바로 흘려보내기 (`share_target` API)
- **오프라인 동작**: Service Worker가 앱 셸 캐시
- **PWA 설치**: 홈 화면에 추가하면 네이티브 앱처럼 동작
- **상태 백업/복원**: 추적 상태를 JSON으로 내보내기/가져오기 (브라우저가 IndexedDB를 비우는 사고 대비)
- **외부 전송 0**: 네트워크 호출 없음, 모든 처리 클라이언트 내

## 사용

### 설치 (모바일)

1. iPhone Safari / Android Chrome에서 위 Live URL 열기
2. 공유 → "홈 화면에 추가"

### 사용 흐름

1. WhatsApp 채팅 → 메뉴 → **More → Export chat → Without media**
2. 이 앱 열기 → 받은 파일 던지기 (또는 안드로이드라면 공유 시트에서 바로 선택)
3. "새 메시지 N건" 확인 → **새 메시지 .txt 저장**
4. 채팅 이름은 자동 추정되며, 처음 실행 시 원하는 이름으로 바꿔두면 이후 export에서 동일 채팅으로 매칭됨

## 개인정보

- 모든 파싱·해시·저장은 브라우저 안에서만 수행됩니다.
- 외부 서버로 가는 네트워크 호출 없음 (CDN 의존성도 없음 — JSZip은 `vendor/` 에 동봉).
- 추적 상태(메시지 해시, 채팅 이름)는 단말의 IndexedDB에만 저장. 메시지 본문은 저장하지 않습니다.
- "전체 상태 초기화" 버튼으로 언제든 모두 삭제 가능.

## 기술 스택

| 영역 | 사용 |
|---|---|
| UI | Vanilla JS (ES modules), 프레임워크 없음 |
| 압축 해제 | [JSZip](https://stuk.github.io/jszip/) (vendored) |
| 해시 | Web Crypto `SubtleCrypto.digest("SHA-256", …)` |
| 저장소 | IndexedDB |
| 오프라인 / 공유 | Service Worker + Web Share Target API |
| 호스팅 | GitHub Pages (정적, HTTPS 강제) |

## 파일 구조

```
index.html              # 진입점, 인라인 CSS
app.js                  # UI, IndexedDB, 파일 처리 파이프라인
parser.js               # 순수 파싱·해시 로직 (Node에서 테스트 가능)
sw.js                   # 앱 셸 캐시 + share_target POST 처리
manifest.webmanifest    # PWA + share_target 등록
vendor/jszip.min.js     # zip 풀이
icons/                  # 192/512 + maskable
scripts/test_parser.mjs # parser 노드 테스트
scripts/make_icons.py   # 아이콘 생성용 (개발 보조)
```

## 개발

이 프로젝트는 빌드 단계가 없습니다. 그냥 정적 서버로 띄우면 됩니다.

```sh
# 로컬 실행 (PWA 기능 일부 테스트하려면 HTTPS 필요)
python3 -m http.server 8000
# 또는
npx serve .
```

파서 단위 테스트:

```sh
node scripts/test_parser.mjs
```

## 배포

`main` 브랜치 루트가 GitHub Pages 소스. `git push` 만 하면 됩니다.

```sh
git push origin main
# 1-2분 후 https://hsojeongsam-cmd.github.io/text-diff-extract/ 갱신
```

## 알려진 제약

- iOS Safari에는 Web Share Target API가 없어서 공유 시트로 바로 보내기는 안 됨 → 파일 선택해서 던져야 함 (안드로이드 Chrome은 OK).
- 단말 저장공간이 빠듯해지면 Chrome이 IndexedDB를 비울 수 있음 → 주기적으로 "상태 백업 (JSON)" 권장.
- WhatsApp 포맷이 변경되면 `parser.js` 의 정규식을 갱신해야 할 수 있음.

## 라이선스

MIT
