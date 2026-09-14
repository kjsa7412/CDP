# 좌표 어휘

이 파일이 통제 어휘(authority file)다. 같은 대상을 가리키는 여러 표기 중
**정본을 하나 정하고 나머지를 `aliases` 로 연결한다.** `aliases` 가 이 파일의
진짜 핵심이다 — 정본 목록만 있으면 작성자만 편해지고, `aliases` 가 있어야
수신자가 자연어로 물어도 걸린다.

**운영 원칙** — 추가는 한 줄, 삭제는 하지 않는다(`deprecated` 로 표시),
alias 는 발견될 때마다 추가한다.

> **값은 비어 있다.** 패키지는 서식이고 좌표 값은 프로젝트가 채운다.
> `## <타입>` 의 **순서가 화면·CLI 의 카테고리 순서**이므로 순서는 건드리지
> 않는다. 쓰지 않는 타입은 통째로 지운다.

## req

## proc

## func

## arch

- `arch:hw` — H/W 아키텍처
- `arch:db` — DB 아키텍처
- `arch:sw` — S/W 아키텍처
- `arch:link` — 데이터 연계

## screen

## prog

## table

## term

## code

## api

## batch

## scenario

## issue

## domain
