# 테이블 정의서 — 연구관리(RP) 스키마

> 이 문서는 **첨부**다. 프로토콜 §8.5 의 3계층 중 3계층이고, 실제로 이 인터페이스를
> 구현하는 한두 사람만 여기까지 온다. 지식 단위에는 요약만 있고 상세는 여기 있다.

`GDI_DE_422_테이블정의서` 덤프에서 생성했다. 상태가 `FINAL` 인 테이블만 싣는다.

## 목차

- `RP_RPMC_INSP_PRJ_LIST` — 연관위심의과제목록
- `RP_PRE_RVIEW_MST` — 사전검토마스터
- `RP_ELC_APV_MST` — 전자결재마스터
- `RP_PRE_RVIEW_OPL_LIST` — 사전검토의견서목록
- `RP_RPMC_INSP_EVL_LIST` — 연관위심의평가목록
- `RP_SERV_INSP_MST` — 용역심의마스터
- `RP_PLND_CHG_TARGR_LIST` — 계획서변경대상자목록
- `RP_PLND_TARGR_LIST` — 계획서대상자목록
- `RP_RPMC_INSP_TARGR_LIST` — 연관위심의대상자목록
- `RP_PLND_CHG_REQ_MST` — 계획서변경요청마스터
- `RP_RPMC_INSP_MST` — 연관위심의마스터
- `RP_WRK_HST_DTL` — 업무이력상세
- `RP_RSCH_PRJ_MST` — 연구과제마스터
- `RP_RDC_OPL_DTL` — 연심회의견서상세
- `RP_RDC_MST` — 연심회마스터
- `RP_WRK_HST_MST` — 업무이력마스터
- `RP_WRK_HST_STAT_INFO` — 업무이력상태정보
- `RP_PRJ_RCPT_MST` — 과제접수마스터
- `RP_RSCH_BUDG_DTL` — 연구예산상세
- `RP_PLND_MST` — 계획서마스터
- `RP_PRJ_RUN_INSP_MST` — 과제수행심의마스터
- `RP_PLND_CHG_MST` — 계획서변경마스터
- `RP_SERV_INSP_TARGR_LIST` — 용역심의대상자목록
- `RP_RVSN_INSP_MST` — 경정심의마스터
- `RP_RDC_TARGR_LIST` — 연심회대상자목록
- `RP_RSCH_BUDG_MST` — 연구예산마스터
- `RP_RVSN_INSP_TARGR_LIST` — 경정심의대상자목록
- `RP_OPNN_EVL_LARG_CTG_LIST` — 의견평가대분류목록
- `RP_RDC_OPL_mST` — 연심회의견서마스터
- `RP_OPNN_EVL_STD_MST` — 의견평가기준마스터
- `RP_OPNN_EVL_DTL_ITEM_LIST` — 의견평가세부항목목록

---

## RP_RPMC_INSP_PRJ_LIST

**연관위심의과제목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 진행여부코드 | `PRGRS_YN_CD` | VARCHAR(10) |  | Y |  |  |
| 4 | 연구유형코드 | `RSCH_CLS_CD` | VARCHAR(10) |  | Y |  |  |
| 5 | 인쇄업체코드 | `PRNT_PARTNER_CD` | VARCHAR(10) |  | Y |  |  |
| 6 | 연구책임자ID | `RSCH_MGR_ID` | VARCHAR(20) |  | Y |  |  |
| 7 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 8 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 9 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 10 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 11 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 12 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 13 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 14 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 15 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `RSCH_PRJ_ID`

---

## RP_PRE_RVIEW_MST

**사전검토마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 6 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 검토기한시작일자 | `RVIEW_TMLT_START_DT` | VARCHAR(8) |  | Y |  |  |
| 12 | 검토기한종료일자 | `RVIEW_TMLT_END_DT` | VARCHAR(8) |  | Y |  |  |
| 13 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 14 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 15 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 16 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 18 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 19 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 20 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 21 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_ELC_APV_MST

**전자결재마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 전자결재ID | `ELC_APV_ID` | VARCHAR(20) |  | Y |  |  |
| 2 | 업무마스터테이블명 | `WRK_MAST_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 3 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | Y |  |  |
| 4 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | Y |  |  |
| 5 | 업무이력ID | `WRK_HST_ID` | VARCHAR(20) |  | Y |  |  |
| 6 | 전자결재번호 | `ELC_APV_NO` | VARCHAR(20) |  | Y |  |  |
| 7 | 전자결재상태코드 | `ELC_APV_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 8 | 기안일자 | `DRFT_DT` | VARCHAR(8) |  | Y |  |  |
| 9 | 기안자ID | `DRFTR_ID` | VARCHAR(20) |  | Y |  |  |
| 10 | 결재완료일시 | `APV_CMPLTN_DTS` | TIMESTAMP(0) |  | Y |  |  |
| 11 | 반려일시 | `RJCT_DTS` | TIMESTAMP(0) |  | Y |  |  |
| 12 | 기안취소일시 | `DRFT_CNCL_DTS` | TIMESTAMP(0) |  | Y |  |  |
| 13 | 전자결재주소 | `ELC_APV_ADDR` | VARCHAR(100) |  | Y |  |  |
| 14 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 15 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 16 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 17 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 18 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 19 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 20 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 21 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 22 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

---

## RP_PRE_RVIEW_OPL_LIST

**사전검토의견서목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 검토대상자ID | `RVIEW_TARGR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N | PK |  |
| 4 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 5 | 비고1내용 | `RMK_1_DESC` | VARCHAR(100) |  | Y |  |  |
| 6 | 비고2내용 | `RMK_2_DESC` | VARCHAR(100) |  | Y |  |  |
| 7 | 비고3내용 | `RMK_3_DESC` | VARCHAR(100) |  | Y |  |  |
| 8 | 채택결과코드 | `Adpt_RSLT_CD` | VARCHAR(10) |  | Y |  |  |
| 9 | 공동단독구분코드 | `JOINT_SNGL_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 10 | 내부외부구분코드 | `INSD_OUTSD_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 11 | 기간내용 | `PRD_DESC` | VARCHAR(100) |  | Y |  |  |
| 12 | 불채택사유내용 | `RJCT_RESN_DESC` | VARCHAR(100) |  | Y |  |  |
| 13 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 14 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 15 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 16 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 18 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 19 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 20 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 21 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `RVIEW_TARGR_ID`, `RSCH_PRJ_ID`

---

## RP_RPMC_INSP_EVL_LIST

**연관위심의평가목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 심의대상자ID | `INSP_TARGR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N | PK |  |
| 4 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 5 | 심의결정여부 | `INSP_DCSN_YN` | VARCHAR(1) |  | Y |  |  |
| 6 | 심의의견내용 | `INSP_OPNN_DESC` | VARCHAR(100) |  | Y |  |  |
| 7 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 8 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 9 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 10 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 11 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 12 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 13 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 14 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 15 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `INSP_TARGR_ID`, `RSCH_PRJ_ID`

---

## RP_SERV_INSP_MST

**용역심의마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 심의명 | `INSP_NM` | VARCHAR(30) |  | Y |  |  |
| 12 | 심의안건내용 | `INSP_AGND_DESC` | VARCHAR(100) |  | Y |  |  |
| 13 | 심의일자 | `INSP_DT` | VARCHAR(8) |  | Y |  |  |
| 14 | 심의시작시간 | `INSP_START_TM` | VARCHAR(6) |  | Y |  |  |
| 15 | 심의종료시간 | `INSP_END_TM` | VARCHAR(6) |  | Y |  |  |
| 16 | 심의장소명 | `INSP_PLC_NM` | VARCHAR(30) |  | Y |  |  |
| 17 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 18 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 19 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 20 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 21 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 22 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 23 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 24 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 25 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 26 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_PLND_CHG_TARGR_LIST

**계획서변경대상자목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구자ID | `RSCHR_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 연구자구분코드 | `RSCHR_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 4 | 참여기간시작일자 | `PRTN_PRD_START_DT` | VARCHAR(8) |  | Y |  |  |
| 5 | 참여기간종료일자 | `PRTN_PRD_END_DT` | VARCHAR(8) |  | Y |  |  |
| 6 | 참여비율 | `PRTN_RTE` | NUMERIC(7,4) |  | Y |  |  |
| 7 | 평가비율 | `EVL_RTE` | NUMERIC(7,4) |  | Y |  |  |
| 8 | 업무수행내용 | `WRK_RUN_DESC` | VARCHAR(100) |  | Y |  |  |
| 9 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 10 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 11 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 12 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 13 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 14 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 15 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 16 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_PLND_TARGR_LIST

**계획서대상자목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구자ID | `RSCHR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 연구자구분코드 | `RSCHR_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 4 | 참여기간시작일자 | `PRTN_PRD_START_DT` | VARCHAR(8) |  | Y |  |  |
| 5 | 참여기간종료일자 | `PRTN_PRD_END_DT` | VARCHAR(8) |  | Y |  |  |
| 6 | 참여비율 | `PRTN_RTE` | NUMERIC(7,4) |  | Y |  |  |
| 7 | 평가비율 | `EVL_RTE` | NUMERIC(7,4) |  | Y |  |  |
| 8 | 업무수행내용 | `WRK_RUN_DESC` | VARCHAR(100) |  | Y |  |  |
| 9 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 10 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 11 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 12 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 13 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 14 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 15 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 16 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `RSCHR_ID`

---

## RP_RPMC_INSP_TARGR_LIST

**연관위심의대상자목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 심의대상자ID | `INSP_TARGR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 4 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 5 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 6 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 7 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 8 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 9 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 10 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 11 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `INSP_TARGR_ID`

---

## RP_PLND_CHG_REQ_MST

**계획서변경요청마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 요청일자 | `REQ_DT` | VARCHAR(8) |  | Y |  |  |
| 12 | 변경내역첨부여부 | `CHG_DESC_ATTCH_YN` | VARCHAR(1) |  | Y |  |  |
| 13 | 예산경정첨부여부 | `BUDG_RVSN_ATTCH_YN` | VARCHAR(1) |  | Y |  |  |
| 14 | 변경사유내역 | `CHG_RESN_DESC` | VARCHAR(100) |  | Y |  |  |
| 15 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 16 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 17 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 18 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 19 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 20 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 21 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 22 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 23 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_RPMC_INSP_MST

**연관위심의마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 3 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 4 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 5 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 6 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 7 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 8 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 9 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 10 | 회의실명 | `MTRM_NM` | VARCHAR(30) |  | Y |  |  |
| 11 | 심의일자 | `INSP_DT` | VARCHAR(8) |  | Y |  |  |
| 12 | 심의시작시간 | `INSP_START_TM` | VARCHAR(6) |  | Y |  |  |
| 13 | 심의종료시간 | `INSP_END_TM` | VARCHAR(6) |  | Y |  |  |
| 14 | 공개여부 | `OPPB_YN` | VARCHAR(1) |  | Y |  |  |
| 15 | 안건내용 | `AGND_DESC` | VARCHAR(100) |  | Y |  |  |
| 16 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 18 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 19 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 20 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 21 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 22 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 23 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 24 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 25 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_WRK_HST_DTL

**업무이력상세**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무이력상세ID | `WRK_HST_DTL_ID` | VARCHAR(20) |  | Y | PK |  |
| 2 | 업무이력ID | `WRK_HST_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 업무마스터테이블명 | `WRK_MAST_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 변경구분코드 | `CHG_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 6 | 물리컬럼명 | `PHYS_COL_NM` | VARCHAR(30) |  | Y |  |  |
| 7 | 논리컬럼명 | `LOGC_COL_NM` | VARCHAR(30) |  | Y |  |  |
| 8 | 기존데이터 | `OLD_DATA` |  |  | Y |  |  |
| 9 | 신규데이터 | `NEW_DATA` |  |  | Y |  |  |
| 10 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 11 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 12 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 13 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 14 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 15 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 16 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 17 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 18 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_HST_DTL_ID`

---

## RP_RSCH_PRJ_MST

**연구과제마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | Y |  |  |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 과제관리번호 | `PRJ_MNGT_NO` | VARCHAR(20) |  | Y |  |  |
| 12 | 과제대상년도 | `PRJ_TARG_YY` | VARCHAR(4) |  | Y |  |  |
| 13 | 연구분류코드 | `RSCH_CTG_CD` | VARCHAR(10) |  | Y |  |  |
| 14 | 연구유형코드 | `RSCH_CLS_CD` | VARCHAR(10) |  | Y |  |  |
| 15 | 과제명 | `PRJ_NM` | VARCHAR(30) |  | Y |  |  |
| 16 | 과제관리명 | `PRJ_MNGT_NM` | VARCHAR(30) |  | Y |  |  |
| 17 | 연구시작일자 | `RSCH_START_DT` | VARCHAR(8) |  | Y |  |  |
| 18 | 연구종료일자 | `RSCH_END_DT` | VARCHAR(8) |  | Y |  |  |
| 19 | 과제발주처명 | `PRJ_ORDR_NM` | VARCHAR(30) |  | Y |  |  |
| 20 | 과제발주처부서명 | `PRJ_ORDR_DEPT_NM` | VARCHAR(30) |  | Y |  |  |
| 21 | 연구책임자ID | `RSCH_MGR_ID` | VARCHAR(20) |  | Y |  |  |
| 22 | DG여부 | `DG_YN` | VARCHAR(1) |  | Y |  |  |
| 23 | 기본과제여부 | `BASE_PRJ_YN` | VARCHAR(1) |  | Y |  |  |
| 24 | 중점과제여부 | `FCS_PRJ_YN` | VARCHAR(1) |  | Y |  |  |
| 25 | 외부위탁포함여부 | `OUTSD_CNSMT_INCL_YN` | VARCHAR(1) |  | Y |  |  |
| 26 | 인쇄업체코드 | `PRNT_PARTNER_CD` | VARCHAR(10) |  | Y |  |  |
| 27 | 평가위원회가중치 | `EVL_CMTE_WGHTD_VAL` | NUMERIC(6,2) |  | Y |  |  |
| 28 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 29 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 30 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 31 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 32 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 33 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 34 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 35 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 36 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_RDC_OPL_DTL

**연심회의견서상세**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | Y |  |  |
| 2 | 의견평가세부항목ID | `OPNN_EVL_DTL_ITEM_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 입력텍스트내용 | `INPUT_TXT_DESC` | VARCHAR(100) |  | Y |  |  |
| 4 | 입력숫자내용 | `INPUT_NUM_DESC` | VARCHAR(100) |  | Y |  |  |
| 5 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 6 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 7 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 8 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 9 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 10 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 11 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 12 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 13 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

---

## RP_RDC_MST

**연심회마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 심의분류코드 | `INSP_CTG_CD` | VARCHAR(10) |  | Y |  |  |
| 12 | 심의명 | `INSP_NM` | VARCHAR(30) |  | Y |  |  |
| 13 | 심의안건내용 | `INSP_AGND_DESC` | VARCHAR(100) |  | Y |  |  |
| 14 | 심의일자 | `INSP_DT` | VARCHAR(8) |  | Y |  |  |
| 15 | 심의시작시간 | `INSP_START_TM` | VARCHAR(6) |  | Y |  |  |
| 16 | 심의종료시간 | `INSP_END_TM` | VARCHAR(6) |  | Y |  |  |
| 17 | 심의장소명 | `INSP_PLC_NM` | VARCHAR(30) |  | Y |  |  |
| 18 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 19 | 확정여부 | `FIX_YN` | VARCHAR(1) |  | Y |  |  |
| 20 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 21 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 22 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 23 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 24 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 25 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 26 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 27 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 28 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_WRK_HST_MST

**업무이력마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무이력ID | `WRK_HST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 업무마스터테이블명 | `WRK_MAST_TBL_NM` | VARCHAR(30) |  | N |  |  |
| 3 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N |  |  |
| 4 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | Y |  |  |
| 6 | 업무이력차수 | `WRK_HST_CHASU` | VARCHAR(5) |  | Y |  |  |
| 7 | 변경구분코드 | `CHG_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 8 | 기존데이터 | `OLD_DATA` | JSONB |  | Y |  |  |
| 9 | 신규데이터 | `NEW_DATA` | JSONB |  | Y |  |  |
| 10 | 변경내용 | `CHG_DESC` | VARCHAR(100) |  | Y |  |  |
| 11 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 12 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 13 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 14 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 15 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 16 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 17 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 18 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 19 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_HST_ID`

---

## RP_WRK_HST_STAT_INFO

**업무이력상태정보**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무상태이력ID | `WRK_STAT_HST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터테이블명 | `WRK_MAST_TBL_NM` | VARCHAR(30) |  | N |  |  |
| 4 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 6 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 7 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 기존진행상태코드 | `OLD_PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 9 | 신규진행상태코드 | `NEW_PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 10 | 변경사유내용 | `CHG_RESN_DESC` | VARCHAR(100) |  | Y |  |  |
| 11 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 12 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 13 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 14 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 15 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 16 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 17 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 18 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 19 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_STAT_HST_ID`

---

## RP_PRJ_RCPT_MST

**과제접수마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 6 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 비고1내용 | `RMK_1_DESC` | VARCHAR(100) |  | Y |  |  |
| 12 | 비고2내용 | `RMK_2_DESC` | VARCHAR(100) |  | Y |  |  |
| 13 | 비고3내용 | `RMK_3_DESC` | VARCHAR(100) |  | Y |  |  |
| 14 | 비고4내용 | `RMK_4_DESC` | VARCHAR(100) |  | Y |  |  |
| 15 | 비고5내용 | `RMK_5_DESC` | VARCHAR(100) |  | Y |  |  |
| 16 | 비고6내용 | `RMK_6_DESC` | VARCHAR(100) |  | Y |  |  |
| 17 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 18 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 19 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 20 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 21 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 22 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 23 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 24 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 25 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 26 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_RSCH_BUDG_DTL

**연구예산상세**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 연구예산상세ID | `RSCH_BUDG_DTL_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구예산마스터ID | `RSCH_BUDG_MAST_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 항목구분코드 | `ITEM_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 4 | 항목코드 | `ITEM_CD` | VARCHAR(10) |  | Y |  |  |
| 5 | 항목명 | `ITEM_NM` | VARCHAR(30) |  | Y |  |  |
| 6 | 예산항목구분코드 | `BUDG_ITEM_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 예산항목코드 | `BUDG_ITEM_CD` | VARCHAR(10) |  | Y |  |  |
| 8 | 예산항목명 | `BUDG_ITEM_NM` | VARCHAR(30) |  | Y |  |  |
| 9 | 산출근거코드 | `CALC_BASE_CD` | VARCHAR(10) |  | Y |  |  |
| 10 | 산출근거명 | `CALC_BASE_NM` | VARCHAR(30) |  | Y |  |  |
| 11 | 산출내역 | `CALC_DESC` | VARCHAR(100) |  | Y |  |  |
| 12 | 비용금액 | `COST_AMT` | BIGINT |  | Y |  |  |
| 13 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 14 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 15 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 16 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 18 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 19 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 20 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 21 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `RSCH_BUDG_DTL_ID`

---

## RP_PLND_MST

**계획서마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | Y |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | Y |  | N |
| 11 | 초안여부 | `Drft_YN` | VARCHAR(1) |  | Y |  |  |
| 12 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 13 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 14 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 15 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 16 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 17 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 18 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 19 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 20 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 21 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_PRJ_RUN_INSP_MST

**과제수행심의마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | N |  | 1 |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | N |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | N |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | N |  | N |
| 11 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 12 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 13 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 14 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 15 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 16 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 17 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 18 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 19 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_PLND_CHG_MST

**계획서변경마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | N |  |  |
| 3 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | Y |  | 1 |
| 4 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 5 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | Y |  | N |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  | Y |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | Y |  | N |
| 11 | 과제관리명 | `PRJ_MNGT_NM` | VARCHAR(30) |  | Y |  |  |
| 12 | 연구시작일자 | `RSCH_START_DT` | VARCHAR(8) |  | Y |  |  |
| 13 | 연구종료일자 | `RSCH_END_DT` | VARCHAR(8) |  | Y |  |  |
| 14 | 과제발주처명 | `PRJ_ORDR_NM` | VARCHAR(30) |  | Y |  |  |
| 15 | 과제발주처부서명 | `PRJ_ORDR_DEPT_NM` | VARCHAR(30) |  | Y |  |  |
| 16 | 연구책임자구분코드 | `RSCH_MGR_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 17 | 연구책임자명 | `RSCH_MGR_NM` | VARCHAR(30) |  | Y |  |  |
| 18 | 외부위탁포함여부 | `OUTSD_CNSMT_INCL_YN` | VARCHAR(1) |  | Y |  |  |
| 19 | 인쇄업체명 | `PRNT_PARTNER_NM` | VARCHAR(30) |  | Y |  |  |
| 20 | 연구과제중지일자 | `RSCH_PRJ_STOP_DT` | VARCHAR(8) |  | Y |  |  |
| 21 | 연구과제재개일자 | `RSCH_PRJ_RSM_DT` | VARCHAR(8) |  | Y |  |  |
| 22 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 23 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 24 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 25 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 26 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 27 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 28 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 29 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 30 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 31 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_SERV_INSP_TARGR_LIST

**용역심의대상자목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 심의대상자ID | `INSP_TARGR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 4 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 5 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 6 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 7 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 8 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 9 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 10 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 11 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `INSP_TARGR_ID`

---

## RP_RVSN_INSP_MST

**경정심의마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | Y |  |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | Y |  |  |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | Y |  |  |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  |  |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | Y |  |  |
| 11 | 심의명 | `INSP_NM` | VARCHAR(30) |  | Y |  |  |
| 12 | 심의안건내용 | `INSP_AGND_DESC` | VARCHAR(100) |  | Y |  |  |
| 13 | 심의일자 | `INSP_DT` | VARCHAR(8) |  | Y |  |  |
| 14 | 심의시작시간 | `INSP_START_TM` | VARCHAR(6) |  | Y |  |  |
| 15 | 심의종료시간 | `INSP_END_TM` | VARCHAR(6) |  | Y |  |  |
| 16 | 심의장소명 | `INSP_PLC_NM` | VARCHAR(30) |  | Y |  |  |
| 17 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 18 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 19 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 20 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 21 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 22 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 23 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 24 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 25 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

---

## RP_RDC_TARGR_LIST

**연심회대상자목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 심의대상자ID | `INSP_TARGR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 심의대상자구분코드 | `INSP_TARGR_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 4 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 5 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 6 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 7 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 9 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 10 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 11 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 12 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `INSP_TARGR_ID`

---

## RP_RSCH_BUDG_MST

**연구예산마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 연구예산마스터ID | `RSCH_BUDG_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 프로젝트ID | `PJT_ID` | VARCHAR(20) |  | Y |  |  |
| 4 | 프로젝트명 | `PJT_NM` | VARCHAR(30) |  | Y |  |  |
| 5 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 6 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 7 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 8 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 9 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 10 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 11 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 12 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 13 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `RSCH_BUDG_MAST_ID`

---

## RP_RVSN_INSP_TARGR_LIST

**경정심의대상자목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 심의대상자ID | `INSP_TARGR_ID` | VARCHAR(20) |  | N | PK |  |
| 3 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 4 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 5 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 6 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 7 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 8 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 9 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 10 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 11 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`, `INSP_TARGR_ID`

---

## RP_OPNN_EVL_LARG_CTG_LIST

**의견평가대분류목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 의견평가대분류ID | `OPNN_EVL_LARG_CTG_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 의견평가기준ID | `OPNN_EVL_STD_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 의견평가대분류명 | `OPNN_EVL_LARG_CTG_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 정렬순서 | `SORT_ORD` | SMALLINT |  | Y |  |  |
| 5 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  |  |
| 6 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 7 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 8 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 9 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 10 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 11 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 12 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 13 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 14 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `OPNN_EVL_LARG_CTG_ID`

---

## RP_RDC_OPL_mST

**연심회의견서마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 업무마스터ID | `WRK_MAST_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 연구과제ID | `RSCH_PRJ_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 업무마스터상위테이블명 | `WRK_MAST_UPPR_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 업무마스터상위ID | `WRK_MAST_UPPR_ID` | VARCHAR(20) |  | Y |  |  |
| 5 | 업무차수 | `WRK_CHASU` | VARCHAR(5) |  | Y |  |  |
| 6 | 진행상태코드 | `PRGRS_STAT_CD` | VARCHAR(10) |  | Y |  |  |
| 7 | 업무이력최종ID | `WRK_HST_FINA_ID` | VARCHAR(20) |  | Y |  |  |
| 8 | 종료여부 | `END_YN` | VARCHAR(1) |  | Y |  |  |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  |  |
| 10 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | Y |  |  |
| 11 | 심의대상자ID | `INSP_TARGR_ID` | VARCHAR(20) |  | Y |  |  |
| 12 | 의견평가기준ID | `OPNN_EVL_STD_ID` | VARCHAR(20) |  | Y |  |  |
| 13 | 첨부파일ID | `ATTCH_FILE_ID` | VARCHAR(20) |  | Y |  |  |
| 14 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 15 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 16 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 17 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 18 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 19 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 20 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 21 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 22 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `WRK_MAST_ID`

---

## RP_OPNN_EVL_STD_MST

**의견평가기준마스터**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 의견평가기준ID | `OPNN_EVL_STD_ID` | VARCHAR(20) |  | Y |  |  |
| 2 | 의견평가기준명 | `OPNN_EVL_STD_NM` | VARCHAR(30) |  | Y |  |  |
| 3 | 적용업무테이블명 | `APPLY_WRK_TBL_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  |  |
| 5 | 삭제여부 | `DEL_YN` | VARCHAR(1) |  | Y |  |  |
| 6 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 7 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 8 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 9 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 10 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 11 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 12 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 13 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 14 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

---

## RP_OPNN_EVL_DTL_ITEM_LIST

**의견평가세부항목목록**

| # | 논리명 | 물리명 | 타입 | 길이 | NULL | 키 | 기본값 |
|---|---|---|---|---|:--:|:--:|---|
| 1 | 의견평가세부항목ID | `OPNN_EVL_DTL_ITEM_ID` | VARCHAR(20) |  | N | PK |  |
| 2 | 의견평가대분류ID | `OPNN_EVL_LARG_CTG_ID` | VARCHAR(20) |  | Y |  |  |
| 3 | 의견평가세부항목명 | `OPNN_EVL_DTL_ITEM_NM` | VARCHAR(30) |  | Y |  |  |
| 4 | 의견평가입력구분코드 | `OPNN_EVL_INPUT_TP_CD` | VARCHAR(10) |  | Y |  |  |
| 5 | 필수여부 | `ESSN_YN` | VARCHAR(1) |  | Y |  |  |
| 6 | 점수최소값 | `SCORE_MIN_VAL` | NUMERIC(6,2) |  | Y |  |  |
| 7 | 점수최대값 | `SCORE_MAX_VAL` | NUMERIC(6,2) |  | Y |  |  |
| 8 | 정렬순서 | `SORT_ORD` | SMALLINT |  | Y |  |  |
| 9 | 사용여부 | `USE_YN` | VARCHAR(1) |  | Y |  |  |
| 10 | 업무비고 | `WRK_RMK` | VARCHAR(100) |  | Y |  |  |
| 11 | 최초등록프로그램ID | `FIRS_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 12 | 최초등록일시 | `FIRS_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 13 | 최초등록자ID | `FIRS_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 14 | 최초등록IP | `FIRS_REG_IP` | VARCHAR(50) |  | Y |  |  |
| 15 | 최종등록프로그램ID | `FINA_REG_PGM_ID` | VARCHAR(50) |  | Y |  |  |
| 16 | 최종등록일시 | `FINA_REG_DTS` | TIMESTAMP(0) |  | Y |  | CURRENT_TIMESTAMP |
| 17 | 최종등록자ID | `FINA_REG_USER_ID` | VARCHAR(20) |  | Y |  |  |
| 18 | 최종등록IP | `FINA_REG_IP` | VARCHAR(50) |  | Y |  |  |

**키** — `OPNN_EVL_DTL_ITEM_ID`
