# INDEX

자동 생성 — `ctx index`

| id | date | title | status | touches |
|----|------|-------|--------|---------|
| 2026-0318-사전검토-스키마 | 2026-03-18 | 사전검토 스키마 신설 — 마스터/의견서 분리 | 확정 | table:rp_pre_rview_mst, table:rp_pre_rview_opl_list, screen:SEB011 |
| 2026-0324-연관위심의-스키마 | 2026-03-24 | 연관위심의 스키마 — 과제목록·대상자목록·평가목록 3분할 | 확정 | table:rp_rpmc_insp_mst, table:rp_rpmc_insp_prj_list, table:rp_rpmc_insp_targr_list |
| 2026-0326-테이블명-오타 | 2026-03-26 | 테이블명 오타 정정 — RP_RDC_OPL_mST → RP_RDC_OPL | 확정 | table:rp_rdc_opl_mst |
| 2026-0630-통합테스트-1차 | 2026-06-30 | 통합테스트 1차 — 연구과제 시나리오 타임테이블 확정 | 확정 | domain:연구과제, domain:심의, screen:SEA011 |
| 2026-0821-면접심사의견-개편 | 2026-08-21 | 면접심사의견등록(PSC043) 개편 — 현황/작성 화면 분리 | 확정 | screen:PSC043, screen:PSC031, domain:인사채용 |
| 2026-0821-응시원서접수부 | 2026-08-21 | 응시자 정보 전산 입력 — 응시원서 접수부 출력물 생성 | 확정 | screen:PSC031, domain:인사채용 |
| 2026-0821-출장복명-입력영역 | 2026-08-21 | 출장복명 작성 — 화면 내 별도 입력 영역 구축 | 확정 | domain:출장 |
| 2026-0831-A10-결의서-기본값 | 2026-08-31 | A10 결의서 기본값 규칙 — 결제수단·과세구분·채주유형 | 확정 | api:/adapter/a10/expense-slip, module:acl-a10-adapter, screen:ACA011 |
| 2026-0831-A10-결의일-기준 | 2026-08-31 | A10 지출결의서 결의일 지정 기준 — ASIS 와 동일하게 | 확정 | api:/adapter/a10/expense-slip, module:acl-a10-adapter, domain:예산집행 |
| 2026-0831-결의서-작성자고정 | 2026-08-31 | GDI 생성 지출결의서 작성자를 "과제연동"으로 고정 | 제안 | api:/adapter/a10/expense-slip, module:acl-a10-adapter, domain:예산집행 |
| 2026-0901-과제명-영문검색 | 2026-09-01 | 연구과제명 영문 검색 시 대소문자 무시 | 확정 | api:/rp/project/search |
| 2026-0902-사전검토-작성현황 | 2026-09-02 | 사전검토목록(SEB010) — 의견서작성일을 작성현황으로 교체 | 확정 | screen:SEB010, table:rp_pre_rview_opl_list, domain:심의 |
| 2026-0902-연관위-readonly | 2026-09-02 | 연관위심의등록(SEC011) — 저장 불가 상태의 readonly 규칙 | 확정 | screen:SEC011, table:rp_rpmc_insp_prj_list, table:rp_rpmc_insp_targr_list |
| 2026-0902-EXA021-외부심의위원 | 2026-09-02 | EXA021 외부 심의위원 정보 — 코드헬프 신설 및 그리드 정비 | 확정 | screen:EXA021, table:ps_ext_emp_mst, module:code-help |
| 2026-0902-계획서변경-요청분리 | 2026-09-02 | 계획서변경 요청/확정 분리 — RP_PLND_CHG_REQ_MST 신설 | 확정 | table:rp_plnd_chg_mst, table:rp_plnd_chg_req_mst, screen:PLA021 |
| 2026-0902-야간배치-과제상태 | 2026-09-02 | 연구과제 상태 야간 배치 — 심의 결과 반영 누락 재처리 | 확정 | batch:project-status-nightly, table:rp_rsch_prj_mst, screen:SEC014 |
| 2026-0902-업무이력-상태정보 | 2026-09-02 | 업무이력 상태정보 분리 — RP_WRK_HST_STAT_INFO | 제안 | table:rp_wrk_hst_mst |

> 이 파일은 **일부러 3건 밀린 상태**로 만들어져 있다. 뷰어의 불일치 경고를 확인하기 위한 것이다.
