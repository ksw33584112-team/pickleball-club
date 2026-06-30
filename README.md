# 피클볼 회원관리 시스템 🏓

PC(웹 관리자)와 모바일 앱(PWA)이 하나의 Supabase 데이터베이스를 공유하는 회원관리 시스템.

기능: 회원가입 승인, 스케줄 달력, 시간대별 예약(신청→승인), 회비 달력(입금인/미입금인), 코치 관리, 실시간 동기화 + 관리자 알림, 카카오 알림톡(선택).

## 바로 써보기

`피클볼 관리 실행.bat`을 더블클릭하거나 `index.html`을 열면 됩니다. Supabase 설정 전에는 "데모 모드"로 동작해요(이 브라우저에만 저장).

## 실제 운영(클라우드 저장 + PC·폰 공유)

`배포방법.md` 를 보세요. 요약: ① Supabase에 `supabase/schema.sql` 실행 → ② `assets/js/config.js`에 URL·anon key 입력 → ③ GitHub Pages 배포.

## 폴더

```
피클볼/
├─ index.html, manifest.json, sw.js
├─ 피클볼 관리 실행.bat        PC 실행 파일
├─ assets/css, assets/js, assets/images, assets/icons
├─ supabase/schema.sql        DB 생성 SQL
├─ supabase/functions/send-alimtalk   카카오 알림톡 함수
├─ 배포방법.md
└─ docs/설계문서.md
```
