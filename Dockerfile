FROM cloudron/base:5.0.0@sha256:04fd70dbd8ad6149c19de39e35718e024417c3e01dc9c6637eaf4a41ec4e596c

RUN mkdir -p /app/code
WORKDIR /app/code

# SURFER_COMMIT is ignored as we always build from master but this tracks the release sha for renovate
# renovate: datasource=git-refs packageName=https://git.cloudron.io/apps/surfer branch=master
ARG SURFER_COMMIT=ef9d88f2160017babf131a778a683056dfae079b

COPY . /app/code/

RUN npm install
RUN npm run build
RUN npm cache clean --force

COPY start.sh /app/code/

CMD [ "/app/code/start.sh" ]
