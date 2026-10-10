# CDP 서버 — Docker 는 **선택지**다(검토 R10). 기본 배치는 systemd(install.sh).
#
# 빌드 컨텍스트는 서버 산출물 폴더다 (cdp-server-v<버전>/) —
#     docker build -f deploy/Dockerfile -t cdp-server:<버전> .
#
# 실행 —
#     docker run -d --name cdp -p 7374:7374 \
#       -v cdp-repos:/opt/cdp/repos -v cdp-data:/opt/cdp/data cdp-server:<버전>
#     docker logs cdp          ← 첫 관리자 코드 한 줄 → 브라우저 /setup
#
# **지켜야 할 것은 볼륨 둘뿐이다**(제품화 2 S5) — 명부(`data/auth.json`) · git 자격(HOME = `data/home`)이
# data 볼륨 안에 산다. 전에는 auth.json 이 산출물 폴더의 호스트 파일이라 새 판 폴더에서 올리면 명부가
# 사라졌고, HOME 이 이미지 안이라 PAT 가 컨테이너와 같이 사라졌다.
#
# `--bind 0.0.0.0` 은 **컨테이너 안이라 맞다** — 경계는 호스트의 `-p` 매핑이다.
#
# systemd 가 없으므로 유닛 대신 HEALTHCHECK 가 `/healthz` 를 본다.

FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/cdp
COPY bin ./bin
COPY web ./web
COPY forms ./forms
COPY kit ./kit
COPY manual ./manual
COPY deploy ./deploy

# HOME 을 data 볼륨 안에 — `serve git-auth` 의 .git-credentials · .gitconfig 가 컨테이너를 다시 만들어도 남는다
ENV HOME=/opt/cdp/data/home
RUN useradd -r -d /opt/cdp/data/home -s /usr/sbin/nologin cdp \
 && mkdir -p repos data/home \
 && chmod 755 bin/ctx \
 && chown -R cdp:cdp /opt/cdp
USER cdp

EXPOSE 7374
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:7374/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["node", "/opt/cdp/bin/ctx.mjs", "serve", \
  "--root", "/opt/cdp/repos", \
  "--auth", "/opt/cdp/data/auth.json", \
  "--data", "/opt/cdp/data", \
  "--web", "/opt/cdp/web", \
  "--bind", "0.0.0.0", \
  "--port", "7374", \
  "--mirror"]
