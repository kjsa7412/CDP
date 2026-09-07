# 좌표 어휘

이 파일이 통제 어휘(authority file)다. 같은 대상을 가리키는 여러 표기 중 **정본을 하나
정하고 나머지를 aliases 로 연결한다.** `aliases` 가 이 파일의 진짜 핵심이다 — 정본
목록만 있으면 작성자만 편해지고, aliases 가 있어야 수신자가 자연어로 물어도 걸린다.

**운영 원칙** — 추가는 한 줄, 삭제는 하지 않는다(`deprecated` 로 표시),
alias 는 발견될 때마다 추가한다.

## table

- `table:rp_rsch_prj_mst` — 연구과제마스터
  aliases: 연구과제, 과제마스터, 연구과제테이블, RP_RSCH_PRJ_MST
- `table:rp_prj_rcpt_mst` — 과제접수마스터
  aliases: 과제접수, 접수마스터, RP_PRJ_RCPT_MST
- `table:rp_plnd_mst` — 계획서마스터
  aliases: 계획서, 계획서테이블, 연구계획서, RP_PLND_MST
- `table:rp_plnd_chg_mst` — 계획서변경마스터
  aliases: 계획서변경, 변경마스터, RP_PLND_CHG_MST
- `table:rp_plnd_chg_req_mst` — 계획서변경요청마스터
  aliases: 변경요청, 계획서변경요청, RP_PLND_CHG_REQ_MST
- `table:rp_pre_rview_mst` — 사전검토마스터
  aliases: 사전검토, 사전검토테이블, RP_PRE_RVIEW_MST
- `table:rp_pre_rview_opl_list` — 사전검토의견서목록
  aliases: 사전검토의견서, 검토의견서, RP_PRE_RVIEW_OPL_LIST
- `table:rp_rpmc_insp_mst` — 연관위심의마스터
  aliases: 연관위심의, 연구관리위원회심의, RP_RPMC_INSP_MST
- `table:rp_rpmc_insp_prj_list` — 연관위심의과제목록
  aliases: 심의대상연구과제목록, 심의과제목록, RP_RPMC_INSP_PRJ_LIST
- `table:rp_rpmc_insp_targr_list` — 연관위심의대상자목록
  aliases: 심의대상자목록, 심의대상자, RP_RPMC_INSP_TARGR_LIST
- `table:rp_rdc_mst` — 연심회마스터
  aliases: 연심회, 연구심의위원회, RP_RDC_MST
- `table:rp_rdc_opl_mst` — 연심회의견서마스터
  aliases: 연심회의견서, RP_RDC_OPL_MST
- `table:rp_rsch_budg_mst` — 연구예산마스터
  aliases: 연구예산, 예산마스터, RP_RSCH_BUDG_MST
- `table:rp_elc_apv_mst` — 전자결재마스터
  aliases: 전자결재, 결재마스터, RP_ELC_APV_MST
- `table:ps_ext_emp_mst` — 외부인원마스터
  aliases: 외부인원, 외부심의위원, PS_EXT_EMP_MST
- `table:rp_wrk_hst_mst` — 업무이력마스터
  aliases: 업무이력, 이력마스터, RP_WRK_HST_MST
- `table:rp_wrk_hst_stat_info` — 업무이력상태정보
  aliases: 이력상태, RP_WRK_HST_STAT_INFO
- `table:rp_rdc_opl_dtl` — 연심회의견서상세 (구)
  aliases: 연심회의견상세
  deprecated: 2026-03-26 → table:rp_rdc_opl_mst 로 통합

## screen

- `screen:SEA011` — 연구과제 초안등록
  aliases: 초안등록, 과제초안등록
- `screen:SEB010` — 사전검토목록
  aliases: 사전검토목록화면
- `screen:SEB011` — 사전검토등록
  aliases: 사전검토등록화면
- `screen:SEB020` — 사전검토의견서등록
  aliases: 의견서등록, 검토의견서등록
- `screen:SEC011` — 연관위심의등록
  aliases: 심의등록, 연관위등록
- `screen:SEC014` — 연구관리위원회결과등록
  aliases: 연관위결과등록, 심의결과등록
- `screen:PLA011` — 계획서등록
  aliases: 계획서등록화면
- `screen:PLA021` — 계획서변경등록
  aliases: 계획서변경화면
- `screen:PSC031` — 서류심사등록
  aliases: 서류심사, 서류심사등록화면
- `screen:PSC043` — 면접심사의견등록
  aliases: 면접심사, 면접심사의견, 면접의견등록
- `screen:ACA011` — 지출처리
  aliases: 지출처리화면, 지출등록
- `screen:MYC011` — 정산등록
  aliases: 정산, 정산등록화면
- `screen:EXA021` — 심의위원 정보등록
  aliases: 심의위원등록, 외부심의위원등록
- `screen:EXE020` — AI구독증빙첨부
  aliases: AI구독, 구독증빙

## api

- `api:/adapter/a10/expense-slip` — A10 지출결의서 생성 연동
  aliases: 결의서연동, 지출결의서API, expense-slip
- `api:/adapter/a10/budget-sync` — A10 예산 집행내역 동기화
  aliases: 예산동기화, budget-sync
- `api:/rp/project/search` — 연구과제 검색
  aliases: 과제검색API, project-search

## module

- `module:acl-a10-adapter` — A10(더존) 연계 Anti-Corruption Layer
  aliases: ACL, A10어댑터, 연계어댑터
- `module:code-help` — 코드헬프 공통 컴포넌트
  aliases: 코드헬프, 팝업코드헬프
- `module:grid-common` — 그리드 공통 컴포넌트
  aliases: 공통그리드, 그리드컴포넌트

## term

- `term:응시원서접수부` — 분야별 응시원서 접수부 (한글 산출물)
  aliases: 접수부, 응시원서접수, 응시원서접수부
- `term:연대서명` — 심사위원 전원의 서명이 한 장에 들어가는 출력물
  aliases: 연대서명출력물, 공동서명
- `term:최신성` — 같은 좌표에 후속이 더 없는 상태
  aliases: 결착, 결착도, 후속

## issue

- `issue:ISS-001` — 연심회 보류 상태값 추가 여부
  aliases: 연심회보류, 보류상태값

## batch

- `batch:project-status-nightly` — 과제 상태 야간 배치
  aliases: 야간배치, 과제상태배치

## code

- `code:PL010` — 계획서 상태
  aliases: 계획서상태코드, 계획상태, PL010
- `code:PS130` — 외부인원 업무구분
  aliases: 업무구분코드, PS130
- `code:A10PAY` — A10 결제수단
  aliases: 결제수단, 결제수단코드

## domain

- `domain:연구과제`
  aliases: 과제, 연구관리
- `domain:심의`
  aliases: 심의절차, 위원회
- `domain:인사채용`
  aliases: 채용, 인사
- `domain:예산집행`
  aliases: 예산, 지출, 집행
- `domain:출장`
  aliases: 출장관리
