# CDP 서버 — Docker 는 **선택지**다(검토 R10). 기본 배치는 systemd(install.sh).
#
# 빌드 컨텍스트는 서버 산출물 폴더다 (cdp-server-v<버전>/) —
#     docker build -f deploy/Dockerfile -t cdp-server:0.9.0 .
#
# 실행 —
#     docker run -d --name cdp -p 7374:7374 \
#       -v cdp-repos:/opt/cdp/repos -v cdp-data:/opt/cdp/data \
#       -v $PWD/auth.json:/opt/cdp/auth.json cdp-server:0.9.0
#
# `--bind 0.0.0.0` 은 **컨테이너 안이라 맞다** — 경계는 호스트의 `-p` 매핑이다.
# 명부·토큰은 호스트에서 만든다: docker exec cdp node bin/ctx.mjs serve init …
#
# systemd 가 없으므로 유닛 대신 HEALTHCHECK 가 `/healthz` 를 본다.

FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/cdp
COPY bin ./bin
COPY web ./web
COPY packages ./packages
COPY manual ./manual

RUN useradd -r -d /opt/cdp -s /usr/sbin/nologin cdp \
 && mkdir -p repos data \
 && chmod 755 bin/ctx \
 && chown -R cdp:cdp /opt/cdp
USER cdp

EXPOSE 7374
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:7374/healthz').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

ENTRYPOINT ["node", "/opt/cdp/bin/ctx.mjs", "serve", \
  "--root", "/opt/cdp/repos", \
  "--auth", "/opt/cdp/auth.json", \
  "--data", "/opt/cdp/data", \
  "--web", "/opt/cdp/web", \
  "--packages", "/opt/cdp/packages", \
  "--bind", "0.0.0.0", \
  "--port", "7374", \
  "--mirror"]
